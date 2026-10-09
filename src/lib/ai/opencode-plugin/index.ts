import { Plugin } from "@opencode/plugin";
import { z } from "zod";
import { STRUCTURED_OUTPUT_TOOL } from "../request";

export default Plugin.define({
  id: "nudge.structured-output",
  async setup(context) {
    const schema = context.options.schema;
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
      throw new Error("Nudge's result tool requires an output schema");
    }
    // V2's raw JSON Schema conversion can fall back to accepting an input when
    // it cannot decode the schema. A Standard Schema validator fails closed and
    // enforces Nudge's nested constraints, including PostgreSQL's NUL restriction.
    const input = z.fromJSONSchema(schema);
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
