import type { Prisma } from "@prisma/client";
import { logger, schedules, task, wait } from "@trigger.dev/sdk";
import { type BatchRequest, getProvider } from "../lib/ai";
import { buildEffortPlanForProvider } from "../lib/ai/effort";
import { safeRevalidateTag } from "../lib/cache-revalidate";
import { PROBLEM_LIST_TAG, problemTag } from "../lib/cache-tags";
import { DISCORD_COLORS } from "../lib/discord-webhook";
import { prisma } from "../lib/prisma";
import {
  pipelineStateData,
  problemOrderBy,
  problemSelect,
  problemUpdateData,
  problemUpdateManyData,
  problemWhere,
  readyToRunWhere,
} from "../lib/problem-pipeline-db";
import { addDailyTokenUsage } from "../lib/usage-tracker";
import { discordLog } from "./discord-log";
import {
  problemOutputSchema,
  problemResultSchema,
} from "./generate-content/content-schema";
import { getActiveModelConfig } from "./generate-content/model-config";
import {
  type ModelInfo,
  saveProblemContent,
} from "./generate-content/persistence";
import { fetchProblemStatement } from "./generate-content/problem-statement";
import { buildPrompt, SYSTEM_PROMPT } from "./generate-content/prompt";

const BATCH_SIZE = 10;
const MAX_GENERATION_ATTEMPTS = 3;
const BATCH_POLL_MAX_CHECKS = 24;
const BATCH_POLL_INTERVAL_HOURS = 1;
const STALE_BATCH_THRESHOLD_HOURS = 48;

type ProblemForBatch = {
  id: string;
  contestId: number;
  index: string;
  name: string;
  rating: number | null;
  tags: string[];
};

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function toProblemLabel(problem: Pick<ProblemForBatch, "contestId" | "index">) {
  return `${problem.contestId}${problem.index}`;
}

function toBatchSample(
  problems: Array<Pick<ProblemForBatch, "contestId" | "index">>,
) {
  const sample = problems
    .slice(0, 5)
    .map((problem) => toProblemLabel(problem))
    .join(", ");
  const extra = problems.length > 5 ? ` (+${problems.length - 5} more)` : "";
  return `${sample}${extra}`;
}

function splitIntoChunks<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];

  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }

  return chunks;
}

function revalidateProblems(
  problems: Array<Pick<ProblemForBatch, "contestId" | "index">>,
) {
  if (problems.length === 0) {
    return;
  }

  safeRevalidateTag(PROBLEM_LIST_TAG, "max");
  for (const problem of problems) {
    safeRevalidateTag(problemTag(problem.contestId, problem.index), "max");
  }
}

async function markProblemsFailed(problemIds: string[], reason: string) {
  if (problemIds.length === 0) {
    return 0;
  }

  const [problems, result] = await prisma.$transaction([
    prisma.problem.findMany({
      where: problemWhere({
        id: { in: problemIds },
        runState: { not: "SUCCEEDED" },
      }),
      select: {
        contestId: true,
        index: true,
      },
    }),
    prisma.problem.updateMany({
      where: problemWhere({
        id: { in: problemIds },
        runState: { not: "SUCCEEDED" },
      }),
      data: problemUpdateManyData({
        ...pipelineStateData("READY", "FAILED"),
        activeBatchId: null,
        processingStartedAt: null,
        lastGenerationError: reason,
      }),
    }),
  ]);

  revalidateProblems(problems);

  return result.count;
}

async function buildBatchRequests(
  problems: ProblemForBatch[],
): Promise<BatchRequest[]> {
  const problemStatements = await Promise.all(
    problems.map((problem) =>
      fetchProblemStatement(problem.contestId, problem.index),
    ),
  );

  return problems.map((problem, index) => {
    const statement = problemStatements[index];
    const textPrompt = buildPrompt(problem, statement?.html);

    const userPrompt: BatchRequest["userPrompt"] =
      statement?.images && statement.images.length > 0
        ? [
            { type: "text", text: textPrompt },
            ...statement.images.map((url) => ({
              type: "image_url" as const,
              image_url: { url },
            })),
          ]
        : textPrompt;

    return {
      customId: problem.id,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      outputSchema: problemOutputSchema,
    };
  });
}

