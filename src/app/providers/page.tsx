import { Cpu } from "lucide-react";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { PROVIDER_MODELS_TAG } from "@/lib/cache-tags";
import { prisma } from "@/lib/prisma";
import { ProviderPanel } from "./provider-panel";

export const metadata: Metadata = {
  title: "Providers",
  description: "Manage AI model providers for content generation.",
};

export default async function ProviderPage() {
  "use cache";

  cacheLife("hours");
  cacheTag(PROVIDER_MODELS_TAG);

  const configs = await prisma.providerModel.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });
  const initial = configs.map((config) => ({
    id: config.id,
    provider: config.provider,
    modelId: config.modelId,
    displayName: config.displayName,
    isActive: config.isActive,
    effort: config.effort,
  }));

  return (
    <main className="min-h-screen pb-16">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <section className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card/80 p-6 shadow-[0_28px_70px_-40px_rgba(15,23,42,0.45)] backdrop-blur sm:p-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_32%),radial-gradient(circle_at_85%_15%,rgba(245,158,11,0.16),transparent_28%)]" />

          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground shadow-sm">
              <Cpu className="size-3.5" />
              Model provider
            </span>

            <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">
              Generation models
            </h1>

            <p className="mt-3 max-w-xl text-base/7 text-muted-foreground sm:text-lg/8">
              Switch the AI model used for generating hints, editorials, and
              solutions. Changes apply to the next generation batch.
            </p>
          </div>
        </section>

        <section className="mt-8">
          <ProviderPanel initial={initial} />
        </section>
      </div>
    </main>
  );
}
