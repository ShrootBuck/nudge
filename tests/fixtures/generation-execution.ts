import { mock } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GenerateOptions, StructuredResponse } from "../../src/lib/ai";
import type { GenerationCompletion } from "../../src/lib/generation-contract";
import type { AutomaticGenerationProblem } from "../../src/lib/generation-queue";

const directory = await mkdtemp(join(tmpdir(), "nudge-execution-"));
const previousDirectory = process.cwd();
process.chdir(directory);
process.env.CACHE_REVALIDATION_URL = "https://nudge.example";
// An HTTP-only generation must not import or initialize a database client.
mock.module("../../src/lib/prisma", () => {
  throw new Error("Local generation imported Prisma");
});
const complete = mock(async (_submission: GenerationCompletion) => ({
  processed: 1 as const,
  outcome: "succeeded" as const,
  displayName: "Test model",
  totalTokens: 10,
}));
const fail = mock(async (_id: string, error: string) => ({
  processed: 0 as const,
  outcome: "failed" as const,
  error,
}));
mock.module("../../src/lib/generation-api", () => ({
  completeGeneration: complete,
  failGeneration: fail,
}));
mock.module("../../src/lib/generation-transcript", () => ({
  publishGenerationTranscript: async () => {
    throw new Error("Unexpected upload");
  },
  deleteGenerationTranscript: async () => {},
}));

const fetchPage = mock(async () => new Response("%PDF-1.7"));
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
const signal = new AbortController().signal;
const generate = mock(
  async (options: GenerateOptions): Promise<StructuredResponse> => {
    assert.equal(options.abortSignal, signal);
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
      outputText: "unparsed output for server validation",
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
const claimId = "c2c9d8d5-0ad4-4056-9364-fdddc35b5145";
const run = () =>
  executeProblemGeneration({
    problem,
    claimId,
    generate,
    log: { info() {}, warn() {}, error() {} },
    abortSignal: signal,
  });
try {
  assert.equal((await run()).outcome, "succeeded");
  assert.equal(generate.mock.calls.length, 1);
  assert.equal(fetchPage.mock.calls.length, 0);
  assert.equal(
    complete.mock.calls[0][0].response.outputText,
    "unparsed output for server validation",
  );
  assert.equal(fail.mock.calls.length, 0);
  assert.deepEqual(await readdir(join(directory, ".opencode-runs")), []);

  complete.mockImplementationOnce(async () => {
    throw new Error("network disconnected");
  });
  await assert.rejects(run(), /opencode:resume/);
  assert.equal(fail.mock.calls.length, 0); // Don't invalidate a potentially committed result.
  const saved = JSON.parse(
    await readFile(
      join(directory, ".opencode-runs", `${claimId}.pending.json`),
      "utf8",
    ),
  );
  assert.equal(saved.origin, "https://nudge.example");
  assert.equal(saved.submission.claimId, claimId);
  assert.equal(saved.submission.response.responseId, "test-response");

  generate.mockImplementationOnce(async () => {
    throw new Error("cancelled");
  });
  assert.equal((await run()).outcome, "failed");
  assert.equal(fail.mock.calls.length, 1);
  assert.equal(fail.mock.calls[0][0], claimId);
} finally {
  process.chdir(previousDirectory);
  await rm(directory, { recursive: true, force: true });
}
console.log("ok");
