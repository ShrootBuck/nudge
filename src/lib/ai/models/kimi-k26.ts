import {
  buildMessages,
  structuredOutputDefaults,
  toResponseFormat,
} from "../request";
import type { GenerateOptions, ModelProfile } from "../types";

/** Kimi K2.6 — structured output only; no reasoning block in the request body. */
export const kimiK26Profile: ModelProfile = {
  id: "moonshotai/kimi-k2.6",
  displayName: "Kimi K2.6 (thinking)",
  buildRequest(options: GenerateOptions) {
    return {
      model: "moonshotai/kimi-k2.6",
      messages: buildMessages(options.systemPrompt, options.userPrompt),
      response_format: toResponseFormat(options.outputSchema),
      ...structuredOutputDefaults,
    };
  },
};
