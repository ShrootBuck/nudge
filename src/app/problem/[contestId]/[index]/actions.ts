"use server";

import { updateTag } from "next/cache";
import { PROBLEM_LIST_TAG, problemTag } from "@/lib/cache-tags";
import { sendAdminLog } from "@/lib/discord";
import { DISCORD_COLORS } from "@/lib/discord-webhook";
import { SITE_URL, verifyAdminPassword } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  pipelineStateData,
  problemUpdateData,
} from "@/lib/problem-pipeline-db";

const REVIEW_STATUSES = ["VERIFIED", "INCORRECT"] as const;

type ReviewStatus = (typeof REVIEW_STATUSES)[number];

const MAX_REASON_LENGTH = 1000;
const REGENERATION_TRANSACTION_MAX_WAIT_MS = 15_000;
const REGENERATION_TRANSACTION_TIMEOUT_MS = 15_000;

export async function setProblemReviewStatus(
  problemId: string,
  password: string,
  reviewStatus: ReviewStatus,
) {
  const auth = verifyAdminPassword(password);
  if (!auth.ok) {
    return { success: false, error: auth.error } as const;
  }

  if (!REVIEW_STATUSES.includes(reviewStatus)) {
    return { success: false, error: "Invalid review status" } as const;
  }

  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { contestId: true, index: true, name: true },
  });

  if (!problem) {
    return { success: false, error: "Problem not found" } as const;
  }

  const resolvedAt = new Date();
  const [, resolvedReports] = await prisma.$transaction([
    prisma.problem.update({
      where: { id: problemId },
      data: { reviewStatus },
    }),
    prisma.report.updateMany({
      where: { problemId, resolvedAt: null },
      data: { resolvedAt, resolution: reviewStatus },
    }),
  ]);

  updateTag(PROBLEM_LIST_TAG);
  updateTag(problemTag(problem.contestId, problem.index));

  const tag = `${problem.contestId}${problem.index}`;
  const link = `${SITE_URL}/problem/${problem.contestId}/${problem.index}`;
  const logConfig = {
    VERIFIED: { title: "✅ Problem Verified", color: DISCORD_COLORS.success },
    INCORRECT: {
      title: "⚠️ Marked Incorrect",
      color: DISCORD_COLORS.warning,
    },
  } as const;
  const log = logConfig[reviewStatus];
  const reportSummary =
    resolvedReports.count > 0
      ? `\n${resolvedReports.count} open report${resolvedReports.count === 1 ? " was" : "s were"} resolved by this action.`
      : "";
  await sendAdminLog({
    title: log.title,
    description: `**[${tag} — ${problem.name}](${link})**${reportSummary}`,
    color: log.color,
  });

  return { success: true } as const;
}

export async function regenerateProblemContent(
  problemId: string,
  password: string,
) {
  const auth = verifyAdminPassword(password);
  if (!auth.ok) {
    return { success: false, error: auth.error } as const;
  }

  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: {
      contestId: true,
      index: true,
      name: true,
      runState: true,
    },
  });

  if (!problem) {
    return { success: false, error: "Problem not found" } as const;
  }

  if (problem.runState === "RUNNING") {
    return {
      success: false,
      error: "Generation is already running for this problem",
    } as const;
  }

  const resolvedReportCount = await prisma.$transaction(
    async (tx) => {
      await tx.hint.deleteMany({ where: { problemId } });
      await tx.editorial.deleteMany({ where: { problemId } });
      await tx.solution.deleteMany({ where: { problemId } });

      await tx.problem.update({
        where: { id: problemId },
        data: problemUpdateData({
          ...pipelineStateData("IDLE"),
          generationAttempts: 0,
          reviewStatus: "UNREVIEWED",
          requestedCount: { increment: 1 },
          generationStartedAt: null,
          lastGenerationError: null,
          generatedByDisplayName: null,
          generatedByModel: null,
          generationResponseId: null,
          generationFinishReason: null,
          generationNativeFinishReason: null,
          generationProviderName: null,
          generationTotalTokens: null,
        }),
      });

      const resolvedReports = await tx.report.updateMany({
        where: { problemId, resolvedAt: null },
        data: {
          resolvedAt: new Date(),
          resolution: "REGENERATED",
        },
      });

      return resolvedReports.count;
    },
    {
      maxWait: REGENERATION_TRANSACTION_MAX_WAIT_MS,
      timeout: REGENERATION_TRANSACTION_TIMEOUT_MS,
    },
  );

  updateTag(PROBLEM_LIST_TAG);
  updateTag(problemTag(problem.contestId, problem.index));

  const tag = `${problem.contestId}${problem.index}`;
  const link = `${SITE_URL}/problem/${problem.contestId}/${problem.index}`;
  const reportSummary =
    resolvedReportCount > 0
      ? `\n${resolvedReportCount} open report${resolvedReportCount === 1 ? " was" : "s were"} resolved by this regeneration.`
      : "";
  await sendAdminLog({
    title: "♻️ Queued Regeneration",
    description: `**[${tag} — ${problem.name}](${link})**\nExisting generated content was deleted and the problem was queued for a future local Codex run.${reportSummary}`,
    color: DISCORD_COLORS.info,
  });

  return { success: true } as const;
}

export async function reportProblem(problemId: string, reason: string) {
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { reviewStatus: true },
  });

  if (!problem) {
    return { success: false, error: "Problem not found" } as const;
  }

  if (problem.reviewStatus === "VERIFIED") {
    return {
      success: false,
      error: "Verified solutions cannot be reported",
    } as const;
  }

  const trimmed = reason.trim().slice(0, MAX_REASON_LENGTH) || null;

  await prisma.report.create({
    data: {
      problemId,
      reason: trimmed,
    },
  });

  return { success: true } as const;
}
