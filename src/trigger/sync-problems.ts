import { logger, schedules } from "@trigger.dev/sdk";
import { safeRevalidateTag } from "../lib/cache-revalidate";
import { PROBLEM_LIST_TAG, problemTag } from "../lib/cache-tags";
import { discordLog } from "../lib/discord-log";
import { DISCORD_COLORS } from "../lib/discord-webhook";
import { resetStaleRunningGenerations } from "../lib/generation-queue";
import { fetchWithTimeout } from "../lib/http";
import { prisma } from "../lib/prisma";
import {
  pipelineStateData,
  problemCreateData,
} from "../lib/problem-pipeline-db";

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

function isValidProblem(problem: CFProblem) {
  return (
    Number.isSafeInteger(problem.contestId) &&
    problem.contestId > 0 &&
    typeof problem.index === "string" &&
    problem.index.trim().length > 0 &&
    typeof problem.name === "string" &&
    problem.name.trim().length > 0
  );
}

function tagsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((v) => setA.has(v));
}

export const syncProblems = schedules.task({
  id: "sync-problems",
  cron: {
    pattern: "0 0 * * *",
    timezone: "America/Phoenix",
  },
  run: async () => {
    const staleGenerationReset = await resetStaleRunningGenerations();

    if (staleGenerationReset.resetCount > 0) {
      safeRevalidateTag(PROBLEM_LIST_TAG, "max");
      for (const problem of staleGenerationReset.problems) {
        safeRevalidateTag(problemTag(problem.contestId, problem.index), "max");
      }

      const shownProblems = staleGenerationReset.problems.slice(0, 10);
      const problemLines = shownProblems.map((problem) => {
        const startedAt = problem.generationStartedAt
          ? `<t:${Math.floor(problem.generationStartedAt.getTime() / 1000)}:R>`
          : "unknown start time";
        return `**${problem.contestId}${problem.index} - ${problem.name}** (${problem.generationAttempts} attempt${problem.generationAttempts === 1 ? "" : "s"}, started ${startedAt})`;
      });
      const extraCount = staleGenerationReset.resetCount - shownProblems.length;

      logger.info("Reset stale running generations", {
        count: staleGenerationReset.resetCount,
        cutoff: staleGenerationReset.cutoff.toISOString(),
      });

      await discordLog({
        title: "Stale Generations Requeued",
        description: [
          `Reset **${staleGenerationReset.resetCount}** generation${staleGenerationReset.resetCount === 1 ? "" : "s"} that had been running for more than 24 hours.`,
          "",
          ...problemLines,
          ...(extraCount > 0 ? [`...and ${extraCount} more.`] : []),
        ].join("\n"),
        color: DISCORD_COLORS.warning,
        fields: [
          {
            name: "Cutoff",
            value: `<t:${Math.floor(staleGenerationReset.cutoff.getTime() / 1000)}:f>`,
            inline: true,
          },
        ],
      });
    } else {
      logger.info("No stale running generations to reset");
    }

    logger.info("Fetching problems from Codeforces API");

    const res = await fetchWithTimeout(
      "https://codeforces.com/api/problemset.problems",
      {
        timeoutMs: 20_000,
        headers: {
          "User-Agent":
            "nudge-bot/1.0 (+https://nudge.zaydkrunz.com; contact@zaydkrunz.com)",
        },
      },
    );

    if (!res.ok) {
      throw new Error(
        `Codeforces API returned ${res.status} ${res.statusText}`,
      );
    }

    const data = (await res.json()) as CFResponse;
    if (data.status !== "OK") {
      throw new Error("Codeforces API returned non-OK status");
    }

    const problems = data.result.problems.filter(isValidProblem);
    logger.info(`Fetched ${problems.length} valid problems from Codeforces`);

    // Process in batches to avoid excessive concurrent DB operations.
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let failed = 0;
    const batchSize = 100;
    const touchedProblemTags = new Set<string>();

    for (let i = 0; i < problems.length; i += batchSize) {
      const batch = problems.slice(i, i + batchSize);

      // Fetch existing problems for this batch in a single query.
      const existingProblems = await prisma.problem.findMany({
        where: {
          OR: batch.map((p) => ({
            contestId: p.contestId,
            index: p.index,
          })),
        },
        select: {
          contestId: true,
          index: true,
          name: true,
          rating: true,
          tags: true,
        },
      });

      const existingMap = new Map(
        existingProblems.map((p) => [`${p.contestId}-${p.index}`, p]),
      );

      const results = await Promise.allSettled(
        batch.map(async (p) => {
          const key = `${p.contestId}-${p.index}`;
          const existing = existingMap.get(key);

          if (!existing) {
            const result = await prisma.problem.create({
              data: {
                ...problemCreateData(pipelineStateData("IDLE")),
                contestId: p.contestId,
                index: p.index,
                name: p.name,
                rating: p.rating ?? null,
                tags: p.tags,
              },
              select: {
                contestId: true,
                index: true,
              },
            });
            touchedProblemTags.add(problemTag(result.contestId, result.index));
            return "created" as const;
          }

          const nameChanged = existing.name !== p.name;
          const ratingChanged = existing.rating !== (p.rating ?? null);
          const tagsChanged = !tagsEqual(existing.tags, p.tags);

          if (nameChanged || ratingChanged || tagsChanged) {
            const result = await prisma.problem.update({
              where: {
                contestId_index: {
                  contestId: p.contestId,
                  index: p.index,
                },
              },
              data: {
                name: p.name,
                rating: p.rating ?? null,
                tags: p.tags,
              },
              select: {
                contestId: true,
                index: true,
              },
            });
            touchedProblemTags.add(problemTag(result.contestId, result.index));
            return "updated" as const;
          }

          return "unchanged" as const;
        }),
      );

      for (const r of results) {
        if (r.status === "fulfilled") {
          if (r.value === "created") created++;
          else if (r.value === "updated") updated++;
          else unchanged++;
        } else {
          failed++;
          logger.error("Problem sync failed", {
            error: String(r.reason),
          });
        }
      }

      logger.info(
        `Processed ${Math.min(i + batchSize, problems.length)}/${problems.length}`,
      );
    }

    if (created > 0 || updated > 0) {
      safeRevalidateTag(PROBLEM_LIST_TAG, "max");
      for (const tag of touchedProblemTags) {
        safeRevalidateTag(tag, "max");
      }
    }

    logger.info(
      `Sync complete: ${created} created, ${updated} updated, ${unchanged} unchanged, ${failed} failed`,
    );

    await discordLog({
      title: "🔄 Problem Sync Complete",
      description:
        failed > 0
          ? `Synced **${problems.length.toLocaleString()}** problems from Codeforces API with **${failed}** failures.`
          : `Synced **${problems.length.toLocaleString()}** problems from Codeforces API.`,
      color: failed > 0 ? DISCORD_COLORS.warning : DISCORD_COLORS.sky,
      fields: [
        { name: "New", value: `${created}`, inline: true },
        { name: "Updated", value: `${updated}`, inline: true },
        { name: "Unchanged", value: `${unchanged}`, inline: true },
        ...(failed > 0
          ? [{ name: "Failed", value: `${failed}`, inline: true }]
          : []),
      ],
    });

    if (failed > 0) {
      throw new Error(`Problem sync completed with ${failed} failed upserts`);
    }

    return {
      created,
      updated,
      unchanged,
      total: problems.length,
      failed,
      staleGenerationsReset: staleGenerationReset.resetCount,
    };
  },
});
