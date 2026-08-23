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
