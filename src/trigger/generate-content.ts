import { logger, task } from "@trigger.dev/sdk";
import { generateStructuredResponse } from "../lib/ai";
import { DISCORD_COLORS } from "../lib/discord-webhook";
import {
  AUTOMATIC_GENERATION_SOURCE,
  type AutomaticGenerationSource,
  automaticGenerationProblemSelect,
  claimProblemForGeneration,
} from "../lib/generation-queue";
import { prisma } from "../lib/prisma";
import { discordLog } from "./discord-log";
import { executeProblemGeneration } from "./generate-content/execution";

export type GenerateContentPayload = {
  problemId: string;
  adminBypass?: boolean;
  source?: AutomaticGenerationSource;
  preclaimed?: boolean;
};

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

    if (payload.preclaimed && payload.source !== AUTOMATIC_GENERATION_SOURCE) {
      logger.error("Preclaimed generation requires the automatic source", {
        problemId: payload.problemId,
        source: payload.source,
      });
      return { processed: 0, skipped: "invalid-preclaimed-source" };
    }

    const problem = await prisma.problem.findUnique({
      where: { id: payload.problemId },
      select: automaticGenerationProblemSelect,
    });

    if (!problem) {
      logger.error(`Problem not found: ${payload.problemId}`);
      return { error: "Problem not found" };
    }

    if (payload.preclaimed && problem.runState !== "RUNNING") {
      logger.warn("Preclaimed problem is not running", {
        problemId: problem.id,
        runState: problem.runState,
      });
      return { processed: 0, skipped: "preclaimed-problem-not-running" };
    }

    if (!payload.preclaimed) {
      const claimed = await claimProblemForGeneration({
        problemId: problem.id,
        requireAutomaticEligibility:
          payload.source === AUTOMATIC_GENERATION_SOURCE,
      });

      if (!claimed) {
        logger.warn("Problem was not eligible for generation", {
          problemId: problem.id,
          source: payload.source,
        });
        return { processed: 0, skipped: "not-eligible-for-generation" };
      }
    }

    const result = await executeProblemGeneration({
      problem,
      generate: generateStructuredResponse,
      log: logger,
    });

    if (result.processed > 0) {
      await discordLog({
        title:
          payload.source === AUTOMATIC_GENERATION_SOURCE
            ? "⚡ Nightly Generation Complete"
            : "⚡ On-Demand Generation Complete",
        description:
          "Processed a problem using GPT-5.5 (xhigh) through Codex CLI.",
        color: DISCORD_COLORS.info,
      });
    }

    return { processed: result.processed };
  },
});
