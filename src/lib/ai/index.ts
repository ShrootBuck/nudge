import { OpenAIProvider } from "./providers/openai";
import type { GenerateOptions, LLMProvider, StructuredResponse } from "./types";

// Registry of available providers
const providers: Record<string, LLMProvider> = {
  openai: new OpenAIProvider(),
};

// Map models to their default providers if not explicitly specified
function getProviderNameForModel(model: string): string {
  if (model.startsWith("claude-")) {
    return "anthropic";
  }
  // Default to openai for now (handles gpt-* and others)
  return "openai";
}

/**
 * Get an LLM provider by name.
 */
export function getProvider(name: string): LLMProvider {
  const provider = providers[name.toLowerCase()];
  if (!provider) {
    throw new Error(`LLM Provider '${name}' is not registered or supported.`);
  }
  return provider;
}

/**
 * Main entrypoint for generating structured responses.
 * Resolves the appropriate provider based on options or environment variables.
 */
export async function generateStructuredResponse(
  options: GenerateOptions & { provider?: string },
): Promise<StructuredResponse> {
  const providerName =
    options.provider ||
    process.env.LLM_PROVIDER ||
    getProviderNameForModel(options.model);

  const provider = getProvider(providerName);
  return provider.generateStructuredResponse(options);
}

export * from "./types";
