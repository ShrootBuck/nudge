import type { Prisma } from "@prisma/client";
import { logger, task } from "@trigger.dev/sdk";
import { DISCORD_COLORS } from "../lib/discord-webhook";
import { prisma } from "../lib/prisma";
import {
  backlogWhere,
  pipelineStateData,
  problemUpdateManyData,
  problemWhere,
} from "../lib/problem-pipeline-db";
import { discordLog } from "./discord-log";

interface BackfillPayload {
  ratingMin?: number;
  ratingMax?: number;
  contestIdMin?: number;
  contestIdMax?: number;
  tags?: string[];
  limit?: number; // max problems to queue, defaults to 100
}

// Manually triggered — marks backlog problems as ready based on filters
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
      ...backlogWhere(),
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
      where: problemWhere(where),
      select: { id: true },
      orderBy: [
        { requestedCount: "desc" },
        { updatedAt: "desc" },
        { contestId: "desc" },
      ] as unknown as Prisma.ProblemOrderByWithRelationInput[],
      take: limit,
    });

    if (candidates.length === 0) {
      logger.info("No matching backlog problems found");
      return { queued: 0 };
    }

    const selectedIds = candidates.map((c) => c.id);

    // Mark them all as READY + IDLE
    await prisma.problem.updateMany({
      where: { id: { in: selectedIds } },
      data: problemUpdateManyData({
        ...pipelineStateData("READY", "IDLE"),
        activeBatchId: null,
        processingStartedAt: null,
        lastGenerationError: null,
      }),
    });

    // Fetch sample details for logging (max 5)
    const sampleIds = selectedIds.slice(0, 5);
    const sampleProblems = await prisma.problem.findMany({
      where: { id: { in: sampleIds } },
      select: { contestId: true, index: true, rating: true },
    });

    const sampleLabels = sampleProblems.map(
      (p) => `${p.contestId}${p.index} (${p.rating ?? "unrated"})`,
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
        `**${selectedIds.length}** backlog problems marked ready for generation\n` +
        sampleLabels.join(", ") +
        extraBackfill,
      color: DISCORD_COLORS.orange,
      fields:
        filters.length > 0
          ? [{ name: "Filters", value: filters.join("\n") }]
          : undefined,
    });

    return { queued: selectedIds.length };
  },
});
