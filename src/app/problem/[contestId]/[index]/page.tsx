import { notFound } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import type { RunState } from "@/lib/problem-pipeline";
import { parseSolutionContent } from "@/lib/problem-solution";
import {
  highlightCodeHtml,
  SHIKI_DARK_THEME,
  SHIKI_LIGHT_THEME,
} from "@/lib/shiki";
import { ProblemContent } from "./problem-content";
import type { ProblemView } from "./problem-view-types";

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

  // Resolve the human-readable model name for display
  let modelDisplayName: string | null = null;
  if (problem.generatedByProvider && problem.generatedByModel) {
    const config = await prisma.providerModel.findUnique({
      where: {
        provider_modelId: {
          provider: problem.generatedByProvider,
          modelId: problem.generatedByModel,
        },
      },
      select: { displayName: true },
    });
    modelDisplayName = config?.displayName ?? problem.generatedByModel;
  }

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

  const viewProblem: ProblemView = {
    id: problem.id,
    contestId: problem.contestId,
    index: problem.index,
    name: problem.name,
    rating: problem.rating,
    tags: problem.tags,
    reviewStatus: problem.reviewStatus,
    runState: problem.runState as RunState,
    modelDisplayName,
    hints: problem.hints,
    editorial: problem.editorial,
    solution: problem.solution
      ? {
          ...problem.solution,
          preHighlightedHtml: preHighlightedSolutionHtml,
        }
      : null,
  };

  return <ProblemContent problem={viewProblem} />;
}
