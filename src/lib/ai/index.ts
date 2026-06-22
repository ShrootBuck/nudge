import { generateManagedCodexStructuredResponse } from "./codex-cli";
import type { GenerateOptions, StructuredResponse } from "./types";

export * from "./types";

export async function generateStructuredResponse(
  options: GenerateOptions,
): Promise<StructuredResponse> {
  return generateManagedCodexStructuredResponse(options);
}
