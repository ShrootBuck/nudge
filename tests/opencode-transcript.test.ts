import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mirrorOpenCodeTranscript } from "../src/lib/ai/opencode-transcript";

describe("OpenCode transcript mirroring", () => {
  test("writes the exported bytes without modification", async () => {
    const root = await mkdtemp(
      join(tmpdir(), "nudge-opencode-transcript-test-"),
    );
    const destinationDirectory = join(root, "destination");
    const transcript = new TextEncoder().encode(
      '{"info":{"id":"session/unsafe"},"messages":[]}\n\t',
    );

    try {
      const transcriptPath = await mirrorOpenCodeTranscript({
        sessionId: "session/unsafe",
        transcript,
        destinationDirectory,
      });

      expect(transcriptPath).toBe(
        join(destinationDirectory, "session_unsafe.json"),
      );
      expect(await readFile(transcriptPath)).toEqual(Buffer.from(transcript));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
