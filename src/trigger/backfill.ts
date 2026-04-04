import type { Prisma } from "@prisma/client";
import { logger, task } from "@trigger.dev/sdk";
import { prisma } from "./db";

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

    logger.info(`Queued ${selectedIds.length} problems for generation`, {
      sample: sampleProblems.map(
        (p: { contestId: number; index: string; rating: number | null }) =>
          `${p.contestId}${p.index} (${p.rating ?? "unrated"})`,
      ),
    });

    return { queued: selectedIds.length };
  },
});
