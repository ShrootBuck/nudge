export function siteApiUrl(path: string) {
  const base = process.env.CACHE_REVALIDATION_URL?.trim();
  if (!base) throw new Error("CACHE_REVALIDATION_URL is not configured");
  const url = new URL(path, base);
  if (
    url.username ||
    url.password ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  ) {
    throw new Error("Nudge's API requires HTTPS outside localhost");
  }
  return url;
}

export function siteApiAuthorization() {
  const secret = process.env.CACHE_REVALIDATION_SECRET?.trim();
  if (!secret) throw new Error("CACHE_REVALIDATION_SECRET is not configured");
  return `Bearer ${secret}`;
}
