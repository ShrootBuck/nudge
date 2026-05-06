export const ANTHROPIC_EFFORT_ORDER = [
  "max",
  "xhigh",
  "high",
  "medium",
  "low",
] as const;

export const OPENAI_EFFORT_ORDER = [
  "xhigh",
  "high",
  "medium",
  "low",
  "none",
] as const;

export const MOONSHOT_EFFORT_ORDER = ["enabled", "disabled"] as const;

const EFFORT_ORDER_BY_PROVIDER = {
  anthropic: ANTHROPIC_EFFORT_ORDER,
  moonshot: MOONSHOT_EFFORT_ORDER,
  openai: OPENAI_EFFORT_ORDER,
} as const;

export function normalizeEffort(effort: string | null | undefined) {
  const normalized = effort?.trim().toLowerCase() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export function getEffortOptions(providerId: string): readonly string[] | null {
  const normalizedProviderId = providerId.trim().toLowerCase();
  return (
    EFFORT_ORDER_BY_PROVIDER[
      normalizedProviderId as keyof typeof EFFORT_ORDER_BY_PROVIDER
    ] ?? null
  );
}

export function buildEffortPlanForProvider(
  providerId: string,
  configuredEffort?: string | null,
): Array<string | undefined> {
  const effort = normalizeEffort(configuredEffort);
  const options = getEffortOptions(providerId);
  if (!options) {
    return effort ? [effort] : [undefined];
  }

  if (!effort) {
    return [...options];
  }

  const startIndex = options.indexOf(effort);
  if (startIndex === -1) {
    throw new Error(
      `Invalid ${providerId} effort "${configuredEffort}". Expected one of: ${options.join(", ")}`,
    );
  }

  return [...options.slice(startIndex)];
}

export function validateEffortForProvider(
  providerId: string,
  configuredEffort: string | null | undefined,
) {
  const effort = normalizeEffort(configuredEffort);
  if (!effort) {
    return { ok: true as const, effort: null };
  }

  const options = getEffortOptions(providerId);
  if (!options) {
    return { ok: true as const, effort };
  }

  if (!options.includes(effort)) {
    return {
      ok: false as const,
      error: `Invalid effort "${configuredEffort}" for ${providerId}. Supported values: ${options.join(", ")}`,
    };
  }

  return { ok: true as const, effort };
}
