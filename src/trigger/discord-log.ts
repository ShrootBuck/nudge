import { type DiscordEmbed, sendDiscordWebhook } from "../lib/discord-webhook";
import { getOptionalEnv } from "../lib/env";

const MAX_DISCORD_LOG_ATTEMPTS = 3;
const DISCORD_LOG_RETRY_DELAY_MS = 1_000;

let warnedAboutMissingWebhook = false;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Best-effort Trigger logger; keeps runs successful if Discord is unavailable.
export async function discordLog(embed: DiscordEmbed): Promise<void> {
  const webhookUrl = getOptionalEnv("DISCORD_WEBHOOK_URL");

  if (!webhookUrl) {
    if (!warnedAboutMissingWebhook) {
      warnedAboutMissingWebhook = true;
      console.warn(
        "DISCORD_WEBHOOK_URL is not set; skipping trigger Discord logs",
      );
    }
    return;
  }

  for (let attempt = 1; attempt <= MAX_DISCORD_LOG_ATTEMPTS; attempt++) {
    const sent = await sendDiscordWebhook(webhookUrl, embed);

    if (sent) {
      return;
    }

    if (attempt < MAX_DISCORD_LOG_ATTEMPTS) {
      await wait(DISCORD_LOG_RETRY_DELAY_MS * attempt);
    }
  }
}
