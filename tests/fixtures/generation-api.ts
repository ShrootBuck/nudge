import { mock } from "bun:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GenerationCompletion } from "../../src/lib/generation-contract";

// This fixture deliberately exercises real transactions in a disposable DB only.
assert.match(
  new URL(process.env.DATABASE_URL ?? "").pathname,
  /^\/nudge_generation_api_test_/,
);
const root = await mkdtemp(join(tmpdir(), "nudge-api-"));
process.env.TRANSCRIPT_STORAGE_DIR = root;
process.env.CACHE_REVALIDATION_SECRET = "integration-test-secret";
process.env.NEXT_PUBLIC_SITE_URL = "https://nudge.example";
const invalidate = mock(async () => true);
const notify = mock(async () => {});
mock.module("../../src/lib/cache-revalidate", () => ({
  safeRevalidateTags: invalidate,
}));
mock.module("../../src/lib/discord-log", () => ({ discordLog: notify }));
const { GET, POST } = await import("../../src/app/api/generation/route");
const { prisma } = await import("../../src/lib/prisma");
const { resetStaleRunningGenerations } = await import(
  "../../src/lib/generation-queue"
);
const { storeTranscript } = await import("../../src/lib/transcript-storage");
const {
  claimNextGeneration,
  completeGeneration,
  failGeneration,
  previewNextGeneration,
} = await import("../../src/lib/generation-api");
let droppedReplies = 0;
let dropNextReply = false;
let redirectTo: string | null = null;
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    if (redirectTo) return Response.redirect(redirectTo, 307);
    const response = await (request.method === "GET"
      ? GET(request)
      : POST(request));
    if (dropNextReply && response.ok) {
      dropNextReply = false;
      droppedReplies++;
      return new Response("Simulated lost acknowledgement", { status: 503 });
    }
    return response;
  },
});
process.env.CACHE_REVALIDATION_URL = server.url.href;
const endpoint = new URL("/api/generation", server.url);
const headers = {
  Authorization: "Bearer integration-test-secret",
  "Content-Type": "application/json",
};
const post = (body: unknown) =>
  fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body) });
const content = {
  status: "success",
  reason: null,
  hints: Array.from({ length: 5 }, (_, index) => ({
    order: index + 1,
    content: `Hint ${index + 1}`,
  })),
  editorial: "A complete editorial.",
  solution: "int main() {}",
};
const completion = (claimId: string): GenerationCompletion => ({
  action: "complete",
  claimId,
  transcriptKey: null,
  response: {
    outputText: JSON.stringify(content),
    responseId: randomUUID(),
    displayName: "Test model",
    resolvedModel: "test/model",
    finishReason: "stop",
    nativeFinishReason: "stop",
    providerName: "test",
    totalTokens: 321,
  },
});
const createProblem = (contestId: number) =>
  prisma.problem.create({
    data: {
      contestId,
      index: "A",
      name: `Test ${contestId}`,
      tags: [],
      requestedCount: 100,
    },
  });

