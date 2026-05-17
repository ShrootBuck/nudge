export const PROBLEM_LIST_TAG = "problem-list";

export function problemTag(contestId: number, index: string) {
  return `problem:${contestId}:${index.toUpperCase()}`;
}
