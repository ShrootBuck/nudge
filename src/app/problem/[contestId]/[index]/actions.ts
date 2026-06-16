"use server";

import { updateTag } from "next/cache";
import {
  formatOpenAIDailyTokenUsage,
  getOpenAIDailyTokenUsage,
} from "@/lib/ai/token-budget";
import { PROBLEM_LIST_TAG, problemTag } from "@/lib/cache-tags";
import { sendAdminLog } from "@/lib/discord";
import { DISCORD_COLORS } from "@/lib/discord-webhook";
import { getOptionalEnv, SITE_URL, verifyAdminPassword } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { triggerGenerateContentTask } from "@/lib/trigger-tasks";

const REVIEW_STATUSES = ["VERIFIED", "INCORRECT", "UNSOLVABLE"] as const;

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

export async function triggerRegeneration(problemId: string, password: string) {
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

  if (!getOptionalEnv("TRIGGER_SECRET_KEY")) {
    return {
      success: false,
      error: "Trigger.dev is not configured on the server",
    } as const;
  }

  const budget = await getOpenAIDailyTokenUsage();
  if (budget.exhausted) {
    return {
      success: false,
      error: `OpenAI daily token grant exhausted (${formatOpenAIDailyTokenUsage(
        budget,
      )}).`,
    } as const;
  }

  try {
    await triggerGenerateContentTask({ problemId, adminBypass: true });
  } catch (error) {
    console.error("Regeneration trigger failed", {
      problemId,
      contestId: problem.contestId,
      index: problem.index,
      triggerVersion: process.env.TRIGGER_VERSION,
      error,
    });
    return { success: false, error: "Regeneration trigger failed" } as const;
  }

  updateTag(PROBLEM_LIST_TAG);
  updateTag(problemTag(problem.contestId, problem.index));

  const tag = `${problem.contestId}${problem.index}`;
  const link = `${SITE_URL}/problem/${problem.contestId}/${problem.index}`;
  await sendAdminLog({
    title: "🔁 Regeneration Started",
    description: `**[${tag} — ${problem.name}](${link})**\nOn-demand generation task was triggered immediately.`,
    color: DISCORD_COLORS.violet,
  });

  return { success: true } as const;
}
