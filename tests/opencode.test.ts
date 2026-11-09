import { describe, expect, test } from "bun:test";
import type { SessionTransferData } from "@opencode/client";
import { OPEN_CODE_GENERATION_CONFIG } from "../src/lib/ai/config";
import {
  buildOpenCodeGenerationConfig,
  buildOpenCodeRuntimeConfig,
  toStructuredResponse,
} from "../src/lib/ai/opencode";
import {
  buildStructuredOutputSchema,
  STRUCTURED_OUTPUT_TOOL,
} from "../src/lib/ai/request";

const session: SessionTransferData = {
  info: {
    id: "ses_1",
    projectID: "project-1",
    cost: 0,
    location: { directory: "/tmp/work" },
    time: { created: 1, updated: 2, idle: 2 },
    outcome: "succeeded",
    tokens: {
      input: 80,
      output: 20,
      reasoning: 20,
      cache: { read: 30, write: 10 },
    },
  },
  messages: [
    {
      id: "msg_1",
      type: "assistant",
      time: { created: 1, completed: 2 },
      agent: "nudge-generation",
      model: { id: "gpt-6-astra", providerID: "openai", variant: "low" },
      content: [
        {
          type: "tool",
          id: "call_1",
          name: STRUCTURED_OUTPUT_TOOL,
          time: { created: 1, completed: 2 },
          state: {
            status: "completed",
            input: { value: "ok" },
            content: [{ type: "text", text: "Accepted" }],
          },
        },
      ],
      finish: "tool-calls",
      tokens: {
        input: 10,
        output: 5,
        reasoning: 5,
        cache: { read: 0, write: 0 },
      },
    },
  ],
};

describe("OpenCode V2 generation", () => {
  test("preserves the model and disables questions in ordered native permissions", () => {
    const config = buildOpenCodeRuntimeConfig();
    expect(config.share).toBe("disabled");
    expect(config.update).toBe("disable");
    expect(config.permissions).toEqual([
      { action: "*", resource: "*", effect: "allow" },
      { action: "question", resource: "*", effect: "deny" },
    ]);
    expect(config.agents?.["nudge-generation"]?.permissions).toEqual(
      config.permissions,
    );
    expect(config.agents?.["nudge-generation"]?.model).toBe(
      `${OPEN_CODE_GENERATION_CONFIG.model}${OPEN_CODE_GENERATION_CONFIG.variant ? `#${OPEN_CODE_GENERATION_CONFIG.variant}` : ""}`,
    );
  });

  test("reads validated tool output and counts the whole session including cached tokens", () => {
    expect(
      toStructuredResponse({
        session,
        providerName: "OpenAI",
        transcriptPath: "/tmp/session.json",
      }),
    ).toEqual({
      outputText: '{"value":"ok"}',
      responseId: "msg_1",
      transcriptPath: "/tmp/session.json",
      displayName: OPEN_CODE_GENERATION_CONFIG.displayName,
      resolvedModel: "openai/gpt-6-astra",
      finishReason: "stop",
      nativeFinishReason: "tool-calls",
      providerName: "OpenAI via OpenCode",
      totalTokens: 160,
    });
  });

  test("does not treat plain JSON text as a schema-validated submission", () => {
    const missing = structuredClone(session);
    const message = missing.messages[0];
    if (message.type !== "assistant") throw new Error("Expected assistant");
    message.content = [{ type: "text", text: '{"value":"ok"}' }];
    expect(() => toStructuredResponse({ session: missing })).toThrow(
      "missing a successful",
    );
  });

  test("rejects incomplete or failed tool calls", () => {
    for (const state of [
      { status: "running" as const, input: { value: "bad" }, metadata: {} },
      {
        status: "error" as const,
        input: { value: "bad" },
        error: { type: "validation", message: "Invalid value" },
      },
    ]) {
      const invalid = structuredClone(session);
      const message = invalid.messages[0];
      if (message.type !== "assistant" || message.content[0].type !== "tool")
        throw new Error("Expected tool");
      message.content[0].state = state;
      expect(() => toStructuredResponse({ session: invalid })).toThrow(
        "missing a successful",
      );
    }
  });

  test("rejects failures and interruptions even if an earlier result was submitted", () => {
    for (const outcome of ["failed", "interrupted"] as const) {
      expect(() =>
        toStructuredResponse({
          session: { ...session, info: { ...session.info, outcome } },
        }),
      ).toThrow(outcome);
    }
  });

  test("surfaces provider errors", () => {
    const failed = structuredClone(session);
    failed.info.outcome = "failed";
    const message = failed.messages[0];
    if (message.type !== "assistant") throw new Error("Expected assistant");
    message.error = { type: "ProviderError", message: "Rate limited" };
    expect(() => toStructuredResponse({ session: failed })).toThrow(
      "ProviderError: Rate limited",
    );
  });

  test("keeps a warning when the transcript could not be mirrored", () => {
    expect(toStructuredResponse({ session }).transcriptWarning).toContain(
      "ses_1",
    );
  });

  test("passes the strict schema and original system instructions to the generation plugin", () => {
    const options = {
      systemPrompt: "Follow Nudge's teaching style.",
      userPrompt: "prompt",
      outputSchema: {
        name: "result",
        description: "A result",
        schema: { type: "object", properties: { value: { type: "string" } } },
      },
    };
    const schema = buildStructuredOutputSchema(options);
    expect(schema).toEqual({
      type: "object",
      title: "result",
      description: "A result",
      properties: { value: { type: "string" } },
      required: ["value"],
      additionalProperties: false,
    });
    const config = buildOpenCodeGenerationConfig(options);
    expect(config.agents?.["nudge-generation"]?.system).toContain(
      options.systemPrompt,
    );
    expect(config.agents?.["nudge-generation"]?.system).toContain(
      STRUCTURED_OUTPUT_TOOL,
    );
    expect(config.plugins?.[0]).toMatchObject({ options: { schema } });
  });
});
