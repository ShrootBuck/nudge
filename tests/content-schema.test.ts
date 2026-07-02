import { describe, expect, test } from "bun:test";
import { problemResultSchema } from "../src/lib/generate-content/content-schema";

describe("generated content schema", () => {
  test("rejects generic lack-of-confidence unsolvable reasons", () => {
    const result = problemResultSchema.safeParse({
      status: "unsolvable",
      reason:
        "I can’t honestly guarantee an AC-quality solution for this 3500-rated problem.",
      hints: null,
      editorial: null,
      solution: null,
    });

    expect(result.success).toBe(false);
  });

  test("accepts concrete source-access unsolvable reasons", () => {
    const result = problemResultSchema.safeParse({
      status: "unsolvable",
      reason:
        "The statement depends on an external PDF that defines the operation, but Codeforces returned 403 Cloudflare challenge when accessing that required resource.",
      hints: null,
      editorial: null,
      solution: null,
    });

    expect(result.success).toBe(true);
  });
});
