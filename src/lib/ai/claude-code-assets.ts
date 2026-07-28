import type {
  Base64ImageSource,
  ImageBlockParam,
  TextBlockParam,
} from "@anthropic-ai/sdk/resources";
import {
  downloadCodeforcesImage,
  type FetchImplementation,
} from "./codeforces-images";
import type { UserPromptInput } from "./types";

export type ClaudeCodePromptBlock = TextBlockParam | ImageBlockParam;

type SupportedImageMediaType = Base64ImageSource["media_type"];

// Claude reads raster images only; Codeforces occasionally serves SVG statements
// figures that OpenCode could hand off as files but that Claude cannot decode.
const SUPPORTED_IMAGE_MEDIA_TYPES = new Set<string>([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function buildClaudeCodePromptContent({
  input,
  abortSignal,
  fetchImplementation = fetch,
}: {
  input: UserPromptInput;
  abortSignal?: AbortSignal;
  fetchImplementation?: FetchImplementation;
}): Promise<ClaudeCodePromptBlock[]> {
  if (typeof input === "string") {
    return [{ type: "text", text: input }];
  }

  return Promise.all(
    input.map(async (item) => {
      if (item.type === "text") {
        return { type: "text", text: item.text ?? "" } satisfies TextBlockParam;
      }

      const imageUrl = item.image_url?.url;
      if (!imageUrl) {
        throw new Error("Image prompt item is missing a URL");
      }

      const url = new URL(imageUrl);
      const { data, mediaType } = await downloadCodeforcesImage({
        url,
        abortSignal,
        fetchImplementation,
      });
      if (!SUPPORTED_IMAGE_MEDIA_TYPES.has(mediaType)) {
        throw new Error(
          `Claude cannot read ${mediaType} images (${url.href}); expected PNG, JPEG, GIF, or WebP`,
        );
      }

      return {
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType as SupportedImageMediaType,
          data: Buffer.from(data).toString("base64"),
        },
      } satisfies ImageBlockParam;
    }),
  );
}
