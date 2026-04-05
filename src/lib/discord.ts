import { type DiscordEmbed, sendDiscordWebhook } from "./discord-webhook";
import { getOptionalEnv } from "./env";

let warnedAboutMissingWebhook = false;

export async function sendAdminLog(embed: DiscordEmbed): Promise<void> {
  const webhookUrl = getOptionalEnv("DISCORD_WEBHOOK_URL");

  if (!webhookUrl) {
    if (!warnedAboutMissingWebhook) {
      warnedAboutMissingWebhook = true;
      console.warn("DISCORD_WEBHOOK_URL is not set; skipping admin log");
    }
    return;
  }

  // Don't throw - we don't want to fail the admin action if Discord is down.
  await sendDiscordWebhook(webhookUrl, embed);
}
