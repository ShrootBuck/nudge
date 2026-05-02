import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import { PROVIDER_MODELS_TAG, problemTag } from "@/lib/cache-tags";
import { prisma } from "@/lib/prisma";
import { parseSolutionContent } from "@/lib/problem-solution";
import {
  highlightCodeHtml,
  SHIKI_DARK_THEME,
  SHIKI_LIGHT_THEME,
} from "@/lib/shiki";
import { ProblemContent } from "./problem-content";
import type { ProblemView } from "./problem-view-types";

async function getProblemView(
  contestId: number,
  index: string,
): Promise<ProblemView | null> {
  "use cache";

  cacheLife("minutes");
  cacheTag(problemTag(contestId, index), PROVIDER_MODELS_TAG);

  const problem = await prisma.problem.findUnique({
    where: {
      contestId_index: { contestId, index },
    },
    include: {
      hints: { orderBy: { order: "asc" } },
      editorial: true,
      solution: true,
    },
  });

  if (!problem) return null;

  let modelDisplayName: string | null = null;
  let modelEffort: string | null = null;
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
    modelEffort = problem.generatedByEffort ?? null;
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

  return {
    id: problem.id,
    contestId: problem.contestId,
    index: problem.index,
    name: problem.name,
    rating: problem.rating,
    tags: problem.tags,
    reviewStatus: problem.reviewStatus,
    runState: problem.runState,
    modelDisplayName,
    modelEffort,
    hints: problem.hints,
    editorial: problem.editorial,
    solution: problem.solution
      ? {
          id: problem.solution.id,
          content: problem.solution.content,
          preHighlightedHtml: preHighlightedSolutionHtml,
        }
      : null,
  };
}

export default async function ProblemPage({
  params,
}: {
  params: Promise<{ contestId: string; index: string }>;
}) {
  const { contestId, index } = await params;
  const contestIdNum = Number.parseInt(contestId, 10);
  const normalizedIndex = index.toUpperCase();

  if (Number.isNaN(contestIdNum)) notFound();

  const problem = await getProblemView(contestIdNum, normalizedIndex);

  if (!problem) notFound();

  return <ProblemContent problem={problem} />;
}
