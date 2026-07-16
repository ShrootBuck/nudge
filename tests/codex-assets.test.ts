import { describe, expect, test } from "bun:test";
import { createCodexAssetDownloader } from "../src/lib/ai/codex-assets";
import { buildMessages } from "../src/lib/ai/request";

describe("Codex prompt assets", () => {
  test("converts remote image prompt items into URL objects", () => {
    const messages = buildMessages([
      { type: "text", text: "Inspect this diagram" },
      {
        type: "image_url",
        image_url: {
          url: "https://codeforces.com/predownloaded/example.png",
        },
      },
    ]);

    const content = messages[0]?.content;
    expect(Array.isArray(content)).toBe(true);
    if (!Array.isArray(content)) {
      throw new Error("Expected multipart user content");
    }

    expect(content[1]).toMatchObject({ type: "file", mediaType: "image" });
    expect(content[1]?.type === "file" && content[1].data).toBeInstanceOf(URL);
  });

  test("downloads Codeforces images into binary prompt data", async () => {
    const calls: string[] = [];
    const downloader = createCodexAssetDownloader({
      fetchImplementation: async (input) => {
        calls.push(String(input));
        return new Response(new Uint8Array([137, 80, 78, 71]), {
          status: 200,
          headers: {
            "content-length": "4",
            "content-type": "image/png; charset=binary",
          },
        });
      },
    });

    const [result] = await downloader([
      {
        url: new URL("https://espresso.codeforces.com/example.png"),
        isUrlSupportedByModel: false,
      },
    ]);

    expect(calls).toEqual(["https://espresso.codeforces.com/example.png"]);
    expect([...result.data]).toEqual([137, 80, 78, 71]);
    expect(result.mediaType).toBe("image/png");
  });

  test("refuses to download images from unrelated hosts", async () => {
    const downloader = createCodexAssetDownloader({
      fetchImplementation: async () => {
        throw new Error("fetch should not run");
      },
    });

    await expect(
      downloader([
        {
          url: new URL("https://example.com/problem.png"),
          isUrlSupportedByModel: false,
        },
      ]),
    ).rejects.toThrow("non-Codeforces image");
  });
});
