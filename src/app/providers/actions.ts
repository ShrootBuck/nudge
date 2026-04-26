"use server";

import { getEffortOptions, validateEffortForProvider } from "@/lib/ai/effort";
import { sendAdminLog } from "@/lib/discord";
import { DISCORD_COLORS } from "@/lib/discord-webhook";
import { verifyAdminPassword } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export type ProviderModel = {
  id: string;
  provider: string;
  modelId: string;
  displayName: string;
  isActive: boolean;
  effort: string | null;
};

export async function listProviderModels(): Promise<ProviderModel[]> {
  const configs = await prisma.providerModel.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });

  return configs.map((c) => ({
    id: c.id,
    provider: c.provider,
    modelId: c.modelId,
    displayName: c.displayName,
    isActive: c.isActive,
    effort: c.effort,
  }));
}

function auth(password: string) {
  const authResult = verifyAdminPassword(password);
  if (!authResult.ok) {
    return { success: false, error: authResult.error } as const;
  }

  return null;
}

// Activate one model config and deactivate the rest in one transaction.
export async function setActiveModel(password: string, configId: string) {
  const denied = auth(password);
  if (denied) return denied;

  const config = await prisma.providerModel.findUnique({
    where: { id: configId },
  });

  if (!config) {
    return { success: false, error: "Config not found" } as const;
  }

  await prisma.$transaction([
    prisma.providerModel.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    }),
    prisma.providerModel.update({
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

export async function addModelConfig(
  password: string,
  data: {
    provider: string;
    modelId: string;
    displayName: string;
    effort?: string | null;
  },
) {
  const denied = auth(password);
  if (denied) return denied;

  const provider = data.provider.trim().toLowerCase();
  const modelId = data.modelId.trim();
  const displayName = data.displayName.trim();
  if (!provider || !modelId || !displayName) {
    return { success: false, error: "All fields are required" } as const;
  }

  const effortValidation = validateEffortForProvider(provider, data.effort);
  if (!effortValidation.ok) {
    return { success: false, error: effortValidation.error } as const;
  }

  if (getEffortOptions(provider) && !effortValidation.effort) {
    return {
      success: false,
      error: "Effort is required for this provider",
    } as const;
  }

  if (provider !== "anthropic" && provider !== "openai") {
    return {
      success: false,
      error: `Unsupported provider "${provider}". Supported providers: anthropic, openai`,
    } as const;
  }

  const [existing, count] = await Promise.all([
    prisma.providerModel.findUnique({
      where: { provider_modelId: { provider, modelId } },
    }),
    prisma.providerModel.count(),
  ]);

  const isFirst = count === 0;
  const isOverwrite = existing !== null;

  const effort = effortValidation.effort;

  const result = await prisma.providerModel.upsert({
    where: { provider_modelId: { provider, modelId } },
    create: {
      provider,
      modelId,
      displayName,
      isActive: isFirst,
      effort,
    },
    update: {
      displayName,
      effort,
    },
  });

  await sendAdminLog({
    title: isOverwrite ? "✏️ Model Updated" : "➕ Model Added",
    description: `**${displayName}**\n${provider}/${modelId}`,
    color: DISCORD_COLORS.violet,
  });

  return {
    success: true,
    id: result.id,
    isActive: result.isActive,
    overwrote: isOverwrite,
  } as const;
}
