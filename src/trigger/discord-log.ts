import { task } from "@trigger.dev/sdk";

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL!;

type DiscordEmbed = {
  title: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
};

/**
 * Fire-and-forget Discord webhook task.
 * Trigger tasks use this instead of the lib/discord helper
 * (which runs in the Next.js process).
 */
export const discordLog = task({
  id: "discord-log",
  retry: { maxAttempts: 3 },
  run: async (payload: DiscordEmbed) => {
    const body = {
      embeds: [
        {
          ...payload,
          color: payload.color ?? 0x3b82f6, // blue default
          timestamp: new Date().toISOString(),
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
      throw new Error(`Discord webhook failed (${res.status}): ${text}`);
    }

    return { sent: true };
  },
});
