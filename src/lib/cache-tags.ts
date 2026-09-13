export const PROBLEM_LIST_TAG = "problem-list";
export const CURRENT_MODEL_TAG = "current-model";

export function problemTag(contestId: number, index: string) {
  return `problem:${contestId}:${index.toUpperCase()}`;
}
