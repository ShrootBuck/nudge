import type { Prisma, RunState } from "@prisma/client";

export function problemWhere<T extends Prisma.ProblemWhereInput>(input: T): T {
  return input;
}

export function problemCreateData<T extends Partial<Prisma.ProblemCreateInput>>(
  input: T,
): T {
  return input;
}

export function problemUpdateData<T extends Prisma.ProblemUpdateInput>(
  input: T,
): T {
  return input;
}

export function problemUpdateManyData<
  T extends Prisma.ProblemUpdateManyMutationInput,
>(input: T): T {
  return input;
}

export function problemOrderBy<
  T extends Prisma.ProblemOrderByWithRelationInput[],
>(input: T): T {
  return input;
}

export function problemSelect<T extends Prisma.ProblemSelect>(input: T): T {
  return input;
}

export function pipelineStateData(runState: RunState) {
  return {
    runState,
  } satisfies Pick<Prisma.ProblemCreateInput, "runState">;
}

export function completedContentWhere(): Prisma.ProblemWhereInput {
  return problemWhere({
    runState: "SUCCEEDED",
  });
}
