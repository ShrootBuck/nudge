import { fetchWithTimeout } from "./http";

export const DISCORD_COLORS = {
  success: 0x10b981,
  warning: 0xf59e0b,
  error: 0xef4444,
  info: 0x3b82f6,
  violet: 0x8b5cf6,
  sky: 0x0ea5e9,
  indigo: 0x6366f1,
  orange: 0xf97316,
} as const;

export type DiscordEmbed = {
  title: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  timestamp?: string;
};

// Plain content lets Discord unfurl bare links with the site's Open Graph card.
export type DiscordContentMessage = { content: string };

export type DiscordMessage = DiscordEmbed | DiscordContentMessage;

function toWebhookBody(message: DiscordMessage) {
  if ("content" in message) {
    return { content: message.content };
  }

  return {
    embeds: [
      {
        ...message,
        color: message.color ?? DISCORD_COLORS.info,
        timestamp: message.timestamp ?? new Date().toISOString(),
      },
    ],
  };
}

export async function sendDiscordWebhook(
  webhookUrl: string,
  message: DiscordMessage,
  options?: { throwOnError?: boolean },
): Promise<boolean> {
  const normalizedWebhookUrl = webhookUrl.trim();
  if (!normalizedWebhookUrl) {
    const message = "Discord webhook URL is missing or empty";
    if (options?.throwOnError) {
      throw new Error(message);
    }

    console.error(message);
    return false;
  }

  const body = toWebhookBody(message);

  let response: Response;

  try {
    response = await fetchWithTimeout(normalizedWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeoutMs: 10_000,
    });
  } catch (error) {
    const message = `Discord webhook request failed: ${error instanceof Error ? error.message : String(error)}`;

    if (options?.throwOnError) {
      throw new Error(message);
    }

    console.error(message);
    return false;
  }

  if (response.ok) {
    return true;
  }

  const text = await response.text();
  const errorMessage = `Discord webhook failed (${response.status}): ${text}`;

  if (options?.throwOnError) {
    throw new Error(errorMessage);
  }

  console.error(errorMessage);
  return false;
}
