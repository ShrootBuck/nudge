export const PROBLEM_LIST_TAG = "problem-list";
export const PROVIDER_MODELS_TAG = "provider-models";

export function problemTag(contestId: number, index: string) {
  return `problem:${contestId}:${index.toUpperCase()}`;
}
