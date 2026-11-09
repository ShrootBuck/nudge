import type { GenerateOptions, StructuredResponse } from "../ai";
import { formatProblemId } from "../codeforces-problem";
import { failGeneration } from "../generation-api";
import type {
  GenerationCompletion,
  GenerationResult,
} from "../generation-contract";
import type { AutomaticGenerationProblem } from "../generation-queue";
import { problemOutputSchema } from "./content-schema";
import { savePendingGeneration, submitPendingGeneration } from "./pending";
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

  if (response.transcriptPath)
    log.info(`Saved generation transcript to ${response.transcriptPath}`);
  else if (response.transcriptWarning) log.warn(response.transcriptWarning);

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
    transcriptKey: null,
  };
  const pendingPath = await savePendingGeneration(
    submission,
    response.transcriptPath,
    problem.generationTranscriptUrl,
  );
  try {
    return await submitPendingGeneration(pendingPath, log);
  } catch (error) {
    throw new Error(
      `${toErrorMessage(error)}. Result saved locally; retry without regenerating: bun run codex:resume -- ${pendingPath}`,
      { cause: error },
    );
  }
}
