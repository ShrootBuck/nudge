import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { CURRENT_MODEL_TAG } from "@/lib/cache-tags";
import { prisma } from "@/lib/prisma";

export async function CurrentModel() {
  // The database is available at runtime, not inside the image build.
  await connection();
  return <CachedCurrentModel />;
}

async function CachedCurrentModel() {
  "use cache";

  cacheLife("hours");
  cacheTag(CURRENT_MODEL_TAG);

  const state = await prisma.siteState.findUnique({
    where: { id: "global" },
    select: { currentModel: true },
  });

  if (!state) return null;

  return (
    <Badge
      variant="secondary"
      className="max-w-full min-w-0"
      title={`Nudge currently uses ${state.currentModel} to generate hints, editorials, and code writeups.`}
    >
      <span className="hidden shrink-0 sm:inline">Current AI model:</span>
      <span className="truncate">{state.currentModel}</span>
    </Badge>
  );
}
