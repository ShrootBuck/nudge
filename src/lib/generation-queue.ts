import type { Prisma } from "@prisma/client";

export const AUTOMATIC_GENERATION_SOURCE = "hourly-queue";
export const AUTOMATIC_GENERATION_MAX_ATTEMPTS = 3;

export type AutomaticGenerationSource = typeof AUTOMATIC_GENERATION_SOURCE;

export function automaticGenerationProblemWhere(): Prisma.ProblemWhereInput {
  return {
    requestedCount: { gt: 0 },
    generationAttempts: { lt: AUTOMATIC_GENERATION_MAX_ATTEMPTS },
    runState: { in: ["IDLE", "FAILED"] },
    reviewStatus: { not: "UNSOLVABLE" },
  };
}

export function automaticGenerationProblemOrderBy(): Prisma.ProblemOrderByWithRelationInput[] {
  return [{ requestedCount: "desc" }, { contestId: "desc" }];
}
