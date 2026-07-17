import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mirrorOpenCodeTranscript } from "../src/lib/ai/opencode-transcript";

describe("OpenCode transcript mirroring", () => {
  test("writes the complete session payload", async () => {
    const root = await mkdtemp(
      join(tmpdir(), "nudge-opencode-transcript-test-"),
    );
    const destinationDirectory = join(root, "destination");
    const session = {
      info: { id: "session/unsafe" },
      messages: [{ info: { id: "message-1" }, parts: [] }],
    };

    try {
      const transcriptPath = await mirrorOpenCodeTranscript({
        sessionId: "session/unsafe",
        session,
        capturedAt: new Date("2026-07-17T12:00:00.000Z"),
        destinationDirectory,
      });

      expect(transcriptPath).toBe(
        join(destinationDirectory, "session_unsafe.json"),
      );
      expect(JSON.parse(await readFile(transcriptPath, "utf8"))).toEqual({
        sessionId: "session/unsafe",
        capturedAt: "2026-07-17T12:00:00.000Z",
        session,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
