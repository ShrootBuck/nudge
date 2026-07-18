import type { ReviewStatus, RunState } from "@prisma/client";

const MAX_DESCRIPTION_LENGTH = 160;
const PROBLEM_INDEX_PATTERN = /^[A-Z][A-Z0-9]*$/;

export type ProblemSocialData = {
  contestId: number;
  index: string;
  name: string;
  rating: number | null;
  tags: string[];
  runState: RunState;
  reviewStatus: ReviewStatus;
  hintCount: number;
  hasEditorial: boolean;
  hasSolution: boolean;
};

export function parseProblemRouteParams({
  contestId,
  index,
}: {
  contestId: string;
  index: string;
}) {
  if (!/^\d+$/.test(contestId)) return null;

  const parsedContestId = Number(contestId);
  const normalizedIndex = index.toUpperCase();

  if (
    !Number.isSafeInteger(parsedContestId) ||
    parsedContestId <= 0 ||
    !PROBLEM_INDEX_PATTERN.test(normalizedIndex)
  ) {
    return null;
  }

  return { contestId: parsedContestId, index: normalizedIndex };
}

export function formatProblemId(contestId: number, index: string) {
  return `${contestId}${index}`;
}

export function problemSocialTitle(problem: ProblemSocialData) {
  return `${formatProblemId(problem.contestId, problem.index)}: ${problem.name}`;
}

function joinItems(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function truncateDescription(value: string) {
  if (value.length <= MAX_DESCRIPTION_LENGTH) return value;

  const candidate = value.slice(0, MAX_DESCRIPTION_LENGTH - 3);
  const lastSpace = candidate.lastIndexOf(" ");
  const cleanCut = lastSpace > 110 ? candidate.slice(0, lastSpace) : candidate;
  return `${cleanCut.trimEnd()}...`;
}

export function problemSocialDescription(problem: ProblemSocialData) {
  const problemId = formatProblemId(problem.contestId, problem.index);
  const features: string[] = [];

  if (problem.hintCount > 0) {
    features.push(
      `${problem.hintCount} progressive hint${problem.hintCount === 1 ? "" : "s"}`,
    );
  }
  if (problem.hasEditorial) features.push("a clean editorial");
  if (problem.hasSolution) features.push("a C++ solution");

  const lead = features.length
    ? `Get ${joinItems(features)} for`
    : "View problem details and generation status for";
  const details: string[] = [];

  if (problem.rating !== null) details.push(`Rated ${problem.rating}`);
  if (problem.tags.length > 0)
    details.push(`Topics: ${problem.tags.slice(0, 4).join(", ")}`);

  const nameEnding = /[.!?]$/.test(problem.name) ? "" : ".";
  const description = `${lead} Codeforces ${problemId}: ${problem.name}${nameEnding}${
    details.length ? ` ${details.join("; ")}.` : ""
  }`;

  return truncateDescription(description);
}

export function isProblemIndexable(problem: ProblemSocialData) {
  return (
    problem.runState === "SUCCEEDED" &&
    problem.reviewStatus !== "INCORRECT" &&
    problem.reviewStatus !== "UNSOLVABLE"
  );
}
