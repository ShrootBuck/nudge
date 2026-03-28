import { schedules, logger, task } from "@trigger.dev/sdk";
import { prisma } from "./db";

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

    logger.info(`Generating content for ${problem.contestId}${problem.index}: ${problem.name}`);

    // Mark as processing
    await prisma.problem.update({
      where: { id: problem.id },
      data: { generationStatus: "PROCESSING" },
    });

    try {
      // TODO: Wire up AI SDK here — will generate:
      // - 5 progressive hints
      // - 1 prose editorial
      // - 1 C++ solution
      // For now, just a placeholder that marks it complete

      throw new Error("AI generation not yet implemented — waiting for AI SDK integration");
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
    // Grab up to 50 PENDING problems (oldest first)
    const problems = await prisma.problem.findMany({
      where: { generationStatus: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 50,
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
