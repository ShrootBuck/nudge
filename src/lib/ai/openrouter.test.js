import { describe, expect, test } from "bun:test";
import {
  buildOpenRouterChatRequest,
  extractStructuredResponse,
} from "./openrouter.ts";

const preset = {
  slug: "alpha",
  label: "Alpha",
  description: "Test preset",
};

const outputSchema = {
  name: "test_response",
  description: "A strict test response",
  schema: {
    type: "object",
    properties: {
      ok: { type: "boolean" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: { value: { type: "string" } },
        },
      },
    },
  },
};

describe("OpenRouter request builder", () => {
  test("uses preset model references and injects strict JSON schema", () => {
    const request = buildOpenRouterChatRequest(
      {
        systemPrompt: "System",
        userPrompt: "User",
        outputSchema,
      },
      preset,
    );

    expect(request.model).toBe("@preset/alpha");
    expect(request.provider).toBeUndefined();
    expect(request.plugins).toBeUndefined();
    expect(request.messages).toEqual([
      { role: "system", content: "System" },
      { role: "user", content: "User" },
    ]);
    expect(request.response_format).toMatchObject({
      type: "json_schema",
      json_schema: {
        name: "test_response",
        strict: true,
      },
    });
    expect(
      request.response_format.json_schema.schema.additionalProperties,
    ).toBe(false);
    expect(request.response_format.json_schema.schema.required).toEqual([
      "ok",
      "items",
    ]);
  });

  test("preserves multimodal user content", () => {
    const request = buildOpenRouterChatRequest(
      {
        systemPrompt: "System",
        userPrompt: [
          { type: "text", text: "Solve this" },
          {
            type: "image_url",
            image_url: { url: "https://example.com/statement.png" },
          },
        ],
        outputSchema,
      },
      preset,
    );

    expect(request.messages[1].content).toEqual([
      { type: "text", text: "Solve this" },
      {
        type: "image_url",
        image_url: { url: "https://example.com/statement.png" },
      },
    ]);
  });
});

describe("OpenRouter response extraction", () => {
  test("extracts content, token usage, cost, finish reasons, and metadata", () => {
    const response = extractStructuredResponse(
      {
        id: "gen-123",
        model: "openrouter/fallback-model",
        choices: [
          {
            finish_reason: "stop",
            native_finish_reason: "provider-stop",
            message: { content: '  {"ok":true}  ' },
          },
        ],
        usage: { cost: 0.12 },
      },
      preset,
      {
        model: "provider/model",
        provider_name: "Provider",
        tokens_prompt: 10,
        tokens_completion: 20,
        total_cost: 0.42,
        finish_reason: "metadata-stop",
        native_finish_reason: "metadata-native-stop",
      },
    );

    expect(response).toEqual({
      outputText: '{"ok":true}',
      responseId: "gen-123",
      presetSlug: "alpha",
      presetLabel: "Alpha",
      resolvedModel: "provider/model",
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
      costCredits: 0.42,
      finishReason: "metadata-stop",
      nativeFinishReason: "metadata-native-stop",
      providerName: "Provider",
    });
  });

  test("throws when response content is missing", () => {
    expect(() =>
      extractStructuredResponse(
        {
          id: "gen-123",
          choices: [{ message: { content: "   " } }],
        },
        preset,
      ),
    ).toThrow("OpenRouter response missing message content");
  });
});
