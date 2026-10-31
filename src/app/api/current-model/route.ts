import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";
import { CURRENT_MODEL_TAG } from "@/lib/cache-tags";
import { prisma } from "@/lib/prisma";

async function getCurrentModel() {
  "use cache";

  cacheLife("hours");
  cacheTag(CURRENT_MODEL_TAG);
  const state = await prisma.siteState.findUnique({
    where: { id: "global" },
    select: { currentModel: true },
  });
  return state?.currentModel ?? null;
}

export async function GET() {
  // The database is private at image-build time. Only this small endpoint needs
  // a runtime connection; the pages that display the badge can stay static.
  await connection();
  return Response.json(
    { currentModel: await getCurrentModel() },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } },
  );
}
