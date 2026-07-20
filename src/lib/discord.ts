import { type DiscordMessage, sendDiscordWebhook } from "./discord-webhook";
import { getOptionalEnv } from "./env";

let warnedAboutMissingWebhook = false;

export async function sendAdminLog(message: DiscordMessage): Promise<void> {
  const webhookUrl = getOptionalEnv("DISCORD_WEBHOOK_URL");

  if (!webhookUrl) {
    if (!warnedAboutMissingWebhook) {
      warnedAboutMissingWebhook = true;
      console.warn("DISCORD_WEBHOOK_URL is not set; skipping admin log");
    }
    return;
  }

  // Do not throw so admin actions still succeed if Discord is down.
  await sendDiscordWebhook(webhookUrl, message);
}
