import OpenAI from "openai";
import type {
  ResponseInput,
  ResponseInputContent,
} from "openai/resources/responses/responses";
import type {
  GenerateOptions,
  LLMProvider,
  StructuredResponse,
  UserPromptInput,
} from "../types";

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI();
  }

  async generateStructuredResponse(
    options: GenerateOptions,
  ): Promise<StructuredResponse> {
    const response = await this.client.responses.create({
      model: options.model,
      instructions: options.systemPrompt,
      input: this.toResponseInput(options.userPrompt),
      ...(options.effort === "high" ||
      options.effort === "medium" ||
      options.effort === "low"
        ? { reasoning: { effort: options.effort } }
        : {}),
      text: {
        format: {
          type: "json_schema",
          name: options.outputSchema.name,
          description: options.outputSchema.description,
          strict: true,
          schema: this.enforceStrictSchema(options.outputSchema.schema),
        },
      },
    });

    const outputText = this.extractOutputText(response) ?? "";

    return {
      outputText,
      tokensUsed: response.usage?.total_tokens ?? null,
      responseId: response.id,
    };
  }

  private enforceStrictSchema(
    schema: Record<string, unknown>,
  ): Record<string, unknown> {
    const copy = { ...schema };

    if (copy.type === "object" && copy.properties) {
      const props = copy.properties as Record<string, Record<string, unknown>>;
      copy.properties = Object.fromEntries(
        Object.entries(props).map(([key, value]) => [
          key,
          this.enforceStrictSchema(value),
        ]),
      );
      copy.additionalProperties = false;

      if (!copy.required) {
        copy.required = Object.keys(props);
      }
    }

    if (copy.type === "array" && copy.items) {
      copy.items = this.enforceStrictSchema(
        copy.items as Record<string, unknown>,
      );
    }

    if (Array.isArray(copy.anyOf)) {
      copy.anyOf = copy.anyOf.map((s) =>
        this.enforceStrictSchema(s as Record<string, unknown>),
      );
    }

    return copy;
  }

  private toResponseInput(input: UserPromptInput): string | ResponseInput {
    if (typeof input === "string") {
      return input;
    }

    const content: ResponseInputContent[] = input.map((item) => {
      if (item.type === "text") {
        return { type: "input_text", text: item.text ?? "" };
      }

      return {
        type: "input_image",
        image_url: item.image_url?.url ?? null,
        detail: "auto",
      };
    });

    return [
      {
        type: "message" as const,
        role: "user" as const,
        content,
      },
    ];
  }

  private extractOutputText(response: {
    output_text?: string;
    output?: Array<{
      type?: string;
      text?: string;
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }>;
  }): string | null {
    if (response.output_text && response.output_text.trim().length > 0) {
      return response.output_text;
    }

    for (const item of response.output ?? []) {
      if (
        (item.type === "output_text" || item.type === "text") &&
        typeof item.text === "string" &&
        item.text.trim().length > 0
      ) {
        return item.text;
      }

      if (item.type === "message") {
        for (const contentItem of item.content ?? []) {
          if (
            contentItem.type === "output_text" &&
            typeof contentItem.text === "string" &&
            contentItem.text.trim().length > 0
          ) {
            return contentItem.text;
          }
        }
      }
    }

    return null;
  }
}
