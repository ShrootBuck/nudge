import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export { authorizedServiceRequest as authorizedTranscriptRequest } from "./service-auth";

export const MAX_TRANSCRIPT_BYTES = 64 * 1024 * 1024;
export const TRANSCRIPT_ROUTE = "/api/transcripts/";
export const JSONL_CONTENT_TYPE = "application/x-ndjson";
export type TranscriptFormat = "json" | "jsonl";

export function validTranscriptKey(key: string) {
  return /^[a-f0-9]{64}\.jsonl?$/.test(key);
}

export function transcriptKey(
  body: Uint8Array,
  format: TranscriptFormat = "json",
) {
  return `${createHash("sha256").update(body).digest("hex")}.${format}`;
}

function storagePath(key: string) {
  if (!validTranscriptKey(key)) throw new Error("Invalid transcript key");
  const directory = process.env.TRANSCRIPT_STORAGE_DIR?.trim();
  if (!directory) throw new Error("TRANSCRIPT_STORAGE_DIR is not configured");
  return join(resolve(directory), key);
}

export async function storeTranscript(
  body: Uint8Array,
  format: TranscriptFormat = "json",
) {
  if (body.byteLength > MAX_TRANSCRIPT_BYTES)
    throw new Error("Transcript exceeds size limit");
  const key = transcriptKey(body, format);
  const path = storagePath(key);
  await mkdir(resolve(path, ".."), { recursive: true });
  // Publish atomically so an interrupted write can never leave a partial download.
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, body, { flag: "wx", mode: 0o640 });
    await link(temporary, path).catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
      if (transcriptKey(await readFile(path), format) !== key)
        throw new Error("Stored transcript checksum mismatch");
    });
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  return key;
}

export async function readTranscript(key: string) {
  return readFile(storagePath(key));
}

export async function removeTranscript(key: string) {
  await unlink(storagePath(key)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}