try {
  await prisma.problem.deleteMany();
  await prisma.aiGenerationUsage.deleteMany();
  await prisma.siteState.deleteMany();
  const initial = await createProblem(90001);
  assert.equal((await fetch(endpoint)).status, 401);
  assert.equal(
    (await fetch(endpoint, { method: "POST", body: "{}" })).status,
    401,
  );
  assert.equal(
    (await fetch(endpoint, { headers: { Authorization: "Bearer wrong" } }))
      .status,
    401,
  );
  assert.equal(
    (await post({ action: "claim", claimId: "invalid" })).status,
    400,
  );
  assert.equal((await post({ action: "sql", query: "select *" })).status, 400);
  assert.equal(
    (await fetch(endpoint, { method: "POST", headers, body: "not json" }))
      .status,
    400,
  );
  assert.equal(
    (
      await fetch(endpoint, {
        method: "POST",
        headers,
        body: "x".repeat(4 * 1024 * 1024 + 1),
      })
    ).status,
    413,
  );
  delete process.env.CACHE_REVALIDATION_SECRET;
  assert.equal((await fetch(endpoint, { headers })).status, 401);
  process.env.CACHE_REVALIDATION_SECRET = "integration-test-secret";
  assert.equal((await previewNextGeneration())?.problem.id, initial.id);
  assert.equal(
    (await prisma.problem.findUniqueOrThrow({ where: { id: initial.id } }))
      .generationAttempts,
    0,
  );

  dropNextReply = true;
  const first = await claimNextGeneration();
  assert.ok(first);
  assert.equal(first.problem.id, initial.id);
  assert.equal(first.problem.generationAttempts, 1);
  const claimRetries = await Promise.all(
    Array.from({ length: 3 }, () =>
      post({ action: "claim", claimId: first.claimId }).then((r) => r.json()),
    ),
  );
  assert.ok(claimRetries.every((claim) => claim.problem.id === initial.id));
  assert.equal(
    (await prisma.problem.findUniqueOrThrow({ where: { id: initial.id } }))
      .generationAttempts,
    1,
  );
  assert.equal(await claimNextGeneration(), null);

  const submission = completion(first.claimId);
  submission.transcriptKey = `${"a".repeat(64)}.json`;
  assert.equal((await post(submission)).status, 400);
  assert.equal(await prisma.aiGenerationUsage.count(), 0);
  submission.transcriptKey = await storeTranscript(
    Buffer.from('{"test":true}'),
  );

  // Force a failure late in the transaction, after the content and usage writes.
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "SiteState" ADD CONSTRAINT "test_reject_model" CHECK ("currentModel" <> 'reject-test')`,
  );
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(
      (
        await post({
          ...submission,
          response: { ...submission.response, displayName: "reject-test" },
        })
      ).status,
      500,
    );
  } finally {
    console.error = originalError;
  }
  assert.equal(await prisma.hint.count(), 0);
  assert.equal(await prisma.aiGenerationUsage.count(), 0);
  assert.equal(
    (await prisma.problem.findUniqueOrThrow({ where: { id: initial.id } }))
      .runState,
    "RUNNING",
  );
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "SiteState" DROP CONSTRAINT "test_reject_model"`,
  );

  dropNextReply = true;
  const result = await completeGeneration(submission);
  assert.equal(result.outcome, "succeeded");
  assert.equal(droppedReplies, 2);
  assert.equal(
    (await failGeneration(first.claimId, "late cancellation")).outcome,
    "succeeded",
  );
  assert.deepEqual(await completeGeneration(submission), result);
  assert.equal(await prisma.hint.count(), 5);
  assert.equal(await prisma.editorial.count(), 1);
  assert.equal(await prisma.solution.count(), 1);
  assert.equal(await prisma.aiGenerationUsage.count(), 1);
  assert.equal(
    (await prisma.siteState.findUniqueOrThrow({ where: { id: "global" } }))
      .currentModel,
    "Test model",
  );
  assert.equal(notify.mock.calls.length, 1);
  const saved = await prisma.problem.findUniqueOrThrow({
    where: { id: initial.id },
  });
  assert.equal(
    saved.generationTranscriptUrl,
    `https://nudge.example/api/transcripts/${submission.transcriptKey}`,
  );
  assert.equal(saved.generationTotalTokens, 321);

  const second = await createProblem(90002);
  const secondClaim = await claimNextGeneration();
  assert.ok(secondClaim);
  const invalid = completion(secondClaim.claimId);
  invalid.response.outputText = JSON.stringify({ ...content, hints: [] });
  assert.equal((await completeGeneration(invalid)).outcome, "failed");
  assert.equal(await prisma.hint.count({ where: { problemId: second.id } }), 0);
  assert.equal(
    await prisma.aiGenerationUsage.count({ where: { problemId: second.id } }),
    1,
  );
  const replacement = await claimNextGeneration();
  assert.ok(replacement);
  assert.equal(
    (
      await post({
        action: "fail",
        claimId: secondClaim.claimId,
        reason: "stale worker",
      })
    ).status,
    409,
  );
  assert.equal((await post(invalid)).status, 409);
  await prisma.problem.update({
    where: { id: second.id },
    data: { generationStartedAt: new Date(Date.now() - 25 * 3600_000) },
  });
  assert.equal((await resetStaleRunningGenerations()).resetCount, 1);
  assert.equal((await post(completion(replacement.claimId))).status, 409);
  const thirdClaim = await claimNextGeneration();
  assert.ok(thirdClaim);
  const unsolvable = completion(thirdClaim.claimId);
  unsolvable.response.outputText = JSON.stringify({
    status: "unsolvable",
    reason:
      "Both statement URLs returned 403 and no accessible copy of the required statement was found.",
    hints: null,
    editorial: null,
    solution: null,
  });
  assert.equal((await completeGeneration(unsolvable)).outcome, "unsolvable");
  assert.equal(await claimNextGeneration(), null);
  assert.equal(notify.mock.calls.length, 2);

  await createProblem(90003);
  await createProblem(90004);
  const parallel = await Promise.all([
    claimNextGeneration(),
    claimNextGeneration(),
  ]);
  assert.ok(parallel[0] && parallel[1]);
  assert.notEqual(parallel[0].problem.id, parallel[1].problem.id);
  await Promise.all(
    parallel.map((claim) => {
      assert.ok(claim);
      return failGeneration(claim.claimId, "Cancelled");
    }),
  );

  process.env.CACHE_REVALIDATION_URL = "http://insecure.example";
  await assert.rejects(previewNextGeneration(), /HTTPS/);
  process.env.CACHE_REVALIDATION_URL = server.url.href;
  let redirectedRequests = 0;
  const destination = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch() {
      redirectedRequests++;
      return new Response("null");
    },
  });
  redirectTo = destination.url.href;
  try {
    await assert.rejects(previewNextGeneration());
    assert.equal(redirectedRequests, 0);
  } finally {
    destination.stop(true);
  }
  assert.ok(invalidate.mock.calls.length > 0);
} finally {
  server.stop(true);
  await prisma.$disconnect();
  await rm(root, { recursive: true, force: true });
}
console.log("ok");
