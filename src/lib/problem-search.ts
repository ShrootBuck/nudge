import type { Prisma } from "@prisma/client";
import {
  formatProblemId,
  MAX_PROBLEM_INPUT_LENGTH,
  parseCodeforcesProblem,
  parseContestId,
} from "./codeforces-problem";

export const MAX_SEARCH_QUERY_LENGTH = 100;

function parseSearchProblem(value: string) {
  // A number followed by a word can be a title, e.g. "2 Arrays".
  // Explicit slashes and URLs still accept every supported index.
  if (/^\d+\s+[a-z]{2,}$/i.test(value)) return null;
  return parseCodeforcesProblem(value);
}

export function normalizeProblemSearch(query: string) {
  const value = query.trim().slice(0, MAX_PROBLEM_INPUT_LENGTH);
  const problem = parseSearchProblem(value);
  return problem
    ? formatProblemId(problem.contestId, problem.index)
    : value.slice(0, MAX_SEARCH_QUERY_LENGTH);
}

export function problemSearchWhere(query: string): Prisma.ProblemWhereInput {
  const value = normalizeProblemSearch(query);
  if (!value) return {};

  const problem = parseSearchProblem(value);
  if (problem) return problem;
  if (/^\d+$/.test(value)) {
    return { contestId: parseContestId(value) ?? 0 };
  }
  return { name: { contains: value, mode: "insensitive" } };
}
