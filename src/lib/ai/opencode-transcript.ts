import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

function safeSessionFilename(sessionId: string) {
  return sessionId.replaceAll(/[^a-zA-Z0-9_-]/g, "_");
}

export async function mirrorOpenCodeTranscript({
  sessionId,
  session,
  capturedAt = new Date(),
  destinationDirectory = join(process.cwd(), ".opencode-runs"),
}: {
  sessionId: string;
  session: unknown;
  capturedAt?: Date;
  destinationDirectory?: string;
}) {
  await mkdir(destinationDirectory, { recursive: true });
  const destinationPath = join(
    destinationDirectory,
    `${safeSessionFilename(sessionId)}.json`,
  );
  await writeFile(
    destinationPath,
    `${JSON.stringify(
      {
        sessionId,
        capturedAt: capturedAt.toISOString(),
        session,
      },
      null,
      2,
    )}\n`,
  );
  return destinationPath;
}
