import { readFile } from "node:fs/promises";
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

function storageUrl(path: string) {
  const base = process.env.CACHE_REVALIDATION_URL?.trim();
  if (!base) throw new Error("CACHE_REVALIDATION_URL is not configured");
  const url = new URL(path, base);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  ) {
    throw new Error("Transcript storage requires HTTPS outside localhost");
  }
  return url;
}

function authorization() {
  const secret = process.env.CACHE_REVALIDATION_SECRET?.trim();
  if (!secret) throw new Error("CACHE_REVALIDATION_SECRET is not configured");
  return `Bearer ${secret}`;
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
  const response = await fetch(storageUrl("/api/transcripts"), {
    method: "POST",
    headers: {
      Authorization: authorization(),
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
  return storageUrl(result.path).href;
}

export async function deleteGenerationTranscript(url: string) {
  const expected = storageUrl(TRANSCRIPT_ROUTE);
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
    headers: { Authorization: authorization() },
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(`Transcript deletion failed (${response.status})`);
}
