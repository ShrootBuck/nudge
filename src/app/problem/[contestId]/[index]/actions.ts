"use server";

import { sendAdminLog } from "@/lib/discord";
import { DISCORD_COLORS } from "@/lib/discord-webhook";
import { SITE_URL, verifyAdminPassword } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import {
  pipelineStateData,
  problemUpdateData,
} from "@/lib/problem-pipeline-db";

const REVIEW_STATUSES = [
  "VERIFIED",
  "SOLUTION_INCORRECT",
  "UNSOLVABLE",
] as const;

type ReviewStatus = (typeof REVIEW_STATUSES)[number];

const MAX_REASON_LENGTH = 1000;

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

  await prisma.problem.update({
    where: { id: problemId },
    data: { reviewStatus },
  });

  const tag = `${problem.contestId}${problem.index}`;
  const link = `${SITE_URL}/problem/${problem.contestId}/${problem.index}`;
  const logConfig = {
    VERIFIED: { title: "✅ Problem Verified", color: DISCORD_COLORS.success },
    SOLUTION_INCORRECT: {
      title: "⚠️ Marked Incorrect",
      color: DISCORD_COLORS.warning,
    },
    UNSOLVABLE: {
      title: "🚫 Marked Unsolvable",
      color: DISCORD_COLORS.warning,
    },
  } as const;
  const log = logConfig[reviewStatus];
  await sendAdminLog({
    title: log.title,
    description: `**[${tag} — ${problem.name}](${link})**`,
    color: log.color,
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

export async function queueRegeneration(problemId: string, password: string) {
  const auth = verifyAdminPassword(password);
  if (!auth.ok) {
    return { success: false, error: auth.error } as const;
  }

  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { contestId: true, index: true, name: true },
  });

  if (!problem) {
    return { success: false, error: "Problem not found" } as const;
  }

  await prisma.problem.update({
    where: { id: problemId },
    data: problemUpdateData({
      ...pipelineStateData("READY", "IDLE"),
      generationAttempts: 0,
      reviewStatus: "UNREVIEWED",
      requestedCount: 1,
      requestedAt: new Date(),
      activeBatchId: null,
      processingStartedAt: null,
      lastGenerationError: null,
    }),
  });

  const tag = `${problem.contestId}${problem.index}`;
  const link = `${SITE_URL}/problem/${problem.contestId}/${problem.index}`;
  await sendAdminLog({
    title: "🔁 Regeneration Queued",
    description: `**[${tag} — ${problem.name}](${link})**\nAttempt counter reset, will be picked up by next generation run.`,
    color: DISCORD_COLORS.violet,
  });

  return { success: true } as const;
}
