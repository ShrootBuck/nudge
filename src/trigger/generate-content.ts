import type { Prisma } from "@prisma/client";
import { logger, schedules } from "@trigger.dev/sdk";
import { safeRevalidateTag } from "../lib/cache-revalidate";
import { PROBLEM_LIST_TAG, problemTag } from "../lib/cache-tags";
import { DISCORD_COLORS } from "../lib/discord-webhook";
import { generateStructuredResponse } from "../lib/openai";
import { prisma } from "../lib/prisma";
import {
  pipelineStateData,
  problemOrderBy,
  problemUpdateData,
  problemWhere,
  readyToRunWhere,
} from "../lib/problem-pipeline-db";
import { discordLog } from "./discord-log";
import {
  problemOutputSchema,
  problemResultSchema,
} from "./generate-content/content-schema";
import { saveProblemContent } from "./generate-content/persistence";
import { fetchProblemStatement } from "./generate-content/problem-statement";
import { buildPrompt, SYSTEM_PROMPT } from "./generate-content/prompt";

const MODEL_ID = "gpt-5.5-2026-04-23";
const MODEL_EFFORT = "high";
const MODEL_DISPLAY_NAME = "GPT-5.5";
const DAILY_TOKEN_LIMIT = 200_000;
const MAX_GENERATION_ATTEMPTS = 3;
const STALE_GENERATION_THRESHOLD_HOURS = 6;

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

function revalidateProblems(
  problems: Array<Pick<ProblemForGeneration, "contestId" | "index">>,
) {
  if (problems.length === 0) {
    return;
  }

  safeRevalidateTag(PROBLEM_LIST_TAG, "max");
  for (const problem of problems) {
    safeRevalidateTag(problemTag(problem.contestId, problem.index), "max");
  }
}

function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

async function getDailyTokenUsage(dateKey: string) {
  const record = await prisma.dailyTokenUsage.findUnique({
    where: { date: dateKey },
    select: { tokens: true },
  });

  return record?.tokens ?? 0;
}

async function incrementDailyTokens(dateKey: string, tokens: number) {
  await prisma.dailyTokenUsage.upsert({
    where: { date: dateKey },
    create: { date: dateKey, tokens },
    update: { tokens: { increment: tokens } },
  });
}

async function fetchNextProblem(): Promise<ProblemForGeneration | null> {
  const where: Prisma.ProblemWhereInput = readyToRunWhere(
    MAX_GENERATION_ATTEMPTS,
  );

  return prisma.problem.findFirst({
    where: problemWhere(where),
    orderBy: problemOrderBy([
      { requestedCount: "desc" },
      { createdAt: "desc" },
    ]),
    select: {
      id: true,
      contestId: true,
      index: true,
      name: true,
      rating: true,
      tags: true,
    },
  });
}

async function recoverStaleGenerations() {
  const staleBefore = new Date(
    Date.now() - STALE_GENERATION_THRESHOLD_HOURS * 60 * 60 * 1000,
  );

  const staleProblems = await prisma.problem.findMany({
    where: problemWhere({
      runState: "RUNNING",
      generationStartedAt: { lt: staleBefore },
    }),
    select: {
      id: true,
      contestId: true,
      index: true,
    },
    take: 100,
  });

  if (staleProblems.length === 0) {
    return 0;
  }

  const staleIds = staleProblems.map((problem) => problem.id);

  const result = await prisma.problem.updateMany({
    where: problemWhere({ id: { in: staleIds }, runState: "RUNNING" }),
    data: problemUpdateData({
      ...pipelineStateData("READY", "FAILED"),
      generationStartedAt: null,
      lastGenerationError: `Generation exceeded ${STALE_GENERATION_THRESHOLD_HOURS}h without completion`,
    }),
  });

  revalidateProblems(staleProblems);

  logger.warn(`Recovered ${result.count} stale generation run(s)`);
  return result.count;
}

