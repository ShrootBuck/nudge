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
  tokensUsed: number | null;
  responseId: string;
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

/** OpenRouter chat completion request — each model profile fills this differently. */
export type OpenRouterChatRequest = Record<string, unknown> & {
  model: string;
  messages: OpenRouterMessage[];
};

export type OpenRouterChatResponse = {
  id: string;
  choices: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  usage?: {
    total_tokens?: number;
  };
};

export type ModelProfile = {
  id: string;
  displayName: string;
  buildRequest: (options: GenerateOptions) => OpenRouterChatRequest;
};
