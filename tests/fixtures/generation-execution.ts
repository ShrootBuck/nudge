import { mock } from "bun:test";
import assert from "node:assert/strict";
import type { GenerateOptions, StructuredResponse } from "../../src/lib/ai";
import type { AutomaticGenerationProblem } from "../../src/lib/generation-queue";

const save = mock(async () => {});
const update = mock(async () => ({}));
const updateMany = mock(async () => ({ count: 1 }));
const usage = mock(async () => {});
mock.module("../../src/lib/prisma", () => ({
  prisma: { problem: { update, updateMany } },
}));
mock.module("../../src/lib/generate-content/persistence", () => ({
  saveProblemContent: save,
}));
mock.module("../../src/lib/ai/usage", () => ({ recordGenerationUsage: usage }));
mock.module("../../src/lib/cache-revalidate", () => ({
  safeRevalidateTags: async () => true,
}));
mock.module("../../src/lib/discord-log", () => ({
  discordLog: async () => {},
}));
mock.module("../../src/lib/generation-transcript", () => ({
  publishGenerationTranscript: async () => {
    throw new Error("No transcript should be published by this test");
  },
  deleteGenerationTranscript: async () => {},
}));

// This would reproduce the old HTML parser failure if fetching moves back
// into execution. The agent must be called without any preliminary fetch.
const fetchPage = mock(
  async () =>
    new Response("%PDF-1.7", {
      headers: { "Content-Type": "application/pdf" },
    }),
);
globalThis.fetch = Object.assign(fetchPage, { preconnect: fetch.preconnect });

const { executeProblemGeneration } = await import(
  "../../src/lib/generate-content/execution"
);
const problem: AutomaticGenerationProblem = {
  id: "pdf-problem",
  contestId: 2080,
  index: "D",
  name: "Order Statistics",
  rating: null,
  tags: [],
  requestedCount: 0,
  generationAttempts: 1,
  runState: "RUNNING",
  generationTranscriptUrl: null,
};
const content = {
  status: "success",
  reason: null,
  hints: Array.from({ length: 5 }, (_, index) => ({
    order: index + 1,
    content: `Hint ${index + 1}`,
  })),
  editorial: "Test editorial",
  solution: "int main() {}",
};
let output: unknown = content;
const signal = new AbortController().signal;
const generate = mock(
  async (options: GenerateOptions): Promise<StructuredResponse> => {
    assert.equal(options.abortSignal, signal);
    assert.equal(typeof options.userPrompt, "string");
    assert.match(
      String(options.userPrompt),
      /https:\/\/codeforces.com\/problemset\/problem\/2080\/D/,
    );
    assert.match(
      String(options.userPrompt),
      /https:\/\/codeforces.com\/contest\/2080\/problem\/D/,
    );
    assert.match(options.systemPrompt, /PDF/);
    return {
      outputText: JSON.stringify(output),
      responseId: "test-response",
      displayName: "Test model",
      resolvedModel: "test-model",
      finishReason: "stop",
      nativeFinishReason: "stop",
      providerName: "Test provider",
      totalTokens: 10,
    };
  },
);
const run = () =>
  executeProblemGeneration({
    problem,
    generate,
    log: { info() {}, warn() {}, error() {} },
    abortSignal: signal,
  });

assert.deepEqual(await run(), { processed: 1, outcome: "succeeded" });
assert.equal(generate.mock.calls.length, 1);
assert.equal(fetchPage.mock.calls.length, 0);
assert.equal(save.mock.calls.length, 1);
assert.equal(usage.mock.calls.length, 1);

// A tool result still has to pass content validation before persistence.
output = { ...content, hints: [] };
assert.equal((await run()).outcome, "failed");
assert.equal(save.mock.calls.length, 1);
assert.equal(updateMany.mock.calls.length, 1);

// Actual retrieval blockers retain the existing unsolvable handling.
output = {
  status: "unsolvable",
  reason:
    "Both Codeforces URLs returned 403 and no accessible copy of the required statement was found.",
  hints: null,
  editorial: null,
  solution: null,
};
assert.deepEqual(await run(), { processed: 1, outcome: "unsolvable" });
assert.equal(save.mock.calls.length, 1);
assert.equal(update.mock.calls.length, 1);
assert.equal(fetchPage.mock.calls.length, 0);
console.log("ok");
