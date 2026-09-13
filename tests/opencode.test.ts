import { describe, expect, test } from "bun:test";
import type { AssistantMessage } from "@opencode-ai/sdk/v2";
import { OPEN_CODE_GENERATION_CONFIG } from "../src/lib/ai/config";
import {
  assertGenerationPlatformSupported,
  buildOpenCodeOutputRequest,
  buildOpenCodeRuntimeConfig,
  extractOpenCodeJson,
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

  test("uses JSON text for Alibaba while retaining native output elsewhere", () => {
    const options = {
      systemPrompt: "Solve carefully",
      userPrompt: "problem",
      outputSchema: {
        name: "result",
        description: "Result",
        schema: { type: "object" },
      },
    };
    const request = buildOpenCodeOutputRequest(options, "alibaba-token-plan");
    expect(request.format).toEqual({ type: "text" });
    expect(request.system).toContain("Solve carefully");
    expect(request.system).toContain('"title":"result"');
    expect(buildOpenCodeOutputRequest(options, "openai").format.type).toBe(
      "json_schema",
    );
  });

  test("extracts JSON without including reasoning and rejects malformed output", () => {
    const base = { id: "part", sessionID: "session", messageID: "message" };
    expect(
      extractOpenCodeJson([
        { ...base, type: "reasoning", text: "thinking", time: { start: 1 } },
        { ...base, type: "text", text: '```json\n{"value":"ok"}\n```' },
      ]),
    ).toBe('{"value":"ok"}');
    expect(() =>
      extractOpenCodeJson([{ ...base, type: "text", text: "not JSON" }]),
    ).toThrow();
  });

  test("allows every generation tool except question", () => {
    const config = buildOpenCodeRuntimeConfig();
    expect(config.share).toBe("disabled");
    const permission = config.permission;
    const entries = Object.entries(permission as Record<string, string>);
    expect(entries.length).toBe(15);
    for (const [key, value] of entries) {
      expect(value).toBe(key === "question" ? "deny" : "allow");
    }
    expect(config.agent?.["nudge-generation"]?.permission).toEqual(permission);
  });

  test("refuses to build the generation runtime on macOS", () => {
    expect(() => assertGenerationPlatformSupported("darwin")).toThrow(
      /disabled on macOS/,
    );
    expect(() => assertGenerationPlatformSupported("linux")).not.toThrow();
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
