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

const AUTO_QUEUE_LIMIT = 10;

export const autoQueueMostRequested = schedules.task({
  id: "auto-queue-most-requested",
  cron: {
    pattern: "59 23 * * *",
    timezone: "America/Phoenix",
  },
  run: async () => {
    const problems = await prisma.problem.findMany({
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
      take: AUTO_QUEUE_LIMIT,
    });

    if (problems.length === 0) {
      logger.info("No backlog problem found to auto-queue");
      return { queued: 0 };
    }

    const queuedProblems: Array<{ label: string; requestedCount: number }> = [];

    for (const problem of problems) {
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
      queuedProblems.push({ label, requestedCount: problem.requestedCount });
      logger.info(`Auto-queued backlog problem ${label}`, {
        requestedCount: problem.requestedCount,
      });
    }

    await discordLog({
      title: `🤖 Auto-Queued ${queuedProblems.length} Most Requested`,
      description: queuedProblems
        .map(
          ({ label, requestedCount }, index) =>
            `${index + 1}. **${label}** (requested count: **${requestedCount}**)`,
        )
        .join("\n"),
      color: DISCORD_COLORS.violet,
    });

    return {
      queued: problems.length,
      problems: problems.map((problem) => `${problem.contestId}${problem.index}`),
    };
  },
});
