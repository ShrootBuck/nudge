import Anthropic from "@anthropic-ai/sdk";
import { logger, schedules, task, wait } from "@trigger.dev/sdk";
import { z } from "zod";
import { prisma } from "./db";

const anthropic = new Anthropic(); // uses ANTHROPIC_API_KEY env var

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

const SYSTEM_PROMPT = `You are an expert competitive programmer and teacher. You have deep knowledge of algorithms, data structures, and Codeforces problems. When generating hints, make them truly progressive: hint 1 should be a gentle nudge about what area to think about, while hint 5 should basically give away the key insight. The editorial should be clear prose (not code), and the solution must be correct, efficient C++ that handles all edge cases.

Write hints and editorials in clean Markdown. You may use inline LaTeX ($...$) and display LaTeX ($$...$$) for formulas, invariants, transitions, and complexity expressions, but only when it improves clarity. Never put mathematical notation inside code fences unless it is actual code.

Use quick and clever humor when appropriate. Tell it like it is (don't sugar-coat responses), and use very casual language. You are fully allowed to swear, just don't overdo it like a sailor (be natural).`;

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

Formatting rules:
- Hints and the editorial should be valid Markdown.
- You may use inline math like $dp[i]$ and display math like $$\\sum_{i=1}^{n} a_i$$ when it helps.
- Do not wrap the final C++ solution in Markdown fences and do not add explanation around it.

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

// Submit a batch request for a single problem, wait 1 day, then collect results
export const generateProblemContent = task({
  id: "generate-problem-content",
  queue: {
    concurrencyLimit: 10,
  },
  run: async (payload: { problemId: string }) => {
    const problem = await prisma.problem.findUniqueOrThrow({
      where: { id: payload.problemId },
    });

    logger.info(
      `Submitting batch for ${problem.contestId}${problem.index}: ${problem.name}`,
    );

    await prisma.problem.update({
      where: { id: problem.id },
      data: { generationStatus: "PROCESSING" },
    });

    try {
      // Submit a single-item batch request (50% cost discount vs synchronous)
      const batch = await anthropic.messages.batches.create({
        requests: [
          {
            custom_id: problem.id,
            params: {
              model: "claude-sonnet-4-5-20250514",
              max_tokens: 8096,
              system: SYSTEM_PROMPT,
              messages: [{ role: "user", content: buildPrompt(problem) }],
              tool_choice: { type: "any" },
              tools: [contentToolSchema],
            },
          },
        ],
      });

      logger.info(
        `Batch ${batch.id} submitted for ${problem.contestId}${problem.index}, waiting 1 day`,
      );

      // Checkpointed wait — zero compute cost while suspended
      await wait.for({ days: 1 });

      // Retrieve batch status
      const completed = await anthropic.messages.batches.retrieve(batch.id);

      if (completed.processing_status !== "ended") {
        throw new Error(
          `Batch ${batch.id} still ${completed.processing_status} after 1 day`,
        );
      }

      // Stream through results (we only submitted 1 request)
      let resultMessage: Anthropic.Messages.Message | null = null;

      const results = await anthropic.messages.batches.results(batch.id);
      for await (const entry of results) {
        if (entry.result.type === "succeeded") {
          resultMessage = entry.result.message;
        } else {
          throw new Error(
            `Batch request failed with type: ${entry.result.type}`,
          );
        }
      }

      if (!resultMessage) {
        throw new Error("No result returned from batch");
      }

      // Extract structured output from tool_use block
      const toolUse = resultMessage.content.find(
        (block): block is Anthropic.Messages.ToolUseBlock =>
          block.type === "tool_use",
      );

      if (!toolUse) {
        throw new Error("No tool_use block in response");
      }

      const parsed = contentSchema.parse(toolUse.input);

      logger.info(
        `Batch ${batch.id} complete — ${parsed.hints.length} hints, editorial + solution`,
      );

      // Save all generated content in a transaction
      await prisma.$transaction([
        // Delete any existing content (in case of retry)
        prisma.hint.deleteMany({ where: { problemId: problem.id } }),
        prisma.editorial.deleteMany({ where: { problemId: problem.id } }),
        prisma.solution.deleteMany({ where: { problemId: problem.id } }),

        // Create hints
        ...parsed.hints.map((hint) =>
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
            content: parsed.editorial,
          },
        }),

        // Create solution
        prisma.solution.create({
          data: {
            problemId: problem.id,
            content: parsed.solution,
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
        batchId: batch.id,
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
    pattern: "0 0 * * *",
    timezone: "America/Phoenix",
  },
  run: async () => {
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

    await generateProblemContent.batchTrigger(
      problems.map((p: { id: string }) => ({
        payload: { problemId: p.id },
      })),
    );

    return { triggered: problems.length };
  },
});
