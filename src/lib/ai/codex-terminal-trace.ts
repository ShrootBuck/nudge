import type { GenerationTraceEvent } from "./types";

function parseTraceObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function webSearchQuery(value: unknown) {
  const query = parseTraceObject(value)?.query;
  return typeof query === "string" && query.trim() ? query : null;
}

export function normalizeCodexTerminalTraceEvent(
  event: GenerationTraceEvent,
  displayedWebSearchCallIds: Set<string>,
): GenerationTraceEvent | null {
  if (event.type === "tool-call" && event.toolName === "web_search") {
    const query = webSearchQuery(event.input);
    if (!query) {
      return null;
    }

    displayedWebSearchCallIds.add(event.toolCallId);
    return { ...event, input: { query } };
  }

  if (event.type === "tool-result" && event.toolName === "web_search") {
    if (displayedWebSearchCallIds.has(event.toolCallId)) {
      return null;
    }

    const query = webSearchQuery(event.output);
    if (!query) {
      return event;
    }

    displayedWebSearchCallIds.add(event.toolCallId);
    return {
      type: "tool-call",
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      input: { query },
    };
  }

  return event;
}
