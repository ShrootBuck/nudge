import type { OpenRouterChatRequest, OpenRouterChatResponse } from "./types";

const CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function createChatCompletion(
  body: OpenRouterChatRequest,
): Promise<OpenRouterChatResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const response = await fetch(CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `OpenRouter request failed (${response.status}): ${errorBody}`,
    );
  }

  return response.json() as Promise<OpenRouterChatResponse>;
}

export function extractMessageContent(
  content: string | null | undefined,
): string {
  return content?.trim() ?? "";
}
