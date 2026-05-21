import type { OpenRouterMessage, OutputSchema, UserPromptInput } from "./types";

export function toStrictJsonSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const copy = { ...schema };

  if (copy.type === "object" && copy.properties) {
    const props = copy.properties as Record<string, Record<string, unknown>>;
    copy.properties = Object.fromEntries(
      Object.entries(props).map(([key, value]) => [
        key,
        toStrictJsonSchema(value),
      ]),
    );
    copy.additionalProperties = false;

    if (!copy.required) {
      copy.required = Object.keys(props);
    }
  }

  if (copy.type === "array" && copy.items) {
    copy.items = toStrictJsonSchema(copy.items as Record<string, unknown>);
  }

  if (Array.isArray(copy.anyOf)) {
    copy.anyOf = copy.anyOf.map((s) =>
      toStrictJsonSchema(s as Record<string, unknown>),
    );
  }

  return copy;
}

export function toResponseFormat(outputSchema: OutputSchema) {
  return {
    type: "json_schema",
    json_schema: {
      name: outputSchema.name,
      description: outputSchema.description,
      strict: true,
      schema: toStrictJsonSchema(outputSchema.schema),
    },
  };
}

function toUserContent(
  input: UserPromptInput,
): string | OpenRouterMessage["content"] {
  if (typeof input === "string") {
    return input;
  }

  return input.map((item) => {
    if (item.type === "text") {
      return { type: "text" as const, text: item.text ?? "" };
    }

    return {
      type: "image_url" as const,
      image_url: { url: item.image_url?.url ?? "" },
    };
  });
}

export function buildMessages(
  systemPrompt: string,
  userPrompt: UserPromptInput,
): OpenRouterMessage[] {
  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: toUserContent(userPrompt) },
  ];
}

export const structuredOutputDefaults = {
  provider: { require_parameters: true },
  plugins: [{ id: "response-healing" }],
} as const;
