import { mock } from "bun:test";
import assert from "node:assert/strict";

const problems = Array.from({ length: 101 }, (_, i) => ({
  contestId: i + 1,
  index: "01",
  name: `Problem ${i}`,
  type: "PROGRAMMING",
  tags: [],
}));
let reads = 0;
let activeWrites = 0;
let maxActiveWrites = 0;
let failRead = true;
let failWrite = false;
const invalidations: string[][] = [];

mock.module("@trigger.dev/sdk", () => ({
  schedules: { task: (definition: unknown) => definition },
  logger: { info() {}, warn() {}, error() {} },
}));
mock.module("../../src/lib/codeforces-api", () => ({
  fetchCodeforcesProblemset: async () => ({
    problems,
    skipped: 0,
    duplicates: 0,
  }),
}));
mock.module("../../src/lib/generation-queue", () => ({
  resetStaleRunningGenerations: async () => ({ resetCount: 0 }),
}));
mock.module("../../src/lib/discord-log", () => ({
  discordLog: async () => {},
}));
mock.module("../../src/lib/cache-revalidate", () => ({
  safeRevalidateTags: async (tags: string[]) => {
    invalidations.push(tags);
    return true;
  },
}));
mock.module("../../src/lib/prisma", () => ({
  prisma: {
    problem: {
      findMany: async () => {
        if (++reads === 2 && failRead) throw new Error("Database read failed");
        return [];
      },
      create: async ({
        data,
      }: {
        data: { contestId: number; index: string };
      }) => {
        activeWrites++;
        maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
        try {
          await Promise.resolve();
          if (failWrite && data.contestId === 50)
            throw new Error("Database write failed");
          return { contestId: data.contestId, index: data.index };
        } finally {
          activeWrites--;
        }
      },
    },
  },
}));

const { syncProblems } = await import("../../src/trigger/sync-problems");
const task = syncProblems as unknown as { run: () => Promise<unknown> };
await assert.rejects(task.run(), /Database read failed/);
assert.equal(maxActiveWrites, 10);
assert.equal(invalidations.length, 1);
assert.equal(invalidations[0].length, 101); // List plus the 100 already committed rows.
assert.ok(invalidations[0].includes("problem:1:01"));
assert.ok(invalidations[0].includes("problem:100:01"));
assert.ok(!invalidations[0].includes("problem:101:01"));

reads = 0;
failRead = false;
failWrite = true;
invalidations.length = 0;
await assert.rejects(task.run(), /1 failed upserts/);
assert.equal(invalidations[0].length, 101);
assert.ok(invalidations[0].includes("problem:101:01"));
assert.ok(!invalidations[0].includes("problem:50:01"));
console.log("ok");
