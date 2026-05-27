import { openai, type OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import { generateText, jsonSchema, Output } from "ai";
import { buildMessages, toStrictJsonSchema } from "./request";
import type { GenerateOptions, StructuredResponse } from "./types";

const MODEL = "gpt-5.5-2026-04-23";
const DISPLAY_NAME = "GPT-5.5 (xhigh)";
const PROVIDER_NAME = "OpenAI";

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

function buildOutput(options: GenerateOptions) {
  return Output.object({
    name: options.outputSchema.name,
    description: options.outputSchema.description,
    schema: jsonSchema(toStrictJsonSchema(options.outputSchema.schema)),
  });
}

export async function generateOpenAIStructuredResponse(
  options: GenerateOptions,
): Promise<StructuredResponse> {
  const result = await generateText({
    model: openai(MODEL),
    system: options.systemPrompt,
    messages: buildMessages(options.userPrompt),
    output: buildOutput(options),
    providerOptions: {
      openai: {
        reasoningEffort: "xhigh",
      } satisfies OpenAIResponsesProviderOptions,
    },
  });

  const outputText = JSON.stringify(result.output);

  if (!outputText) {
    throw new Error(
      `OpenAI response missing structured output (id: ${result.response.id}, finish_reason: ${result.finishReason})`,
    );
  }

  return {
    outputText,
    responseId: result.response.id,
    displayName: DISPLAY_NAME,
    resolvedModel: coalesceString(result.response.modelId, MODEL),
    finishReason: coalesceString(result.finishReason),
    nativeFinishReason: coalesceString(result.rawFinishReason),
    providerName: PROVIDER_NAME,
  };
}
