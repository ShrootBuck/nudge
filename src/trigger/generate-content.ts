import type { Prisma } from "@prisma/client";
import { logger, task } from "@trigger.dev/sdk";
import { generateStructuredResponse, type StructuredResponse } from "../lib/ai";
import {
  formatOpenAIDailyTokenUsage,
  getOpenAIDailyTokenUsage,
  recordOpenAIGenerationUsage,
} from "../lib/ai/token-budget";
import { safeRevalidateTag } from "../lib/cache-revalidate";
import { PROBLEM_LIST_TAG, problemTag } from "../lib/cache-tags";
import { DISCORD_COLORS } from "../lib/discord-webhook";
import {
  AUTOMATIC_GENERATION_SOURCE,
  type AutomaticGenerationSource,
  automaticGenerationProblemWhere,
} from "../lib/generation-queue";
import { prisma } from "../lib/prisma";
import {
  pipelineStateData,
  problemUpdateData,
} from "../lib/problem-pipeline-db";
import { discordLog } from "./discord-log";
import {
  problemOutputSchema,
  problemResultSchema,
} from "./generate-content/content-schema";
import {
  type GenerationAuditInfo,
  saveProblemContent,
} from "./generate-content/persistence";
import { fetchProblemStatement } from "./generate-content/problem-statement";
import { buildPrompt, SYSTEM_PROMPT } from "./generate-content/prompt";

type ProblemForGeneration = {
  id: string;
  contestId: number;
  index: string;
  name: string;
  rating: number | null;
  tags: string[];
};

