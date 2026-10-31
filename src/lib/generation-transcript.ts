import { readFile } from "node:fs/promises";
import { siteApiAuthorization, siteApiUrl } from "./site-api";
import {
  MAX_TRANSCRIPT_BYTES,
  TRANSCRIPT_ROUTE,
  validTranscriptKey,
} from "./transcript-storage";

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
  problemId: string;
  problemLabel: string;
  responseId: string;
  transcriptPath: string;
}) {
  const body = await readFile(transcriptPath);
  if (body.byteLength > MAX_TRANSCRIPT_BYTES)
    throw new Error("Transcript exceeds size limit");
  const response = await fetch(siteApiUrl("/api/transcripts"), {
    method: "POST",
    headers: {
      Authorization: siteApiAuthorization(),
      "Content-Type": "application/json",
    },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok)
    throw new Error(`Transcript upload failed (${response.status})`);
  const result = (await response.json()) as { path?: unknown };
  if (
    typeof result.path !== "string" ||
    !result.path.startsWith(TRANSCRIPT_ROUTE) ||
    !validTranscriptKey(result.path.slice(TRANSCRIPT_ROUTE.length))
  ) {
    throw new Error("Invalid transcript upload acknowledgement");
  }
  return siteApiUrl(result.path).href;
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
  const response = await fetch(target, {
    method: "DELETE",
    headers: { Authorization: siteApiAuthorization() },
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(`Transcript deletion failed (${response.status})`);
}
