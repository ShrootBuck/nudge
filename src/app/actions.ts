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

export async function searchProblems(query: string) {
  if (!query || query.length < 1) return [];

  const completedWhere = problemWhere({
    AND: [
      completedContentWhere(),
      { reviewStatus: { notIn: ["UNSOLVABLE", "INCORRECT"] } },
    ],
  });

  const contestMatch = query.match(/^(\d+)([A-Za-z]\d?)?$/);
  const whereClause = contestMatch
    ? {
        ...completedWhere,
        contestId: Number(contestMatch[1]),
        ...(contestMatch[2] ? { index: contestMatch[2].toUpperCase() } : {}),
      }
    : {
        ...completedWhere,
        name: { contains: query, mode: "insensitive" as const },
      };

  const problems = await prisma.problem.findMany({
    where: whereClause,
    take: 10,
    orderBy: [{ reviewStatus: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      contestId: true,
      index: true,
      name: true,
      rating: true,
      tags: true,
    },
  });

  return problems;
}
