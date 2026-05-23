"use server";

import { revalidatePath } from "next/cache";
import {
  getActiveOpenRouterPreset,
  setActiveOpenRouterPreset,
} from "@/lib/ai/generation-config";
import {
  type OpenRouterPreset,
  resolveOpenRouterPreset,
} from "@/lib/ai/openrouter-presets";
import { sendAdminLog } from "@/lib/discord";
import { DISCORD_COLORS } from "@/lib/discord-webhook";
import { verifyAdminPassword } from "@/lib/env";

export type ProviderActionState = {
  success?: boolean;
  message?: string;
  error?: string;
  activePresetSlug?: string;
};

function toFormString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export async function selectGenerationPreset(
  _prevState: ProviderActionState | null,
  formData: FormData,
): Promise<ProviderActionState> {
  const password = toFormString(formData.get("password"));
  const auth = verifyAdminPassword(password);
  if (!auth.ok) {
    return { success: false, error: auth.error };
  }

  const requestedSlug = toFormString(formData.get("presetSlug"));
  if (!requestedSlug) {
    return { success: false, error: "Choose a preset first" };
  }

  let nextPreset: OpenRouterPreset;
  try {
    nextPreset = resolveOpenRouterPreset(requestedSlug);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Invalid preset",
    };
  }

  let previousLabel = "Unknown preset";
  try {
    previousLabel = (await getActiveOpenRouterPreset()).label;
  } catch {
    previousLabel = "Invalid stored preset";
  }

  const updatedPreset = await setActiveOpenRouterPreset(nextPreset.slug);

  revalidatePath("/provider");

  await sendAdminLog({
    title: "Provider Preset Changed",
    description: `OpenRouter generation preset changed from **${previousLabel}** to **${updatedPreset.label}**.`,
    color: DISCORD_COLORS.indigo,
    fields: [{ name: "Preset slug", value: updatedPreset.slug, inline: true }],
  });

  return {
    success: true,
    message: `${updatedPreset.label} is now active for future generations.`,
    activePresetSlug: updatedPreset.slug,
  };
}
