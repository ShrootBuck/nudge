export function getOptionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function getRequiredEnv(name: string): string {
  const value = getOptionalEnv(name);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://nudge.zaydkrunz.com";
