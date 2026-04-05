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
        color: embed.color ?? 0x3b82f6,
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
