import { mkdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { GenerateOptions, StructuredResponse } from "../ai";
import { formatProblemId } from "../codeforces-problem";
import { completeGeneration, failGeneration } from "../generation-api";
import type {
  GenerationCompletion,
  GenerationResult,
} from "../generation-contract";
import type { AutomaticGenerationProblem } from "../generation-queue";
import {
  deleteGenerationTranscript,
  publishGenerationTranscript,
} from "../generation-transcript";
import { siteApiUrl } from "../site-api";
import { problemOutputSchema } from "./content-schema";
import { buildPrompt, GENERATION_SYSTEM_PROMPT } from "./prompt";

export type StructuredResponseGenerator = (
  options: GenerateOptions,
) => Promise<StructuredResponse>;
export type GenerationLogger = {
  info(message: string, properties?: Record<string, unknown>): void;
  warn(message: string, properties?: Record<string, unknown>): void;
  error(message: string, properties?: Record<string, unknown>): void;
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function toProblemLabel(
  problem: Pick<AutomaticGenerationProblem, "contestId" | "index">,
) {
  return formatProblemId(problem.contestId, problem.index);
}

export async function executeProblemGeneration({
  problem,
  claimId,
  generate,
  log,
  abortSignal,
}: {
  problem: AutomaticGenerationProblem;
  claimId: string;
  generate: StructuredResponseGenerator;
  log: GenerationLogger;
  abortSignal?: AbortSignal;
}): Promise<GenerationResult> {
  const label = toProblemLabel(problem);
  log.info(`Running generation for ${label}`);
  const generationStartedAt = Date.now();
  const heartbeat = setInterval(() => {
    const seconds = Math.round((Date.now() - generationStartedAt) / 1000);
    log.info(
      `${label} still running (${Math.floor(seconds / 60)}m ${seconds % 60}s elapsed)`,
    );
  }, 30_000);
  heartbeat.unref?.();

  let response: StructuredResponse;
  try {
    response = await generate({
      systemPrompt: GENERATION_SYSTEM_PROMPT,
      userPrompt: buildPrompt(problem),
      outputSchema: problemOutputSchema,
      abortSignal,
    });
  } catch (error) {
    const reason = `Generation failed for ${label}: ${toErrorMessage(error)}`;
    log.error(reason);
    return await failGeneration(claimId, reason);
  } finally {
    clearInterval(heartbeat);
  }

  let transcriptUrl: string | null = null;
  if (response.transcriptPath) {
    log.info(`Saved full generation transcript to ${response.transcriptPath}`);
    try {
      transcriptUrl = await publishGenerationTranscript({
        problemId: problem.id,
        problemLabel: label,
        responseId: response.responseId,
        transcriptPath: response.transcriptPath,
      });
      log.info(`Published full generation transcript to ${transcriptUrl}`);
    } catch (error) {
      log.warn(
        `Could not publish generation transcript: ${toErrorMessage(error)}`,
      );
    }
  } else if (response.transcriptWarning) {
    log.warn(response.transcriptWarning);
  }

  const submission: GenerationCompletion = {
    action: "complete",
    claimId,
    response: {
      outputText: response.outputText,
      responseId: response.responseId,
      displayName: response.displayName,
      resolvedModel: response.resolvedModel,
      finishReason: response.finishReason,
      nativeFinishReason: response.nativeFinishReason,
      providerName: response.providerName,
      totalTokens: response.totalTokens,
    },
    transcriptKey: transcriptUrl
      ? (new URL(transcriptUrl).pathname.split("/").at(-1) ?? null)
      : null,
  };
  // Keep the generated result if the network goes away after an expensive run.
  // No credentials are stored here. A retry uses the same claim and is idempotent.
  const pendingPath = resolve(".opencode-runs", `${claimId}.pending.json`);
  await mkdir(resolve(pendingPath, ".."), { recursive: true });
  await writeFile(
    pendingPath,
    JSON.stringify({ origin: siteApiUrl("/").origin, submission }),
    { mode: 0o600 },
  );
  let result: GenerationResult;
  try {
    result = await completeGeneration(submission);
  } catch (error) {
    throw new Error(
      `${toErrorMessage(error)}. Result saved locally; retry without regenerating: bun run opencode:resume -- ${pendingPath}`,
      { cause: error },
    );
  }
  await unlink(pendingPath).catch((error) =>
    log.warn(`Could not remove saved submission: ${toErrorMessage(error)}`),
  );
  // The old transcript is deletable only after the database references the new one.
  if (
    transcriptUrl &&
    problem.generationTranscriptUrl &&
    problem.generationTranscriptUrl !== transcriptUrl
  ) {
    await deleteGenerationTranscript(problem.generationTranscriptUrl).catch(
      (error) =>
        log.warn(
          `Could not delete previous transcript: ${toErrorMessage(error)}`,
        ),
    );
  }
  return result;
}
