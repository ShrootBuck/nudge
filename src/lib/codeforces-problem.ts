export const MAX_CONTEST_ID = 2_147_483_647;
export const MAX_PROBLEM_INPUT_LENGTH = 2_048;
export const PROBLEM_INDEX_PATTERN = /^[A-Z0-9]{1,10}$/;

export type CodeforcesProblemId = { contestId: number; index: string };

export function parseContestId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const contestId = Number(value);
  return Number.isSafeInteger(contestId) &&
    contestId > 0 &&
    contestId <= MAX_CONTEST_ID
    ? contestId
    : null;
}

export function parseProblemRouteParams({
  contestId,
  index,
}: {
  contestId: string;
  index: string;
}): CodeforcesProblemId | null {
  const parsedContestId = parseContestId(contestId);
  const normalizedIndex = index.toUpperCase();
  if (
    parsedContestId === null ||
    !PROBLEM_INDEX_PATTERN.test(normalizedIndex)
  ) {
    return null;
  }
  return { contestId: parsedContestId, index: normalizedIndex };
}

export function formatProblemId(contestId: number, index: string) {
  // Numeric indexes (e.g. contest 921's "01") need a separator to stay unambiguous.
  return /^\d/.test(index) ? `${contestId}/${index}` : `${contestId}${index}`;
}

export function parseCodeforcesProblem(
  input: string,
): CodeforcesProblemId | null {
  const value = input.trim();
  if (!value || value.length > MAX_PROBLEM_INPUT_LENGTH) return null;

  const identifier =
    value.match(/^(\d+)\s*\/\s*([A-Z0-9]{1,10})$/i) ??
    value.match(/^(\d+)\s+([A-Z0-9]{1,10})$/i) ??
    value.match(/^(\d+)([A-Z][A-Z0-9]{0,9})$/i);
  if (identifier) {
    return parseProblemRouteParams({
      contestId: identifier[1],
      index: identifier[2],
    });
  }

  try {
    const url = new URL(
      value.startsWith("//")
        ? `https:${value}`
        : /^[a-z][a-z\d+.-]*:\/\//i.test(value)
          ? value
          : `https://${value}`,
    );
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port ||
      (url.hostname !== "codeforces.com" &&
        !url.hostname.endsWith(".codeforces.com"))
    ) {
      return null;
    }

    const path = url.pathname.replace(/\/+$/, "");
    const match =
      path.match(/^\/problemset\/problem\/(\d+)\/([A-Z0-9]{1,10})$/i) ??
      path.match(/^\/(?:contest|gym)\/(\d+)\/problem\/([A-Z0-9]{1,10})$/i) ??
      path.match(
        /^\/group\/[A-Z0-9]+\/contest\/(\d+)\/problem\/([A-Z0-9]{1,10})$/i,
      );
    return match
      ? parseProblemRouteParams({ contestId: match[1], index: match[2] })
      : null;
  } catch {
    return null;
  }
}
