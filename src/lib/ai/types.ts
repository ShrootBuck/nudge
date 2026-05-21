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
  model: string;
  effort?: "high" | "medium" | "low" | string;
  systemPrompt: string;
  userPrompt: UserPromptInput;
  outputSchema: OutputSchema;
};

export interface LLMProvider {
  generateStructuredResponse(
    options: GenerateOptions,
  ): Promise<StructuredResponse>;
}
