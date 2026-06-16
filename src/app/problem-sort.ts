export const DEFAULT_PROBLEM_SORT = "newest-contest";

export const PROBLEM_SORT_OPTIONS = [
  {
    value: "quality",
    label: "Quality first",
    description: "Verified problems first",
  },
  {
    value: "rating-asc",
    label: "Rating: low to high",
    description: "Easier problems first",
  },
  {
    value: "rating-desc",
    label: "Rating: high to low",
    description: "Harder problems first",
  },
  {
    value: "newest-contest",
    label: "Newest contest first",
    description: "Higher contest IDs first",
  },
  {
    value: "oldest-contest",
    label: "Oldest contest first",
    description: "Lower contest IDs first",
  },
  {
    value: "name-az",
    label: "Name A-Z",
    description: "Alphabetical by problem name",
  },
] as const;

export type ProblemSort = (typeof PROBLEM_SORT_OPTIONS)[number]["value"];

const PROBLEM_SORT_VALUES = new Set<string>(
  PROBLEM_SORT_OPTIONS.map((option) => option.value),
);

export function isProblemSort(value: string): value is ProblemSort {
  return PROBLEM_SORT_VALUES.has(value);
}

export function problemSortLabel(sort: ProblemSort) {
  return (
    PROBLEM_SORT_OPTIONS.find((option) => option.value === sort)?.label ??
    PROBLEM_SORT_OPTIONS[0].label
  );
}
