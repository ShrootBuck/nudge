import type { JSONSchema7 } from "ai";

export type OutputSchema = {
  name: string;
  description: string;
  schema: JSONSchema7;
};

export type UserPromptInput =
  | string
  | Array<{
      type: "text" | "image_url";
      text?: string;
      image_url?: { url: string };
    }>;

export type StructuredResponse = {
  outputText: string;
  responseId: string;
  displayName: string;
  resolvedModel: string | null;
  finishReason: string | null;
  nativeFinishReason: string | null;
  providerName: string | null;
};

export type GenerateOptions = {
  systemPrompt: string;
  userPrompt: UserPromptInput;
  outputSchema: OutputSchema;
};
