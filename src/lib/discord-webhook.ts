export const DISCORD_COLORS = {
  success: 0x10b981, // emerald
  warning: 0xf59e0b, // amber
  error: 0xef4444, // red
  info: 0x3b82f6, // blue
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
  const body = {
    embeds: [
      {
        ...embed,
        color: embed.color ?? DISCORD_COLORS.info,
        timestamp: embed.timestamp ?? new Date().toISOString(),
      },
    ],
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

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
