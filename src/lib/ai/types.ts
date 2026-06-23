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
  totalTokens: number | null;
};

export type GenerationTraceEvent =
  | { type: "reasoning-start" }
  | { type: "reasoning-delta"; text: string }
  | { type: "reasoning-end" }
  | { type: "output-start" }
  | { type: "output-delta"; text: string }
  | { type: "output-end" }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      input: unknown;
    }
  | {
      type: "tool-result";
      toolCallId: string;
      toolName: string;
      output: unknown;
    }
  | { type: "error"; error: unknown };

export type GenerateOptions = {
  systemPrompt: string;
  userPrompt: UserPromptInput;
  outputSchema: OutputSchema;
  abortSignal?: AbortSignal;
  onTraceEvent?: (event: GenerationTraceEvent) => void;
};
