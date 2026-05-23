import { getActiveOpenRouterPreset } from "./generation-config";
import {
  buildOpenRouterChatRequest,
  createChatCompletion,
  extractStructuredResponse,
  fetchGenerationMetadataBestEffort,
} from "./openrouter";
import type { GenerateOptions, StructuredResponse } from "./types";

export * from "./generation-config";
export * from "./openrouter-presets";
export * from "./types";

export async function generateStructuredResponse(
  options: GenerateOptions,
): Promise<StructuredResponse> {
  const preset = await getActiveOpenRouterPreset();
  const body = buildOpenRouterChatRequest(options, preset);
  const result = await createChatCompletion(body);
  const metadata = await fetchGenerationMetadataBestEffort(result.id);

  return extractStructuredResponse(result, preset, metadata);
}
