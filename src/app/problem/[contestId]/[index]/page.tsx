import { getDownloadUrl } from "@vercel/blob";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import { problemTag } from "@/lib/cache-tags";
import { prisma } from "@/lib/prisma";
import { getProblemSocialData } from "@/lib/problem-read-cache";
import {
  formatProblemId,
  isProblemIndexable,
  parseProblemRouteParams,
  problemSocialDescription,
  problemSocialTitle,
} from "@/lib/problem-social";
import { parseSolutionContent } from "@/lib/problem-solution";
import {
  highlightCodeHtml,
  SHIKI_DARK_THEME,
  SHIKI_LIGHT_THEME,
} from "@/lib/shiki";
import { createPageMetadata, OG_IMAGE_SIZE } from "@/lib/site-metadata";
import { ProblemContent } from "./problem-content";
import type { ProblemView } from "./problem-view-types";

type ProblemPageProps = {
  params: Promise<{ contestId: string; index: string }>;
};

export async function generateMetadata({
  params,
}: ProblemPageProps): Promise<Metadata> {
  const route = parseProblemRouteParams(await params);
  if (!route) notFound();

  const problem = await getProblemSocialData(route.contestId, route.index);
  if (!problem) notFound();

  const path = `/problem/${problem.contestId}/${problem.index}`;
  const problemId = formatProblemId(problem.contestId, problem.index);
  const title = problemSocialTitle(problem);
  const description = problemSocialDescription(problem);
  const image = {
    url: `${path}/opengraph-image`,
    ...OG_IMAGE_SIZE,
    alt: `${problemId}: ${problem.name} - Codeforces hints and editorial on Nudge`,
    type: "image/png" as const,
  };
  const metadata = createPageMetadata({
    title,
    description,
    path,
    image,
  });

  return {
    ...metadata,
    keywords: [
      `Codeforces ${problemId}`,
      problem.name,
      ...problem.tags,
      "competitive programming",
      "progressive hints",
      "editorial",
      "C++ solution",
    ],
    category: "education",
    robots: isProblemIndexable(problem)
      ? { index: true, follow: true }
      : { index: false, follow: false, noarchive: true },
    openGraph: {
      ...metadata.openGraph,
      type: "article",
      tags: problem.tags,
    },
  };
}

async function getProblemView(
  contestId: number,
  index: string,
): Promise<ProblemView | null> {
  "use cache";

  cacheLife("days");
  cacheTag(problemTag(contestId, index));

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

  const modelDisplayName = problem.generatedByDisplayName ?? null;

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
    transcriptDownloadUrl: problem.generationTranscriptUrl
      ? getDownloadUrl(problem.generationTranscriptUrl)
      : null,
    lastGenerationError: problem.lastGenerationError,
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

export default async function ProblemPage({ params }: ProblemPageProps) {
  const route = parseProblemRouteParams(await params);
  if (!route) notFound();

  const problem = await getProblemView(route.contestId, route.index);

  if (!problem) notFound();

  return <ProblemContent problem={problem} />;
}
