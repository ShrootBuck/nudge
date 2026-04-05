import { AnthropicProvider } from "./anthropic";
import { OpenAIProvider } from "./openai";
import type { AIProvider } from "./types";

// ---------------------------------------------------------------------------
// Provider registry
// ---------------------------------------------------------------------------

const providers = new Map<string, AIProvider>();

function register(provider: AIProvider) {
  providers.set(provider.id, provider);
}

// Register built-in providers
register(new AnthropicProvider());
register(new OpenAIProvider());

/**
 * Look up a registered AI provider by its ID.
 * The ID must match the `provider` column stored in `ModelConfig`.
 *
 * @throws If no provider is registered under that ID.
 */
export function getProvider(providerId: string): AIProvider {
  const provider = providers.get(providerId);
  if (!provider) {
    const available = [...providers.keys()].join(", ");
    throw new Error(
      `Unknown AI provider "${providerId}". Registered providers: ${available}`,
    );
  }
  return provider;
}

// Re-export all types for convenience
export type {
  AIProvider,
  BatchRequest,
  BatchResult,
  BatchStatus,
  OutputSchema,
} from "./types";
