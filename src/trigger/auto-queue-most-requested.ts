import { logger, schedules } from "@trigger.dev/sdk";
import { DISCORD_COLORS } from "../lib/discord-webhook";
import { prisma } from "../lib/prisma";
import {
  backlogWhere,
  pipelineStateData,
  problemUpdateData,
  problemWhere,
} from "../lib/problem-pipeline-db";
import { discordLog } from "./discord-log";

export const autoQueueMostRequested = schedules.task({
  id: "auto-queue-most-requested",
  cron: {
    pattern: "0 0 * * *",
    timezone: "America/Phoenix",
  },
  run: async () => {
    const problem = await prisma.problem.findFirst({
      where: problemWhere(backlogWhere()),
      select: {
        id: true,
        contestId: true,
        index: true,
        requestedCount: true,
      },
      orderBy: {
        requestedCount: "desc",
      },
    });

    if (!problem) {
      logger.info("No backlog problem found to auto-queue");
      return { queued: 0 };
    }

    await prisma.problem.update({
      where: { id: problem.id },
      data: problemUpdateData({
        ...pipelineStateData("READY", "IDLE"),
        activeBatchId: null,
        processingStartedAt: null,
        lastGenerationError: null,
      }),
    });

    const label = `${problem.contestId}${problem.index}`;
    logger.info(`Auto-queued backlog problem ${label}`, {
      requestedCount: problem.requestedCount,
    });

    await discordLog({
      title: "🤖 Auto-Queued Most Requested",
      description: `Marked **${label}** ready for generation (requested count: **${problem.requestedCount}**).`,
      color: DISCORD_COLORS.violet,
    });

    return { queued: 1, problem: label };
  },
});
