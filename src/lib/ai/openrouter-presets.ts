export type OpenRouterPreset = {
  slug: string;
  label: string;
  description: string;
};

const PRESET_MODEL_PREFIX = "@preset/";

const presetCatalog = [
  {
    slug: "kimi-k2-6",
    label: "Kimi K2.6",
    description:
      "Default generation preset. Configure its model, providers, reasoning, and plugins in OpenRouter.",
  },
  {
    slug: "gemini-2-5-pro",
    label: "Gemini 2.5 Pro",
    description:
      "High-context fallback preset for harder statement parsing and multimodal problems.",
  },
  {
    slug: "claude-sonnet-4-5",
    label: "Claude Sonnet 4.5",
    description:
      "Editorial-quality preset for comparing non-Kimi generation behavior.",
  },
] as const satisfies readonly OpenRouterPreset[];

// TODO: Replace this temporary local allowlist once OpenRouter exposes a
// documented preset GET/list endpoint. Until then, keep these slugs aligned
// with the OpenRouter dashboard presets and set provider.require_parameters
// inside each preset so structured output support is enforced upstream.
export const OPENROUTER_PRESETS =
  validateOpenRouterPresetCatalog(presetCatalog);

export function validateOpenRouterPresetCatalog(
  presets: readonly OpenRouterPreset[],
): OpenRouterPreset[] {
  if (presets.length === 0) {
    throw new Error("At least one OpenRouter preset must be configured");
  }

  const seen = new Set<string>();

  for (const preset of presets) {
    const slug = preset.slug.trim();
    if (!slug) {
      throw new Error("OpenRouter preset slug cannot be empty");
    }

    if (slug.startsWith(PRESET_MODEL_PREFIX)) {
      throw new Error(
        `OpenRouter preset slug '${slug}' should not include ${PRESET_MODEL_PREFIX}`,
      );
    }

    if (!preset.label.trim()) {
      throw new Error(`OpenRouter preset '${slug}' must have a label`);
    }

    if (seen.has(slug)) {
      throw new Error(`Duplicate OpenRouter preset slug '${slug}'`);
    }

    seen.add(slug);
  }

  return presets.map((preset) => ({
    slug: preset.slug.trim(),
    label: preset.label.trim(),
    description: preset.description.trim(),
  }));
}

export function getDefaultOpenRouterPreset(
  presets = OPENROUTER_PRESETS,
): OpenRouterPreset {
  return presets[0];
}

export function resolveOpenRouterPreset(
  slug: string | null | undefined,
  presets = OPENROUTER_PRESETS,
): OpenRouterPreset {
  const normalizedSlug = slug?.trim();
  if (!normalizedSlug) {
    return getDefaultOpenRouterPreset(presets);
  }

  const preset = presets.find((candidate) => candidate.slug === normalizedSlug);
  if (!preset) {
    throw new Error(
      `Unknown OpenRouter preset '${slug}'. Valid presets: ${presets
        .map((candidate) => candidate.slug)
        .join(", ")}`,
    );
  }

  return preset;
}

export function toOpenRouterPresetModel(slug: string): string {
  return `${PRESET_MODEL_PREFIX}${slug}`;
}
