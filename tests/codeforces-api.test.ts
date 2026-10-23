import { describe, expect, test } from "bun:test";
import { parseCodeforcesProblemset } from "../src/lib/codeforces-api";

const problem = {
  contestId: 921,
  index: "01",
  name: "Numeric index problem",
  type: "PROGRAMMING",
  tags: ["math", "implementation", "math"],
};
const response = (problems: unknown[]) => ({
  status: "OK",
  result: { problems },
});

describe("Codeforces problemset ingestion", () => {
  test("ingests all 14 numeric indexes from contest 921 without changing their identity", () => {
    const indexes = Array.from({ length: 14 }, (_, i) =>
      String(i + 1).padStart(2, "0"),
    );
    const result = parseCodeforcesProblemset(
      response(indexes.map((index) => ({ ...problem, index }))),
    );
    expect(result.problems.map((p) => p.index)).toEqual(indexes);
    expect(result.skipped).toBe(0);
    expect(result.duplicates).toBe(0);
    expect(result.problems[0].tags).toEqual(["implementation", "math"]);
    expect(result.problems[0].rating).toBeUndefined();
  });

  test("deduplicates normalized IDs and reports invalid or unsupported records", () => {
    const result = parseCodeforcesProblemset(
      response([
        problem,
        { ...problem, name: "Updated name", rating: 1400 },
        { ...problem, contestId: 123, index: " h12 " },
        { ...problem, type: "QUESTION" },
        { ...problem, contestId: 2147483648 },
        { ...problem, name: "bad\0name" },
        { ...problem, tags: ["bad\0tag"] },
      ]),
    );
    expect(result.problems).toHaveLength(2);
    expect(result.problems[0].name).toBe("Updated name");
    expect(result.problems[0].rating).toBe(1400);
    expect(result.problems[1].index).toBe("H12");
    expect(result.duplicates).toBe(1);
    expect(result.skipped).toBe(4);
  });

  test("fails loudly on API failures, empty catalogs, and entirely invalid payloads", () => {
    expect(() =>
      parseCodeforcesProblemset({
        status: "FAILED",
        comment: "Call limit exceeded",
      }),
    ).toThrow("Call limit exceeded");
    expect(() => parseCodeforcesProblemset(response([]))).toThrow(
      "no usable problems",
    );
    expect(() =>
      parseCodeforcesProblemset(response([{ ...problem, index: "!" }])),
    ).toThrow("1 skipped");
    expect(() =>
      parseCodeforcesProblemset({ status: "OK", result: {} }),
    ).toThrow();
  });
});
