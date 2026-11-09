import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { SessionPromptInput } from "@opencode/client";
import {
  downloadCodeforcesImage,
  extensionForImage,
  type FetchImplementation,
} from "./codeforces-images";
import type { UserPromptInput } from "./types";

type PromptInput = Pick<SessionPromptInput, "text" | "files">;

const MAX_PROMPT_IMAGES = 12;
const MAX_PROMPT_IMAGE_BYTES = 50 * 1024 * 1024;

export async function buildOpenCodePromptInput({
  input,
  workingDirectory,
  abortSignal,
  fetchImplementation = fetch,
}: {
  input: UserPromptInput;
  workingDirectory: string;
  abortSignal?: AbortSignal;
  fetchImplementation?: FetchImplementation;
}): Promise<PromptInput> {
  if (typeof input === "string") {
    return { text: input, files: [] };
  }

  const assetDirectory = join(workingDirectory, "assets");
  let imageIndex = 0;
  let totalImageBytes = 0;
  const imageCount = input.filter((item) => item.type === "image_url").length;
  if (imageCount > MAX_PROMPT_IMAGES) {
    throw new Error(`Prompt contains more than ${MAX_PROMPT_IMAGES} images`);
  }

  const text: string[] = [];
  const files: NonNullable<SessionPromptInput["files"]>[number][] = [];
  for (const item of input) {
    if (item.type === "text") {
      text.push(item.text ?? "");
      continue;
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
    totalImageBytes += data.byteLength;
    if (totalImageBytes > MAX_PROMPT_IMAGE_BYTES) {
      throw new Error("Prompt images exceed the 50 MB aggregate limit");
    }

    await mkdir(assetDirectory, { recursive: true });
    const filename = `image-${currentImageIndex + 1}${extensionForImage(
      url,
      mediaType,
    )}`;
    const filePath = join(assetDirectory, filename);
    await writeFile(filePath, data);
    text.push(`[Attached image: ${filename}]`);
    files.push({
      name: filename,
      uri: pathToFileURL(filePath).href,
    });
  }

  return { text: text.join("\n\n"), files };
}
