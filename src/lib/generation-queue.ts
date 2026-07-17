import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { pipelineStateData, problemUpdateData } from "./problem-pipeline-db";

export const AUTOMATIC_GENERATION_MAX_ATTEMPTS = 3;
export const STALE_RUNNING_GENERATION_AGE_MS = 24 * 60 * 60 * 1000;
const CLAIM_TRANSACTION_MAX_WAIT_MS = 15_000;
const CLAIM_TRANSACTION_TIMEOUT_MS = 15_000;

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
  generationTranscriptUrl: true,
} as const;

export type AutomaticGenerationProblem = Prisma.ProblemGetPayload<{
  select: typeof automaticGenerationProblemSelect;
}>;

export type AutomaticGenerationSelection = {
  problem: AutomaticGenerationProblem;
  selectionReason: "requested" | "backfill";
};

const staleRunningGenerationSelect = {
  id: true,
  contestId: true,
  index: true,
  name: true,
  generationAttempts: true,
  generationStartedAt: true,
  requestedCount: true,
} as const;

export type StaleRunningGenerationReset = Prisma.ProblemGetPayload<{
  select: typeof staleRunningGenerationSelect;
}>;

export function staleRunningGenerationCutoff(now = new Date()) {
  return new Date(now.getTime() - STALE_RUNNING_GENERATION_AGE_MS);
}

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

export async function resetStaleRunningGenerations(now = new Date()) {
  const cutoff = staleRunningGenerationCutoff(now);
  const staleProblems = await prisma.problem.findMany({
    where: {
      runState: "RUNNING",
      generationStartedAt: { lte: cutoff },
    },
    orderBy: [{ generationStartedAt: "asc" }, { contestId: "desc" }],
    select: staleRunningGenerationSelect,
  });

  const resetProblems: StaleRunningGenerationReset[] = [];

  for (const problem of staleProblems) {
    const updated = await prisma.problem.updateMany({
      where: {
        id: problem.id,
        runState: "RUNNING",
        generationStartedAt: { lte: cutoff },
      },
      data: problemUpdateData({
        ...pipelineStateData("IDLE"),
        ...(problem.generationAttempts > 0
          ? { generationAttempts: { decrement: 1 } }
          : {}),
        generationStartedAt: null,
        lastGenerationError:
          "Generation was reset after running for more than 24 hours.",
      }),
    });

    if (updated.count === 1) {
      resetProblems.push(problem);
    }
  }

  return {
    cutoff,
    resetCount: resetProblems.length,
    problems: resetProblems,
  };
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
    const result = await prisma.$transaction(
      async (tx) => {
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
      },
      {
        maxWait: CLAIM_TRANSACTION_MAX_WAIT_MS,
        timeout: CLAIM_TRANSACTION_TIMEOUT_MS,
      },
    );

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
