import { readFile } from "node:fs/promises";
import { siteApiAuthorization, siteApiUrl } from "./site-api";
import {
  JSONL_CONTENT_TYPE,
  MAX_TRANSCRIPT_BYTES,
  TRANSCRIPT_ROUTE,
  transcriptKey,
  validTranscriptKey,
} from "./transcript-storage";

class TranscriptRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

async function requestTranscript<T>({
  url,
  method,
  body,
  contentType,
  readResponse,
}: {
  url: URL;
  method: "POST" | "DELETE";
  body?: Buffer<ArrayBuffer>;
  contentType?: string;
  readResponse: (response: Response) => Promise<T>;
}) {
  const authorization = siteApiAuthorization();
  // Uploads are content-addressed and deletion is idempotent, so a lost response
  // can safely be retried with the same bytes. Keep TLS verification enabled.
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: authorization,
          ...(contentType ? { "Content-Type": contentType } : {}),
        },
        body,
        redirect: "error",
        signal: AbortSignal.timeout(method === "POST" ? 120_000 : 30_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new TranscriptRequestError(
          `Transcript ${method === "POST" ? "upload" : "deletion"} failed (${response.status})`,
          response.status === 408 ||
            response.status === 429 ||
            response.status >= 500,
        );
      }
      return await readResponse(response);
    } catch (error) {
      if (
        attempt >= 2 ||
        (error instanceof TranscriptRequestError && !error.retryable)
      )
        throw error;
      await Bun.sleep(500 * 2 ** attempt);
    }
  }
}

export function hasTranscriptUploadConfiguration(
  environment: Record<string, string | undefined> = process.env,
) {
  return Boolean(
    environment.CACHE_REVALIDATION_URL?.trim() &&
      environment.CACHE_REVALIDATION_SECRET?.trim(),
  );
}

export async function publishGenerationTranscript({
  transcriptPath,
}: {
  transcriptPath: string;
}) {
  const body = await readFile(transcriptPath);
  if (body.byteLength > MAX_TRANSCRIPT_BYTES)
    throw new Error("Transcript exceeds size limit");
  const format = transcriptPath.endsWith(".jsonl") ? "jsonl" : "json";
  const expectedPath = TRANSCRIPT_ROUTE + transcriptKey(body, format);
  return requestTranscript({
    url: siteApiUrl("/api/transcripts"),
    method: "POST",
    contentType: format === "jsonl" ? JSONL_CONTENT_TYPE : "application/json",
    body,
    readResponse: async (response) => {
      const result = (await response.json()) as { path?: unknown } | null;
      if (result?.path !== expectedPath) {
        throw new TranscriptRequestError(
          "Invalid transcript upload acknowledgement",
          false,
        );
      }
      return siteApiUrl(expectedPath).href;
    },
  });
}

export async function deleteGenerationTranscript(url: string) {
  const expected = siteApiUrl(TRANSCRIPT_ROUTE);
  const target = new URL(url, expected);
  if (
    target.origin !== expected.origin ||
    !target.pathname.startsWith(TRANSCRIPT_ROUTE) ||
    !validTranscriptKey(target.pathname.slice(TRANSCRIPT_ROUTE.length))
  ) {
    throw new Error(
      "Refusing to delete a transcript outside the configured storage service",
    );
  }
  await requestTranscript({
    url: target,
    method: "DELETE",
    readResponse: async (response) => {
      await response.body?.cancel();
    },
  });
}
