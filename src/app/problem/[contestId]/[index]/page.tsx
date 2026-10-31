import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import { problemTag } from "@/lib/cache-tags";
import { prisma } from "@/lib/prisma";
import { getPreparedProblemContent } from "@/lib/problem-content";
import { getProblemSocialData } from "@/lib/problem-read-cache";
import {
  formatProblemId,
  isProblemIndexable,
  parseProblemRouteParams,
  problemSocialDescription,
  problemSocialTitle,
} from "@/lib/problem-social";
import { createPageMetadata, OG_IMAGE_SIZE } from "@/lib/site-metadata";
import { ProblemContentBody } from "./problem-content-body";
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

async function getProblemContent(contestId: number, index: string) {
  // Cache the public component output. Prepared documents themselves live in
  // Postgres, so a process restart no longer repeats math/code preparation.
  "use cache";

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

  if (!problem) {
    cacheLife("minutes");
    return null;
  }

  if (problem.runState === "SUCCEEDED") {
    cacheLife("days");
  } else {
    cacheLife("seconds");
  }

  const prepared = await getPreparedProblemContent(problem);
  const view: ProblemView = {
    id: problem.id,
    contestId: problem.contestId,
    index: problem.index,
    name: problem.name,
    rating: problem.rating,
    tags: problem.tags,
    reviewStatus: problem.reviewStatus,
    runState: problem.runState,
    modelDisplayName: problem.generatedByDisplayName ?? null,
    transcriptDownloadUrl: problem.generationTranscriptUrl,
    lastGenerationError:
      problem.lastGenerationError && problem.reviewStatus === "UNSOLVABLE"
        ? problem.lastGenerationError.slice(0, 500)
        : problem.lastGenerationError
          ? "The last generation attempt failed. A retry is needed."
          : null,
    // Both the DB query and prepared documents are ordered by hint order.
    hints: prepared.hints.map((hint, position) => ({
      id: problem.hints[position].id,
      order: hint.order,
      parsedDocument: hint.document,
    })),
    editorial:
      problem.editorial && prepared.editorial
        ? {
            id: problem.editorial.id,
            parsedDocument: prepared.editorial,
          }
        : null,
    solution:
      problem.solution && prepared.solution
        ? {
            id: problem.solution.id,
            content: problem.solution.content,
            parsedDocument: prepared.solution,
          }
        : null,
  };
  return <ProblemContentBody key={problem.id} problem={view} />;
}

export default async function ProblemPage({ params }: ProblemPageProps) {
  const route = parseProblemRouteParams(await params);
  if (!route) notFound();

  const content = await getProblemContent(route.contestId, route.index);

  if (!content) notFound();

  return content;
}
