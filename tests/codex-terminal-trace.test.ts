import { describe, expect, test } from "bun:test";
import { normalizeCodexTerminalTraceEvent } from "../src/lib/ai/codex-terminal-trace";

describe("Codex terminal trace", () => {
  test("replaces an empty web search start with the completed query", () => {
    const displayed = new Set<string>();

    expect(
      normalizeCodexTerminalTraceEvent(
        {
          type: "tool-call",
          toolCallId: "search-1",
          toolName: "web_search",
          input: { query: "" },
        },
        displayed,
      ),
    ).toBeNull();

    expect(
      normalizeCodexTerminalTraceEvent(
        {
          type: "tool-result",
          toolCallId: "search-1",
          toolName: "web_search",
          output: { query: "Codeforces 2210E editorial" },
        },
        displayed,
      ),
    ).toEqual({
      type: "tool-call",
      toolCallId: "search-1",
      toolName: "web_search",
      input: { query: "Codeforces 2210E editorial" },
    });
  });

  test("does not duplicate a web search whose initial call has a query", () => {
    const displayed = new Set<string>();
    const call = {
      type: "tool-call" as const,
      toolCallId: "search-2",
      toolName: "web_search",
      input: '{"query":"Codeforces 2210E"}',
    };

    expect(normalizeCodexTerminalTraceEvent(call, displayed)).toEqual({
      ...call,
      input: { query: "Codeforces 2210E" },
    });

    expect(
      normalizeCodexTerminalTraceEvent(
        {
          type: "tool-result",
          toolCallId: "search-2",
          toolName: "web_search",
          output: { query: "Codeforces 2210E" },
        },
        displayed,
      ),
    ).toBeNull();
  });

  test("leaves other tool events unchanged", () => {
    const displayed = new Set<string>();
    const event = {
      type: "tool-call" as const,
      toolCallId: "exec-1",
      toolName: "exec",
      input: { command: "pwd" },
    };

    expect(normalizeCodexTerminalTraceEvent(event, displayed)).toBe(event);
  });
});
