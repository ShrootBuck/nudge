import { notFound } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseSolutionContent } from "@/lib/problem-solution";
import {
  highlightCodeHtml,
  SHIKI_DARK_THEME,
  SHIKI_LIGHT_THEME,
} from "@/lib/shiki";
import { ProblemContent } from "./problem-content";

export default async function ProblemPage({
  params,
}: {
  params: Promise<{ contestId: string; index: string }>;
}) {
  await connection();

  const { contestId, index } = await params;
  const contestIdNum = Number.parseInt(contestId, 10);

  if (Number.isNaN(contestIdNum)) notFound();

  const problem = await prisma.problem.findUnique({
    where: {
      contestId_index: { contestId: contestIdNum, index: index.toUpperCase() },
    },
    include: {
      hints: { orderBy: { order: "asc" } },
      editorial: true,
      solution: true,
    },
  });

  if (!problem) notFound();

  let preHighlightedSolutionHtml: { light: string; dark: string } | null = null;

  if (problem.solution) {
    const parsedSolution = parseSolutionContent(problem.solution.content);

    if (parsedSolution.kind === "code") {
      try {
        const [light, dark] = await Promise.all([
          highlightCodeHtml(
            parsedSolution.code,
            parsedSolution.language,
            SHIKI_LIGHT_THEME,
          ),
          highlightCodeHtml(
            parsedSolution.code,
            parsedSolution.language,
            SHIKI_DARK_THEME,
          ),
        ]);
        preHighlightedSolutionHtml = { light, dark };
      } catch {
        preHighlightedSolutionHtml = null;
      }
    }
  }

  return (
    <ProblemContent
      problem={{
        ...problem,
        solution: problem.solution
          ? {
              ...problem.solution,
              preHighlightedHtml: preHighlightedSolutionHtml,
            }
          : null,
      }}
    />
  );
}
