import { describe, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mirrorCodexTranscript } from "../src/lib/ai/codex-transcript";

describe("Codex transcript mirroring", () => {
  test("copies the transcript for the matching temporary Codex workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "nudge-codex-transcript-test-"));
    const codexHome = join(root, "codex-home");
    const destinationDirectory = join(root, "destination");
    const workingDirectory = join(root, "nudge-codex-generation-match");
    const sessionDirectory = join(codexHome, "sessions", "2026", "07", "09");
    const matchingTranscript = join(sessionDirectory, "rollout-matching.jsonl");

    try {
      await mkdir(sessionDirectory, { recursive: true });
      await mkdir(workingDirectory);
      await writeFile(
        matchingTranscript,
        `${JSON.stringify({
          type: "session_meta",
          payload: { cwd: await realpath(workingDirectory) },
        })}\n${JSON.stringify({ type: "response_item" })}\n`,
      );
      await writeFile(
        join(sessionDirectory, "rollout-other.jsonl"),
        `${JSON.stringify({
          type: "session_meta",
          payload: { cwd: join(root, "other-workspace") },
        })}\n`,
      );

      const transcriptPath = await mirrorCodexTranscript({
        workingDirectory,
        codexHome,
        destinationDirectory,
      });

      expect(transcriptPath).toBe(
        join(destinationDirectory, "rollout-matching.jsonl"),
      );
      expect(await readFile(transcriptPath ?? "", "utf8")).toBe(
        await readFile(matchingTranscript, "utf8"),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
