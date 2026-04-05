import type { Prisma } from "@prisma/client";
import { logger, task } from "@trigger.dev/sdk";
import { prisma } from "../lib/prisma";
import { discordLog } from "./discord-log";

interface BackfillPayload {
  ratingMin?: number;
  ratingMax?: number;
  contestIdMin?: number;
  contestIdMax?: number;
  tags?: string[];
  limit?: number; // max problems to queue, defaults to 100
}

// Manually triggered — marks UNQUEUED problems as PENDING based on filters
export const backfill = task({
  id: "backfill",
  run: async (payload: BackfillPayload) => {
    const {
      ratingMin,
      ratingMax,
      contestIdMin,
      contestIdMax,
      tags,
      limit = 100,
    } = payload;

    logger.info("Starting backfill", {
      ratingMin,
      ratingMax,
      contestIdMin,
      contestIdMax,
      tags,
      limit,
    });

    const where: Prisma.ProblemWhereInput = {
      generationStatus: "UNQUEUED",
    };

    if (ratingMin !== undefined || ratingMax !== undefined) {
      where.rating = {
        ...(ratingMin !== undefined ? { gte: ratingMin } : {}),
        ...(ratingMax !== undefined ? { lte: ratingMax } : {}),
      };
    }

    if (contestIdMin !== undefined || contestIdMax !== undefined) {
      where.contestId = {
        ...(contestIdMin !== undefined ? { gte: contestIdMin } : {}),
        ...(contestIdMax !== undefined ? { lte: contestIdMax } : {}),
      };
    }

    if (tags && tags.length > 0) {
      where.tags = { hasSome: tags };
    }

    const candidates = await prisma.problem.findMany({
      where,
      select: { id: true },
      orderBy: { contestId: "desc" },
      take: limit,
    });

    if (candidates.length === 0) {
      logger.info("No matching UNQUEUED problems found");
      return { queued: 0 };
    }

    const selectedIds = candidates.map((c: { id: string }) => c.id);

    // Mark them all as PENDING
    await prisma.problem.updateMany({
      where: { id: { in: selectedIds } },
      data: { generationStatus: "PENDING" },
    });

    // Fetch sample details for logging (max 5)
    const sampleIds = selectedIds.slice(0, 5);
    const sampleProblems = await prisma.problem.findMany({
      where: { id: { in: sampleIds } },
      select: { contestId: true, index: true, rating: true },
    });

    const sampleLabels = sampleProblems.map(
      (p: { contestId: number; index: string; rating: number | null }) =>
        `${p.contestId}${p.index} (${p.rating ?? "unrated"})`,
    );

    logger.info(`Queued ${selectedIds.length} problems for generation`, {
      sample: sampleLabels,
    });

    const filters: string[] = [];
    if (ratingMin !== undefined || ratingMax !== undefined)
      filters.push(`Rating: ${ratingMin ?? "∞"}–${ratingMax ?? "∞"}`);
    if (contestIdMin !== undefined || contestIdMax !== undefined)
      filters.push(`Contest: ${contestIdMin ?? "∞"}–${contestIdMax ?? "∞"}`);
    if (tags && tags.length > 0) filters.push(`Tags: ${tags.join(", ")}`);

    const extraBackfill =
      selectedIds.length > 5 ? `\n(+${selectedIds.length - 5} more)` : "";

    await discordLog.trigger({
      title: "📋 Backfill Queued",
      description:
        `**${selectedIds.length}** problems marked PENDING for generation\n` +
        sampleLabels.join(", ") +
        extraBackfill,
      color: 0xf97316, // orange
      fields:
        filters.length > 0
          ? [{ name: "Filters", value: filters.join("\n") }]
          : undefined,
    });

    return { queued: selectedIds.length };
  },
});
