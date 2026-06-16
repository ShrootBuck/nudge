import { logger, schedules } from "@trigger.dev/sdk";
import { DISCORD_COLORS, sendDiscordWebhook } from "../lib/discord-webhook";
import { getRequiredEnv, SITE_URL } from "../lib/env";
import { prisma } from "../lib/prisma";

export const reportDigest = schedules.task({
  id: "report-digest",
  cron: {
    pattern: "0 0 * * *",
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

    const problemCounts = new Map<
      string,
      { count: number; problem: (typeof reports)[0]["problem"] }
    >();
    for (const r of reports) {
      const existing = problemCounts.get(r.problemId);
      if (existing) {
        existing.count++;
      } else {
        problemCounts.set(r.problemId, { count: 1, problem: r.problem });
      }
    }

    const top5 = Array.from(problemCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const top5Lines = top5.map((entry, i) => {
      const tag = `${entry.problem.contestId}${entry.problem.index}`;
      const link = `${SITE_URL}/problem/${entry.problem.contestId}/${entry.problem.index}`;
      return `**${i + 1}.** [${tag} — ${entry.problem.name}](${link}) — **${entry.count}** report${entry.count === 1 ? "" : "s"}`;
    });

    const lines = reports.map((r) => {
      const tag = `${r.problem.contestId}${r.problem.index}`;
      const link = `${SITE_URL}/problem/${r.problem.contestId}/${r.problem.index}`;
      const reason = r.reason ?? "_No reason given_";
      const time = `<t:${Math.floor(r.createdAt.getTime() / 1000)}:R>`;
      return `**[${tag} — ${r.problem.name}](${link})**\n${reason}\n${time}`;
    });

    const description = [
      "**🔥 Top Reported Problems**",
      top5Lines.join("\n"),
      "",
      "**📋 All Reports**",
      ...lines,
    ].join("\n");

    await sendDiscordWebhook(
      getRequiredEnv("DISCORD_WEBHOOK_URL"),
      {
        title: `🚩 ${reports.length} new report${reports.length === 1 ? "" : "s"} today`,
        description,
        color: DISCORD_COLORS.warning,
      },
      { throwOnError: true },
    );

    logger.info(`Sent digest with ${reports.length} report(s)`);
    return { sent: true, count: reports.length };
  },
});
