import { describe, expect, test } from "bun:test";
import { buildStructuredOutputFormat } from "../src/lib/ai/request";
import {
  problemOutputSchema,
  problemResultSchema,
} from "../src/lib/generate-content/content-schema";

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

const validContent = {
  status: "success" as const,
  reason: null,
  hints: Array.from({ length: 5 }, (_, index) => ({
    order: index + 1,
    content: "Use $p_i$ and $2\\equiv -1\\pmod 3$.",
  })),
  editorial: "Unicode is fine: π, ≤, 🚀.\n\n$$\\sum_i a_i$$",
  solution: "int main() { char c = '\\0'; }\n",
};

describe("generated text storage validation", () => {
  test("recovers string hints in array order without changing the content", () => {
    expect(
      problemResultSchema.parse({
        ...validContent,
        hints: validContent.hints.map((hint) => hint.content),
      }),
    ).toEqual(problemResultSchema.parse(validContent));
  });

  test("still rejects invalid recovered hints and ambiguous mixed lists", () => {
    const strings = validContent.hints.map((hint) => hint.content);
    for (const hints of [
      strings.slice(1),
      [...strings, "extra"],
      ["   ", ...strings.slice(1)],
      ["bad\0text", ...strings.slice(1)],
      ["x".repeat(10_001), ...strings.slice(1)],
      [validContent.hints[0], ...strings.slice(1)],
      validContent.hints.map((hint) => ({ ...hint, order: 1 })),
    ]) {
      expect(
        problemResultSchema.safeParse({ ...validContent, hints }).success,
      ).toBe(false);
    }
  });

  test("preserves Unicode, math, newlines, and C++ escaped null literals", () => {
    expect(problemResultSchema.parse(validContent)).toEqual({
      ...validContent,
      solution: validContent.solution.trim(),
    });
  });

  for (const field of ["hint", "editorial", "solution", "reason"]) {
    test(`rejects JSON-escaped NUL in ${field} before persistence`, () => {
      const content = structuredClone(validContent);
      const malformed = "Before\0after";
      if (field === "hint") content.hints[0].content = malformed;
      if (field === "editorial") content.editorial = malformed;
      if (field === "solution") content.solution = malformed;
      const input =
        field === "reason"
          ? {
              status: "unsolvable",
              reason: malformed,
              hints: null,
              editorial: null,
              solution: null,
            }
          : content;
      const result = problemResultSchema.safeParse(
        JSON.parse(JSON.stringify(input)),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("NUL (U+0000)");
        expect(result.error.issues[0].path).toEqual(
          field === "hint" ? ["hints", 0, "content"] : [field],
        );
      }
    });
  }
});

test("OpenCode receives NUL restrictions for every generated text field", () => {
  const format = buildStructuredOutputFormat({
    systemPrompt: "system",
    userPrompt: "prompt",
    outputSchema: problemOutputSchema,
  });
  if (format.type !== "json_schema") throw new Error("Expected JSON schema");
  const patterns: string[] = [];
  function visit(value: unknown) {
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if (node.type === "string" && node.minLength === 1) {
      expect(typeof node.pattern).toBe("string");
      patterns.push(node.pattern as string);
    }
    for (const child of Object.values(node)) visit(child);
  }
  visit(format.schema);
  expect(patterns).toHaveLength(4);
  for (const pattern of patterns) {
    const regex = new RegExp(pattern);
    expect(regex.test("Math $x$\nUnicode π\tC++ \\0")).toBe(true);
    expect(regex.test("bad\0math")).toBe(false);
    expect(regex.test("trailing\n\0")).toBe(false);
  }
});
