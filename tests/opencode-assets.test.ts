import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOpenCodePromptInput } from "../src/lib/ai/opencode-assets";

describe("OpenCode prompt assets", () => {
  test("downloads Codeforces images into V2 file attachments", async () => {
    const workingDirectory = await mkdtemp(
      join(tmpdir(), "nudge-opencode-assets-test-"),
    );
    const calls: string[] = [];

    try {
      const prompt = await buildOpenCodePromptInput({
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
        fetchImplementation: async (input, init) => {
          calls.push(String(input));
          expect(init?.redirect).toBe("error");
          expect(init?.signal).toBeInstanceOf(AbortSignal);
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
      expect(prompt.text).toBe(
        "Inspect this diagram\n\n[Attached image: image-1.png]",
      );
      expect(prompt.files).toHaveLength(1);
      expect(prompt.files?.[0]?.name).toBe("image-1.png");
      const file = prompt.files?.[0];
      if (!file) throw new Error("Expected an OpenCode file attachment");
      expect([
        ...new Uint8Array(await readFile(fileURLToPath(file.uri))),
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
        buildOpenCodePromptInput({
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

  test("does not follow image redirects", async () => {
    const workingDirectory = await mkdtemp(
      join(tmpdir(), "nudge-opencode-assets-test-"),
    );
    let calls = 0;

    try {
      await expect(
        buildOpenCodePromptInput({
          input: [
            {
              type: "image_url",
              image_url: {
                url: "https://espresso.codeforces.com/redirect.png",
              },
            },
          ],
          workingDirectory,
          fetchImplementation: async (_input, init) => {
            calls++;
            expect(init?.redirect).toBe("error");
            return new Response(null, {
              status: 302,
              headers: { location: "http://127.0.0.1/admin" },
            });
          },
        }),
      ).rejects.toThrow("Failed to download Codeforces image");
      expect(calls).toBe(1);
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }
  });
});
