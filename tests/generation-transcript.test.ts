import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  hasVercelBlobReadWriteToken,
  publishGenerationTranscript,
} from "../src/lib/generation-transcript";

describe("generation transcript publishing", () => {
  test("uploads the local transcript bytes without modification", async () => {
    const root = await mkdtemp(
      join(tmpdir(), "nudge-transcript-publish-test-"),
    );
    const transcriptPath = join(root, "session.json");
    const transcript = Buffer.from('{"messages":[]}\n\t');
    await writeFile(transcriptPath, transcript);

    try {
      const url = await publishGenerationTranscript({
        problemId: "problem/unsafe",
        problemLabel: "123A",
        responseId: "message/unsafe",
        transcriptPath,
        token: null,
        upload: async (pathname, body, options) => {
          expect(pathname).toBe(
            "generation-transcripts/problem_unsafe/123A-message_unsafe.json",
          );
          expect(body).toEqual(transcript);
          expect(options).toEqual({
            access: "public",
            addRandomSuffix: false,
            cacheControlMaxAge: 31_536_000,
            contentType: "application/json",
          });
          return {
            url: "https://example.public.blob.vercel-storage.com/run.json",
          };
        },
      });

      expect(url).toBe(
        "https://example.public.blob.vercel-storage.com/run.json",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("requires a usable static token for local uploads", () => {
    expect(hasVercelBlobReadWriteToken({})).toBe(false);
    expect(
      hasVercelBlobReadWriteToken({ BLOB_READ_WRITE_TOKEN: "[SENSITIVE]" }),
    ).toBe(false);
    expect(
      hasVercelBlobReadWriteToken({ BLOB_READ_WRITE_TOKEN: "token" }),
    ).toBe(true);
  });
});
