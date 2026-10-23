import { mock } from "bun:test";
import assert from "node:assert/strict";
import type { ReviewStatus, RunState } from "@prisma/client";

let problem: {
  runState: RunState;
  reviewStatus: ReviewStatus;
  generationAttempts: number;
  requestedCount: number;
} | null = null;
let updated = 0;
const updateMany = mock(async () => ({ count: updated }));
mock.module("../../src/lib/prisma", () => ({
  prisma: { problem: { updateMany, findUnique: async () => problem } },
}));

const { requestProblem } = await import("../../src/app/request/actions");
const request = (value: string) => {
  const data = new FormData();
  data.set("problem", value);
  return requestProblem(null, data);
};

assert.match(
  (await request("https://codeforces.com/blog/entry/123/A")).error ?? "",
  /Enter a problem ID/,
);
assert.equal(updateMany.mock.calls.length, 0);
assert.equal((await request("921/01")).input, "921/01");
assert.match((await request("921/01")).error ?? "", /sync.*daily/);

problem = {
  runState: "IDLE",
  reviewStatus: "UNREVIEWED",
  generationAttempts: 0,
  requestedCount: 1,
};
updated = 1;
let result = await request("https://codeforces.com/contest/921/problem/01");
assert.equal(result.problemHref, "/problem/921/01");
assert.match(result.message ?? "", /Queued 921\/01/);
assert.deepEqual(
  (updateMany.mock.calls.at(-1) as unknown as [{ where: object }])[0].where,
  {
    contestId: 921,
    index: "01",
    generationAttempts: { lt: 3 },
    runState: { in: ["IDLE", "FAILED"] },
    reviewStatus: { notIn: ["UNSOLVABLE", "INCORRECT"] },
    requestedCount: { lt: 100 },
  },
);

updated = 0;
problem = { ...problem, runState: "SUCCEEDED", reviewStatus: "UNSOLVABLE" };
result = await request("921/01");
assert.ok(result.error);
assert.equal(result.problemHref, undefined);
problem.reviewStatus = "INCORRECT";
assert.match((await request("921/01")).error ?? "", /marked incorrect/);
problem.reviewStatus = "VERIFIED";
assert.match((await request("921/01")).message ?? "", /already available/);
problem.runState = "RUNNING";
assert.match((await request("921/01")).message ?? "", /already running/);
problem = {
  ...problem,
  runState: "FAILED",
  reviewStatus: "UNREVIEWED",
  generationAttempts: 3,
};
assert.match((await request("921/01")).error ?? "", /exhausted/);
problem = { ...problem, generationAttempts: 0, requestedCount: 100 };
assert.match((await request("921/01")).message ?? "", /maximum priority/);
console.log("ok");
