import { describe, expect, test } from "bun:test";
import { isSupportedCacheTag } from "../src/lib/cache-revalidate";
import {
  formatProblemId,
  parseCodeforcesProblem,
  parseProblemRouteParams,
} from "../src/lib/codeforces-problem";
import {
  normalizeProblemSearch,
  problemSearchWhere,
} from "../src/lib/problem-search";

describe("Codeforces problem identifiers", () => {
  test.each(["123A", " 123 a ", "123/A", "123 / a"])("parses %s", (input) => {
    expect(parseCodeforcesProblem(input)).toEqual({
      contestId: 123,
      index: "A",
    });
  });

  test.each([
    "https://codeforces.com/problemset/problem/123/A",
    "https://codeforces.com/contest/123/problem/a/?locale=en#statement",
    "codeforces.com/contest/123/problem/A",
    "//m1.codeforces.com/contest/123/problem/A",
    "https://codeforces.com/group/abc123/contest/123/problem/A",
    "https://codeforces.com/gym/123/problem/A",
  ])("parses the problem path in %s", (input) => {
    expect(parseCodeforcesProblem(input)).toEqual({
      contestId: 123,
      index: "A",
    });
  });

  test("preserves leading zeroes in numeric indexes throughout the app", () => {
    for (const input of [
      "921/01",
      "921 01",
      "https://codeforces.com/contest/921/problem/01",
    ]) {
      expect(parseCodeforcesProblem(input)).toEqual({
        contestId: 921,
        index: "01",
      });
      expect(problemSearchWhere(input)).toEqual({
        contestId: 921,
        index: "01",
      });
      expect(normalizeProblemSearch(input)).toBe("921/01");
    }
    expect(parseProblemRouteParams({ contestId: "921", index: "01" })).toEqual({
      contestId: 921,
      index: "01",
    });
    expect(formatProblemId(921, "01")).toBe("921/01");
    expect(isSupportedCacheTag("problem:921:01")).toBe(true);
    expect(parseCodeforcesProblem("92101")).toBeNull();
    expect(problemSearchWhere("92101")).toEqual({ contestId: 92101 });
  });

  test.each([
    "https://example.com/contest/123/problem/A",
    "https://codeforces.com.example.com/contest/123/problem/A",
    "https://codeforces.com/blog/entry/123/A",
    "https://codeforces.com/profile/123/A",
    "https://codeforces.com/problemset/problem/123/A/extra",
    "ftp://codeforces.com/contest/123/problem/A",
    "https://user:secret@codeforces.com/contest/123/problem/A",
    "https://codeforces.com:8443/contest/123/problem/A",
    "0A",
    "2147483648A",
    "999999999999999999999999999A",
    "123/A_B",
    "123/A%2fB",
  ])("rejects invalid or unrelated input %s", (input) => {
    expect(parseCodeforcesProblem(input)).toBeNull();
  });

  test("shares ID and title search behavior without truncating URLs first", () => {
    for (const input of ["2271 h12", "2271/H12", "2271h12"]) {
      expect(problemSearchWhere(input)).toEqual({
        contestId: 2271,
        index: "H12",
      });
    }
    expect(
      normalizeProblemSearch(
        `https://codeforces.com/contest/2271/problem/H2?tracking=${"x".repeat(150)}`,
      ),
    ).toBe("2271H2");
    expect(problemSearchWhere("  2 Arrays  ")).toEqual({
      name: { contains: "2 Arrays", mode: "insensitive" },
    });
    expect(problemSearchWhere("Watermelon")).toEqual({
      name: { contains: "Watermelon", mode: "insensitive" },
    });
    expect(problemSearchWhere("2147483648")).toEqual({ contestId: 0 });
    expect(problemSearchWhere("  ")).toEqual({});
    expect(isSupportedCacheTag("problem:2147483648:A")).toBe(false);
    expect(isSupportedCacheTag("problem:921:01:extra")).toBe(false);
  });
});
