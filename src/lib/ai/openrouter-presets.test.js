import { describe, expect, test } from "bun:test";
import {
  getDefaultOpenRouterPreset,
  resolveOpenRouterPreset,
  toOpenRouterPresetModel,
  validateOpenRouterPresetCatalog,
} from "./openrouter-presets.ts";

describe("OpenRouter preset catalog", () => {
  test("uses the first configured preset as the default", () => {
    const presets = validateOpenRouterPresetCatalog([
      { slug: "alpha", label: "Alpha", description: "First" },
      { slug: "beta", label: "Beta", description: "Second" },
    ]);

    expect(getDefaultOpenRouterPreset(presets)).toEqual({
      slug: "alpha",
      label: "Alpha",
      description: "First",
    });
  });

  test("resolves configured slugs and rejects unknown slugs", () => {
    const presets = validateOpenRouterPresetCatalog([
      { slug: "alpha", label: "Alpha", description: "First" },
    ]);

    expect(resolveOpenRouterPreset("alpha", presets).label).toBe("Alpha");
    expect(() => resolveOpenRouterPreset("missing", presets)).toThrow(
      "Unknown OpenRouter preset",
    );
  });

  test("rejects duplicate and already-prefixed slugs", () => {
    expect(() =>
      validateOpenRouterPresetCatalog([
        { slug: "alpha", label: "Alpha", description: "First" },
        { slug: "alpha", label: "Alpha again", description: "Duplicate" },
      ]),
    ).toThrow("Duplicate OpenRouter preset slug 'alpha'");

    expect(() =>
      validateOpenRouterPresetCatalog([
        {
          slug: "@preset/alpha",
          label: "Alpha",
          description: "Already prefixed",
        },
      ]),
    ).toThrow("should not include @preset/");
  });

  test("builds OpenRouter preset model references", () => {
    expect(toOpenRouterPresetModel("alpha")).toBe("@preset/alpha");
  });
});
