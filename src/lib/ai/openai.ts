import { type OpenAIResponsesProviderOptions, openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { buildMessages, buildStructuredOutput } from "./request";
import type { GenerateOptions, StructuredResponse } from "./types";

const MODEL = "gpt-5.5-2026-04-23";
const DISPLAY_NAME = "GPT-5.5 (xhigh)";
const PROVIDER_NAME = "OpenAI";
const GENERATION_TIMEOUT_MS = 60 * 60 * 1000;

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

function coalesceTokenCount(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

export async function generateOpenAIStructuredResponse(
  options: GenerateOptions,
): Promise<StructuredResponse> {
  const result = streamText({
    model: openai(MODEL),
    system: options.systemPrompt,
    messages: buildMessages(options.userPrompt),
    output: buildStructuredOutput(options),
    abortSignal: options.abortSignal,
    maxRetries: 0,
    timeout: {
      totalMs: GENERATION_TIMEOUT_MS,
    },
    providerOptions: {
      openai: {
        reasoningEffort: "xhigh",
      } satisfies OpenAIResponsesProviderOptions,
    },
  });

  const [output, response, finishReason, rawFinishReason, usage] =
    await Promise.all([
      result.output,
      result.response,
      result.finishReason,
      result.rawFinishReason,
      result.totalUsage,
    ]);

  const outputText = JSON.stringify(output);

  if (!outputText) {
    throw new Error(
      `OpenAI response missing structured output (id: ${response.id}, finish_reason: ${finishReason})`,
    );
  }

  return {
    outputText,
    responseId: response.id,
    displayName: DISPLAY_NAME,
    resolvedModel: coalesceString(response.modelId, MODEL),
    finishReason: coalesceString(finishReason),
    nativeFinishReason: coalesceString(rawFinishReason),
    providerName: PROVIDER_NAME,
    totalTokens: coalesceTokenCount(usage.totalTokens),
  };
}
