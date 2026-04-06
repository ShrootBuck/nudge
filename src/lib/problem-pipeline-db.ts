import type { Prisma } from "@prisma/client";
import type { QueueState, RunState } from "./problem-pipeline";

function castWhere(input: unknown): Prisma.ProblemWhereInput {
  return input as Prisma.ProblemWhereInput;
}

export function problemWhere(input: unknown): Prisma.ProblemWhereInput {
  return castWhere(input);
}

export function problemCreateData(input: unknown): Prisma.ProblemCreateInput {
  return input as Prisma.ProblemCreateInput;
}

export function problemUpdateData(input: unknown): Prisma.ProblemUpdateInput {
  return input as Prisma.ProblemUpdateInput;
}

export function problemUpdateManyData(
  input: unknown,
): Prisma.ProblemUpdateManyMutationInput {
  return input as Prisma.ProblemUpdateManyMutationInput;
}

export function problemOrderBy(
  input: unknown,
): Prisma.ProblemOrderByWithRelationInput[] {
  return input as Prisma.ProblemOrderByWithRelationInput[];
}

export function problemSelect<T = Record<string, unknown>>(input: unknown): T {
  return input as T;
}

export function pipelineStateData(queueState: QueueState, runState: RunState) {
  return {
    queueState,
    runState,
  };
}

export function readyToRunWhere(maxAttempts: number): Prisma.ProblemWhereInput {
  return castWhere({
    generationAttempts: { lt: maxAttempts },
    queueState: "READY",
    runState: { in: ["IDLE", "FAILED"] },
  });
}

export function backlogWhere(): Prisma.ProblemWhereInput {
  return castWhere({
    queueState: "BACKLOG",
  });
}

export function completedContentWhere(): Prisma.ProblemWhereInput {
  return castWhere({
    runState: "SUCCEEDED",
  });
}
