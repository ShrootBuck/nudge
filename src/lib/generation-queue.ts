import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { pipelineStateData, problemUpdateData } from "./problem-pipeline-db";

export const AUTOMATIC_GENERATION_SOURCE = "hourly-queue";
export const AUTOMATIC_GENERATION_MAX_ATTEMPTS = 3;

export type AutomaticGenerationSource = typeof AUTOMATIC_GENERATION_SOURCE;

export const automaticGenerationProblemSelect = {
  id: true,
  contestId: true,
  index: true,
  name: true,
  rating: true,
  tags: true,
  requestedCount: true,
  generationAttempts: true,
  runState: true,
} as const;

export type AutomaticGenerationProblem = Prisma.ProblemGetPayload<{
  select: typeof automaticGenerationProblemSelect;
}>;

export type AutomaticGenerationSelection = {
  problem: AutomaticGenerationProblem;
  selectionReason: "requested" | "backfill";
};

export function automaticGenerationProblemWhere(): Prisma.ProblemWhereInput {
  return {
    generationAttempts: { lt: AUTOMATIC_GENERATION_MAX_ATTEMPTS },
    runState: { in: ["IDLE", "FAILED"] },
    reviewStatus: { not: "UNSOLVABLE" },
  };
}

export function requestedGenerationProblemWhere(): Prisma.ProblemWhereInput {
  return {
    ...automaticGenerationProblemWhere(),
    requestedCount: { gt: 0 },
  };
}

export function requestedGenerationProblemOrderBy(): Prisma.ProblemOrderByWithRelationInput[] {
  return [{ requestedCount: "desc" }, { contestId: "desc" }];
}

export function backfillGenerationProblemOrderBy(): Prisma.ProblemOrderByWithRelationInput[] {
  return [{ contestId: "desc" }];
}

export async function selectNextAutomaticGenerationProblem(
  client: Prisma.TransactionClient = prisma,
): Promise<AutomaticGenerationSelection | null> {
  const requestedProblem = await client.problem.findFirst({
    where: requestedGenerationProblemWhere(),
    orderBy: requestedGenerationProblemOrderBy(),
    select: automaticGenerationProblemSelect,
  });

  if (requestedProblem) {
    return {
      problem: requestedProblem,
      selectionReason: "requested",
    };
  }

  const backfillProblem = await client.problem.findFirst({
    where: automaticGenerationProblemWhere(),
    orderBy: backfillGenerationProblemOrderBy(),
    select: automaticGenerationProblemSelect,
  });

  return backfillProblem
    ? {
        problem: backfillProblem,
        selectionReason: "backfill",
      }
    : null;
}

export async function claimProblemForGeneration({
  problemId,
  requireAutomaticEligibility,
  client = prisma,
}: {
  problemId: string;
  requireAutomaticEligibility: boolean;
  client?: Prisma.TransactionClient;
}) {
  const updated = await client.problem.updateMany({
    where: requireAutomaticEligibility
      ? { id: problemId, ...automaticGenerationProblemWhere() }
      : { id: problemId },
    data: problemUpdateData({
      ...pipelineStateData("RUNNING"),
      generationAttempts: { increment: 1 },
      reviewStatus: "UNREVIEWED",
      generationStartedAt: new Date(),
      lastGenerationError: null,
    }),
  });

  return updated.count === 1;
}

export async function selectAndClaimNextAutomaticGenerationProblem() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const result = await prisma.$transaction(async (tx) => {
      const selection = await selectNextAutomaticGenerationProblem(tx);

      if (!selection) {
        return { status: "empty" as const };
      }

      const claimed = await claimProblemForGeneration({
        problemId: selection.problem.id,
        requireAutomaticEligibility: true,
        client: tx,
      });

      return claimed
        ? { status: "claimed" as const, selection }
        : { status: "retry" as const };
    });

    if (result.status === "empty") {
      return null;
    }

    if (result.status === "claimed") {
      return result.selection;
    }
  }

  throw new Error(
    "Could not claim the next generation candidate after 10 attempts",
  );
}
