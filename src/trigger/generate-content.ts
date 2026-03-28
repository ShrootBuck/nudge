import { schedules, logger, task } from "@trigger.dev/sdk";
import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { prisma } from "./db";

const contentSchema = z.object({
  hints: z
    .array(
      z.object({
        order: z.number().describe("Hint number, 1 through 5."),
        content: z
          .string()
          .describe("The hint text, building on previous hints."),
      }),
    )
    .describe("Exactly 5 progressive hints, each building on the last."),
  editorial: z
    .string()
    .describe(
      "A prose editorial explaining the full solution approach. Write in nice, neat markdown.",
    ),
  solution: z
    .string()
    .describe("A complete, correct C++ solution using the template given."),
});

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
3. A complete C++ solution that would get full points accepted on Codeforces

For the C++ solution, use this template:
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

// Process a single problem — called by the daily scheduler
export const generateProblemContent = task({
  id: "generate-problem-content",
  queue: {
    concurrencyLimit: 10,
  },
  retry: {
    maxAttempts: 3,
  },
  run: async (payload: { problemId: string }) => {
    const problem = await prisma.problem.findUniqueOrThrow({
      where: { id: payload.problemId },
    });

    logger.info(
      `Generating content for ${problem.contestId}${problem.index}: ${problem.name}`,
    );

    // Mark as processing
    await prisma.problem.update({
      where: { id: problem.id },
      data: { generationStatus: "PROCESSING" },
    });

    try {
      const { output, usage } = await generateText({
        model: anthropic("claude-sonnet-4-5"),
        output: Output.object({ schema: contentSchema }),
        system: `You are an expert competitive programmer and teacher. You have deep knowledge of algorithms, data structures, and Codeforces problems. When generating hints, make them truly progressive: hint 1 should be a gentle nudge about what area to think about, while hint 5 should basically give away the key insight. The editorial should be clear prose (not code), and the solution must be correct, efficient C++ that handles all edge cases.

        Use quick and clever humor when appropriate. Tell it like it is (don't sugar-coat responses), and use very casual language. You are fully allowed to swear, just don't overdo it like a sailor (be natural).`,
        prompt: buildPrompt(problem),
      });

      if (!output) {
        throw new Error("Model returned no structured output");
      }

      logger.info(`Generated content, usage: ${JSON.stringify(usage)}`);

      // Save all generated content in a transaction
      await prisma.$transaction([
        // Delete any existing content (in case of retry)
        prisma.hint.deleteMany({ where: { problemId: problem.id } }),
        prisma.editorial.deleteMany({ where: { problemId: problem.id } }),
        prisma.solution.deleteMany({ where: { problemId: problem.id } }),

        // Create hints
        ...output.hints.map((hint) =>
          prisma.hint.create({
            data: {
              problemId: problem.id,
              order: hint.order,
              content: hint.content,
            },
          }),
        ),

        // Create editorial
        prisma.editorial.create({
          data: {
            problemId: problem.id,
            content: output.editorial,
          },
        }),

        // Create solution
        prisma.solution.create({
          data: {
            problemId: problem.id,
            content: output.solution,
          },
        }),

        // Mark as completed
        prisma.problem.update({
          where: { id: problem.id },
          data: { generationStatus: "COMPLETED" },
        }),
      ]);

      return {
        problemId: problem.id,
        problem: `${problem.contestId}${problem.index}`,
        hintsGenerated: output.hints.length,
        usage,
      };
    } catch (error) {
      await prisma.problem.update({
        where: { id: problem.id },
        data: { generationStatus: "FAILED" },
      });
      throw error;
    }
  },
});

// Runs daily at midnight Phoenix time — picks up PENDING problems
export const generateContentScheduler = schedules.task({
  id: "generate-content-scheduler",
  cron: {
    pattern: "0 0 * * *", // midnight daily
    timezone: "America/Phoenix",
  },
  run: async () => {
    // Grab up to 10 PENDING problems (newest first)
    const problems = await prisma.problem.findMany({
      where: { generationStatus: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, contestId: true, index: true, name: true },
    });

    if (problems.length === 0) {
      logger.info("No pending problems to generate content for");
      return { triggered: 0 };
    }

    logger.info(`Triggering generation for ${problems.length} problems`);

    // Batch trigger individual generation tasks
    await generateProblemContent.batchTrigger(
      problems.map((p: { id: string }) => ({
        payload: { problemId: p.id },
      })),
    );

    return { triggered: problems.length };
  },
});
