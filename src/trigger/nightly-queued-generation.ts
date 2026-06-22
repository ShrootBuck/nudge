import { logger, schedules, tasks } from "@trigger.dev/sdk";
import {
  AUTOMATIC_GENERATION_SOURCE,
  selectAndClaimNextAutomaticGenerationProblem,
} from "../lib/generation-queue";
import type { generateContentTask } from "./generate-content";
import { markClaimedProblemFailed } from "./generate-content/execution";

function problemLabel(problem: { contestId: number; index: string }) {
  return `${problem.contestId}${problem.index}`;
}

export const nightlyQueuedGeneration = schedules.task({
  id: "nightly-queued-generation",
  queue: { concurrencyLimit: 1 },
  retry: { maxAttempts: 1 },
  cron: {
    pattern: "0 0 * * *",
    timezone: "America/Phoenix",
  },
  run: async () => {
    const selection = await selectAndClaimNextAutomaticGenerationProblem();

    if (!selection) {
      logger.info("Skipping nightly generation; no eligible problems");
      return {
        triggered: false,
        skipped: "no-eligible-problems",
      };
    }

    const { problem, selectionReason } = selection;
    const label = problemLabel(problem);
    logger.info("Triggering nightly queued generation", {
      problemId: problem.id,
      problem: label,
      name: problem.name,
      selectionReason,
      requestedCount: problem.requestedCount,
      generationAttempts: problem.generationAttempts,
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
        const reason = `Nightly queued generation failed to start: ${String(
          error,
        )}`;
        await markClaimedProblemFailed({ problem, reason });
        throw error;
      }
    })();

    if (!result.ok) {
      await markClaimedProblemFailed({
        problem,
        reason: `Nightly queued generation task failed: ${result.id}`,
      });
      logger.error("Nightly queued generation task failed", {
        runId: result.id,
        problemId: problem.id,
        problem: label,
        error: String(result.error),
      });
      throw new Error(`Nightly queued generation task failed: ${result.id}`);
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
