import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GET } from "../src/app/api/transcripts/[key]/route";
import { POST } from "../src/app/api/transcripts/route";
import {
  deleteGenerationTranscript,
  hasTranscriptUploadConfiguration,
} from "../src/lib/generation-transcript";
import {
  readTranscript,
  removeTranscript,
  storeTranscript,
  transcriptKey,
  validTranscriptKey,
} from "../src/lib/transcript-storage";

const originalDirectory = process.env.TRANSCRIPT_STORAGE_DIR;
const originalSecret = process.env.CACHE_REVALIDATION_SECRET;
let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "nudge-transcripts-"));
  process.env.TRANSCRIPT_STORAGE_DIR = root;
  process.env.CACHE_REVALIDATION_SECRET = "test-transcript-secret";
});
afterAll(async () => {
  if (originalDirectory === undefined)
    delete process.env.TRANSCRIPT_STORAGE_DIR;
  else process.env.TRANSCRIPT_STORAGE_DIR = originalDirectory;
  if (originalSecret === undefined)
    delete process.env.CACHE_REVALIDATION_SECRET;
  else process.env.CACHE_REVALIDATION_SECRET = originalSecret;
  await rm(root, { recursive: true, force: true });
});

describe("self-hosted generation transcripts", () => {
  test("authenticated upload and download preserve exact bytes, with idempotent concurrent writes", async () => {
    const body = Buffer.from('{"messages":[],"unicode":"λ"}\n\t');
    const request = () =>
      new Request("http://localhost/api/transcripts", {
        method: "POST",
        headers: { Authorization: "Bearer test-transcript-secret" },
        body,
      });
    const responses = await Promise.all([POST(request()), POST(request())]);
    const results = await Promise.all(
      responses.map((response) => response.json()),
    );
    expect(results[0]).toEqual(results[1]);
    const key = transcriptKey(body);
    expect(results[0].path).toBe(`/api/transcripts/${key}`);
    expect(await readFile(join(root, key))).toEqual(body);
    expect((await readdir(root)).some((file) => file.endsWith(".tmp"))).toBe(
      false,
    );
    const download = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ key }),
    });
    expect(Buffer.from(await download.arrayBuffer())).toEqual(body);
    expect(download.headers.get("content-disposition")).toContain("attachment");
    await removeTranscript(key);
    expect(
      (
        await GET(new Request("http://localhost"), {
          params: Promise.resolve({ key }),
        })
      ).status,
    ).toBe(404);
  });

  test("rejects unauthenticated uploads and malformed JSON", async () => {
    expect(
      (
        await POST(
          new Request("http://localhost", { method: "POST", body: "{}" }),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await POST(
          new Request("http://localhost", {
            method: "POST",
            headers: { Authorization: "Bearer test-transcript-secret" },
            body: "not json",
          }),
        )
      ).status,
    ).toBe(400);
  });

  test("rejects path traversal and external deletion targets", async () => {
    expect(validTranscriptKey("../.env")).toBe(false);
    await expect(readTranscript("../.env")).rejects.toThrow(
      "Invalid transcript key",
    );
    await expect(
      deleteGenerationTranscript("https://attacker.example/file.json"),
    ).rejects.toThrow("outside");
  });

  test("requires the shared upload configuration", () => {
    expect(hasTranscriptUploadConfiguration({})).toBe(false);
    expect(
      hasTranscriptUploadConfiguration({
        CACHE_REVALIDATION_URL: "https://nudge.example",
        CACHE_REVALIDATION_SECRET: "secret",
      }),
    ).toBe(true);
  });

  test("storage needs an explicit persistent directory", async () => {
    delete process.env.TRANSCRIPT_STORAGE_DIR;
    try {
      await expect(storeTranscript(Buffer.from("{}"))).rejects.toThrow(
        "not configured",
      );
    } finally {
      process.env.TRANSCRIPT_STORAGE_DIR = root;
    }
  });
});
