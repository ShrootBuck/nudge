import { describe, expect, test } from "bun:test";
import {
  isProblemIndexable,
  type ProblemSocialData,
  parseProblemRouteParams,
  problemSocialDescription,
  problemSocialTitle,
} from "../src/lib/problem-social";

const problem: ProblemSocialData = {
  contestId: 2209,
  index: "D",
  name: "A Very Real Codeforces Problem",
  rating: 1900,
  tags: ["data structures", "greedy", "implementation"],
  runState: "SUCCEEDED",
  reviewStatus: "VERIFIED",
  hintCount: 5,
  hasEditorial: true,
  hasSolution: true,
};

describe("problem social metadata", () => {
  test("normalizes valid route params and rejects partial contest IDs", () => {
    expect(parseProblemRouteParams({ contestId: "2209", index: "d" })).toEqual({
      contestId: 2209,
      index: "D",
    });
    expect(
      parseProblemRouteParams({ contestId: "2209oops", index: "D" }),
    ).toBeNull();
    expect(
      parseProblemRouteParams({ contestId: "2209", index: "../D" }),
    ).toBeNull();
  });

  test("builds concise, problem-specific titles and descriptions", () => {
    expect(problemSocialTitle(problem)).toBe(
      "2209D: A Very Real Codeforces Problem",
    );

    const description = problemSocialDescription(problem);
    expect(description).toContain("5 progressive hints");
    expect(description).toContain("Codeforces 2209D");
    expect(description).toContain("Rated 1900");
    expect(description).toContain("Topics: data structures");
    expect(description.length).toBeLessThanOrEqual(160);
  });

  test("does not double-punctuate problem names", () => {
    const description = problemSocialDescription({
      ...problem,
      name: "Who Watches the Watchpig?",
      rating: null,
      tags: ["greedy"],
    });

    expect(description).toContain("Watchpig? Topics: greedy.");
    expect(description).not.toContain("Watchpig?.");
  });

  test("only indexes successful problems that are not rejected", () => {
    expect(isProblemIndexable(problem)).toBe(true);
    expect(isProblemIndexable({ ...problem, reviewStatus: "INCORRECT" })).toBe(
      false,
    );
    expect(isProblemIndexable({ ...problem, runState: "RUNNING" })).toBe(false);
  });
});
