import { describe, expect, test } from "bun:test";
import {
  STALE_RUNNING_GENERATION_AGE_MS,
  staleRunningGenerationCutoff,
} from "../src/lib/generation-queue";

describe("generation queue stale resets", () => {
  test("uses a 24 hour running-generation cutoff", () => {
    expect(STALE_RUNNING_GENERATION_AGE_MS).toBe(24 * 60 * 60 * 1000);

    const now = new Date("2026-06-28T07:00:00.000Z");
    expect(staleRunningGenerationCutoff(now)).toEqual(
      new Date("2026-06-27T07:00:00.000Z"),
    );
  });
});
