import { z } from "zod";
import rawConfig from "../../../nudge.config.json";

const config = z
  .strictObject({
    model: z
      .string()
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, "Expected a Codex model ID"),
    reasoningEffort: z.string().trim().min(1),
    display: z.strictObject({
      model: z.string().trim().min(1),
      reasoning: z.string().trim().min(1).optional(),
    }),
  })
  .parse(rawConfig);

export const generationConfig = {
  model: config.model,
  reasoningEffort: config.reasoningEffort,
  displayName: `${config.display.model} (${config.display.reasoning ?? config.reasoningEffort})`,
};
