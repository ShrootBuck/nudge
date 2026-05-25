import type { Prisma } from "@prisma/client";
import { logger, task } from "@trigger.dev/sdk";
import { generateStructuredResponse, type StructuredResponse } from "../lib/ai";
import { safeRevalidateTag } from "../lib/cache-revalidate";
import { PROBLEM_LIST_TAG, problemTag } from "../lib/cache-tags";
import { DISCORD_COLORS } from "../lib/discord-webhook";
import { prisma } from "../lib/prisma";
import {
  pipelineStateData,
  problemUpdateData,
  problemWhere,
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

const MAX_GENERATION_ATTEMPTS = 3;

type ProblemForGeneration = {
  id: string;
  contestId: number;
  index: string;
  name: string;
  rating: number | null;
  tags: string[];
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
    promptTokens: response.promptTokens,
    completionTokens: response.completionTokens,
    totalTokens: response.totalTokens,
    costCredits: response.costCredits,
    finishReason: response.finishReason,
    nativeFinishReason: response.nativeFinishReason,
    providerName: response.providerName,
  };
}

function generationAuditData(
  response: StructuredResponse,
): Pick<
  Prisma.ProblemUpdateInput,
  | "generatedByDisplayName"
  | "generatedByModel"
  | "generationResponseId"
  | "generationPromptTokens"
  | "generationCompletionTokens"
  | "generationTotalTokens"
  | "generationCostCredits"
  | "generationFinishReason"
  | "generationNativeFinishReason"
  | "generationProviderName"
> {
  const audit = toGenerationAuditInfo(response);

  return {
    generatedByDisplayName: audit.displayName,
    generatedByModel: audit.resolvedModel,
    generationResponseId: audit.responseId,
    generationPromptTokens: audit.promptTokens,
    generationCompletionTokens: audit.completionTokens,
    generationTotalTokens: audit.totalTokens,
    generationCostCredits: audit.costCredits,
    generationFinishReason: audit.finishReason,
    generationNativeFinishReason: audit.nativeFinishReason,
    generationProviderName: audit.providerName,
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

function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

async function incrementDailyTokens(dateKey: string, tokens: number) {
  await prisma.dailyTokenUsage.upsert({
    where: { date: dateKey },
    create: { date: dateKey, tokens },
    update: { tokens: { increment: tokens } },
  });
}

export const generateContentTask = task({
  id: "generate-content-task",
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  run: async (payload: { problemId: string; adminBypass?: boolean }) => {
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

    const dateKey = utcDateKey();

    const whereClause = payload.adminBypass
      ? problemWhere({ id: problem.id })
      : problemWhere({
          id: problem.id,
          runState: { in: ["IDLE", "FAILED"] },
          generationAttempts: { lt: MAX_GENERATION_ATTEMPTS },
          reviewStatus: { not: "UNSOLVABLE" },
        });

    const updated = await prisma.problem.updateMany({
      where: whereClause,
      data: problemUpdateData({
        ...pipelineStateData("RUNNING"),
        generationAttempts: { increment: 1 },
        ...(payload.adminBypass ? { reviewStatus: "UNREVIEWED" } : {}),
        generationStartedAt: new Date(),
        lastGenerationError: null,
      }),
    });

    if (updated.count === 0) {
      logger.warn("Problem was already picked up for generation", {
        problemId: problem.id,
      });
      return { processed: 0, tokensUsed: 0 };
    }

    const result = await executeGeneration(problem, dateKey);

    if (result.processed > 0) {
      await discordLog({
        title: "⚡ On-Demand Generation Complete",
        description: `Processed a problem using Kimi K2.6 (thinking).`,
        color: DISCORD_COLORS.info,
        fields: [
          { name: "Tokens used", value: `${result.tokensUsed}`, inline: true },
          { name: "UTC date", value: dateKey, inline: true },
        ],
      });
    }

    return { processed: result.processed, tokensUsed: result.tokensUsed };
  },
});

// ---------------------------------------------------------------------------
// Shared generation flow for on-demand tasks.
// ---------------------------------------------------------------------------

type GenerationResult = {
  processed: number;
  tokensUsed: number;
};

async function executeGeneration(
  problem: ProblemForGeneration,
  dateKey: string,
): Promise<GenerationResult> {
  const label = toProblemLabel(problem);

  let processed = 0;
  let tokensUsed = 0;

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

    const response = await generateStructuredResponse({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      outputSchema: problemOutputSchema,
    });

    if (!response.outputText.trim()) {
      throw new Error("Provider response missing output text");
    }

    const parsed = JSON.parse(response.outputText);
    const outputData = problemResultSchema.parse(parsed);
    const usedTokens = response.totalTokens ?? 0;

    if (usedTokens > 0) {
      await incrementDailyTokens(dateKey, usedTokens);
      tokensUsed += usedTokens;
    }

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
      }),
    });

    revalidateProblems([problem]);
  }

  return { processed, tokensUsed };
}
