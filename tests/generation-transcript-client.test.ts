import { afterAll, afterEach, beforeAll, expect, spyOn, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deleteGenerationTranscript,
  publishGenerationTranscript,
} from "../src/lib/generation-transcript";
import { transcriptKey } from "../src/lib/transcript-storage";

const originalUrl = process.env.CACHE_REVALIDATION_URL;
const originalSecret = process.env.CACHE_REVALIDATION_SECRET;
const originalPreconnect = fetch.preconnect;
const body = Buffer.from('{"messages":[],"unicode":"λ"}\n');
const path = `/api/transcripts/${transcriptKey(body)}`;
const origin = "https://nudge.example";
let root: string;
let transcriptPath: string;
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

function mockFetch(
  implementation: (
    url: Parameters<typeof fetch>[0],
    init?: RequestInit,
  ) => Promise<Response>,
) {
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(implementation, { preconnect: originalPreconnect }),
  );
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "nudge-transcript-client-"));
  transcriptPath = join(root, "transcript.json");
  await writeFile(transcriptPath, body);
  process.env.CACHE_REVALIDATION_URL = origin;
  process.env.CACHE_REVALIDATION_SECRET = "test-secret";
});

afterEach(() => fetchSpy?.mockRestore());
afterAll(async () => {
  if (originalUrl === undefined) delete process.env.CACHE_REVALIDATION_URL;
  else process.env.CACHE_REVALIDATION_URL = originalUrl;
  if (originalSecret === undefined)
    delete process.env.CACHE_REVALIDATION_SECRET;
  else process.env.CACHE_REVALIDATION_SECRET = originalSecret;
  await rm(root, { recursive: true, force: true });
});

function publish() {
  return publishGenerationTranscript({
    transcriptPath,
  });
}

test("retries a TLS handshake failure with identical upload bytes and fresh timeout", async () => {
  const requests: RequestInit[] = [];
  mockFetch(async (url, init) => {
    expect(String(url)).toBe(`${origin}/api/transcripts`);
    requests.push(init ?? {});
    if (requests.length === 1)
      throw Object.assign(new Error("EPROTO: The TLS handshake failed"), {
        code: "EPROTO",
      });
    return Response.json({ path });
  });

  expect(await publish()).toBe(`${origin}${path}`);
  expect(requests).toHaveLength(2);
  for (const request of requests) {
    expect(request.method).toBe("POST");
    expect(request.body).toEqual(body);
    expect(request.headers).toEqual({
      Authorization: "Bearer test-secret",
      "Content-Type": "application/json",
    });
    expect(request.redirect).toBe("error");
    expect(request.signal?.aborted).toBe(false);
  }
  expect(requests[0].signal).not.toBe(requests[1].signal);
});

test("retries when the upload acknowledgement is lost", async () => {
  fetchSpy = spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new TypeError("Connection closed"));
          },
        }),
      ),
    )
    .mockResolvedValueOnce(Response.json({ path }));
  expect(await publish()).toBe(`${origin}${path}`);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});

test.each([408, 429, 502, 503])(
  "retries temporary HTTP %i responses",
  async (status) => {
    fetchSpy = spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("temporary", { status }))
      .mockResolvedValueOnce(Response.json({ path }));
    expect(await publish()).toBe(`${origin}${path}`);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  },
);

test.each([400, 401, 403, 413])(
  "does not retry permanent HTTP %i failures",
  async (status) => {
    mockFetch(async () => new Response("rejected", { status }));
    await expect(publish()).rejects.toThrow(`upload failed (${status})`);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  },
);

test("stops after three failed attempts and preserves the actual error", async () => {
  const error = new Error("EPROTO: The TLS handshake failed");
  fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(error);
  await expect(publish()).rejects.toBe(error);
  expect(fetchSpy).toHaveBeenCalledTimes(3);
});

test("does not retry invalid upload acknowledgements", async () => {
  mockFetch(async () =>
    Response.json({ path: "https://attacker.example/transcript.json" }),
  );
  await expect(publish()).rejects.toThrow("Invalid transcript upload");
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

test("retries transient cleanup failures", async () => {
  fetchSpy = spyOn(globalThis, "fetch")
    .mockRejectedValueOnce(new TypeError("Connection closed"))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  await deleteGenerationTranscript(`${origin}${path}`);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
  for (const [url, request] of fetchSpy.mock.calls) {
    expect(String(url)).toBe(`${origin}${path}`);
    expect(request?.method).toBe("DELETE");
  }
});
