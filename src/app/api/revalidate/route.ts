import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import {
  type CacheRevalidationProfile,
  isSupportedCacheTag,
} from "@/lib/cache-revalidate";
import { getOptionalEnv } from "@/lib/env";

const MAX_TAGS_PER_REQUEST = 100;

function hasValidAuthorization(request: Request, secret: string) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;

  const provided = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

function isProfile(value: unknown): value is CacheRevalidationProfile {
  return value === "expire" || value === "max";
}

export async function POST(request: Request) {
  const secret = getOptionalEnv("CACHE_REVALIDATION_SECRET");
  if (!secret) {
    return Response.json(
      { error: "Cache revalidation is not configured" },
      { status: 503 },
    );
  }

  if (!hasValidAuthorization(request, secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { tags, profile } = body as { tags?: unknown; profile?: unknown };
  if (
    !Array.isArray(tags) ||
    tags.length === 0 ||
    tags.length > MAX_TAGS_PER_REQUEST ||
    !tags.every(isSupportedCacheTag) ||
    !isProfile(profile)
  ) {
    return Response.json(
      { error: "Invalid cache tags or profile" },
      { status: 400 },
    );
  }

  const uniqueTags = Array.from(new Set(tags));
  for (const tag of uniqueTags) {
    if (profile === "expire") {
      revalidateTag(tag, { expire: 0 });
    } else {
      revalidateTag(tag, "max");
    }
  }

  return Response.json({ revalidated: uniqueTags.length });
}
