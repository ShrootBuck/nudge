import { describe, expect, test } from "bun:test";
import { buildClaudeCodePromptContent } from "../src/lib/ai/claude-code-assets";

function imageResponse(bytes: number[], contentType: string) {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "content-length": String(bytes.length),
      "content-type": contentType,
    },
  });
}

describe("Claude Code prompt assets", () => {
  test("inlines Codeforces images as base64 content blocks", async () => {
    const calls: string[] = [];

    const content = await buildClaudeCodePromptContent({
      input: [
        { type: "text", text: "Inspect this diagram" },
        {
          type: "image_url",
          image_url: { url: "https://espresso.codeforces.com/example.png" },
        },
      ],
      fetchImplementation: async (input) => {
        calls.push(String(input));
        return imageResponse([137, 80, 78, 71], "image/png; charset=binary");
      },
    });

    expect(calls).toEqual(["https://espresso.codeforces.com/example.png"]);
    expect(content[0]).toEqual({ type: "text", text: "Inspect this diagram" });
    expect(content[1]).toEqual({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: Buffer.from([137, 80, 78, 71]).toString("base64"),
      },
    });
  });

  test("passes a plain string prompt through as a single text block", async () => {
    expect(await buildClaudeCodePromptContent({ input: "Solve 1A" })).toEqual([
      { type: "text", text: "Solve 1A" },
    ]);
  });

  test("refuses to download images from unrelated hosts", async () => {
    await expect(
      buildClaudeCodePromptContent({
        input: [
          {
            type: "image_url",
            image_url: { url: "https://example.com/problem.png" },
          },
        ],
        fetchImplementation: async () => {
          throw new Error("fetch should not run");
        },
      }),
    ).rejects.toThrow("non-Codeforces image");
  });

  test("rejects image formats Claude cannot decode", async () => {
    await expect(
      buildClaudeCodePromptContent({
        input: [
          {
            type: "image_url",
            image_url: { url: "https://codeforces.com/figure.svg" },
          },
        ],
        fetchImplementation: async () =>
          imageResponse([60, 115, 118, 103], "image/svg+xml"),
      }),
    ).rejects.toThrow("Claude cannot read image/svg+xml images");
  });
});
