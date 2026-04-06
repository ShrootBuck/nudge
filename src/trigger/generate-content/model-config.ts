import { prisma } from "../../lib/prisma";

export async function getActiveModelConfig() {
  const activeConfigs = await prisma.modelConfig.findMany({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
    take: 2,
  });

  if (activeConfigs.length === 0) {
    throw new Error("No active model configuration found in DB");
  }

  if (activeConfigs.length > 1) {
    throw new Error(
      "Multiple active model configurations found. Keep exactly one config active.",
    );
  }

  return activeConfigs[0];
}
