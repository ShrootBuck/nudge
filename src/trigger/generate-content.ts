import type { Prisma } from "@prisma/client";
import { logger, schedules, task, wait } from "@trigger.dev/sdk";
import { type BatchRequest, getProvider } from "../lib/ai";
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
import { discordLog } from "./discord-log";
import {
  contentSchema,
  problemOutputSchema,
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
const STALE_RUN_THRESHOLD_HOURS = 26;

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

async function markProblemsFailed(problemIds: string[], reason: string) {
  if (problemIds.length === 0) {
    return 0;
  }

  const result = await prisma.problem.updateMany({
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
  });

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

    logger.info(
      `Using provider "${modelConfig.provider}" / model "${modelConfig.modelId}" (${modelConfig.displayName})` +
        (modelConfig.effort ? ` [effort=${modelConfig.effort}]` : ""),
    );

    const problems = await prisma.problem.findMany({
      where: problemWhere({
        id: { in: payload.problemIds },
        queueState: "READY",
        runState: { in: ["IDLE", "FAILED"] },
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

    logger.info(`Creating batch with ${problems.length} requests`);
    const requests = await buildBatchRequests(problems);

    let batchId: string;
    try {
      batchId = await provider.createBatch(
        modelConfig.modelId,
        requests,
        modelConfig.effort ?? undefined,
      );
    } catch (error) {
      const reason = `Batch creation failed: ${toErrorMessage(error)}`;
      logger.error(reason);

      await markProblemsFailed(foundProblemIds, reason);
      throw error;
    }

    await prisma.problem.updateMany({
      where: problemWhere({ id: { in: foundProblemIds } }),
      data: problemUpdateManyData({
        ...pipelineStateData("READY", "RUNNING"),
        generationAttempts: { increment: 1 },
        activeBatchId: batchId,
        processingStartedAt: new Date(),
        lastGenerationError: null,
      }),
    });

    logger.info(
      `Batch ${batchId} submitted (${problems.length} problems), polling hourly`,
    );

    await discordLog.trigger({
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
      const failedCount = await markProblemsFailed(foundProblemIds, reason);

      await discordLog.trigger({
        title: "❌ Batch Incomplete",
        description: `Batch \`${batchId}\` failed or timed out.\n**${failedCount}** problems marked FAILED.`,
        color: DISCORD_COLORS.error,
      });

      throw new Error(
        `Batch ${batchId} not completed after ${BATCH_POLL_MAX_CHECKS} checks`,
      );
    }

    const modelInfo: ModelInfo = {
      provider: modelConfig.provider,
      modelId: modelConfig.modelId,
    };

    let succeeded = 0;
    let failed = 0;
    const pendingResultIds = new Set(foundProblemIds);

    try {
      for await (const result of provider.getBatchResults(batchId)) {
        pendingResultIds.delete(result.customId);

        const problem = problemMap.get(result.customId);
        const label = problem ? toProblemLabel(problem) : result.customId;

        if (!problem) {
          logger.warn(
            `Batch ${batchId} returned unknown customId ${result.customId}`,
          );
          continue;
        }

        try {
          if (result.status !== "succeeded" || !result.output) {
            throw new Error(result.error ?? "Unknown provider error");
          }

          const outputData = result.output as Record<string, unknown>;

          if (outputData.status === "unsolvable") {
            const reason =
              typeof outputData.reason === "string" && outputData.reason.trim()
                ? outputData.reason
                : "Unknown reason";

            logger.warn(`Problem ${label} reported as unsolvable: ${reason}`);

            await prisma.problem.update({
              where: { id: result.customId },
              data: problemUpdateData({
                ...pipelineStateData("READY", "SUCCEEDED"),
                reviewStatus: "UNSOLVABLE",
                activeBatchId: null,
                processingStartedAt: null,
                lastGenerationError: null,
              }),
            });

            await discordLog.trigger({
              title: "🚫 Unsolvable Problem",
              description: `Model reported that problem **${label}** cannot be solved.\n**Reason:** ${reason}`,
              color: DISCORD_COLORS.error,
            });

            failed++;
            continue;
          }

          const parsed = contentSchema.parse(outputData);
          await saveProblemContent(result.customId, parsed, modelInfo);

          succeeded++;
          logger.info(`Saved content for ${label}`);
        } catch (error) {
          failed++;
          const reason = `Failed to process result for ${label}: ${toErrorMessage(error)}`;

          logger.error(reason);

          await prisma.problem.update({
            where: { id: result.customId },
            data: problemUpdateData({
              ...pipelineStateData("READY", "FAILED"),
              activeBatchId: null,
              processingStartedAt: null,
              lastGenerationError: reason,
            }),
          });
        }
      }
    } catch (error) {
      const reason = `Batch ${batchId} result stream failed: ${toErrorMessage(error)}`;
      logger.error(reason);
    }

    if (pendingResultIds.size > 0) {
      const missingIds = [...pendingResultIds];
      const reason = `Batch ${batchId} finished with missing result entries`;
      const failedCount = await markProblemsFailed(missingIds, reason);

      if (failedCount > 0) {
        failed += failedCount;
        logger.error(
          `Batch ${batchId} finished with ${failedCount} missing result(s)`,
        );
      }
    }

    logger.info(
      `Batch ${batchId} complete: ${succeeded} succeeded, ${failed} failed`,
    );

    const emoji = failed === 0 ? "✅" : "⚠️";
    await discordLog.trigger({
      title: `${emoji} Batch Complete`,
      description: `Batch \`${batchId}\` finished processing.`,
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

    return { batchId, succeeded, failed };
  },
});

export const generateContentScheduler = schedules.task({
  id: "generate-content-scheduler",
  cron: {
    pattern: "0 0 * * *",
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

    await discordLog.trigger({
      title: "📅 Daily Generation Triggered",
      description: `**${problems.length}** ready problems queued across **${chunks.length}** batch${chunks.length === 1 ? "" : "es"}\n${toBatchSample(problems)}`,
      color: DISCORD_COLORS.indigo,
    });

    return { triggered: problems.length, batches: chunks.length };
  },
});

export const generationStateWatchdog = schedules.task({
  id: "generation-state-watchdog",
  cron: {
    pattern: "0 * * * *",
    timezone: "America/Phoenix",
  },
  run: async () => {
    const staleBefore = new Date(
      Date.now() - STALE_RUN_THRESHOLD_HOURS * 60 * 60 * 1000,
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
    const reason = `Run exceeded ${STALE_RUN_THRESHOLD_HOURS}h without completion`;

    const recovered = await markProblemsFailed(staleIds, `Watchdog: ${reason}`);

    await discordLog.trigger({
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
