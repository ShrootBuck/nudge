import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { FilePartInput, TextPartInput } from "@opencode-ai/sdk/v2";
import {
  downloadCodeforcesImage,
  extensionForImage,
  type FetchImplementation,
} from "./codeforces-images";
import type { UserPromptInput } from "./types";

type PromptPart = TextPartInput | FilePartInput;

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
