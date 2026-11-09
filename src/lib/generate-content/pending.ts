import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { z } from "zod";
import { completeGeneration } from "../generation-api";
import {
  type GenerationCompletion,
  generationRequestSchema,
} from "../generation-contract";
import {
  deleteGenerationTranscript,
  publishGenerationTranscript,
} from "../generation-transcript";
import { siteApiUrl } from "../site-api";

const pendingSchema = z.object({
  origin: z.string(),
  submission: generationRequestSchema,
  // Only a sibling raw log produced by this worker can be uploaded on resume.
  transcriptFile: z
    .string()
    .regex(/^[0-9a-f-]{36}\.jsonl$/)
    .optional(),
  previousTranscriptUrl: z.string().nullable().optional(),
});

export interface SubmissionLogger {
  info(message: string): void;
  warn(message: string): void;
}

export async function savePendingGeneration(
  submission: GenerationCompletion,
  transcriptPath: string | undefined,
  previousTranscriptUrl: string | null,
) {
  const directory = resolve(".codex-runs");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (
    transcriptPath &&
    (await realpath(dirname(transcriptPath))) !== (await realpath(directory))
  )
    throw new Error(
      "Generation transcript must be in the worker's run directory",
    );
  const pending = pendingSchema.parse({
    origin: siteApiUrl("/").origin,
    submission,
    transcriptFile: transcriptPath ? basename(transcriptPath) : undefined,
    previousTranscriptUrl,
  });
  const path = join(directory, `${submission.claimId}.pending.json`);
  const tmp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(pending), { mode: 0o600, flag: "wx" });
    await rename(tmp, path);
  } finally {
    await unlink(tmp).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  return path;
}

export async function submitPendingGeneration(
  path: string,
  log: SubmissionLogger,
) {
  const pending = pendingSchema.parse(JSON.parse(await readFile(path, "utf8")));
  if (pending.origin !== siteApiUrl("/").origin)
    throw new Error("Saved submission belongs to a different Nudge server");
  const submission = pending.submission;
  if (submission.action !== "complete")
    throw new Error("Not a saved generation result");
  let transcriptUrl: string | undefined;
  if (pending.transcriptFile) {
    transcriptUrl = await publishGenerationTranscript({
      transcriptPath: join(dirname(path), pending.transcriptFile),
    });
    submission.transcriptKey = basename(new URL(transcriptUrl).pathname);
    log.info(`Published generation transcript to ${transcriptUrl}`);
  }
  const result = await completeGeneration(submission);
  await unlink(path).catch((error) =>
    log.warn(`Could not remove saved submission: ${error.message}`),
  );
  if (
    transcriptUrl &&
    pending.previousTranscriptUrl &&
    pending.previousTranscriptUrl !== transcriptUrl
  ) {
    await deleteGenerationTranscript(pending.previousTranscriptUrl).catch(
      (error) =>
        log.warn(`Could not delete previous transcript: ${error.message}`),
    );
  }
  return result;
}
