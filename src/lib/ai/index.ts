import {
  activeModelProfile,
  modelProfiles,
  resolveModelProfile,
} from "./models";
import { createChatCompletion, extractMessageContent } from "./openrouter";
import type { GenerateOptions, StructuredResponse } from "./types";

export * from "./types";
export { activeModelProfile, modelProfiles, resolveModelProfile };
export type { ModelProfileId } from "./models";

export async function generateStructuredResponse(
  options: GenerateOptions,
  profile = activeModelProfile,
): Promise<StructuredResponse> {
  const body = profile.buildRequest(options);
  const result = await createChatCompletion(body);

  const outputText = extractMessageContent(result.choices[0]?.message?.content);

  if (!outputText) {
    throw new Error("OpenRouter response missing message content");
  }

  return {
    outputText,
    tokensUsed: result.usage?.total_tokens ?? null,
    responseId: result.id,
  };
}
