import { safeRevalidateTags } from "../src/lib/cache-revalidate";
import { problemTag } from "../src/lib/cache-tags";
import { formatProblemId } from "../src/lib/codeforces-problem";
import { readPreparedContent } from "../src/lib/prepared-content";
import { prisma } from "../src/lib/prisma";
import { getPreparedProblemContent } from "../src/lib/problem-content";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--check")) {
  throw new Error("Usage: bun run content:prepare [--check]");
}
const checkOnly = args.includes("--check");
let cursor: string | undefined;
let inspected = 0;
let missing = 0;

try {
  for (;;) {
    const problems = await prisma.problem.findMany({
      where: { runState: "SUCCEEDED" },
      orderBy: { id: "asc" },
      take: 50,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        contestId: true,
        index: true,
        updatedAt: true,
        preparedContent: true,
        hints: { select: { order: true, content: true } },
        editorial: { select: { content: true } },
        solution: { select: { content: true } },
      },
    });
    if (problems.length === 0) break;
    const tags: string[] = [];
    for (const problem of problems) {
      inspected++;
      // Include matching rows too, so a rerun can retry an invalidation that
      // failed after a previous run had already saved its prepared documents.
      if (!checkOnly) tags.push(problemTag(problem.contestId, problem.index));
      if (
        readPreparedContent(problem.preparedContent, {
          hints: problem.hints,
          editorial: problem.editorial?.content ?? null,
          solution: problem.solution?.content ?? null,
        })
      ) {
        continue;
      }
      missing++;
      if (!checkOnly) {
        await getPreparedProblemContent(problem);
        console.log(
          `Prepared ${formatProblemId(problem.contestId, problem.index)}`,
        );
      }
    }
    if (tags.length > 0 && !(await safeRevalidateTags(tags, "expire"))) {
      throw new Error("Content was saved, but page cache invalidation failed");
    }
    cursor = problems.at(-1)?.id;
  }
  console.log(
    checkOnly
      ? `${inspected} completed problems checked; ${missing} need preparation.`
      : `${inspected} completed problems checked; ${missing} prepared.`,
  );
  if (checkOnly && missing > 0) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
