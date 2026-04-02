import Anthropic from "@anthropic-ai/sdk";
import { logger, schedules, task, wait } from "@trigger.dev/sdk";
import { z } from "zod";
import { prisma } from "./db";

const anthropic = new Anthropic(); // uses ANTHROPIC_API_KEY env var

const BATCH_SIZE = 10;

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

// JSON Schema for the tool_use structured output
const contentToolSchema = {
  name: "submit_content",
  description:
    "Submit the generated hints, editorial, and solution for this problem.",
  input_schema: {
    type: "object" as const,
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

function saveProblemContent(
  problemId: string,
  parsed: z.infer<typeof contentSchema>,
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

    // Mark as completed
    prisma.problem.update({
      where: { id: problemId },
      data: { generationStatus: "COMPLETED" },
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

// Process a batch of problems via one Anthropic Batch API call
export const generateBatchContent = task({
  id: "generate-batch-content",
  queue: { concurrencyLimit: 5 },
  retry: { maxAttempts: 2 },
  run: async (payload: { problemIds: string[] }) => {
    // Fetch full problem data for the batch
    const problems = await prisma.problem.findMany({
      where: { id: { in: payload.problemIds } },
    });

    // Build a lookup so we can map custom_id -> problem later
    const problemMap = new Map<string, ProblemForBatch>();
    for (const p of problems) {
      problemMap.set(p.id, p);
    }

    // Mark all as PROCESSING
    await prisma.problem.updateMany({
      where: { id: { in: payload.problemIds } },
      data: { generationStatus: "PROCESSING" },
    });

    logger.info(`Creating batch with ${problems.length} requests`);

    let batch: Anthropic.Messages.Batches.MessageBatch;
    try {
      batch = await anthropic.messages.batches.create({
        requests: problems.map((problem) => ({
          custom_id: problem.id,
          params: {
            model: "claude-opus-4-6",
            max_tokens: 128000,
            thinking: {
              type: "enabled" as const,
              budget_tokens: 120000,
            },
            system: SYSTEM_PROMPT,
            messages: [
              { role: "user" as const, content: buildPrompt(problem) },
            ],
            tools: [contentToolSchema],
          },
        })),
      });
    } catch (error) {
      // Batch creation failed (e.g. insufficient credits) — revert all to PENDING
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
      `Batch ${batch.id} submitted (${problems.length} problems), waiting 1 day`,
    );

    // Checkpointed wait — zero compute cost while suspended
    await wait.for({ days: 1 });

    logger.info(`Wait complete, retrieving batch ${batch.id}`);

    const completed = await anthropic.messages.batches.retrieve(batch.id);

    if (completed.processing_status !== "ended") {
      // Not done yet — wait another 12 hours and check again
      logger.warn(
        `Batch ${batch.id} still ${completed.processing_status}, waiting 12 more hours`,
      );
      await wait.for({ hours: 12 });

      const retryCheck = await anthropic.messages.batches.retrieve(batch.id);
      if (retryCheck.processing_status !== "ended") {
        // Give up — mark all as FAILED so they can be retried later
        logger.error(`Batch ${batch.id} still not done after 36 hours`);
        await prisma.problem.updateMany({
          where: {
            id: { in: payload.problemIds },
            generationStatus: "PROCESSING",
          },
          data: { generationStatus: "FAILED" },
        });
        throw new Error(
          `Batch ${batch.id} still ${retryCheck.processing_status} after 36h`,
        );
      }
    }

    // Process results — handle each problem independently
    let succeeded = 0;
    let failed = 0;
    const results = await anthropic.messages.batches.results(batch.id);

    for await (const entry of results) {
      const problemId = entry.custom_id;
      const problem = problemMap.get(problemId);
      const label = problem
        ? `${problem.contestId}${problem.index}`
        : problemId;

      try {
        if (entry.result.type !== "succeeded") {
          throw new Error(`Request ${entry.result.type}`);
        }

        const toolUse = entry.result.message.content.find(
          (block): block is Anthropic.Messages.ToolUseBlock =>
            block.type === "tool_use",
        );

        if (!toolUse) {
          throw new Error("No tool_use block in response");
        }

        const parsed = contentSchema.parse(toolUse.input);

        await saveProblemContent(problemId, parsed);
        succeeded++;
        logger.info(`Saved content for ${label}`);
      } catch (error) {
        failed++;
        logger.error(`Failed to process result for ${label}`, {
          error: String(error),
        });
        await prisma.problem.update({
          where: { id: problemId },
          data: { generationStatus: "FAILED" },
        });
      }
    }

    // Check for problems that were in the batch but had no result entry
    // (shouldn't happen, but just in case)
    await prisma.problem.updateMany({
      where: {
        id: { in: payload.problemIds },
        generationStatus: "PROCESSING", // still PROCESSING = never got a result
      },
      data: { generationStatus: "FAILED" },
    });

    logger.info(
      `Batch ${batch.id} complete: ${succeeded} succeeded, ${failed} failed`,
    );

    return { batchId: batch.id, succeeded, failed };
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
      where: { generationStatus: { in: ["PENDING", "FAILED"] } },
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
