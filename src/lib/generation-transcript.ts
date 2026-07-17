import { readFile } from "node:fs/promises";
import { del, put } from "@vercel/blob";

const TRANSCRIPT_CACHE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

type TranscriptUploader = (
  pathname: string,
  body: Buffer,
  options: {
    access: "public";
    addRandomSuffix: false;
    cacheControlMaxAge: number;
    contentType: "application/json";
    token?: string;
  },
) => Promise<{ url: string }>;

function safePathSegment(value: string) {
  return value.replaceAll(/[^a-zA-Z0-9_-]/g, "_");
}

function getVercelBlobReadWriteToken(
  environment: Record<string, string | undefined> = process.env,
) {
  const token = environment.BLOB_READ_WRITE_TOKEN?.trim();
  return token && token !== "[SENSITIVE]" ? token : null;
}

export function hasVercelBlobReadWriteToken(
  environment: Record<string, string | undefined> = process.env,
) {
  return Boolean(getVercelBlobReadWriteToken(environment));
}

export async function publishGenerationTranscript({
  problemId,
  problemLabel,
  responseId,
  transcriptPath,
  token = getVercelBlobReadWriteToken(),
  upload = put,
}: {
  problemId: string;
  problemLabel: string;
  responseId: string;
  transcriptPath: string;
  token?: string | null;
  upload?: TranscriptUploader;
}) {
  const transcript = await readFile(transcriptPath);
  const pathname = [
    "generation-transcripts",
    safePathSegment(problemId),
    `${safePathSegment(problemLabel)}-${safePathSegment(responseId)}.json`,
  ].join("/");
  const blob = await upload(pathname, transcript, {
    access: "public",
    addRandomSuffix: false,
    cacheControlMaxAge: TRANSCRIPT_CACHE_MAX_AGE_SECONDS,
    contentType: "application/json",
    ...(token ? { token } : {}),
  });

  return blob.url;
}

export async function deleteGenerationTranscript(url: string) {
  const token = getVercelBlobReadWriteToken();
  await del(url, token ? { token } : undefined);
}
