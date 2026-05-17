import OpenAI from "openai";
import type {
  ResponseInput,
  ResponseInputContent,
} from "openai/resources/responses/responses";

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

type ResponseOutputItem = {
  type?: string;
  text?: string;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
};

export type StructuredResponse = {
  outputText: string;
  tokensUsed: number | null;
  responseId: string;
};

const client = new OpenAI();

function enforceStrictSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const copy = { ...schema };

  if (copy.type === "object" && copy.properties) {
    const props = copy.properties as Record<string, Record<string, unknown>>;
    copy.properties = Object.fromEntries(
      Object.entries(props).map(([key, value]) => [
        key,
        enforceStrictSchema(value),
      ]),
    );
    copy.additionalProperties = false;

    if (!copy.required) {
      copy.required = Object.keys(props);
    }
  }

  if (copy.type === "array" && copy.items) {
    copy.items = enforceStrictSchema(copy.items as Record<string, unknown>);
  }

  if (Array.isArray(copy.anyOf)) {
    copy.anyOf = copy.anyOf.map((s) =>
      enforceStrictSchema(s as Record<string, unknown>),
    );
  }

  return copy;
}

function toResponseInput(input: UserPromptInput): string | ResponseInput {
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

function extractOutputText(response: {
  output_text?: string;
  output?: ResponseOutputItem[];
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

export async function generateStructuredResponse({
  model,
  effort,
  systemPrompt,
  userPrompt,
  outputSchema,
}: {
  model: string;
  effort: "high";
  systemPrompt: string;
  userPrompt: UserPromptInput;
  outputSchema: OutputSchema;
}): Promise<StructuredResponse> {
  const response = await client.responses.create({
    model,
    instructions: systemPrompt,
    input: toResponseInput(userPrompt),
    reasoning: { effort },
    text: {
      format: {
        type: "json_schema",
        name: outputSchema.name,
        description: outputSchema.description,
        strict: true,
        schema: enforceStrictSchema(outputSchema.schema),
      },
    },
  });

  const outputText = extractOutputText(response) ?? "";

  return {
    outputText,
    tokensUsed: response.usage?.total_tokens ?? null,
    responseId: response.id,
  };
}