export type GenerateContentPayload = {
  problemId: string;
  adminBypass?: boolean;
  source?: AutomaticGenerationSource;
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function toProblemLabel(
  problem: Pick<ProblemForGeneration, "contestId" | "index">,
) {
  return `${problem.contestId}${problem.index}`;
}

function toGenerationAuditInfo(
  response: StructuredResponse,
): GenerationAuditInfo {
  return {
    displayName: response.displayName,
    responseId: response.responseId,
    resolvedModel: response.resolvedModel,
    finishReason: response.finishReason,
    nativeFinishReason: response.nativeFinishReason,
    providerName: response.providerName,
    totalTokens: response.totalTokens,
  };
}

function generationAuditData(
  response: StructuredResponse,
): Pick<
  Prisma.ProblemUpdateInput,
  | "generatedByDisplayName"
  | "generatedByModel"
  | "generationResponseId"
  | "generationFinishReason"
  | "generationNativeFinishReason"
  | "generationProviderName"
  | "generationTotalTokens"
> {
  const audit = toGenerationAuditInfo(response);

  return {
    generatedByDisplayName: audit.displayName,
    generatedByModel: audit.resolvedModel,
    generationResponseId: audit.responseId,
    generationFinishReason: audit.finishReason,
    generationNativeFinishReason: audit.nativeFinishReason,
    generationProviderName: audit.providerName,
    generationTotalTokens: audit.totalTokens,
  };
}

function revalidateProblems(
  problems: Array<Pick<ProblemForGeneration, "contestId" | "index">>,
) {
  if (problems.length === 0) return;

  safeRevalidateTag(PROBLEM_LIST_TAG, "max");
  for (const problem of problems) {
    safeRevalidateTag(problemTag(problem.contestId, problem.index), "max");
  }
}

export const generateContentTask = task({
  id: "generate-content-task",
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async (payload: GenerateContentPayload) => {
    if (!payload.adminBypass) {
      logger.warn(
        "Automatic generation is disabled; admin bypass is required",
        {
          problemId: payload.problemId,
        },
      );
      return { processed: 0, skipped: "manual-admin-only" };
    }

    const problem = await prisma.problem.findUnique({
      where: { id: payload.problemId },
      select: {
        id: true,
        contestId: true,
        index: true,
        name: true,
        rating: true,
        tags: true,
      },
    });

    if (!problem) {
      logger.error(`Problem not found: ${payload.problemId}`);
      return { error: "Problem not found" };
    }

    const budget = await getOpenAIDailyTokenUsage();
    if (budget.exhausted) {
      logger.warn("OpenAI daily generation token cap reached", {
        problemId: problem.id,
        usage: formatOpenAIDailyTokenUsage(budget),
      });
      return {
        processed: 0,
        skipped: "openai-daily-generation-token-cap-reached",
        usedTokens: budget.usedTokens,
        dailyTokenCap: budget.dailyTokenCap,
        grantDate: budget.grantDate,
      };
    }

    const updated = await prisma.problem.updateMany({
      where:
        payload.source === AUTOMATIC_GENERATION_SOURCE
          ? { id: problem.id, ...automaticGenerationProblemWhere() }
          : { id: problem.id },
      data: problemUpdateData({
        ...pipelineStateData("RUNNING"),
        generationAttempts: { increment: 1 },
        reviewStatus: "UNREVIEWED",
        generationStartedAt: new Date(),
        lastGenerationError: null,
      }),
    });

    if (updated.count === 0) {
      logger.warn("Problem was not eligible for generation", {
        problemId: problem.id,
        source: payload.source,
      });
      return { processed: 0, skipped: "not-eligible-for-generation" };
    }

    const result = await executeGeneration(problem);

    if (result.processed > 0) {
      await discordLog({
        title:
          payload.source === AUTOMATIC_GENERATION_SOURCE
            ? "⚡ Hourly Generation Complete"
            : "⚡ On-Demand Generation Complete",
        description: `Processed a problem using GPT-5.5 via AI SDK.`,
        color: DISCORD_COLORS.info,
      });
    }

    return { processed: result.processed };
  },
});

// ---------------------------------------------------------------------------
// Shared generation flow for on-demand tasks.
// ---------------------------------------------------------------------------

type GenerationResult = {
  processed: number;
};

async function executeGeneration(
  problem: ProblemForGeneration,
): Promise<GenerationResult> {
  const label = toProblemLabel(problem);

  let processed = 0;
  let response: StructuredResponse | null = null;

  try {
    const statement = await fetchProblemStatement(
      problem.contestId,
      problem.index,
    );
    const textPrompt = buildPrompt(problem, statement?.html);
    const userPrompt =
      statement?.images && statement.images.length > 0
        ? [
            { type: "text" as const, text: textPrompt },
            ...statement.images.map((url) => ({
              type: "image_url" as const,
              image_url: { url },
            })),
          ]
        : textPrompt;

    logger.info(`Running generation for ${label}`);

    response = await generateStructuredResponse({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      outputSchema: problemOutputSchema,
    });
    await recordOpenAIGenerationUsage({ problemId: problem.id, response });

    if (!response.outputText.trim()) {
      throw new Error("Provider response missing output text");
    }

    const parsed = JSON.parse(response.outputText);
    const outputData = problemResultSchema.parse(parsed);

    if (outputData.status === "unsolvable") {
      const reason = outputData.reason;
      logger.warn(`Problem ${label} reported as unsolvable: ${reason}`);

      await prisma.problem.update({
        where: { id: problem.id },
        data: problemUpdateData({
          ...pipelineStateData("FAILED"),
          reviewStatus: "UNSOLVABLE",
          generationStartedAt: null,
          lastGenerationError: reason,
          ...generationAuditData(response),
        }),
      });

      revalidateProblems([problem]);

      await discordLog({
        title: "🚫 Unsolvable Problem",
        description: `Model reported that problem **${label}** cannot be solved.\n**Reason:** ${reason}`,
        color: DISCORD_COLORS.error,
      });
    } else {
      await saveProblemContent(
        problem.id,
        outputData,
        toGenerationAuditInfo(response),
      );
    }

    processed = 1;
  } catch (error) {
    const reason = `Generation failed for ${label}: ${toErrorMessage(error)}`;
    logger.error(reason);

    await prisma.problem.update({
      where: { id: problem.id },
      data: problemUpdateData({
        ...pipelineStateData("FAILED"),
        generationStartedAt: null,
        lastGenerationError: reason,
        ...(response ? generationAuditData(response) : {}),
      }),
    });

    revalidateProblems([problem]);
  }

  return { processed };
}
