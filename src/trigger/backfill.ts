import { task, logger } from "@trigger.dev/sdk";
import { Prisma } from "@prisma/client";
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

    logger.info("Starting backfill", { ratingMin, ratingMax, contestIdMin, contestIdMax, tags, limit });

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

    const problems = await prisma.problem.findMany({
      where,
      orderBy: { contestId: "asc" },
      take: limit,
      select: { id: true, contestId: true, index: true, name: true, rating: true },
    });

    if (problems.length === 0) {
      logger.info("No matching UNQUEUED problems found");
      return { queued: 0 };
    }

    // Mark them all as PENDING
    await prisma.problem.updateMany({
      where: { id: { in: problems.map((p: { id: string }) => p.id) } },
      data: { generationStatus: "PENDING" },
    });

    logger.info(
      `Queued ${problems.length} problems for generation`,
      {
        sample: problems
          .slice(0, 5)
          .map(
            (p: { contestId: number; index: string; rating: number | null }) =>
              `${p.contestId}${p.index} (${p.rating ?? "unrated"})`,
          ),
      },
    );

    return { queued: problems.length };
  },
});
