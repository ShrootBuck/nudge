import { z } from "zod";
import rawConfig from "../../../nudge.config.json";

const configSchema = z
  .object({
    model: z
      .string()
      .trim()
      .refine(
        (value) => {
          const separator = value.indexOf("/");
          return separator > 0 && separator < value.length - 1;
        },
        { message: "model must use the provider/model format" },
      ),
    variant: z.string().trim().min(1).optional(),
    display: z
      .object({
        model: z.string().trim().min(1),
        reasoning: z.string().trim().min(1).optional(),
      })
      .strict(),
  })
  .strict();

const parsedConfig = configSchema.parse(rawConfig);
const modelSeparator = parsedConfig.model.indexOf("/");
const reasoningDisplayName =
  parsedConfig.display.reasoning ?? parsedConfig.variant ?? null;

export const OPEN_CODE_GENERATION_CONFIG = {
  model: parsedConfig.model,
  providerId: parsedConfig.model.slice(0, modelSeparator),
  modelId: parsedConfig.model.slice(modelSeparator + 1),
  variant: parsedConfig.variant ?? null,
  modelDisplayName: parsedConfig.display.model,
  reasoningDisplayName,
  displayName: reasoningDisplayName
    ? `${parsedConfig.display.model} (${reasoningDisplayName})`
    : parsedConfig.display.model,
} as const;
