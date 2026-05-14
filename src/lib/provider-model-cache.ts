import { cacheLife, cacheTag } from "next/cache";
import { PROVIDER_MODELS_TAG } from "@/lib/cache-tags";
import { prisma } from "@/lib/prisma";

export type CachedProviderModel = {
  id: string;
  provider: string;
  modelId: string;
  displayName: string;
  isActive: boolean;
  effort: string | null;
};

export async function getCachedProviderModels(): Promise<
  CachedProviderModel[]
> {
  "use cache";

  cacheLife("days");
  cacheTag(PROVIDER_MODELS_TAG);

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
