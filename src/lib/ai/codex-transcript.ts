import type { Dirent } from "node:fs";
import { copyFile, mkdir, open, readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const SESSION_METADATA_CHUNK_BYTES = 8 * 1024;
const SESSION_METADATA_MAX_BYTES = 256 * 1024;

type SessionMetadata = {
  type?: string;
  payload?: {
    cwd?: string;
  };
};

async function sessionMatchesWorkingDirectory(
  sessionPath: string,
  workingDirectory: string,
) {
  let sessionFile: Awaited<ReturnType<typeof open>> | null = null;

  try {
    sessionFile = await open(sessionPath, "r");
    const chunks: Buffer[] = [];

    let position = 0;
    while (position < SESSION_METADATA_MAX_BYTES) {
      const buffer = Buffer.alloc(SESSION_METADATA_CHUNK_BYTES);
      const { bytesRead } = await sessionFile.read(
        buffer,
        0,
        buffer.length,
        position,
      );
      if (bytesRead === 0) {
        return false;
      }

      const chunk = buffer.subarray(0, bytesRead);
      const newlineIndex = chunk.indexOf(0x0a);
      if (newlineIndex === -1) {
        chunks.push(chunk);
        position += bytesRead;
        continue;
      }

      chunks.push(chunk.subarray(0, newlineIndex));
      const metadata = JSON.parse(
        Buffer.concat(chunks).toString("utf8"),
      ) as SessionMetadata;
      return (
        metadata.type === "session_meta" &&
        metadata.payload?.cwd === workingDirectory
      );
    }

    return false;
  } catch {
    return false;
  } finally {
    await sessionFile?.close().catch(() => undefined);
  }
}

async function findSessionTranscript(
  directory: string,
  workingDirectory: string,
): Promise<string | null> {
  let entries: Dirent<string>[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries.sort((left, right) =>
    right.name.localeCompare(left.name),
  )) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      const match = await findSessionTranscript(entryPath, workingDirectory);
      if (match) {
        return match;
      }
      continue;
    }

    if (
      entry.isFile() &&
      entry.name.endsWith(".jsonl") &&
      (await sessionMatchesWorkingDirectory(entryPath, workingDirectory))
    ) {
      return entryPath;
    }
  }

  return null;
}

export async function mirrorCodexTranscript({
  workingDirectory,
  codexHome = process.env.CODEX_HOME?.trim() || join(homedir(), ".codex"),
  destinationDirectory = join(process.cwd(), ".codex-runs"),
}: {
  workingDirectory: string;
  codexHome?: string;
  destinationDirectory?: string;
}) {
  const normalizedWorkingDirectory = await realpath(workingDirectory).catch(
    () => workingDirectory,
  );
  const sessionPath = await findSessionTranscript(
    join(codexHome, "sessions"),
    normalizedWorkingDirectory,
  );
  if (!sessionPath) {
    return null;
  }

  await mkdir(destinationDirectory, { recursive: true });
  const destinationPath = join(destinationDirectory, basename(sessionPath));
  await copyFile(sessionPath, destinationPath);
  return destinationPath;
}
