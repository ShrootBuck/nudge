import type { ModelProfile } from "../types";
import { gemini25ProProfile } from "./gemini-25-pro";
import { kimiK26Profile } from "./kimi-k26";

export const modelProfiles = {
  kimi: kimiK26Profile,
  gemini: gemini25ProProfile,
} as const satisfies Record<string, ModelProfile>;

export type ModelProfileId = keyof typeof modelProfiles;

export function resolveModelProfile(
  profileId = process.env.GENERATION_MODEL_PROFILE,
): ModelProfile {
  const id = (profileId ?? "kimi") as ModelProfileId;
  const profile = modelProfiles[id];

  if (!profile) {
    throw new Error(
      `Unknown GENERATION_MODEL_PROFILE '${profileId}'. Valid: ${Object.keys(modelProfiles).join(", ")}`,
    );
  }

  return profile;
}

export const activeModelProfile = resolveModelProfile();
