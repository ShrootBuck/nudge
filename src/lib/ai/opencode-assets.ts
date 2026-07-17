import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { FilePartInput, TextPartInput } from "@opencode-ai/sdk/v2";
import type { UserPromptInput } from "./types";

const MAX_CODEFORCES_IMAGE_BYTES = 20 * 1024 * 1024;

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type PromptPart = TextPartInput | FilePartInput;

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

function detectImageMediaType(data: Uint8Array) {
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

async function downloadCodeforcesImage({
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

function extensionForImage(url: URL, mediaType: string) {
  const urlExtension = extname(url.pathname).toLowerCase();
  if (/^\.(?:gif|jpe?g|png|svg|webp)$/.test(urlExtension)) {
    return urlExtension === ".jpeg" ? ".jpg" : urlExtension;
  }
  return IMAGE_EXTENSIONS[mediaType] ?? ".img";
}

export async function buildOpenCodePromptParts({
  input,
  workingDirectory,
  abortSignal,
  fetchImplementation = fetch,
}: {
  input: UserPromptInput;
  workingDirectory: string;
  abortSignal?: AbortSignal;
  fetchImplementation?: FetchImplementation;
}): Promise<PromptPart[]> {
  if (typeof input === "string") {
    return [{ type: "text", text: input }];
  }

  const assetDirectory = join(workingDirectory, "assets");
  let imageIndex = 0;

  return Promise.all(
    input.map(async (item) => {
      if (item.type === "text") {
        return { type: "text", text: item.text ?? "" } satisfies TextPartInput;
      }

      const imageUrl = item.image_url?.url;
      if (!imageUrl) {
        throw new Error("Image prompt item is missing a URL");
      }

      const url = new URL(imageUrl);
      const currentImageIndex = imageIndex++;
      const { data, mediaType } = await downloadCodeforcesImage({
        url,
        abortSignal,
        fetchImplementation,
      });
      await mkdir(assetDirectory, { recursive: true });
      const filename = `image-${currentImageIndex + 1}${extensionForImage(
        url,
        mediaType,
      )}`;
      const filePath = join(assetDirectory, filename);
      await writeFile(filePath, data);

      return {
        type: "file",
        mime: mediaType,
        filename,
        url: pathToFileURL(filePath).href,
      } satisfies FilePartInput;
    }),
  );
}
