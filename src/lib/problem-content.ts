import type { Prisma } from "@prisma/client";
import {
  preparedContentJson,
  prepareProblemContent,
  readPreparedContent,
} from "./prepared-content";
import { prisma } from "./prisma";

type StoredProblemContent = {
  id: string;
  updatedAt: Date;
  preparedContent: Prisma.JsonValue;
  hints: { order: number; content: string }[];
  editorial: { content: string } | null;
  solution: { content: string } | null;
};

export async function getPreparedProblemContent(problem: StoredProblemContent) {
  const source = {
    hints: problem.hints,
    editorial: problem.editorial?.content ?? null,
    solution: problem.solution?.content ?? null,
  };
  const existing = readPreparedContent(problem.preparedContent, source);
  if (existing) return existing;

  // Legacy rows and renderer upgrades are prepared once, then survive process restarts.
  const prepared = await prepareProblemContent(source);
  await prisma.problem.updateMany({
    // A concurrent generation or edit must not be overwritten by this older snapshot.
    where: { id: problem.id, updatedAt: problem.updatedAt },
    data: {
      preparedContent: preparedContentJson(prepared),
      // Filling derived data must not reorder the problem catalog.
      updatedAt: problem.updatedAt,
    },
  });
  return prepared;
}
