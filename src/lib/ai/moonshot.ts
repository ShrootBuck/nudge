import { moonshotai } from "@ai-sdk/moonshotai";
import { generateText, jsonSchema, Output } from "ai";
import { buildMessages, toStrictJsonSchema } from "./request";
import type { GenerateOptions, StructuredResponse } from "./types";

const MODEL = "kimi-k2.6";
const DISPLAY_NAME = "Kimi K2.6";
const PROVIDER_NAME = "Moonshot AI";

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

export async function generateMoonshotStructuredResponse(
  options: GenerateOptions,
): Promise<StructuredResponse> {
  const result = await generateText({
    model: moonshotai(MODEL),
    system: options.systemPrompt,
    messages: buildMessages(options.userPrompt),
    output: buildOutput(options),
  });

  const outputText = JSON.stringify(result.output);

  if (!outputText) {
    throw new Error(
      `Moonshot response missing structured output (id: ${result.response.id}, finish_reason: ${result.finishReason})`,
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
