import { logger, task } from "@trigger.dev/sdk";
import { DISCORD_COLORS } from "../lib/discord-webhook";
import { prisma } from "../lib/prisma";
import { backlogWhere, problemWhere } from "../lib/problem-pipeline-db";
import { discordLog } from "./discord-log";

const AUTO_QUEUE_LIMIT = 1;

export const autoQueueMostRequested = task({
  id: "auto-queue-most-requested",
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
      const label = `${problem.contestId}${problem.index}`;
      queuedProblems.push({ label, requestedCount: problem.requestedCount });
      logger.info(`Auto-queue disabled; leaving ${label} in BACKLOG`, {
        requestedCount: problem.requestedCount,
      });
    }

    await discordLog({
      title: "🚫 Auto-Queue Disabled",
      description: queuedProblems
        .map(
          ({ label, requestedCount }, index) =>
            `${index + 1}. **${label}** (requested count: **${requestedCount}**)`,
        )
        .join("\n"),
      color: DISCORD_COLORS.warning,
    });

    return {
      queued: 0,
      problems: problems.map(
        (problem) => `${problem.contestId}${problem.index}`,
      ),
    };
  },
});
