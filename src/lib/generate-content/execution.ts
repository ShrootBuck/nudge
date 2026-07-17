import type { Prisma } from "@prisma/client";
import type { GenerateOptions, StructuredResponse } from "../ai";
import { recordGenerationUsage } from "../ai/usage";
import { safeRevalidateTag } from "../cache-revalidate";
import { PROBLEM_LIST_TAG, problemTag } from "../cache-tags";
import { discordLog } from "../discord-log";
import { DISCORD_COLORS } from "../discord-webhook";
import type { AutomaticGenerationProblem } from "../generation-queue";
import {
  deleteGenerationTranscript,
  publishGenerationTranscript,
} from "../generation-transcript";
import { prisma } from "../prisma";
import { pipelineStateData, problemUpdateData } from "../problem-pipeline-db";
import { problemOutputSchema, problemResultSchema } from "./content-schema";
import { type GenerationAuditInfo, saveProblemContent } from "./persistence";
import {
  fetchProblemStatement,
  ProblemStatementUnavailableError,
} from "./problem-statement";
import { buildPrompt } from "./prompt";

export type StructuredResponseGenerator = (
  options: GenerateOptions,
) => Promise<StructuredResponse>;

export type GenerationLogger = {
  info(message: string, properties?: Record<string, unknown>): void;
  warn(message: string, properties?: Record<string, unknown>): void;
  error(message: string, properties?: Record<string, unknown>): void;
};

export type GenerationResult =
  | { processed: 1; outcome: "succeeded" | "unsolvable" }
  | { processed: 0; outcome: "failed"; error: string };

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function toProblemLabel(
  problem: Pick<AutomaticGenerationProblem, "contestId" | "index">,
) {
  return `${problem.contestId}${problem.index}`;
}

function toGenerationAuditInfo(
  response: StructuredResponse,
  transcriptUrl: string | null,
): GenerationAuditInfo {
  return {
    displayName: response.displayName,
    responseId: response.responseId,
    resolvedModel: response.resolvedModel,
    finishReason: response.finishReason,
    nativeFinishReason: response.nativeFinishReason,
    providerName: response.providerName,
    totalTokens: response.totalTokens,
    transcriptUrl,
  };
}

function generationAuditData(
  response: StructuredResponse,
  transcriptUrl: string | null,
): Pick<
  Prisma.ProblemUpdateInput,
  | "generatedByDisplayName"
  | "generatedByModel"
  | "generationResponseId"
  | "generationFinishReason"
  | "generationNativeFinishReason"
  | "generationProviderName"
  | "generationTotalTokens"
  | "generationTranscriptUrl"
> {
  const audit = toGenerationAuditInfo(response, transcriptUrl);

  return {
    generatedByDisplayName: audit.displayName,
    generatedByModel: audit.resolvedModel,
    generationResponseId: audit.responseId,
    generationFinishReason: audit.finishReason,
    generationNativeFinishReason: audit.nativeFinishReason,
    generationProviderName: audit.providerName,
    generationTotalTokens: audit.totalTokens,
    generationTranscriptUrl: audit.transcriptUrl,
  };
}

function revalidateProblem(
  problem: Pick<AutomaticGenerationProblem, "contestId" | "index">,
) {
  safeRevalidateTag(PROBLEM_LIST_TAG, "max");
  safeRevalidateTag(problemTag(problem.contestId, problem.index), "max");
}

export async function markClaimedProblemFailed({
  problem,
  reason,
  response,
  transcriptUrl = null,
}: {
  problem: Pick<
    AutomaticGenerationProblem,
    "id" | "contestId" | "index" | "generationTranscriptUrl"
  >;
  reason: string;
  response?: StructuredResponse | null;
  transcriptUrl?: string | null;
}) {
  const updated = await prisma.problem.updateMany({
    where: { id: problem.id, runState: "RUNNING" },
    data: problemUpdateData({
      ...pipelineStateData("FAILED"),
      generationStartedAt: null,
      lastGenerationError: reason,
      ...(response
        ? generationAuditData(response, transcriptUrl)
        : { generationTranscriptUrl: null }),
    }),
  });

  if (updated.count > 0) {
    revalidateProblem(problem);
  }
}

