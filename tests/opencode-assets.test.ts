import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOpenCodePromptParts } from "../src/lib/ai/opencode-assets";

describe("OpenCode prompt assets", () => {
  test("downloads Codeforces images into local OpenCode file parts", async () => {
    const workingDirectory = await mkdtemp(
      join(tmpdir(), "nudge-opencode-assets-test-"),
    );
    const calls: string[] = [];

    try {
      const parts = await buildOpenCodePromptParts({
        input: [
          { type: "text", text: "Inspect this diagram" },
          {
            type: "image_url",
            image_url: {
              url: "https://espresso.codeforces.com/example.png",
            },
          },
        ],
        workingDirectory,
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

      expect(calls).toEqual(["https://espresso.codeforces.com/example.png"]);
      expect(parts[0]).toEqual({
        type: "text",
        text: "Inspect this diagram",
      });
      expect(parts[1]).toMatchObject({
        type: "file",
        mime: "image/png",
        filename: "image-1.png",
      });
      if (parts[1]?.type !== "file") {
        throw new Error("Expected an OpenCode file part");
      }
      expect([
        ...new Uint8Array(await readFile(fileURLToPath(parts[1].url))),
      ]).toEqual([137, 80, 78, 71]);
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });

  test("refuses to download images from unrelated hosts", async () => {
    const workingDirectory = await mkdtemp(
      join(tmpdir(), "nudge-opencode-assets-test-"),
    );

    try {
      await expect(
        buildOpenCodePromptParts({
          input: [
            {
              type: "image_url",
              image_url: { url: "https://example.com/problem.png" },
            },
          ],
          workingDirectory,
          fetchImplementation: async () => {
            throw new Error("fetch should not run");
          },
        }),
      ).rejects.toThrow("non-Codeforces image");
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });
});
