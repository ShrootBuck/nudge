import { logger, schedules, task, wait } from "@trigger.dev/sdk";
import { z } from "zod";
import { getProvider } from "../lib/ai";
import type { BatchRequest, ToolDefinition } from "../lib/ai/types";
import { prisma } from "./db";

const BATCH_SIZE = 10;
const MAX_GENERATION_ATTEMPTS = 3;

const contentSchema = z.object({
  hints: z.array(
    z.object({
      order: z.number(),
      content: z.string(),
    }),
  ),
  editorial: z.string(),
  solution: z.string(),
});

// Provider-agnostic tool definition for structured output
const contentTool: ToolDefinition = {
  name: "submit_content",
  description:
    "Submit the generated hints, editorial, and solution for this problem.",
  parameters: {
    type: "object",
    properties: {
      hints: {
        type: "array",
        description: "Exactly 5 progressive hints, each building on the last.",
        items: {
          type: "object",
          properties: {
            order: {
              type: "number",
              description: "Hint number, 1 through 5.",
            },
            content: {
              type: "string",
              description:
                "Markdown hint text, building on previous hints. Inline ($...$) and display ($$...$$) LaTeX are allowed when they improve clarity.",
            },
          },
          required: ["order", "content"],
        },
      },
      editorial: {
        type: "string",
        description:
          "A prose editorial explaining the full solution approach. Write in clean Markdown and use inline ($...$) or display ($$...$$) LaTeX whenever mathematical notation improves clarity.",
      },
      solution: {
        type: "string",
        description:
          "A complete, correct C++ solution using the template given. Return raw C++ only, with no surrounding Markdown fence or prose.",
      },
    },
    required: ["hints", "editorial", "solution"],
  },
};

const SYSTEM_PROMPT = `You are an expert competitive programmer and teacher. You have deep knowledge of algorithms, data structures, and Codeforces problems. When generating hints, make them truly progressive: hint 1 should be a gentle nudge about what area to think about, while hint 5 should basically give away the key insight. The editorial should be clear prose (not code), and the solution must be correct, efficient C++ that handles all edge cases but also makes sense to read. The goal is to teach here.

Write hints and editorials in clean Markdown. You may use inline LaTeX ($...$) and display LaTeX ($$...$$) for formulas, invariants, transitions, and complexity expressions wherever it improves clarity. Never put mathematical notation inside code fences unless it is actual code.

Use quick and clever humor when appropriate. Tell it like it is (don't sugar-coat responses), and use very casual language. You are fully allowed to swear, just don't overdo it like a sailor (be natural but slightly funny!).`;

function buildPrompt(problem: {
  contestId: number;
  index: string;
  name: string;
  rating: number | null;
  tags: string[];
}) {
  const ratingStr = problem.rating ? ` (rated ${problem.rating})` : "";
  const tagsStr = problem.tags.length > 0 ? problem.tags.join(", ") : "none";

  return `Generate content for Codeforces problem ${problem.contestId}${problem.index}: "${problem.name}"${ratingStr}.
Tags: ${tagsStr}

Problem URL: https://codeforces.com/contest/${problem.contestId}/problem/${problem.index}

Please generate:
1. Five progressive hints (hint 1 is the gentlest nudge, hint 5 nearly gives away the approach)
2. A prose editorial that fully explains the solution strategy, key observations, and complexity analysis
3. A complete C++ solution that would get full points on Codeforces judge

Formatting rules:
- Hints and the editorial should be valid Markdown.
- You may use inline math like $dp[i]$ and display math like $$\\sum_{i=1}^{n} a_i$$ when it helps.
- Do not wrap the final C++ solution in Markdown fences and do not add explanation around it. Comments are fine.
- You are writing single-file competitive programming C++ that isn't being maintained, not production C++.
  - This obviously means don't be writing super safe code if it's not something tourist would write.

Output format:
- Each hint should be just the hint text. No title, label, or subtitle — the UI adds those.
- The editorial is rendered inside an "Editorial" section already, so DO NOT start it with an "Editorial" heading. Jump straight into the content (e.g. start with "## Observation" or whatever your first section is).
- Please no leading blank lines or spaces on anything!

For the C++ solution, use this template and work around it:
\`\`\`cpp
#include <bits/stdc++.h>
using namespace std;

using ll = long long;

void setIO(const string& name = "") {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

#ifdef ZK_LOCAL_RUN
    freopen("f.in", "r", stdin);
    freopen("f.out", "w", stdout);
#else
    if (!name.empty()) {
        freopen((name + ".in").c_str(), "r", stdin);
        freopen((name + ".out").c_str(), "w", stdout);
    }
#endif
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

  if (!config) {
    throw new Error(
      "No active model configuration found. " +
        "Insert a row into ModelConfig with isActive = true.",
    );
  }

  return config;
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

    // Build provider-agnostic batch requests
    const requests: BatchRequest[] = problems.map((problem) => ({
      customId: problem.id,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildPrompt(problem),
      tools: [contentTool],
    }));

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
        if (result.status !== "succeeded" || !result.toolCallInput) {
          throw new Error(result.error ?? "Unknown error");
        }

        const parsed = contentSchema.parse(result.toolCallInput);

        // Trim whitespace (model sometimes adds leading newlines)
        parsed.solution = parsed.solution.trim();
        parsed.editorial = parsed.editorial.trim();
        for (const hint of parsed.hints) {
          hint.content = hint.content.trim();
        }

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
    await prisma.problem.updateMany({
      where: {
        id: { in: payload.problemIds },
        generationStatus: "PROCESSING", // still PROCESSING = never got a result
      },
      data: { generationStatus: "FAILED" },
    });

    logger.info(
      `Batch ${batchId} complete: ${succeeded} succeeded, ${failed} failed`,
    );

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

    return { triggered: problems.length, batches: chunks.length };
  },
});
