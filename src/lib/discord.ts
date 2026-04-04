const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL!;

type DiscordEmbed = {
  title: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  timestamp?: string;
};

export async function sendAdminLog(embed: DiscordEmbed): Promise<void> {
  const body = {
    embeds: [
      {
        ...embed,
        color: embed.color ?? 0x3b82f6, // blue by default
        timestamp: embed.timestamp ?? new Date().toISOString(),
      },
    ],
  };

  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Discord webhook failed (${res.status}): ${text}`);
    // Don't throw - we don't want to fail the admin action if Discord is down
  }
}
