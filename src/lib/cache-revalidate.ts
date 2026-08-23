import { revalidateTag } from "next/cache";
import { getOptionalEnv } from "./env";
import { fetchWithTimeout, readResponseTextWithLimit } from "./http";

export type CacheRevalidationProfile = "expire" | "max";

const REMOTE_BATCH_SIZE = 100;
const REMOTE_MAX_ATTEMPTS = 3;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function remoteRevalidationUrl() {
  const baseUrl = getOptionalEnv("CACHE_REVALIDATION_URL");
  if (!baseUrl) {
    throw new Error("CACHE_REVALIDATION_URL is not configured");
  }

  const url = new URL("/api/revalidate", baseUrl);
  const localHost =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localHost)) {
    throw new Error(
      "CACHE_REVALIDATION_URL must use HTTPS unless it targets localhost",
    );
  }
  return url;
}

function isMissingStaticGenerationStore(error: unknown) {
  return (
    error instanceof Error &&
    /static generation store missing in revalidateTag/i.test(error.message)
  );
}

export function isSupportedCacheTag(tag: unknown): tag is string {
  return (
    tag === "problem-list" ||
    (typeof tag === "string" &&
      /^problem:\d{1,10}:[A-Z][A-Z0-9]{0,9}$/.test(tag))
  );
}

function revalidateInsideNext(
  tags: readonly string[],
  profile: CacheRevalidationProfile,
) {
  for (const tag of tags) {
    if (profile === "expire") {
      revalidateTag(tag, { expire: 0 });
    } else {
      revalidateTag(tag, "max");
    }
  }
}

async function revalidateRemotely(
  tags: readonly string[],
  profile: CacheRevalidationProfile,
) {
  const secret = getOptionalEnv("CACHE_REVALIDATION_SECRET");
  if (!secret) {
    console.error(
      "Cache invalidation skipped outside Next: CACHE_REVALIDATION_SECRET is not configured",
    );
    return false;
  }

  const url = remoteRevalidationUrl();

  for (let index = 0; index < tags.length; index += REMOTE_BATCH_SIZE) {
    for (let attempt = 1; attempt <= REMOTE_MAX_ATTEMPTS; attempt++) {
      try {
        const response = await fetchWithTimeout(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tags: tags.slice(index, index + REMOTE_BATCH_SIZE),
            profile,
          }),
          timeoutMs: 10_000,
        });

        const detail = (
          await readResponseTextWithLimit(
            response,
            4_096,
            "Cache invalidation response",
          )
        ).slice(0, 500);
        if (!response.ok) {
          throw new Error(
            `Remote cache invalidation failed (${response.status}): ${detail}`,
          );
        }
        break;
      } catch (error) {
        if (attempt === REMOTE_MAX_ATTEMPTS) throw error;
        await wait(250 * attempt);
      }
    }
  }

  return true;
}

export async function safeRevalidateTags(
  inputTags: readonly string[],
  profile: CacheRevalidationProfile = "max",
) {
  const tags = Array.from(new Set(inputTags)).filter(isSupportedCacheTag);
  if (tags.length === 0) return true;

  try {
    revalidateInsideNext(tags, profile);
    return true;
  } catch (error) {
    if (!isMissingStaticGenerationStore(error)) {
      console.error("Cache invalidation failed", error);
      return false;
    }
  }

  try {
    return await revalidateRemotely(tags, profile);
  } catch (error) {
    console.error("Remote cache invalidation failed", error);
    return false;
  }
}
