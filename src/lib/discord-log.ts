import { type DiscordMessage, sendDiscordWebhook } from "./discord-webhook";
import { getOptionalEnv } from "./env";

const MAX_DISCORD_LOG_ATTEMPTS = 3;
const DISCORD_LOG_RETRY_DELAY_MS = 1_000;

let warnedAboutMissingWebhook = false;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Best-effort logger; keeps jobs and local runs successful if Discord is unavailable.
export async function discordLog(message: DiscordMessage): Promise<void> {
  const webhookUrl = getOptionalEnv("DISCORD_WEBHOOK_URL");

  if (!webhookUrl) {
    if (!warnedAboutMissingWebhook) {
      warnedAboutMissingWebhook = true;
      console.warn("DISCORD_WEBHOOK_URL is not set; skipping Discord logs");
    }
    return;
  }

  for (let attempt = 1; attempt <= MAX_DISCORD_LOG_ATTEMPTS; attempt++) {
    const sent = await sendDiscordWebhook(webhookUrl, message);

    if (sent) {
      return;
    }

    if (attempt < MAX_DISCORD_LOG_ATTEMPTS) {
      await wait(DISCORD_LOG_RETRY_DELAY_MS * attempt);
    }
  }
}
