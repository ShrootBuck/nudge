import { cacheLife, cacheTag } from "next/cache";
import { Badge } from "@/components/ui/badge";
import { CURRENT_MODEL_TAG } from "@/lib/cache-tags";
import { prisma } from "@/lib/prisma";

export async function CurrentModel() {
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
      className="max-w-full"
      title={`Current model: ${state.currentModel}`}
    >
      <span className="sr-only">Current model: </span>
      <span className="truncate">{state.currentModel}</span>
    </Badge>
  );
}
