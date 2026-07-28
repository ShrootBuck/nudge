import { describe, expect, test } from "bun:test";
import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import {
  CLAUDE_CODE_GENERATION_CONFIG,
  toStructuredResponse,
} from "../src/lib/ai/claude-code";

const modelUsage = {
  "claude-opus-5": {
    inputTokens: 80,
    outputTokens: 20,
    cacheCreationInputTokens: 10,
    cacheReadInputTokens: 10,
    webSearchRequests: 0,
    costUSD: 0,
    contextWindow: 1_000_000,
    maxOutputTokens: 64_000,
  },
};

const successResult = {
  type: "result",
  subtype: "success",
  duration_ms: 10,
  duration_api_ms: 8,
  is_error: false,
  num_turns: 1,
  result: "done",
  stop_reason: "end_turn",
  total_cost_usd: 0,
  usage: {
    input_tokens: 80,
    output_tokens: 20,
    cache_creation_input_tokens: 10,
    cache_read_input_tokens: 10,
  },
  modelUsage,
  permission_denials: [],
  structured_output: { value: "ok" },
  uuid: "00000000-0000-4000-8000-000000000001",
  session_id: "session-1",
} as unknown as SDKResultMessage;

describe("Claude Code generation", () => {
  test("pins Opus 5 at max reasoning effort", () => {
    expect(CLAUDE_CODE_GENERATION_CONFIG).toEqual({
      model: "claude-opus-5",
      effort: "max",
      displayName: "Claude Opus 5 (max)",
    });
  });

  test("maps structured output and audit metadata", () => {
    expect(
      toStructuredResponse({
        result: successResult,
        resolvedModel: "claude-opus-5",
        transcriptPath: "/tmp/session.json",
      }),
    ).toEqual({
      outputText: '{"value":"ok"}',
      responseId: "session-1",
      transcriptPath: "/tmp/session.json",
      displayName: "Claude Opus 5 (max)",
      resolvedModel: "claude-opus-5",
      finishReason: "stop",
      nativeFinishReason: "end_turn",
      providerName: "Anthropic via Claude Code",
      totalTokens: 120,
    });
  });

  test("warns when the transcript could not be mirrored", () => {
    const response = toStructuredResponse({
      result: successResult,
      transcriptPath: null,
    });
    expect(response.transcriptPath).toBeUndefined();
    expect(response.transcriptWarning).toContain("session-1");
  });

  test("rejects an errored run that still reports the success subtype", () => {
    expect(() =>
      toStructuredResponse({
        result: {
          ...successResult,
          is_error: true,
          terminal_reason: "api_error",
          result: "Failed to authenticate: OAuth session expired",
          structured_output: undefined,
        } as unknown as SDKResultMessage,
      }),
    ).toThrow(/\(api_error\): Failed to authenticate/);
  });

  test("rejects a run that never produced structured output", () => {
    expect(() =>
      toStructuredResponse({
        result: {
          ...successResult,
          structured_output: undefined,
        } as unknown as SDKResultMessage,
      }),
    ).toThrow(/missing structured output/);
  });

  test("surfaces the reported errors on a failed run", () => {
    expect(() =>
      toStructuredResponse({
        result: {
          ...successResult,
          subtype: "error_max_structured_output_retries",
          errors: ["schema validation failed"],
        } as unknown as SDKResultMessage,
      }),
    ).toThrow(/error_max_structured_output_retries: schema validation failed/);
  });
});
