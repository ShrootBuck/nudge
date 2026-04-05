"use server";

import { sendAdminLog } from "@/lib/discord";
import { DISCORD_COLORS } from "@/lib/discord-webhook";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ModelConfig = {
  id: string;
  provider: string;
  modelId: string;
  displayName: string;
  effort: string | null;
  isActive: boolean;
};

// ---------------------------------------------------------------------------
// Read (no password needed)
// ---------------------------------------------------------------------------

export async function listModelConfigs(): Promise<ModelConfig[]> {
  const configs = await prisma.modelConfig.findMany({
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
  });

  return configs.map((c) => ({
    id: c.id,
    provider: c.provider,
    modelId: c.modelId,
    displayName: c.displayName,
    effort: c.effort,
    isActive: c.isActive,
  }));
}

// ---------------------------------------------------------------------------
// Mutations (all password-protected)
// ---------------------------------------------------------------------------

function auth(password: string) {
  if (password !== process.env.VERIFY_PASSWORD) {
    return { success: false, error: "Wrong password" } as const;
  }
  return null;
}

/**
 * Set a model config as the active one.
 * Deactivates all others in a single transaction.
 */
export async function setActiveModel(password: string, configId: string) {
  const denied = auth(password);
  if (denied) return denied;

  const config = await prisma.modelConfig.findUnique({
    where: { id: configId },
  });

  if (!config) {
    return { success: false, error: "Config not found" } as const;
  }

  await prisma.$transaction([
    prisma.modelConfig.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    }),
    prisma.modelConfig.update({
      where: { id: configId },
      data: { isActive: true },
    }),
  ]);

  await sendAdminLog({
    title: "🔄 Model Switched",
    description: `**${config.displayName}** (${config.provider}/${config.modelId}) is now active`,
    color: DISCORD_COLORS.success,
  });

  return { success: true } as const;
}

/**
 * Add a new model configuration.
 */
export async function addModelConfig(
  password: string,
  data: {
    provider: string;
    modelId: string;
    displayName: string;
    effort?: string;
  },
) {
  const denied = auth(password);
  if (denied) return denied;

  const provider = data.provider.trim().toLowerCase();
  const modelId = data.modelId.trim();
  const displayName = data.displayName.trim();
  const effort = data.effort?.trim() || null;

  if (!provider || !modelId || !displayName) {
    return { success: false, error: "All fields are required" } as const;
  }

  const existing = await prisma.modelConfig.findUnique({
    where: { provider_modelId: { provider, modelId } },
  });

  if (existing) {
    return {
      success: false,
      error: `Config for ${provider}/${modelId} already exists`,
    } as const;
  }

  const created = await prisma.modelConfig.create({
    data: { provider, modelId, displayName, effort, isActive: false },
  });

  const effortText = effort ? ` (effort: ${effort})` : "";
  await sendAdminLog({
    title: "➕ Model Added",
    description: `**${displayName}**\n${provider}/${modelId}${effortText}`,
    color: DISCORD_COLORS.violet,
  });

  return { success: true, id: created.id } as const;
}

/**
 * Delete a model configuration.
 * Cannot delete the currently active config.
 */
export async function deleteModelConfig(password: string, configId: string) {
  const denied = auth(password);
  if (denied) return denied;

  const config = await prisma.modelConfig.findUnique({
    where: { id: configId },
  });

  if (!config) {
    return { success: false, error: "Config not found" } as const;
  }

  if (config.isActive) {
    return {
      success: false,
      error:
        "Cannot delete the active configuration. Switch to another model first.",
    } as const;
  }

  await prisma.modelConfig.delete({ where: { id: configId } });

  await sendAdminLog({
    title: "🗑️ Model Deleted",
    description: `**${config.displayName}** (${config.provider}/${config.modelId})`,
    color: DISCORD_COLORS.error,
  });

  return { success: true } as const;
}
