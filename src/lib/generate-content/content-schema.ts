import { z } from "zod";
import type { OutputSchema } from "../ai";

const MAX_HINT_LENGTH = 10_000;
const MAX_EDITORIAL_LENGTH = 100_000;
const MAX_SOLUTION_LENGTH = 200_000;
const MAX_REASON_LENGTH = 2_000;

// JSON permits escaped NUL characters, but PostgreSQL text does not.
// Validate before trimming so a forbidden character can never be hidden.
const POSTGRES_TEXT_PATTERN = "^[^\\u0000]*$";
const generatedTextSchema = z.string().refine((text) => !text.includes("\0"), {
  message:
    "Generated text must not contain NUL (U+0000) characters; use $ or $$ for LaTeX delimiters.",
});

const hintSchema = z.object({
  order: z.number().int().min(1),
  content: generatedTextSchema.trim().min(1).max(MAX_HINT_LENGTH),
});

export const contentSchema = z.object({
  status: z.literal("success"),
  reason: z.null(),
  hints: z.preprocess(
    // OpenCode can accept string hints despite the requested object schema.
    // Only recover an unambiguous ordered string list; validate it normally.
    (value) =>
      Array.isArray(value) && value.every((hint) => typeof hint === "string")
        ? value.map((content, index) => ({ order: index + 1, content }))
        : value,
    z.array(hintSchema).min(1),
  ),
  editorial: generatedTextSchema.trim().min(1).max(MAX_EDITORIAL_LENGTH),
  solution: generatedTextSchema.trim().min(1).max(MAX_SOLUTION_LENGTH),
});

const unsolvableContentSchema = z.object({
  status: z.literal("unsolvable"),
  reason: generatedTextSchema
    .trim()
    .min(1)
    .max(MAX_REASON_LENGTH)
    .refine(
      (reason) =>
        !/\b(can['’]?t|cannot)\s+(honestly\s+)?guarantee\b/i.test(reason) &&
        !/\bmade[- ]up code\b/i.test(reason) &&
        !/\bwithin this run\b/i.test(reason),
      {
        message:
          "Unsolvable reason must name a concrete statement or source-access blocker, not lack of confidence.",
      },
    ),
  hints: z.null(),
  editorial: z.null(),
  solution: z.null(),
});

// Repair presentation/metadata only; never invent missing learning content.
function normalizeResult(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const result = { ...value } as Record<string, unknown>;
  if (typeof result.status === "string")
    result.status = result.status.trim().toLowerCase();
  const hasContent =
    Array.isArray(result.hints) &&
    result.hints.length > 0 &&
    typeof result.editorial === "string" &&
    result.editorial.trim() &&
    typeof result.solution === "string" &&
    result.solution.trim();
  if (hasContent) result.status = "success";
  if (result.status === "success") {
    result.reason = null;
    if (Array.isArray(result.hints)) {
      const hints = result.hints.map((hint) =>
        typeof hint === "string" ? { content: hint } : hint,
      );
      // Preserve explicit ordering when it is unambiguous, otherwise use array order.
      const order = (hint: unknown): number =>
        hint && typeof hint === "object" && "order" in hint
          ? Number(hint.order)
          : Number.NaN;
      if (
        hints.every(
          (hint) => Number.isInteger(order(hint)) && order(hint) > 0,
        ) &&
        new Set(hints.map(order)).size === hints.length
      )
        hints.sort((a, b) => order(a) - order(b));
      result.hints = hints.map((hint, index) =>
        hint && typeof hint === "object" && !Array.isArray(hint)
          ? { ...hint, order: index + 1 }
          : hint,
      );
    }
    if (typeof result.solution === "string") {
      const fenced = result.solution
        .trim()
        .match(/^```(?:cpp|c\+\+|cxx|cc|C\+\+|C\+\+26)?\s*\n([\s\S]*?)\n```$/);
      if (fenced) result.solution = fenced[1];
    }
  } else if (result.status === "unsolvable") {
    for (const field of ["hints", "editorial", "solution"])
      if (
        result[field] == null ||
        result[field] === "null" ||
        result[field] === ""
      )
        result[field] = null;
  }
  return result;
}

export const problemResultSchema = z.preprocess(
  normalizeResult,
  z.discriminatedUnion("status", [contentSchema, unsolvableContentSchema]),
);

export type ParsedContent = z.infer<typeof contentSchema>;
export type ParsedProblemResult = z.infer<typeof problemResultSchema>;

export const problemOutputSchema: OutputSchema = {
  name: "problem_response",
  description:
    "Submit the generated content for the problem, or report if it is unsolvable.",
  schema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["success", "unsolvable"],
        description:
          "Set to 'success' when the retrieved statement defines a solvable programming problem. Set to 'unsolvable' only if the statement is fundamentally incomplete, contradictory, remains inaccessible after retrieval attempts, or depends on an inaccessible required resource. PDF format or a missing editorial alone is not a blocker.",
      },
      reason: {
        anyOf: [
          {
            type: "string",
            pattern: POSTGRES_TEXT_PATTERN,
            minLength: 1,
            maxLength: MAX_REASON_LENGTH,
          },
          { type: "null" },
        ],
        description:
          "If status is 'unsolvable', provide a detailed failure message to show users. Name the concrete statement/resource blocker and any relevant source lookup/access status, such as missing official tutorial, 403/Cloudflare challenge, 404, or unavailable accepted submissions. Otherwise null.",
      },
      hints: {
        anyOf: [
          {
            type: "array",
            minItems: 5,
            maxItems: 5,
            description:
              "Exactly 5 progressive hints, each building on the last.",
            items: {
              type: "object",
              properties: {
                order: {
                  type: "integer",
                  minimum: 1,
                  maximum: 5,
                  description: "Hint number, 1 through 5.",
                },
                content: {
                  type: "string",
                  pattern: POSTGRES_TEXT_PATTERN,
                  minLength: 1,
                  maxLength: MAX_HINT_LENGTH,
                  description: "Markdown hint text.",
                },
              },
              required: ["order", "content"],
              additionalProperties: false,
            },
          },
          { type: "null" },
        ],
        description:
          "If status is 'success', provide exactly 5 progressive hints. Otherwise null.",
      },
      editorial: {
        anyOf: [
          {
            type: "string",
            pattern: POSTGRES_TEXT_PATTERN,
            minLength: 1,
            maxLength: MAX_EDITORIAL_LENGTH,
          },
          { type: "null" },
        ],
        description:
          "If status is 'success', a prose editorial explaining the solution in Nudge's own voice, with no links, citations, or source/research notes. Otherwise null.",
      },
      solution: {
        anyOf: [
          {
            type: "string",
            pattern: POSTGRES_TEXT_PATTERN,
            minLength: 1,
            maxLength: MAX_SOLUTION_LENGTH,
          },
          { type: "null" },
        ],
        description:
          "If status is 'success', a complete C++ solution. Otherwise null.",
      },
    },
    required: ["status", "reason", "hints", "editorial", "solution"],
    additionalProperties: false,
  },
};
