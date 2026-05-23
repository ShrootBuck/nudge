import type { Metadata } from "next";
import { connection } from "next/server";
import { GENERATION_CONFIG_ID } from "@/lib/ai/generation-config";
import {
  getDefaultOpenRouterPreset,
  OPENROUTER_PRESETS,
  resolveOpenRouterPreset,
} from "@/lib/ai/openrouter-presets";
import { prisma } from "@/lib/prisma";
import { ProviderSwitcher } from "./provider-switcher";

export const metadata: Metadata = {
  title: "Provider",
  robots: {
    index: false,
    follow: false,
  },
};

async function getProviderPageData() {
  await connection();

  const config = await prisma.generationConfig.findUnique({
    where: { id: GENERATION_CONFIG_ID },
    select: { activeOpenRouterPresetSlug: true },
  });

  const configuredSlug =
    config?.activeOpenRouterPresetSlug ?? getDefaultOpenRouterPreset().slug;

  try {
    const activePreset = resolveOpenRouterPreset(configuredSlug);
    return {
      activePresetSlug: activePreset.slug,
      activePresetLabel: activePreset.label,
      configError: null,
    };
  } catch (error) {
    return {
      activePresetSlug: configuredSlug,
      activePresetLabel: null,
      configError:
        error instanceof Error
          ? error.message
          : "Stored OpenRouter preset is invalid",
    };
  }
}

export default async function ProviderPage() {
  const data = await getProviderPageData();

  return (
    <main className="min-h-screen pb-16">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <ProviderSwitcher
          presets={OPENROUTER_PRESETS}
          activePresetSlug={data.activePresetSlug}
          activePresetLabel={data.activePresetLabel}
          configError={data.configError}
        />
      </div>
    </main>
  );
}
