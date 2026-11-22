import { mock } from "bun:test";
import assert from "node:assert/strict";

const available = Number(process.env.TEST_AVAILABLE_PROBLEMS);
const mode = process.env.TEST_BATCH_MODE ?? "empty";
const parallel = mode === "empty" ? 1 : 3;
const runCount = mode === "empty" ? 100_000 : 7;
const firstWave = Promise.withResolvers<void>();
const refill = Promise.withResolvers<void>();
let claims = 0;
let active = 0;
let peak = 0;
let generations = 0;
let starts = 0;
let closes = 0;

mock.module("../../src/lib/ai/opencode", () => ({
  createLocalOpenCodeRuntime: async () => {
    starts++;
    return {
      preflight: async () => ({ version: "test", displayName: "Test model" }),
      generate: async () => {
        throw new Error("Unexpected model call");
      },
      close: async () => {
        assert.equal(active, 0, "closed server while jobs were still active");
        closes++;
      },
    };
  },
}));
mock.module("../../src/lib/generation-api", () => ({
  validateGenerationApiConfiguration() {},
  previewNextGeneration: async () => null,
  claimNextGeneration: async () => {
    claims++;
    if (claims > available) return null;
    return {
      claimId: `claim-${claims}`,
      selectionReason: "backfill",
      problem: {
        contestId: claims,
        index: "A",
        name: "Test problem",
        requestedCount: 0,
        generationAttempts: 1,
      },
    };
  },
  failGeneration: async () => {
    throw new Error("Unexpected claim failure");
  },
}));
mock.module("../../src/lib/generate-content/execution", () => ({
  toProblemLabel: (problem: { contestId: number }) => `${problem.contestId}/A`,
  executeProblemGeneration: async ({
    abortSignal,
  }: {
    abortSignal: AbortSignal;
  }) => {
    const id = ++generations;
    active++;
    peak = Math.max(peak, active);
    try {
      if (mode !== "empty") {
        if (id === 3) firstWave.resolve();
        await firstWave.promise;
        if (mode === "interrupt") {
          if (id === 1) process.emit("SIGINT");
          assert.ok(abortSignal.aborted);
        } else if (mode === "fatal") {
          if (id === 1) throw new Error("submission unavailable");
          await Bun.sleep(20);
        } else {
          // A free slot must refill even while the first generation is still busy.
          if (id === 1) await refill.promise;
          if (id === 4) refill.resolve();
          if (mode === "failed" && id === 2)
            return { outcome: "failed", error: "bad result" };
        }
      }
      return { outcome: "succeeded", totalTokens: 10 };
    } finally {
      active--;
    }
  },
}));

process.argv = [
  process.execPath,
  "opencode-next.ts",
  String(runCount),
  "--parallel",
  String(parallel),
];
await import("../../scripts/opencode-next");
const expected =
  mode === "interrupt" || mode === "fatal" ? 3 : Math.min(runCount, available);
assert.equal(
  claims,
  expected + Number(expected === available && available < runCount),
);
assert.equal(generations, expected);
assert.equal(peak, Math.min(parallel, available));
assert.equal(starts, 1);
assert.equal(closes, 1);
assert.equal(
  process.exitCode ?? 0,
  mode === "interrupt" ? 130 : ["fatal", "failed"].includes(mode) ? 1 : 0,
);
console.log("batch verified");
