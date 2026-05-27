import { generateOpenAIStructuredResponse } from "./openai";
import type { GenerateOptions, StructuredResponse } from "./types";

export * from "./types";

export async function generateStructuredResponse(
  options: GenerateOptions,
): Promise<StructuredResponse> {
  return generateOpenAIStructuredResponse(options);
}