async function releaseClaimedProblemAfterStatementFailure({
  problem,
  reason,
}: {
  problem: Pick<AutomaticGenerationProblem, "id" | "contestId" | "index">;
  reason: string;
}) {
  const updated = await prisma.problem.updateMany({
    where: { id: problem.id, runState: "RUNNING" },
    data: problemUpdateData({
      ...pipelineStateData("IDLE"),
      generationAttempts: { decrement: 1 },
      generationStartedAt: null,
      lastGenerationError: reason,
    }),
  });

  if (updated.count > 0) {
    revalidateProblem(problem);
  }
}

export async function executeProblemGeneration({
  problem,
  generate,
  log,
  abortSignal,
}: {
  problem: AutomaticGenerationProblem;
  generate: StructuredResponseGenerator;
  log: GenerationLogger;
  abortSignal?: AbortSignal;
}): Promise<GenerationResult> {
  const label = toProblemLabel(problem);
  let response: StructuredResponse | null = null;
  let transcriptUrl: string | null = null;

  try {
    const statement = await fetchProblemStatement(
      problem.contestId,
      problem.index,
    );
    const textPrompt = buildPrompt(
      problem,
      statement.html,
      statement.sourceStatuses,
    );
    const userPrompt =
      statement.images.length > 0
        ? [
            { type: "text" as const, text: textPrompt },
            ...statement.images.map((url) => ({
              type: "image_url" as const,
              image_url: { url },
            })),
          ]
        : textPrompt;

    log.info(`Running generation for ${label}`);

    response = await generate({
      systemPrompt: "Follow the user prompt and output schema exactly.",
      userPrompt,
      outputSchema: problemOutputSchema,
      abortSignal,
    });
    if (response.transcriptPath) {
      log.info(`Saved full OpenCode transcript to ${response.transcriptPath}`);
      try {
        transcriptUrl = await publishGenerationTranscript({
          problemId: problem.id,
          problemLabel: label,
          responseId: response.responseId,
          transcriptPath: response.transcriptPath,
        });
        log.info(`Published full OpenCode transcript to ${transcriptUrl}`);
        if (
          problem.generationTranscriptUrl &&
          problem.generationTranscriptUrl !== transcriptUrl
        ) {
          await deleteGenerationTranscript(
            problem.generationTranscriptUrl,
          ).catch((error) => {
            log.warn(
              `Could not delete previous transcript: ${toErrorMessage(error)}`,
            );
          });
        }
      } catch (error) {
        log.warn(
          `Could not publish OpenCode transcript: ${toErrorMessage(error)}`,
        );
      }
    } else if (response.transcriptWarning) {
      log.warn(response.transcriptWarning);
    }
    await recordGenerationUsage({ problemId: problem.id, response });

    if (!response.outputText.trim()) {
      throw new Error("Provider response missing output text");
    }

    const parsed = JSON.parse(response.outputText);
    const outputData = problemResultSchema.parse(parsed);

    if (outputData.status === "unsolvable") {
      const reason = outputData.reason;
      log.warn(`Problem ${label} reported as unsolvable: ${reason}`);

      await prisma.problem.update({
        where: { id: problem.id },
        data: problemUpdateData({
          ...pipelineStateData("FAILED"),
          reviewStatus: "UNSOLVABLE",
          generationStartedAt: null,
          lastGenerationError: reason,
          ...generationAuditData(response, transcriptUrl),
        }),
      });

      revalidateProblem(problem);

      await discordLog({
        title: "🚫 Unsolvable Problem",
        description: `Model reported that problem **${label}** cannot be solved.\n**Reason:** ${reason}`,
        color: DISCORD_COLORS.error,
      });

      return { processed: 1, outcome: "unsolvable" };
    }

    await saveProblemContent(
      problem.id,
      outputData,
      toGenerationAuditInfo(response, transcriptUrl),
    );

    return { processed: 1, outcome: "succeeded" };
  } catch (error) {
    const statementUnavailable =
      error instanceof ProblemStatementUnavailableError;
    const reason = statementUnavailable
      ? `Statement fetch failed for ${label}: ${toErrorMessage(error)}`
      : `Generation failed for ${label}: ${toErrorMessage(error)}`;
    log.error(reason);

    if (statementUnavailable) {
      await releaseClaimedProblemAfterStatementFailure({ problem, reason });
    } else {
      await markClaimedProblemFailed({
        problem,
        reason,
        response,
        transcriptUrl,
      });
    }

    return { processed: 0, outcome: "failed", error: reason };
  }
}
