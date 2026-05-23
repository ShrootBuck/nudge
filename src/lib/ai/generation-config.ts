import { prisma } from "@/lib/prisma";
import {
  getDefaultOpenRouterPreset,
  type OpenRouterPreset,
  resolveOpenRouterPreset,
} from "./openrouter-presets";

export const GENERATION_CONFIG_ID = "default";

export async function getActiveOpenRouterPreset(): Promise<OpenRouterPreset> {
  const config = await prisma.generationConfig.findUnique({
    where: { id: GENERATION_CONFIG_ID },
    select: { activeOpenRouterPresetSlug: true },
  });

  if (!config) {
    return getDefaultOpenRouterPreset();
  }

  return resolveOpenRouterPreset(config.activeOpenRouterPresetSlug);
}

export async function setActiveOpenRouterPreset(
  slug: string,
): Promise<OpenRouterPreset> {
  const preset = resolveOpenRouterPreset(slug);

  await prisma.generationConfig.upsert({
    where: { id: GENERATION_CONFIG_ID },
    create: {
      id: GENERATION_CONFIG_ID,
      activeOpenRouterPresetSlug: preset.slug,
    },
    update: { activeOpenRouterPresetSlug: preset.slug },
  });

  return preset;
}
