"use server";

import { prisma } from "@/lib/prisma";
import { completedContentWhere, problemWhere } from "@/lib/problem-pipeline-db";

export async function getRandomProblem() {
  const completedWhere = problemWhere({
    AND: [
      completedContentWhere(),
      { reviewStatus: { notIn: ["UNSOLVABLE", "INCORRECT"] } },
    ],
  });

  const count = await prisma.problem.count({ where: completedWhere });
  if (count === 0) return null;

  const skip = Math.floor(Math.random() * count);

  const problem = await prisma.problem.findFirst({
    where: completedWhere,
    skip,
    select: { contestId: true, index: true },
  });

  if (!problem) return null;

  return { contestId: problem.contestId, index: problem.index };
}
