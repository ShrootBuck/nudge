import { generateMoonshotStructuredResponse } from "./moonshot";
import type { GenerateOptions, StructuredResponse } from "./types";

export * from "./types";

export async function generateStructuredResponse(
  options: GenerateOptions,
): Promise<StructuredResponse> {
  return generateMoonshotStructuredResponse(options);
}
