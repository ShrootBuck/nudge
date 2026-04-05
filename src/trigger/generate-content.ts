import { logger, schedules, task, wait } from "@trigger.dev/sdk";
import * as cheerio from "cheerio";
import { z } from "zod";
import { type BatchRequest, getProvider, type OutputSchema } from "../lib/ai";
import { DISCORD_COLORS } from "../lib/discord-webhook";
import { prisma } from "../lib/prisma";
import { cfProblemUrl } from "../lib/utils";
import { discordLog } from "./discord-log";

const BATCH_SIZE = 10;
const MAX_GENERATION_ATTEMPTS = 3;

const hintSchema = z.object({
  order: z.number().int().min(1).max(5),
  content: z.string().trim().min(1),
});

const contentSchema = z
  .object({
    hints: z.array(hintSchema).length(5),
    editorial: z.string().trim().min(1),
    solution: z.string().trim().min(1),
  })
  .superRefine(({ hints }, ctx) => {
    const orders = [...hints.map((hint) => hint.order)].sort((a, b) => a - b);

    for (const [index, order] of [1, 2, 3, 4, 5].entries()) {
      if (orders[index] !== order) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Hints must contain exactly one entry for each order from 1 to 5",
          path: ["hints"],
        });
        break;
      }
    }
  });

// Provider-agnostic schema for structured output
const problemOutputSchema: OutputSchema = {
  name: "problem_response",
  description:
    "Submit the generated content for the problem, or report if it is unsolvable.",
  schema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["success", "unsolvable"],
        description:
          "Set to 'success' if you can solve the problem. Set to 'unsolvable' if the problem statement is fundamentally incomplete or you cannot solve it.",
      },
      reason: {
        anyOf: [{ type: "string" }, { type: "null" }],
        description:
          "If status is 'unsolvable', provide a brief explanation. Otherwise null.",
      },
      hints: {
        anyOf: [
          {
            type: "array",
            description:
              "Exactly 5 progressive hints, each building on the last.",
            items: {
              type: "object",
              properties: {
                order: {
                  type: "number",
                  description: "Hint number, 1 through 5.",
                },
                content: {
                  type: "string",
                  description: "Markdown hint text.",
                },
              },
              required: ["order", "content"],
              additionalProperties: false,
            },
          },
          { type: "null" },
        ],
        description:
          "If status is 'success', provide exactly 5 progressive hints. Otherwise null.",
      },
      editorial: {
        anyOf: [{ type: "string" }, { type: "null" }],
        description:
          "If status is 'success', a prose editorial explaining the solution. Otherwise null.",
      },
      solution: {
        anyOf: [{ type: "string" }, { type: "null" }],
        description:
          "If status is 'success', a complete C++ solution. Otherwise null.",
      },
    },
    required: ["status", "reason", "hints", "editorial", "solution"],
    additionalProperties: false,
  },
};

const SYSTEM_PROMPT = `You are a legendary competitive programmer (think LGM/red coder level) and a brutally honest but brilliant teacher. You have deep knowledge of algorithms, data structures, and Codeforces problems.

When generating hints, make them truly progressive: hint 1 should be a gentle nudge (e.g. "what if we looked at the parity?"), while hint 5 basically hands them the key insight on a silver platter.

The editorial should be crisp, clear prose explaining the "aha!" moments, transitions, and complexity. The solution must be fast, clean, and correct C++ that handles all edge cases. The goal is to teach the intuition, not just dump code.

If a problem cannot be solved because the text provided is just a stub or lacks the actual rules, return status = "unsolvable" with a brief reason instead of hallucinating. You can also do this if you don't think you were able to fully solve the problem.

Write hints and editorials in clean Markdown. You MUST use inline LaTeX ($...$) and display LaTeX ($$...$$) for math, invariants, transitions, and complexity ($O(N \\log N)$). Never put mathematical notation inside code fences unless it's literal code.

Tone: Use quick, clever humor. Tell it exactly like it is—don't sugar-coat shit, and use casual language. You are fully allowed to swear, just don't overdo it like a sailor. Be natural, be funny, and be smart.`;

