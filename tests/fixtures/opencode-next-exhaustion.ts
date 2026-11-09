import { mock } from "bun:test";
import assert from "node:assert/strict";

const available = Number(process.env.TEST_AVAILABLE_PROBLEMS);
let claims = 0;
let generations = 0;
let closes = 0;

mock.module("../../src/lib/ai/opencode", () => ({
  createLocalOpenCodeRuntime: async () => ({
    preflight: async () => ({
      version: "test",
      executablePath: "test",
      modelReference: "test",
      displayName: "Test model",
    }),
    generate: async () => {
      throw new Error("Real model generation must never run in this test");
    },
    close: async () => {
      closes++;
    },
  }),
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
    throw new Error("An empty queue must not fail a claim");
  },
}));
mock.module("../../src/lib/generate-content/execution", () => ({
  toProblemLabel: (problem: { contestId: number }) => `${problem.contestId}/A`,
  executeProblemGeneration: async () => {
    generations++;
    assert.ok(generations <= available);
    return { outcome: "succeeded", totalTokens: 10 };
  },
}));

process.argv = [process.execPath, "opencode-next.ts", "100000"];
await import("../../scripts/opencode-next");
assert.equal(process.exitCode ?? 0, 0);
assert.equal(claims, available + 1);
assert.equal(generations, available);
assert.equal(closes, 1);
console.log("exhaustion verified");
