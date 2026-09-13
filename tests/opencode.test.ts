import { describe, expect, test } from "bun:test";
import type { AssistantMessage } from "@opencode-ai/sdk/v2";
import { OPEN_CODE_GENERATION_CONFIG } from "../src/lib/ai/config";
import {
  buildOpenCodeRuntimeConfig,
  toStructuredResponse,
} from "../src/lib/ai/opencode";
import { buildStructuredOutputFormat } from "../src/lib/ai/request";

const assistantMessage = {
  id: "message-1",
  sessionID: "session-1",
  role: "assistant",
  time: { created: 1, completed: 2 },
  parentID: "message-0",
  modelID: "gpt-5.6-sol",
  providerID: "openai",
  mode: "nudge-generation",
  agent: "nudge-generation",
  path: { cwd: "/tmp/work", root: "/tmp/work" },
  cost: 0,
  tokens: {
    total: 120,
    input: 80,
    output: 20,
    reasoning: 20,
    cache: { read: 0, write: 0 },
  },
  structured: { value: "ok" },
  variant: "max",
  finish: "tool-calls",
} satisfies AssistantMessage;

describe("OpenCode generation", () => {
  test("builds a display name from the selected configuration", () => {
    expect(OPEN_CODE_GENERATION_CONFIG.model).toBe(
      `${OPEN_CODE_GENERATION_CONFIG.providerId}/${OPEN_CODE_GENERATION_CONFIG.modelId}`,
    );
    expect(OPEN_CODE_GENERATION_CONFIG.displayName).toContain(
      OPEN_CODE_GENERATION_CONFIG.modelDisplayName,
    );
  });

  test("allows all generation permissions", () => {
    const config = buildOpenCodeRuntimeConfig();
    expect(config.share).toBe("disabled");
    expect(config.permission).toBe("allow");
    expect(config.agent?.["nudge-generation"]?.permission).toBe("allow");
  });

  test("maps native structured output and audit metadata", () => {
    expect(
      toStructuredResponse({
        message: assistantMessage,
        providerName: "OpenAI",
        transcriptPath: "/tmp/session.json",
      }),
    ).toEqual({
      outputText: '{"value":"ok"}',
      responseId: "message-1",
      transcriptPath: "/tmp/session.json",
      displayName: OPEN_CODE_GENERATION_CONFIG.displayName,
      resolvedModel: "openai/gpt-5.6-sol",
      finishReason: "stop",
      nativeFinishReason: "tool-calls",
      providerName: "OpenAI via OpenCode",
      totalTokens: 120,
    });
  });

  test("builds a strict native JSON schema format", () => {
    expect(
      buildStructuredOutputFormat({
        systemPrompt: "system",
        userPrompt: "prompt",
        outputSchema: {
          name: "result",
          description: "A result",
          schema: {
            type: "object",
            properties: { value: { type: "string" } },
          },
        },
      }),
    ).toEqual({
      type: "json_schema",
      retryCount: 2,
      schema: {
        type: "object",
        title: "result",
        description: "A result",
        properties: { value: { type: "string" } },
        required: ["value"],
        additionalProperties: false,
      },
    });
  });
});
