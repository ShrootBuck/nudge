import { randomUUID } from "node:crypto";
import {
  type GenerationCompletion,
  type GenerationRequest,
  generationClaimSchema,
  generationResultSchema,
  generationSelectionSchema,
} from "./generation-contract";
import { siteApiAuthorization, siteApiUrl } from "./site-api";

class GenerationApiError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export function validateGenerationApiConfiguration() {
  siteApiUrl("/api/generation");
  siteApiAuthorization();
}

async function requestGenerationApi(body?: GenerationRequest) {
  const url = siteApiUrl("/api/generation");
  const authorization = siteApiAuthorization();
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) {
        const details =
          response.status === 401
            ? "; check CACHE_REVALIDATION_SECRET"
            : response.status === 409
              ? "; this generation claim is no longer active"
              : "";
        throw new GenerationApiError(
          `Nudge generation API failed (${response.status})${details}`,
          response.status >= 500 || response.status === 429,
        );
      }
      return await response.json();
    } catch (error) {
      if (
        attempt >= 2 ||
        (error instanceof GenerationApiError && !error.retryable)
      )
        throw error;
      await Bun.sleep(500 * 2 ** attempt);
    }
  }
}

export async function previewNextGeneration() {
  return generationSelectionSchema
    .nullable()
    .parse(await requestGenerationApi());
}

export async function claimNextGeneration() {
  // Keep this ID for every retry so a dropped response never claims two jobs.
  const claimId = randomUUID();
  return generationClaimSchema
    .nullable()
    .parse(await requestGenerationApi({ action: "claim", claimId }));
}

export async function completeGeneration(submission: GenerationCompletion) {
  return generationResultSchema.parse(await requestGenerationApi(submission));
}

export async function failGeneration(claimId: string, reason: string) {
  return generationResultSchema.parse(
    await requestGenerationApi({
      action: "fail",
      claimId,
      reason: reason.replaceAll("\0", "").slice(0, 4_000),
    }),
  );
}
