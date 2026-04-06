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

export async function sendDiscordWebhook(
  webhookUrl: string,
  embed: DiscordEmbed,
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

  const body = {
    embeds: [
      {
        ...embed,
        color: embed.color ?? DISCORD_COLORS.info,
        timestamp: embed.timestamp ?? new Date().toISOString(),
      },
    ],
  };

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
  const message = `Discord webhook failed (${response.status}): ${text}`;

  if (options?.throwOnError) {
    throw new Error(message);
  }

  console.error(message);
  return false;
}