function schedulerProblemWhere(): Prisma.ProblemWhereInput {
  return readyToRunWhere(MAX_GENERATION_ATTEMPTS);
}

function schedulerOrderBy(): Prisma.ProblemOrderByWithRelationInput[] {
  return problemOrderBy([{ updatedAt: "desc" }, { createdAt: "desc" }]);
}

function schedulerSelect() {
  return problemSelect<{
    id: true;
    contestId: true;
    index: true;
    name: true;
  }>({
    id: true,
    contestId: true,
    index: true,
    name: true,
  });
}

export const generateBatchContent = task({
  id: "generate-batch-content",
  queue: { concurrencyLimit: 5 },
  retry: { maxAttempts: 2 },
  run: async (payload: { problemIds: string[] }) => {
    if (payload.problemIds.length === 0) {
      logger.warn(
        "generate-batch-content called with an empty problemIds list",
      );
      return { batchId: null, succeeded: 0, failed: 0 };
    }

    const modelConfig = await getActiveModelConfig();
    const provider = getProvider(modelConfig.provider);
    const effortPlan = buildEffortPlanForProvider(
      modelConfig.provider,
      modelConfig.effort,
    );
    const selectedEffort = effortPlan[0];

    logger.info(
      `Using provider "${modelConfig.provider}" / model "${modelConfig.modelId}" (${modelConfig.displayName})` +
        (selectedEffort ? ` [effort=${selectedEffort}]` : ""),
    );

    const problems = await prisma.problem.findMany({
      where: problemWhere({
        id: { in: payload.problemIds },
        queueState: "READY",
        runState: { in: ["IDLE", "FAILED"] },
        reviewStatus: { not: "UNSOLVABLE" },
      }),
      select: {
        id: true,
        contestId: true,
        index: true,
        name: true,
        rating: true,
        tags: true,
      },
    });

    if (problems.length === 0) {
      logger.warn("No matching problems found for batch payload", {
        requestedProblemIds: payload.problemIds,
      });
      return { batchId: null, succeeded: 0, failed: 0 };
    }

    const foundProblemIds = problems.map((problem) => problem.id);

    if (foundProblemIds.length !== payload.problemIds.length) {
      logger.warn("Some batch problem IDs were missing from the database", {
        requestedCount: payload.problemIds.length,
        found: foundProblemIds.length,
      });
    }

    if (foundProblemIds.length === 0) {
      logger.warn("No eligible ready problems found for this batch payload");
      return { batchId: null, succeeded: 0, failed: 0 };
    }

    const problemMap = new Map<string, ProblemForBatch>();
    for (const problem of problems) {
      problemMap.set(problem.id, problem);
    }

    logger.info(
      `Creating batch request payload for ${problems.length} problems`,
    );
    const requests = await buildBatchRequests(problems);
    const requestsById = new Map(
      requests.map((request) => [request.customId, request]),
    );
    const batchesUsed: string[] = [];
    const modelInfo: ModelInfo = {
      provider: modelConfig.provider,
      modelId: modelConfig.modelId,
      effort: selectedEffort,
    };

    logger.info(
      `Effort plan: ${effortPlan.map((effort) => effort ?? "default").join(" -> ")}`,
    );

    let succeeded = 0;
    let failed = 0;
    let latestBatchId: string | null = null;
    const pendingIds = new Set(foundProblemIds);
    const lastErrorByProblemId = new Map<string, string>();

    for (let effortIndex = 0; effortIndex < effortPlan.length; effortIndex++) {
      if (pendingIds.size === 0) {
        break;
      }

      const effortForAttempt = effortPlan[effortIndex];
      const hasNextAttempt = effortIndex < effortPlan.length - 1;
      const attemptProblemIds = [...pendingIds];
      const attemptRequests = attemptProblemIds
        .map((id) => requestsById.get(id))
        .filter((request): request is BatchRequest => Boolean(request));

      if (attemptRequests.length === 0) {
        break;
      }

      logger.info(
        `Submitting batch attempt ${effortIndex + 1}/${effortPlan.length} for ${attemptRequests.length} problems` +
          (effortForAttempt ? ` [effort=${effortForAttempt}]` : ""),
      );

      let batchId: string;
      try {
        batchId = await provider.createBatch(
          modelConfig.modelId,
          attemptRequests,
          effortForAttempt,
        );
      } catch (error) {
        const reason = `Batch creation failed${effortForAttempt ? ` (effort ${effortForAttempt})` : ""}: ${toErrorMessage(error)}`;
        logger.error(reason);

        for (const id of attemptProblemIds) {
          lastErrorByProblemId.set(id, reason);
        }

        if (hasNextAttempt) {
          logger.warn(
            `Retrying ${attemptProblemIds.length} problems at lower effort after batch creation failure`,
          );
          continue;
        }

        const failedCount = await markProblemsFailed(attemptProblemIds, reason);
        failed += failedCount;
        pendingIds.clear();
        break;
      }

      latestBatchId = batchId;
      batchesUsed.push(batchId);

      await prisma.problem.updateMany({
        where: problemWhere({ id: { in: attemptProblemIds } }),
        data: problemUpdateManyData({
          ...pipelineStateData("READY", "RUNNING"),
          ...(effortIndex === 0
            ? { generationAttempts: { increment: 1 } }
            : {}),
          activeBatchId: batchId,
          processingStartedAt: new Date(),
          lastGenerationError: null,
        }),
      });

      logger.info(
        `Batch ${batchId} submitted (${attemptRequests.length} problems), polling hourly`,
      );

      if (effortIndex === 0) {
        await discordLog({
          title: "📦 Batch Started",
          description: `**${problems.length}** problems submitted via **${modelConfig.displayName}**\n${toBatchSample(problems)}`,
          color: DISCORD_COLORS.info,
          fields: [
            { name: "Batch ID", value: `\`${batchId}\``, inline: true },
            {
              name: "Provider",
              value: `${modelConfig.provider}/${modelConfig.modelId}`,
              inline: true,
            },
          ],
        });
      }

      let batchEnded = false;

      for (let attempt = 1; attempt <= BATCH_POLL_MAX_CHECKS; attempt++) {
        await wait.for({ hours: BATCH_POLL_INTERVAL_HOURS });

        const status = await provider.checkBatchStatus(batchId);
        logger.info(
          `Batch ${batchId} check ${attempt}/${BATCH_POLL_MAX_CHECKS}: ${status}`,
        );

        if (status === "ended") {
          batchEnded = true;
          break;
        }

        if (status === "failed") {
          logger.error(`Batch ${batchId} reported failure`);
          break;
        }
      }

      if (!batchEnded) {
        const reason = `Batch ${batchId} did not complete successfully`;
        for (const id of attemptProblemIds) {
          lastErrorByProblemId.set(id, reason);
        }

        if (hasNextAttempt) {
          logger.warn(
            `Batch ${batchId} incomplete, retrying ${attemptProblemIds.length} problems at lower effort`,
          );
          continue;
        }

        const failedCount = await markProblemsFailed(attemptProblemIds, reason);
        failed += failedCount;
        for (const id of attemptProblemIds) {
          pendingIds.delete(id);
        }
        break;
      }

      const pendingResultIds = new Set(attemptProblemIds);
      const retryProblemIds = new Set<string>();

      try {
        for await (const result of provider.getBatchResults(batchId)) {
          pendingResultIds.delete(result.customId);

          const problem = problemMap.get(result.customId);
          const label = problem ? toProblemLabel(problem) : result.customId;

          if (!problem || !pendingIds.has(result.customId)) {
            logger.warn(
              `Batch ${batchId} returned unknown customId ${result.customId}`,
            );
            continue;
          }

          try {
            if (result.tokensUsed && result.tokensUsed > 0) {
              await addDailyTokenUsage(modelInfo.provider, result.tokensUsed);
              logger.info(
                `Tracked ${result.tokensUsed} tokens for problem ${label}`,
              );
            }

            if (result.status !== "succeeded" || !result.output) {
              throw new Error(result.error ?? "Unknown provider error");
            }

            const outputData = problemResultSchema.parse(result.output);

            if (outputData.status === "unsolvable") {
              const reason = outputData.reason;

              logger.warn(`Problem ${label} reported as unsolvable: ${reason}`);

              await prisma.problem.update({
                where: { id: result.customId },
                data: problemUpdateData({
                  ...pipelineStateData("BACKLOG", "FAILED"),
                  reviewStatus: "UNSOLVABLE",
                  activeBatchId: null,
                  processingStartedAt: null,
                  lastGenerationError: reason,
                }),
              });
              revalidateProblems([problem]);

              await discordLog({
                title: "🚫 Unsolvable Problem",
                description: `Model reported that problem **${label}** cannot be solved.\n**Reason:** ${reason}`,
                color: DISCORD_COLORS.error,
              });

              failed++;
              pendingIds.delete(result.customId);
              continue;
            }

            await saveProblemContent(result.customId, outputData, modelInfo);

            succeeded++;
            pendingIds.delete(result.customId);
            logger.info(`Saved content for ${label}`);
          } catch (error) {
            const reason = `Failed to process result for ${label}: ${toErrorMessage(error)}`;

            logger.error(reason);
            lastErrorByProblemId.set(result.customId, reason);

            if (hasNextAttempt) {
              retryProblemIds.add(result.customId);
            } else {
              failed++;
              pendingIds.delete(result.customId);
              await prisma.problem.update({
                where: { id: result.customId },
                data: problemUpdateData({
                  ...pipelineStateData("READY", "FAILED"),
                  activeBatchId: null,
                  processingStartedAt: null,
                  lastGenerationError: reason,
                }),
              });
              revalidateProblems([problem]);
            }
          }
        }
      } catch (error) {
        const reason = `Batch ${batchId} result stream failed: ${toErrorMessage(error)}`;
        logger.error(reason);

        for (const id of attemptProblemIds) {
          if (!pendingIds.has(id)) {
            continue;
          }
          lastErrorByProblemId.set(id, reason);
          if (hasNextAttempt) {
            retryProblemIds.add(id);
          }
        }
      }

      if (pendingResultIds.size > 0) {
        const missingIds = [...pendingResultIds].filter((id) =>
          pendingIds.has(id),
        );
        const reason = `Batch ${batchId} finished with missing result entries`;

        for (const id of missingIds) {
          lastErrorByProblemId.set(id, reason);
          if (hasNextAttempt) {
            retryProblemIds.add(id);
          } else {
            failed++;
            pendingIds.delete(id);
          }
        }

        if (!hasNextAttempt && missingIds.length > 0) {
          await markProblemsFailed(missingIds, reason);
        }

        if (missingIds.length > 0) {
          logger.error(
            `Batch ${batchId} finished with ${missingIds.length} missing result(s)`,
          );
        }
      }

      if (hasNextAttempt && retryProblemIds.size > 0) {
        logger.warn(
          `Retrying ${retryProblemIds.size} failed problem(s) at lower effort`,
        );
      }
    }

    if (pendingIds.size > 0) {
      const remainingIds = [...pendingIds];

      await Promise.all(
        remainingIds.map((id) => {
          const reason =
            lastErrorByProblemId.get(id) ??
            "Generation failed after exhausting effort fallbacks";

          return prisma.problem.update({
            where: { id },
            data: problemUpdateData({
              ...pipelineStateData("READY", "FAILED"),
              activeBatchId: null,
              processingStartedAt: null,
              lastGenerationError: reason,
            }),
          });
        }),
      );
      revalidateProblems(
        remainingIds
          .map((id) => problemMap.get(id))
          .filter((problem): problem is ProblemForBatch => Boolean(problem)),
      );

      failed += remainingIds.length;
      pendingIds.clear();
    }

    const completedBatchText =
      batchesUsed.length > 0 ? batchesUsed.join(", ") : "none";

    logger.info(
      `Batches ${completedBatchText} complete: ${succeeded} succeeded, ${failed} failed`,
    );

    const emoji = failed === 0 ? "✅" : "⚠️";
    await discordLog({
      title: `${emoji} Batch Complete`,
      description:
        batchesUsed.length > 0
          ? `Batch${batchesUsed.length === 1 ? "" : "es"} ${batchesUsed.map((id) => `\`${id}\``).join(", ")} finished processing.`
          : "No batch was submitted successfully. All requests failed before submission.",
      color: failed === 0 ? DISCORD_COLORS.success : DISCORD_COLORS.warning,
      fields: [
        { name: "Succeeded", value: `${succeeded}`, inline: true },
        { name: "Failed", value: `${failed}`, inline: true },
        {
          name: "Provider",
          value: `${modelInfo.provider}/${modelInfo.modelId}`,
          inline: true,
        },
      ],
    });

    return { batchId: latestBatchId, succeeded, failed };
  },
});

export const generateContentScheduler = schedules.task({
  id: "generate-content-scheduler",
  cron: {
    pattern: "5 * * * *",
    timezone: "America/Phoenix",
  },
  run: async () => {
    const problems = await prisma.problem.findMany({
      where: problemWhere(schedulerProblemWhere()),
      orderBy: schedulerOrderBy(),
      select: schedulerSelect(),
    });

    if (problems.length === 0) {
      logger.info("No ready problems to generate content for");
      return { triggered: 0, batches: 0 };
    }

    const chunks = splitIntoChunks(
      problems.map((problem) => problem.id),
      BATCH_SIZE,
    );

    logger.info(
      `${problems.length} ready problems -> ${chunks.length} batches of up to ${BATCH_SIZE}`,
    );

    await generateBatchContent.batchTrigger(
      chunks.map((problemIds) => ({ payload: { problemIds } })),
    );

    await discordLog({
      title: "📅 Generation Triggered",
      description: `**${problems.length}** ready problems queued across **${chunks.length}** batch${chunks.length === 1 ? "" : "es"}\n${toBatchSample(problems)}`,
      color: DISCORD_COLORS.indigo,
    });

    return { triggered: problems.length, batches: chunks.length };
  },
});

export const generationStateWatchdog = schedules.task({
  id: "generation-state-watchdog",
  cron: {
    pattern: "0 0 * * *",
    timezone: "America/Phoenix",
  },
  run: async () => {
    const staleBefore = new Date(
      Date.now() - STALE_BATCH_THRESHOLD_HOURS * 60 * 60 * 1000,
    );

    const staleRuns = await prisma.problem.findMany({
      where: problemWhere({
        runState: "RUNNING",
        processingStartedAt: { lt: staleBefore },
      }),
      select: {
        id: true,
        contestId: true,
        index: true,
      },
      take: 500,
    });

    if (staleRuns.length === 0) {
      logger.info("No stale generation runs found");
      return { recovered: 0 };
    }

    const staleIds = staleRuns.map((problem) => problem.id);
    const reason = `Batch exceeded ${STALE_BATCH_THRESHOLD_HOURS}h without completion`;

    const recovered = await markProblemsFailed(staleIds, `Watchdog: ${reason}`);

    await discordLog({
      title: "🛟 Generation Watchdog Recovered Stale Runs",
      description: `Marked **${recovered}** stale running problem${recovered === 1 ? "" : "s"} as FAILED and ready for retry.`,
      color: DISCORD_COLORS.warning,
      fields: [
        {
          name: "Examples",
          value: staleRuns
            .slice(0, 5)
            .map((problem) => toProblemLabel(problem))
            .join(", "),
        },
      ],
    });

    logger.warn(`Recovered ${recovered} stale generation run(s)`);
    return { recovered };
  },
});
