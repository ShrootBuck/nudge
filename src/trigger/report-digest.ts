import { logger, schedules } from "@trigger.dev/sdk";
import { DISCORD_COLORS, sendDiscordWebhook } from "../lib/discord-webhook";
import { getRequiredEnv, SITE_URL } from "../lib/env";
import { prisma } from "../lib/prisma";
import { chunkReportDigest } from "../lib/report-digest";

const RESOLVED_REPORT_RETENTION_DAYS = 30;
const REPORT_BATCH_SIZE = 100;

const RESOLUTION_LABELS = {
  VERIFIED: "dismissed after verification",
  INCORRECT: "confirmed and marked incorrect",
  REGENERATED: "superseded by regeneration",
} as const;

export const reportDigest = schedules.task({
  id: "report-digest",
  queue: { concurrencyLimit: 1 },
  cron: {
    pattern: "0 0 * * *",
    timezone: "America/Phoenix",
  },
  run: async () => {
    const deleteBefore = new Date();
    deleteBefore.setDate(
      deleteBefore.getDate() - RESOLVED_REPORT_RETENTION_DAYS,
    );

    const deletedReports = await prisma.report.deleteMany({
      where: {
        digestedAt: { not: null },
        resolvedAt: { lte: deleteBefore },
      },
    });

    if (deletedReports.count > 0) {
      logger.info(
        `Deleted ${deletedReports.count} resolved report(s) older than ${RESOLVED_REPORT_RETENTION_DAYS} days`,
      );
    }

    const reports = await prisma.report.findMany({
      where: { digestedAt: null },
      include: {
        problem: { select: { contestId: true, index: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
      take: REPORT_BATCH_SIZE,
    });

    if (reports.length === 0) {
      logger.info("No undigested reports");
      return { sent: false, count: 0, deleted: deletedReports.count };
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

    const entries = reports.map((r) => {
      const tag = `${r.problem.contestId}${r.problem.index}`;
      const link = `${SITE_URL}/problem/${r.problem.contestId}/${r.problem.index}`;
      const reason = r.reason ?? "_No reason given_";
      const time = `<t:${Math.floor(r.createdAt.getTime() / 1000)}:R>`;
      const resolution = r.resolution
        ? `\n_Already handled: ${RESOLUTION_LABELS[r.resolution]}._`
        : "";
      return {
        id: r.id,
        text: `**[${tag} — ${r.problem.name}](${link})**\n${reason}\n${time}${resolution}`,
      };
    });

    const summary = [
      "**🔥 Top Reported Problems**",
      top5Lines.join("\n"),
      "",
      "**📋 All Reports**",
    ].join("\n");
    const chunks = chunkReportDigest({ summary, entries });
    const webhookUrl = getRequiredEnv("DISCORD_WEBHOOK_URL");
    let markedDigestedCount = 0;

    for (const [index, chunk] of chunks.entries()) {
      const partLabel =
        chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : "";
      await sendDiscordWebhook(
        webhookUrl,
        {
          title: `🚩 ${reports.length} new report${reports.length === 1 ? "" : "s"}${partLabel}`,
          description: chunk.description,
          color: DISCORD_COLORS.warning,
        },
        { throwOnError: true },
      );

      const markedDigested = await prisma.report.updateMany({
        where: {
          id: { in: chunk.reportIds },
          digestedAt: null,
        },
        data: { digestedAt: new Date() },
      });
      markedDigestedCount += markedDigested.count;
    }

    logger.info(
      `Sent ${chunks.length} digest message(s) with ${reports.length} report(s); marked ${markedDigestedCount} as digested`,
    );
    return {
      sent: true,
      count: reports.length,
      markedDigested: markedDigestedCount,
      messages: chunks.length,
      deleted: deletedReports.count,
    };
  },
});
