import { logger, schedules, tasks } from "@trigger.dev/sdk";
import {
  formatOpenAIDailyTokenUsage,
  getOpenAIDailyTokenUsage,
} from "../lib/ai/token-budget";
import {
  AUTOMATIC_GENERATION_SOURCE,
  automaticGenerationProblemOrderBy,
  automaticGenerationProblemWhere,
} from "../lib/generation-queue";
import { prisma } from "../lib/prisma";
import type { generateContentTask } from "./generate-content";

function problemLabel(problem: { contestId: number; index: string }) {
  return `${problem.contestId}${problem.index}`;
}

export const hourlyQueuedGeneration = schedules.task({
  id: "hourly-queued-generation",
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  cron: {
    pattern: "0 * * * *",
    timezone: "UTC",
  },
  run: async () => {
    const budget = await getOpenAIDailyTokenUsage();
    if (budget.exhausted) {
      logger.info("Skipping hourly generation; OpenAI token cap reached", {
        usage: formatOpenAIDailyTokenUsage(budget),
      });

      return {
        triggered: false,
        skipped: "openai-daily-generation-token-cap-reached",
        usedTokens: budget.usedTokens,
        dailyTokenCap: budget.dailyTokenCap,
        grantDate: budget.grantDate,
      };
    }

    const problem = await prisma.problem.findFirst({
      where: automaticGenerationProblemWhere(),
      orderBy: automaticGenerationProblemOrderBy(),
      select: {
        id: true,
        contestId: true,
        index: true,
        name: true,
        requestedCount: true,
        generationAttempts: true,
      },
    });

    if (!problem) {
      logger.info("Skipping hourly generation; no queued problems");
      return {
        triggered: false,
        skipped: "no-queued-problems",
        usedTokens: budget.usedTokens,
        dailyTokenCap: budget.dailyTokenCap,
        grantDate: budget.grantDate,
      };
    }

    const label = problemLabel(problem);
    logger.info("Triggering hourly queued generation", {
      problemId: problem.id,
      problem: label,
      name: problem.name,
      requestedCount: problem.requestedCount,
      generationAttempts: problem.generationAttempts,
      usage: formatOpenAIDailyTokenUsage(budget),
    });

    const result = await tasks.triggerAndWait<typeof generateContentTask>(
      "generate-content-task",
      {
        problemId: problem.id,
        adminBypass: true,
        source: AUTOMATIC_GENERATION_SOURCE,
      },
      {
        tags: [AUTOMATIC_GENERATION_SOURCE, `problem:${problem.id}`],
      },
    );

    if (!result.ok) {
      logger.error("Hourly queued generation task failed", {
        runId: result.id,
        problemId: problem.id,
        problem: label,
        error: String(result.error),
      });
      throw new Error(`Hourly queued generation task failed: ${result.id}`);
    }

    return {
      triggered: true,
      runId: result.id,
      problemId: problem.id,
      problem: label,
      requestedCount: problem.requestedCount,
      output: result.output,
    };
  },
});
