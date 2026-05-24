import type { OpenRouterPreset } from "./openrouter-presets";
import { toOpenRouterPresetModel } from "./openrouter-presets";
import { buildMessages, toResponseFormat } from "./request";
import type {
  GenerateOptions,
  OpenRouterChatRequest,
  OpenRouterChatResponse,
  OpenRouterGenerationMetadata,
  StructuredResponse,
} from "./types";

const CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const GENERATION_METADATA_URL = "https://openrouter.ai/api/v1/generation";

function getOpenRouterApiKey() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  return apiKey;
}

export function buildOpenRouterChatRequest(
  options: GenerateOptions,
  preset: OpenRouterPreset,
): OpenRouterChatRequest {
  return {
    model: toOpenRouterPresetModel(preset.slug),
    messages: buildMessages(options.systemPrompt, options.userPrompt),
    response_format: toResponseFormat(options.outputSchema),
    provider: {
      require_parameters: ["response_format"],
    },
  };
}

const CHAT_COMPLETION_TIMEOUT_MS = 120_000;
const GENERATION_METADATA_TIMEOUT_MS = 10_000;
const GENERATION_METADATA_DELAY_MS = 1_500;

export async function createChatCompletion(
  body: OpenRouterChatRequest,
): Promise<OpenRouterChatResponse> {
  const response = await fetch(CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getOpenRouterApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CHAT_COMPLETION_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `OpenRouter request failed (${response.status}): ${errorBody}`,
    );
  }

  return response.json() as Promise<OpenRouterChatResponse>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchGenerationMetadata(
  responseId: string,
): Promise<OpenRouterGenerationMetadata["data"] | null> {
  const url = new URL(GENERATION_METADATA_URL);
  url.searchParams.set("id", responseId);

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${getOpenRouterApiKey()}`,
    },
    signal: AbortSignal.timeout(GENERATION_METADATA_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `OpenRouter generation metadata failed (${response.status}): ${errorBody}`,
    );
  }

  const body = (await response.json()) as OpenRouterGenerationMetadata;
  return body.data ?? null;
}

export async function fetchGenerationMetadataBestEffort(
  responseId: string,
): Promise<OpenRouterGenerationMetadata["data"] | null> {
  try {
    // The /generation endpoint is eventually consistent — give OpenRouter
    // time to persist the metadata before the first attempt.
    await delay(GENERATION_METADATA_DELAY_MS);

    const first = await fetchGenerationMetadata(responseId);
    if (first !== null) {
      return first;
    }

    // Single retry: metadata may not have been written yet.
    await delay(GENERATION_METADATA_DELAY_MS);
    return await fetchGenerationMetadata(responseId);
  } catch (error) {
    console.warn(
      `Skipping OpenRouter generation metadata for ${responseId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

export function extractMessageContent(
  content: string | null | undefined,
): string {
  return content?.trim() ?? "";
}

function toFiniteNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function coalesceNumber(
  ...values: Array<number | null | undefined>
): number | null {
  for (const value of values) {
    const normalized = toFiniteNumber(value);
    if (normalized !== null) {
      return normalized;
    }
  }

  return null;
}

function coalesceString(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

export function extractStructuredResponse(
  result: OpenRouterChatResponse,
  preset: OpenRouterPreset,
  metadata: OpenRouterGenerationMetadata["data"] | null = null,
): StructuredResponse {
  const firstChoice = result.choices[0];
  const outputText = extractMessageContent(firstChoice?.message?.content);

  if (!outputText) {
    throw new Error("OpenRouter response missing message content");
  }

  const promptTokens = coalesceNumber(
    metadata?.tokens_prompt,
    result.usage?.prompt_tokens,
  );
  const completionTokens = coalesceNumber(
    metadata?.tokens_completion,
    result.usage?.completion_tokens,
  );
  const summedTokens =
    promptTokens !== null && completionTokens !== null
      ? promptTokens + completionTokens
      : null;

  return {
    outputText,
    responseId: result.id,
    presetSlug: preset.slug,
    presetLabel: preset.label,
    resolvedModel: coalesceString(metadata?.model, result.model),
    promptTokens,
    completionTokens,
    totalTokens: coalesceNumber(result.usage?.total_tokens, summedTokens),
    costCredits: coalesceNumber(
      metadata?.total_cost,
      metadata?.usage,
      result.usage?.cost,
    ),
    finishReason: coalesceString(
      metadata?.finish_reason,
      firstChoice?.finish_reason,
    ),
    nativeFinishReason: coalesceString(
      metadata?.native_finish_reason,
      firstChoice?.native_finish_reason,
    ),
    providerName: coalesceString(metadata?.provider_name),
  };
}
