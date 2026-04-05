import { logger, schedules } from "@trigger.dev/sdk";
import { DISCORD_COLORS, sendDiscordWebhook } from "../lib/discord-webhook";
import { getRequiredEnv, SITE_URL } from "../lib/env";
import { prisma } from "../lib/prisma";

export const reportDigest = schedules.task({
  id: "report-digest",
  cron: {
    pattern: "0 0 * * *", // midnight daily
    timezone: "America/Phoenix",
  },
  run: async () => {
    const since = new Date();
    since.setDate(since.getDate() - 1);

    const reports = await prisma.report.findMany({
      where: { createdAt: { gte: since } },
      include: {
        problem: { select: { contestId: true, index: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    if (reports.length === 0) {
      logger.info("No reports in the last 24 hours");
      return { sent: false, count: 0 };
    }

    const lines = reports.map((r) => {
      const tag = `${r.problem.contestId}${r.problem.index}`;
      const link = `${SITE_URL}/problem/${r.problem.contestId}/${r.problem.index}`;
      const reason = r.reason ?? "_No reason given_";
      const time = `<t:${Math.floor(r.createdAt.getTime() / 1000)}:R>`;
      return `**[${tag} — ${r.problem.name}](${link})**\n${reason}\n${time}`;
    });

    await sendDiscordWebhook(
      getRequiredEnv("DISCORD_WEBHOOK_URL"),
      {
        title: `🚩 ${reports.length} new report${reports.length === 1 ? "" : "s"} today`,
        description: lines.join("\n\n"),
        color: DISCORD_COLORS.warning,
      },
      { throwOnError: true },
    );

    logger.info(`Sent digest with ${reports.length} report(s)`);
    return { sent: true, count: reports.length };
  },
});
