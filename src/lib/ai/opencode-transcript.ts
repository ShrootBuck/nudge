import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

function safeSessionFilename(sessionId: string) {
  return sessionId.replaceAll(/[^a-zA-Z0-9_-]/g, "_");
}

export async function mirrorOpenCodeTranscript({
  sessionId,
  transcript,
  destinationDirectory = join(process.cwd(), ".opencode-runs"),
}: {
  sessionId: string;
  transcript: Uint8Array;
  destinationDirectory?: string;
}) {
  await mkdir(destinationDirectory, { recursive: true });
  const destinationPath = join(
    destinationDirectory,
    `${safeSessionFilename(sessionId)}.json`,
  );
  await writeFile(destinationPath, transcript);
  return destinationPath;
}
