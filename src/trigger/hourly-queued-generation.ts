import { logger, schedules, tasks } from "@trigger.dev/sdk";
import {
  formatOpenAIDailyTokenUsage,
  getOpenAIDailyTokenUsage,
} from "../lib/ai/token-budget";
import {
  AUTOMATIC_GENERATION_SOURCE,
  selectAndClaimNextAutomaticGenerationProblem,
} from "../lib/generation-queue";
import type { generateContentTask } from "./generate-content";
import { markClaimedProblemFailed } from "./generate-content/execution";

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

    const selection = await selectAndClaimNextAutomaticGenerationProblem();

    if (!selection) {
      logger.info("Skipping hourly generation; no eligible problems");
      return {
        triggered: false,
        skipped: "no-eligible-problems",
        usedTokens: budget.usedTokens,
        dailyTokenCap: budget.dailyTokenCap,
        grantDate: budget.grantDate,
      };
    }

    const { problem, selectionReason } = selection;
    const label = problemLabel(problem);
    logger.info("Triggering hourly queued generation", {
      problemId: problem.id,
      problem: label,
      name: problem.name,
      selectionReason,
      requestedCount: problem.requestedCount,
      generationAttempts: problem.generationAttempts,
      usage: formatOpenAIDailyTokenUsage(budget),
    });

    const result = await (async () => {
      try {
        return await tasks.triggerAndWait<typeof generateContentTask>(
          "generate-content-task",
          {
            problemId: problem.id,
            adminBypass: true,
            source: AUTOMATIC_GENERATION_SOURCE,
            preclaimed: true,
          },
          {
            tags: [AUTOMATIC_GENERATION_SOURCE, `problem:${problem.id}`],
          },
        );
      } catch (error) {
        const reason = `Hourly queued generation failed to start: ${String(
          error,
        )}`;
        await markClaimedProblemFailed({ problem, reason });
        throw error;
      }
    })();

    if (!result.ok) {
      await markClaimedProblemFailed({
        problem,
        reason: `Hourly queued generation task failed: ${result.id}`,
      });
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
      selectionReason,
      requestedCount: problem.requestedCount,
      output: result.output,
    };
  },
});
