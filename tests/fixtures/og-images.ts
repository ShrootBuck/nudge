import { mock } from "bun:test";
import assert from "node:assert/strict";
import type { ProblemSocialData } from "../../src/lib/problem-social";

const profiles: string[] = [];
const tags: string[] = [];
mock.module("next/cache", () => ({
  cacheLife: (profile: string) => profiles.push(profile),
  cacheTag: (tag: string) => tags.push(tag),
}));

let problem: ProblemSocialData | null = {
  contestId: 921,
  index: "01",
  name: "A problem with a long title that should still fit on the social card",
  rating: 1900,
  tags: ["dynamic programming", "data structures", "implementation"],
  runState: "SUCCEEDED",
  reviewStatus: "VERIFIED",
  hintCount: 5,
  hasEditorial: true,
  hasSolution: true,
};
let reads = 0;
mock.module("../../src/lib/problem-read-cache", () => ({
  getProblemSocialData: async (contestId: number, index: string) => {
    reads++;
    assert.equal(contestId, 921);
    assert.equal(index, "01");
    return problem;
  },
}));

const { default: problemImage } = await import(
  "../../src/app/problem/[contestId]/[index]/opengraph-image"
);
const { default: siteImage } = await import("../../src/app/opengraph-image");
const params = Promise.resolve({ contestId: "921", index: "01" });

async function png(response: Response) {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(
    response.headers.get("cache-control"),
    "public, max-age=0, must-revalidate",
  );
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.deepEqual(
    [...bytes.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
  );
  assert.equal(bytes.readUInt32BE(16), 1200);
  assert.equal(bytes.readUInt32BE(20), 630);
}

await png(await siteImage());
assert.equal(profiles.at(-1), "max");
await png(await problemImage({ params }));
assert.equal(profiles.at(-1), "days");
assert.equal(tags.at(-1), "problem:921:01");

problem = { ...problem, runState: "RUNNING" };
await png(await problemImage({ params }));
assert.equal(profiles.at(-1), "seconds");

problem = null;
await assert.rejects(problemImage({ params }), /NEXT_HTTP_ERROR_FALLBACK;404/);
assert.equal(profiles.at(-1), "minutes");
const previousReads = reads;
await assert.rejects(
  problemImage({ params: Promise.resolve({ contestId: "oops", index: "A" }) }),
  /NEXT_HTTP_ERROR_FALLBACK;404/,
);
assert.equal(reads, previousReads);
console.log("ok");
