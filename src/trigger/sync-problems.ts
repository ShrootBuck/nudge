import { schedules, logger } from "@trigger.dev/sdk";
import { prisma } from "./db";

interface CFProblem {
  contestId: number;
  index: string;
  name: string;
  type: string;
  rating?: number;
  tags: string[];
}

interface CFResponse {
  status: string;
  result: {
    problems: CFProblem[];
  };
}

// Runs weekly at midnight Phoenix time (America/Phoenix = MST, no DST)
export const syncProblems = schedules.task({
  id: "sync-problems",
  cron: {
    pattern: "0 0 * * 0", // midnight every Sunday
    timezone: "America/Phoenix",
  },
  run: async () => {
    logger.info("Fetching problems from Codeforces API");

    const res = await fetch("https://codeforces.com/api/problemset.problems");
    if (!res.ok) {
      throw new Error(`Codeforces API returned ${res.status}`);
    }

    const data: CFResponse = await res.json();
    if (data.status !== "OK") {
      throw new Error("Codeforces API returned non-OK status");
    }

    const problems = data.result.problems;
    logger.info(`Fetched ${problems.length} problems from Codeforces`);

    // Upsert in batches of 100
    let created = 0;
    let updated = 0;
    const batchSize = 100;

    for (let i = 0; i < problems.length; i += batchSize) {
      const batch = problems.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map(async (p) => {
          const existing = await prisma.problem.findUnique({
            where: {
              contestId_index: {
                contestId: p.contestId,
                index: p.index,
              },
            },
          });

          if (existing) {
            // Update rating/tags if changed, don't touch generationStatus
            await prisma.problem.update({
              where: { id: existing.id },
              data: {
                name: p.name,
                rating: p.rating ?? null,
                tags: p.tags,
              },
            });
            return "updated" as const;
          }

          await prisma.problem.create({
            data: {
              contestId: p.contestId,
              index: p.index,
              name: p.name,
              rating: p.rating ?? null,
              tags: p.tags,
            },
          });
          return "created" as const;
        }),
      );

      for (const r of results) {
        if (r.status === "fulfilled") {
          if (r.value === "created") created++;
          else updated++;
        }
      }

      logger.info(`Processed ${Math.min(i + batchSize, problems.length)}/${problems.length}`);
    }

    logger.info(`Sync complete: ${created} created, ${updated} updated`);
    return { created, updated, total: problems.length };
  },
});
