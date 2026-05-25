import {
  buildOpenRouterChatRequest,
  createChatCompletion,
  extractStructuredResponse,
  fetchGenerationMetadataBestEffort,
} from "./openrouter";
import type { GenerateOptions, StructuredResponse } from "./types";

export * from "./types";

export async function generateStructuredResponse(
  options: GenerateOptions,
): Promise<StructuredResponse> {
  const body = buildOpenRouterChatRequest(options);
  const result = await createChatCompletion(body);
  const metadata = await fetchGenerationMetadataBestEffort(result.id);

  return extractStructuredResponse(result, metadata);
}
