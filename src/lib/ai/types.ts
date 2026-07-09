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
  transcriptPath?: string;
  transcriptWarning?: string;
  displayName: string;
  resolvedModel: string | null;
  finishReason: string | null;
  nativeFinishReason: string | null;
  providerName: string | null;
  totalTokens: number | null;
};

export type GenerateOptions = {
  systemPrompt: string;
  userPrompt: UserPromptInput;
  outputSchema: OutputSchema;
  abortSignal?: AbortSignal;
};