function buildPrompt(
  problem: {
    contestId: number;
    index: string;
    name: string;
    rating: number | null;
    tags: string[];
  },
  problemStatement?: string | null,
) {
  const ratingStr = problem.rating ? ` (rated ${problem.rating})` : "";
  const tagsStr = problem.tags.length > 0 ? problem.tags.join(", ") : "none";

  let statementSection = "";
  if (problemStatement) {
    statementSection = `\n\nProblem Statement:\n<problem-statement>\n${problemStatement}\n</problem-statement>\n`;
  }

  return `Generate content for Codeforces problem ${problem.contestId}${problem.index}: "${problem.name}"${ratingStr}.
Tags: ${tagsStr}

Problem URL: ${cfProblemUrl(problem.contestId, problem.index)}${statementSection}
Please generate:
1. Five progressive hints (from a gentle nudge in hint 1, to a dead giveaway in hint 5).
2. A killer editorial that breaks down the solution strategy, key observations, and complexity analysis.
3. A complete C++ solution that easily gets Accepted on Codeforces.

Formatting & Style Rules:
- Hints and the editorial must be valid Markdown.
- Use LaTeX heavily for math (e.g., $dp[i]$, $$\\sum_{i=1}^{n} a_i$$).
- DO NOT wrap the final C++ solution in Markdown fences (\`\`\`cpp). Just the raw code.
- You are writing single-file competitive programming C++. Don't write enterprise-grade over-engineered garbage. If tourist wouldn't write it, you shouldn't either. Keep it short, clean, and fast. That said, since the goal here is to teach, don't be scared of writing comments, and keep your code fairly clean/logical.
- If avoidable, please do not use specific compiler extensions. Stick to C++ standard stuff as much as you can.
- You are writing C++23.

Output strictness:
- Return JSON matching the provided schema exactly.
- If the problem is solvable, return \`status: "success"\`, \`reason: null\`, and fill in \`hints\`, \`editorial\`, and \`solution\`.
- If the problem is not solvable from the given statement, return \`status: "unsolvable"\`, a short \`reason\`, and set \`hints\`, \`editorial\`, and \`solution\` to null.
- Each hint must be JUST the hint text. No "Hint 1:" or subtitles. The UI adds those automatically.
- The editorial is already rendered inside an "Editorial" section, so DO NOT start it with an "# Editorial" heading. Just jump straight into the meat (e.g., "## Observation 1").

For the C++ solution, you MUST use this template and work around it:

\`\`\`cpp
#include <bits/stdc++.h>
using namespace std;

using ll = long long;

void setIO() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
}

int main() { setIO(); }
\`\`\``;
}

/**
 * Read the active model configuration from the DB.
 * Throws if no row has `isActive = true`.
 */
async function getActiveModelConfig() {
  const config = await prisma.modelConfig.findFirst({
    where: { isActive: true },
  });
  if (!config) throw new Error("No active model configuration found in DB");
  return config;
}

async function fetchProblemStatement(contestId: number, index: string) {
  try {
    const url = cfProblemUrl(contestId, index);
    const res = await fetch(url);
    if (!res.ok) {
      logger.error(
        `Failed to fetch problem statement for ${contestId}${index}: ${res.statusText}`,
      );
      return null;
    }
    const html = await res.text();

    // We parse the HTML with Cheerio to extract text and image URLs properly
    const $ = cheerio.load(html);
    const statementDiv = $(".problem-statement");

    if (statementDiv.length > 0) {
      // Find all image tags within the problem statement and turn them into absolute URLs
      const images: string[] = [];
      statementDiv.find("img").each((_, img) => {
        const src = $(img).attr("src");
        if (src) {
          const absoluteUrl = new URL(src, "https://codeforces.com").href;
          images.push(absoluteUrl);
          // Also update the src in the HTML so the LLM sees the full URL
          $(img).attr("src", absoluteUrl);
        }
      });

      const cleanHtml = statementDiv.html();
      return cleanHtml ? { html: cleanHtml, images } : null;
    }
    return null;
  } catch (err) {
    logger.error(`Error fetching problem statement for ${contestId}${index}`, {
      error: String(err),
    });
    return null;
  }
}

type ModelInfo = { provider: string; modelId: string };

