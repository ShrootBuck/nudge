export type OutputSchema = {
  name: string;
  description: string;
  schema: Record<string, unknown>;
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
  presetSlug: string;
  presetLabel: string;
  resolvedModel: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  costCredits: number | null;
  finishReason: string | null;
  nativeFinishReason: string | null;
  providerName: string | null;
};

export type GenerateOptions = {
  systemPrompt: string;
  userPrompt: UserPromptInput;
  outputSchema: OutputSchema;
};

export type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
};

export type OpenRouterChatRequest = Record<string, unknown> & {
  model: string;
  messages: OpenRouterMessage[];
};

export type OpenRouterChatResponse = {
  id: string;
  choices: Array<{
    finish_reason?: string | null;
    native_finish_reason?: string | null;
    message?: {
      content?: string | null;
    };
  }>;
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
  };
};

export type OpenRouterGenerationMetadata = {
  data?: {
    finish_reason?: string | null;
    native_finish_reason?: string | null;
    model?: string | null;
    provider_name?: string | null;
    tokens_prompt?: number | null;
    tokens_completion?: number | null;
    total_cost?: number | null;
    usage?: number | null;
  };
};
