import { extname } from "node:path";

export const MAX_CODEFORCES_IMAGE_BYTES = 20 * 1024 * 1024;

export type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/webp": ".webp",
};

function isCodeforcesHost(hostname: string) {
  return hostname === "codeforces.com" || hostname.endsWith(".codeforces.com");
}

function assertCodeforcesImageUrl(url: URL) {
  if (url.protocol !== "https:" || !isCodeforcesHost(url.hostname)) {
    throw new Error(`Refusing to download non-Codeforces image: ${url.href}`);
  }
}

export function detectImageMediaType(data: Uint8Array) {
  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47
  ) {
    return "image/png";
  }

  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8) {
    return "image/jpeg";
  }

  const prefix = new TextDecoder().decode(data.subarray(0, 512));
  if (prefix.startsWith("GIF87a") || prefix.startsWith("GIF89a")) {
    return "image/gif";
  }
  if (prefix.startsWith("RIFF") && prefix.slice(8, 12) === "WEBP") {
    return "image/webp";
  }
  if (/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(prefix)) {
    return "image/svg+xml";
  }

  return null;
}

export async function downloadCodeforcesImage({
  url,
  abortSignal,
  fetchImplementation,
}: {
  url: URL;
  abortSignal?: AbortSignal;
  fetchImplementation: FetchImplementation;
}) {
  assertCodeforcesImageUrl(url);

  const response = await fetchImplementation(url, {
    headers: {
      "User-Agent":
        "nudge-bot/1.0 (+https://nudge.zaydkrunz.com; contact@zaydkrunz.com)",
    },
    signal: abortSignal,
  });

  if (!response.ok) {
    throw new Error(
      `Failed to download Codeforces image ${url.href}: ${response.status} ${response.statusText}`,
    );
  }

  if (response.redirected && response.url) {
    assertCodeforcesImageUrl(new URL(response.url));
  }

  const contentLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_CODEFORCES_IMAGE_BYTES
  ) {
    throw new Error(`Codeforces image is too large: ${url.href}`);
  }

  const data = new Uint8Array(await response.arrayBuffer());
  if (data.byteLength > MAX_CODEFORCES_IMAGE_BYTES) {
    throw new Error(`Codeforces image is too large: ${url.href}`);
  }

  const responseMediaType = response.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim();
  const mediaType =
    (responseMediaType?.startsWith("image/") ? responseMediaType : null) ??
    detectImageMediaType(data);
  if (!mediaType) {
    throw new Error(`Codeforces image has an unknown media type: ${url.href}`);
  }

  return { data, mediaType };
}

export function extensionForImage(url: URL, mediaType: string) {
  const urlExtension = extname(url.pathname).toLowerCase();
  if (/^\.(?:gif|jpe?g|png|svg|webp)$/.test(urlExtension)) {
    return urlExtension === ".jpeg" ? ".jpg" : urlExtension;
  }
  return IMAGE_EXTENSIONS[mediaType] ?? ".img";
}
