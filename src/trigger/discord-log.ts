import { task } from "@trigger.dev/sdk";
import { type DiscordEmbed, sendDiscordWebhook } from "../lib/discord-webhook";
import { getRequiredEnv } from "../lib/env";

/**
 * Fire-and-forget Discord webhook task.
 * Trigger tasks use this instead of the lib/discord helper
 * (which runs in the Next.js process).
 */
export const discordLog = task({
  id: "discord-log",
  retry: { maxAttempts: 3 },
  run: async (payload: DiscordEmbed) => {
    await sendDiscordWebhook(getRequiredEnv("DISCORD_WEBHOOK_URL"), payload, {
      throwOnError: true,
    });

    return { sent: true };
  },
});
