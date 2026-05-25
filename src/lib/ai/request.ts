import type { ModelMessage, UserModelMessage } from "ai";
import type { UserPromptInput } from "./types";

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

  if (Array.isArray(copy.oneOf)) {
    copy.oneOf = copy.oneOf.map((s) =>
      toStrictJsonSchema(s as Record<string, unknown>),
    );
  }

  if (copy.$defs && typeof copy.$defs === "object") {
    const defs = copy.$defs as Record<string, Record<string, unknown>>;
    copy.$defs = Object.fromEntries(
      Object.entries(defs).map(([key, value]) => [
        key,
        toStrictJsonSchema(value),
      ]),
    );
  }

  return copy;
}

function toUserContent(input: UserPromptInput): UserModelMessage["content"] {
  if (typeof input === "string") {
    return input;
  }

  return input.map((item) => {
    if (item.type === "text") {
      return { type: "text" as const, text: item.text ?? "" };
    }

    return { type: "image" as const, image: item.image_url?.url ?? "" };
  });
}

export function buildMessages(userPrompt: UserPromptInput): ModelMessage[] {
  return [{ role: "user", content: toUserContent(userPrompt) }];
}