export const generateContentScheduler = schedules.task({
  id: "generate-content-scheduler",
  queue: { concurrencyLimit: 1 },
  cron: {
    pattern: "0 * * * *",
    timezone: "UTC",
  },
  run: async () => {
    const recovered = await recoverStaleGenerations();
    const dateKey = utcDateKey();
    let totalTokens = await getDailyTokenUsage(dateKey);

    if (totalTokens >= DAILY_TOKEN_LIMIT) {
      logger.info("Daily token limit already reached", {
        dateKey,
        totalTokens,
        limit: DAILY_TOKEN_LIMIT,
      });
      return {
        processed: 0,
        tokensUsed: 0,
        totalTokens,
        stopReason: "daily_limit",
      };
    }

    let processed = 0;
    let tokensUsed = 0;

    while (true) {
      if (totalTokens >= DAILY_TOKEN_LIMIT) {
        logger.info("Stopping hourly generation due to daily token limit", {
          dateKey,
          totalTokens,
          limit: DAILY_TOKEN_LIMIT,
        });
        break;
      }

      const problem = await fetchNextProblem();
      if (!problem) {
        logger.info("No ready problems to generate content for");
        break;
      }

      const label = toProblemLabel(problem);

      const updated = await prisma.problem.updateMany({
        where: problemWhere({
          id: problem.id,
          queueState: "READY",
          runState: { in: ["IDLE", "FAILED"] },
          generationAttempts: { lt: MAX_GENERATION_ATTEMPTS },
          reviewStatus: { not: "UNSOLVABLE" },
        }),
        data: problemUpdateData({
          ...pipelineStateData("READY", "RUNNING"),
          generationAttempts: { increment: 1 },
          generationStartedAt: new Date(),
          lastGenerationError: null,
        }),
      });

      if (updated.count === 0) {
        logger.warn("Problem was already picked up for generation", {
          problemId: problem.id,
        });
        continue;
      }

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
          model: MODEL_ID,
          effort: MODEL_EFFORT,
          systemPrompt: SYSTEM_PROMPT,
          userPrompt,
          outputSchema: problemOutputSchema,
        });

        if (!response.outputText.trim()) {
          throw new Error("OpenAI response missing output text");
        }

        const parsed = JSON.parse(response.outputText);
        const outputData = problemResultSchema.parse(parsed);
        const usedTokens = response.tokensUsed ?? 0;

        if (usedTokens > 0) {
          await incrementDailyTokens(dateKey, usedTokens);
          totalTokens += usedTokens;
          tokensUsed += usedTokens;
        }

        if (outputData.status === "unsolvable") {
          const reason = outputData.reason;
          logger.warn(`Problem ${label} reported as unsolvable: ${reason}`);

          await prisma.problem.update({
            where: { id: problem.id },
            data: problemUpdateData({
              ...pipelineStateData("BACKLOG", "FAILED"),
              reviewStatus: "UNSOLVABLE",
              generationStartedAt: null,
              lastGenerationError: reason,
              generatedByDisplayName: `${MODEL_DISPLAY_NAME} (${MODEL_EFFORT})`,
            }),
          });

          revalidateProblems([problem]);

          await discordLog({
            title: "🚫 Unsolvable Problem",
            description: `Model reported that problem **${label}** cannot be solved.\n**Reason:** ${reason}`,
            color: DISCORD_COLORS.error,
          });

          processed += 1;
          continue;
        }

        await saveProblemContent(problem.id, outputData, {
          displayName: `${MODEL_DISPLAY_NAME} (${MODEL_EFFORT})`,
        });

        processed += 1;
      } catch (error) {
        const reason = `Generation failed for ${label}: ${toErrorMessage(error)}`;
        logger.error(reason);

        await prisma.problem.update({
          where: { id: problem.id },
          data: problemUpdateData({
            ...pipelineStateData("READY", "FAILED"),
            generationStartedAt: null,
            lastGenerationError: reason,
          }),
        });

        revalidateProblems([problem]);
      }
    }

    if (processed > 0) {
      await discordLog({
        title: "⏱️ Hourly Generation Complete",
        description: `Processed **${processed}** problem${processed === 1 ? "" : "s"} using ${MODEL_DISPLAY_NAME} (${MODEL_EFFORT}).`,
        color: DISCORD_COLORS.info,
        fields: [
          { name: "Tokens used", value: `${tokensUsed}`, inline: true },
          { name: "UTC date", value: dateKey, inline: true },
        ],
      });
    }

    return {
      processed,
      tokensUsed,
      totalTokens,
      recovered,
      stopReason: totalTokens >= DAILY_TOKEN_LIMIT ? "daily_limit" : "empty",
    };
  },
});
