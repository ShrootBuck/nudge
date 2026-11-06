import { Plugin } from "@opencode/plugin";
import { z } from "zod";
import { problemResultSchema } from "../../generate-content/content-schema";
import { STRUCTURED_OUTPUT_TOOL } from "../request";

export default Plugin.define({
  id: "nudge.structured-output",
  async setup(context) {
    const schema = context.options.schema;
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
      throw new Error("Nudge's result tool requires an output schema");
    }
    // Describe the desired shape without rejecting recoverable metadata mistakes.
    // Use the same content validator here and on the server so the model can fix
    // genuinely incomplete results before the session ends.
    const input = z
      .object({
        status: z.string().optional().describe("success or unsolvable"),
        reason: z
          .string()
          .nullable()
          .optional()
          .describe("null on success; concrete blocker otherwise"),
        hints: z
          .union([
            z.array(
              z.union([
                z.string(),
                z.object({
                  order: z.union([z.number(), z.string()]).optional(),
                  content: z.string(),
                }),
              ]),
            ),
            z.string(),
            z.null(),
          ])
          .optional()
          .describe(
            "Five progressive hints: [{order: 1, content: 'Markdown'}, ...]",
          ),
        editorial: z
          .string()
          .nullable()
          .optional()
          .describe("Self-contained Markdown editorial on success"),
        solution: z
          .string()
          .nullable()
          .optional()
          .describe("Complete raw C++ solution on success"),
      })
      .superRefine((value, context) => {
        const result = problemResultSchema.safeParse(value);
        if (!result.success)
          for (const issue of result.error.issues)
            context.addIssue({
              code: "custom",
              path: issue.path,
              message: issue.message,
            });
      });
    await context.tool.transform((editor) => {
      editor.remove("question");
      editor.add({
        name: STRUCTURED_OUTPUT_TOOL,
        description:
          "Submit the final Nudge result. All arguments must match the result schema. After a successful submission, end your response without further tool calls.",
        input,
        options: { codemode: false },
        // OpenCode runs the Standard Schema validator before the executor.
        // Reading the completed tool call preserves the validated payload in
        // the exported transcript, without an extra result file or JSON parser.
        async execute() {
          return { content: "Nudge result accepted. The task is complete." };
        },
      });
    });
  },
});
