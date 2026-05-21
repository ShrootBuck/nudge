import { z } from "zod";
import type { OutputSchema } from "../../lib/ai";

const hintSchema = z.object({
  order: z.number().int().min(1).max(5),
  content: z.string().trim().min(1),
});

export const contentSchema = z
  .object({
    status: z.literal("success"),
    reason: z.null(),
    hints: z.array(hintSchema).length(5),
    editorial: z.string().trim().min(1),
    solution: z.string().trim().min(1),
  })
  .superRefine(({ hints }, ctx) => {
    const orders = [...hints.map((hint) => hint.order)].sort((a, b) => a - b);

    for (const [index, order] of [1, 2, 3, 4, 5].entries()) {
      if (orders[index] !== order) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Hints must contain exactly one entry for each order from 1 to 5",
          path: ["hints"],
        });
        break;
      }
    }
  });

const unsolvableContentSchema = z.object({
  status: z.literal("unsolvable"),
  reason: z.string().trim().min(1),
  hints: z.null(),
  editorial: z.null(),
  solution: z.null(),
});

export const problemResultSchema = z.discriminatedUnion("status", [
  contentSchema,
  unsolvableContentSchema,
]);

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
          "Set to 'success' if you can solve the problem. Set to 'unsolvable' if the problem statement is fundamentally incomplete or you cannot solve it.",
      },
      reason: {
        anyOf: [{ type: "string" }, { type: "null" }],
        description:
          "If status is 'unsolvable', provide a brief explanation. Otherwise null.",
      },
      hints: {
        anyOf: [
          {
            type: "array",
            description:
              "Exactly 5 progressive hints, each building on the last.",
            items: {
              type: "object",
              properties: {
                order: {
                  type: "number",
                  description: "Hint number, 1 through 5.",
                },
                content: {
                  type: "string",
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
        anyOf: [{ type: "string" }, { type: "null" }],
        description:
          "If status is 'success', a prose editorial explaining the solution. Otherwise null.",
      },
      solution: {
        anyOf: [{ type: "string" }, { type: "null" }],
        description:
          "If status is 'success', a complete C++ solution. Otherwise null.",
      },
    },
    required: ["status", "reason", "hints", "editorial", "solution"],
    additionalProperties: false,
  },
};
