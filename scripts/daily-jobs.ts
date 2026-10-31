import { reportDigest } from "../src/jobs/report-digest";
import { syncProblems } from "../src/jobs/sync-problems";
import { prisma } from "../src/lib/prisma";

// Coolify runs this at 07:00 UTC, midnight in America/Phoenix.
// A database lock prevents overlap across deploys or manual invocations.
try {
  await prisma.$transaction(
    async (transaction) => {
      const [lock] = await transaction.$queryRaw<
        { locked: boolean }[]
      >`SELECT pg_try_advisory_xact_lock(734821049) AS locked`;
      if (!lock.locked) {
        console.log(
          "Daily jobs already running; skipping overlapping invocation",
        );
        return;
      }
      if (process.argv.includes("--check")) {
        console.log(
          "Daily jobs database connection and concurrency lock verified",
        );
        return;
      }
      let failed = false;
      for (const [name, run] of [
        ["sync-problems", syncProblems],
        ["report-digest", reportDigest],
      ] as const) {
        try {
          console.log(name, await run());
        } catch (error) {
          failed = true;
          console.error(name, error);
        }
      }
      if (failed) throw new Error("One or more daily jobs failed");
    },
    { timeout: 30 * 60 * 1000 },
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