function saveProblemContent(
  problemId: string,
  parsed: z.infer<typeof contentSchema>,
  model: ModelInfo,
) {
  return prisma.$transaction([
    // Delete any existing content (in case of retry)
    prisma.hint.deleteMany({ where: { problemId } }),
    prisma.editorial.deleteMany({ where: { problemId } }),
    prisma.solution.deleteMany({ where: { problemId } }),

    // Create hints
    ...parsed.hints.map((hint) =>
      prisma.hint.create({
        data: {
          problemId,
          order: hint.order,
          content: hint.content,
        },
      }),
    ),

    // Create editorial
    prisma.editorial.create({
      data: { problemId, content: parsed.editorial },
    }),

    // Create solution
    prisma.solution.create({
      data: { problemId, content: parsed.solution },
    }),

    // Mark as completed and record which model generated it
    prisma.problem.update({
      where: { id: problemId },
      data: {
        generationStatus: "COMPLETED",
        generatedByProvider: model.provider,
        generatedByModel: model.modelId,
      },
    }),
  ]);
}

type ProblemForBatch = {
  id: string;
  contestId: number;
  index: string;
  name: string;
  rating: number | null;
  tags: string[];
};

// Process a batch of problems via the active AI provider
export const generateBatchContent = task({
  id: "generate-batch-content",
  queue: { concurrencyLimit: 5 },
  retry: { maxAttempts: 2 },
  run: async (payload: { problemIds: string[] }) => {
    // Resolve the active provider + model from the DB
    const modelConfig = await getActiveModelConfig();
    const provider = getProvider(modelConfig.provider);

    logger.info(
      `Using provider "${modelConfig.provider}" / model "${modelConfig.modelId}" (${modelConfig.displayName})` +
        (modelConfig.effort ? ` [effort=${modelConfig.effort}]` : ""),
    );

    // Fetch full problem data for the batch
    const problems = await prisma.problem.findMany({
      where: { id: { in: payload.problemIds } },
    });

    // Build a lookup so we can map custom_id -> problem later
    const problemMap = new Map<string, ProblemForBatch>();
    for (const p of problems) {
      problemMap.set(p.id, p);
    }

    // Mark all as PROCESSING and increment attempt counter
    await prisma.problem.updateMany({
      where: { id: { in: payload.problemIds } },
      data: {
        generationStatus: "PROCESSING",
        generationAttempts: { increment: 1 },
      },
    });

    // Fetch problem statements concurrently
    const problemStatements = await Promise.all(
      problems.map((p) => fetchProblemStatement(p.contestId, p.index)),
    );

    // Build provider-agnostic batch requests
    const requests: BatchRequest[] = problems.map((problem, i) => {
      const statement = problemStatements[i];
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

    logger.info(`Creating batch with ${problems.length} requests`);

    let batchId: string;
    try {
      batchId = await provider.createBatch(
        modelConfig.modelId,
        requests,
        modelConfig.effort ?? undefined,
      );
    } catch (error) {
      // Batch creation failed — revert all to PENDING
      logger.error("Batch creation failed, reverting to PENDING", {
        error: String(error),
      });
      await prisma.problem.updateMany({
        where: { id: { in: payload.problemIds } },
        data: { generationStatus: "PENDING" },
      });
      throw error;
    }

    logger.info(
      `Batch ${batchId} submitted (${problems.length} problems), polling hourly`,
    );

    const problemLabels = problems
      .slice(0, 5)
      .map((p) => `${p.contestId}${p.index}`)
      .join(", ");
    const extraText =
      problems.length > 5 ? ` (+${problems.length - 5} more)` : "";

    await discordLog.trigger({
      title: `📦 Batch Started`,
      description: `**${problems.length}** problems submitted via **${modelConfig.displayName}**\n${problemLabels}${extraText}`,
      color: DISCORD_COLORS.info,
      fields: [
        {
          name: "Batch ID",
          value: `\`${batchId}\``,
          inline: true,
        },
        {
          name: "Provider",
          value: `${modelConfig.provider}/${modelConfig.modelId}`,
          inline: true,
        },
      ],
    });

    // Poll every hour up to 24 times — each wait is checkpointed (zero compute cost)
    let batchEnded = false;
    for (let attempt = 1; attempt <= 24; attempt++) {
      await wait.for({ hours: 1 });

      const status = await provider.checkBatchStatus(batchId);
      logger.info(`Batch ${batchId} check ${attempt}/24: ${status}`);

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
      logger.error(`Batch ${batchId} still not done after 24 hours`);
      await prisma.problem.updateMany({
        where: {
          id: { in: payload.problemIds },
          generationStatus: "PROCESSING",
        },
        data: { generationStatus: "FAILED" },
      });

      await discordLog.trigger({
        title: "❌ Batch Timed Out",
        description: `Batch \`${batchId}\` did not complete after 24 hours.\n**${payload.problemIds.length}** problems marked as FAILED.`,
        color: DISCORD_COLORS.error,
      });

      throw new Error(`Batch ${batchId} not completed after 24 hourly checks`);
    }

    // Process results — handle each problem independently
    const modelInfo: ModelInfo = {
      provider: modelConfig.provider,
      modelId: modelConfig.modelId,
    };

    let succeeded = 0;
    let failed = 0;

    for await (const result of provider.getBatchResults(batchId)) {
      const problem = problemMap.get(result.customId);
      const label = problem
        ? `${problem.contestId}${problem.index}`
        : result.customId;

      try {
        if (result.status !== "succeeded" || !result.output) {
          throw new Error(result.error ?? "Unknown error");
        }

        const outputData = result.output as Record<string, unknown>;

        if (outputData.status === "unsolvable") {
          const reason = (outputData.reason as string) || "Unknown reason";
          logger.warn(`Problem ${label} reported as unsolvable: ${reason}`);

          await prisma.problem.update({
            where: { id: result.customId },
            data: {
              generationStatus: "COMPLETED",
              reviewStatus: "UNSOLVABLE",
            },
          });

          await discordLog.trigger({
            title: `🚫 Unsolvable Problem`,
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
        logger.error(`Failed to process result for ${label}`, {
          error: String(error),
        });
        await prisma.problem.update({
          where: { id: result.customId },
          data: { generationStatus: "FAILED" },
        });
      }
    }

    // Check for problems that were in the batch but had no result entry
    const missingResults = await prisma.problem.updateMany({
      where: {
        id: { in: payload.problemIds },
        generationStatus: "PROCESSING", // still PROCESSING = never got a result
      },
      data: { generationStatus: "FAILED" },
    });

    if (missingResults.count > 0) {
      failed += missingResults.count;
      logger.error(
        `Batch ${batchId} finished with ${missingResults.count} missing result(s)`,
      );
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

// Runs daily at midnight Phoenix time — picks up ALL pending problems
export const generateContentScheduler = schedules.task({
  id: "generate-content-scheduler",
  cron: {
    pattern: "0 0 * * *",
    timezone: "America/Phoenix",
  },
  run: async () => {
    const problems = await prisma.problem.findMany({
      where: {
        generationStatus: { in: ["PENDING", "FAILED"] },
        generationAttempts: { lt: MAX_GENERATION_ATTEMPTS },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, contestId: true, index: true, name: true },
    });

    if (problems.length === 0) {
      logger.info("No pending problems to generate content for");
      return { triggered: 0, batches: 0 };
    }

    // Chunk into batches of BATCH_SIZE
    const chunks: string[][] = [];
    for (let i = 0; i < problems.length; i += BATCH_SIZE) {
      chunks.push(problems.slice(i, i + BATCH_SIZE).map((p) => p.id));
    }

    logger.info(
      `${problems.length} pending problems -> ${chunks.length} batches of up to ${BATCH_SIZE}`,
    );

    await generateBatchContent.batchTrigger(
      chunks.map((problemIds) => ({
        payload: { problemIds },
      })),
    );

    const sample = problems
      .slice(0, 5)
      .map((p) => `${p.contestId}${p.index}`)
      .join(", ");
    const extra = problems.length > 5 ? ` (+${problems.length - 5} more)` : "";

    await discordLog.trigger({
      title: "📅 Daily Generation Triggered",
      description: `**${problems.length}** pending problems queued across **${chunks.length}** batch${chunks.length === 1 ? "" : "es"}\n${sample}${extra}`,
      color: DISCORD_COLORS.indigo,
    });

    return { triggered: problems.length, batches: chunks.length };
  },
});
