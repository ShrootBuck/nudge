import { AnthropicProvider } from "./anthropic";
import { MoonshotProvider } from "./moonshot";
import { OpenAIProvider } from "./openai";
import type { AIProvider } from "./types";
import { XAIProvider } from "./xai";

const providers = new Map<string, AIProvider>();

function register(provider: AIProvider) {
  providers.set(provider.id, provider);
}

register(new AnthropicProvider());
register(new OpenAIProvider());
register(new MoonshotProvider());
register(new XAIProvider());

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

export type {
  AIProvider,
  BatchRequest,
  BatchResult,
  BatchStatus,
  OutputSchema,
} from "./types";
