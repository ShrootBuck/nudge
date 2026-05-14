import { cacheLife, cacheTag } from "next/cache";
import { PROBLEM_LIST_TAG } from "@/lib/cache-tags";
import { prisma } from "@/lib/prisma";
import { completedContentWhere, problemWhere } from "@/lib/problem-pipeline-db";

function listableWhere() {
  return problemWhere({
    AND: [
      completedContentWhere(),
      { reviewStatus: { notIn: ["UNSOLVABLE", "INCORRECT"] } },
    ],
  });
}

export async function getAvailableProblemTags() {
  "use cache";

  cacheLife("days");
  cacheTag(PROBLEM_LIST_TAG);

  const rows = await prisma.$queryRaw<Array<{ tag: string }>>`
    SELECT DISTINCT unnest("tags") AS tag
    FROM "Problem"
    WHERE "runState" = 'SUCCEEDED'
      AND "reviewStatus" NOT IN ('UNSOLVABLE', 'INCORRECT')
    ORDER BY tag ASC
  `;

  return rows.map((r) => r.tag).filter(Boolean);
}

export async function getRandomProblemPool() {
  "use cache";

  cacheLife("days");
  cacheTag(PROBLEM_LIST_TAG);

  return prisma.problem.findMany({
    where: listableWhere(),
    select: { contestId: true, index: true },
  });
}

export async function getCachedProblemSearchResults(query: string) {
  "use cache";

  cacheLife("days");
  cacheTag(PROBLEM_LIST_TAG);

  if (!query || query.length < 1) return [];

  const completedWhere = listableWhere();
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

  return prisma.problem.findMany({
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
}
