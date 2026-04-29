import { revalidateTag } from "next/cache";

function isMissingStaticGenerationStore(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return /static generation store missing in revalidateTag/i.test(
    error.message,
  );
}

export function safeRevalidateTag(tag: string, profile: "max" = "max") {
  try {
    revalidateTag(tag, profile);
  } catch (error) {
    // Trigger.dev jobs run outside Next's request/static generation context.
    // In that environment, revalidateTag throws and should be treated as best-effort.
    if (isMissingStaticGenerationStore(error)) {
      return;
    }

    throw error;
  }
}
