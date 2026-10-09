import type { GenerateOptions } from "./types";

export const STRUCTURED_OUTPUT_TOOL = "nudge_submit_result";
export const STRUCTURED_OUTPUT_RETRIES = 2;

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

  if (Array.isArray(copy.allOf)) {
    copy.allOf = copy.allOf.map((schema) =>
      toStrictJsonSchema(schema as Record<string, unknown>),
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

export function buildStructuredOutputSchema(options: GenerateOptions) {
  return z.record(z.string(), z.json()).parse({
    ...toStrictJsonSchema(options.outputSchema.schema),
    title: options.outputSchema.name,
    description: options.outputSchema.description,
  });
}

import { z } from "zod";
