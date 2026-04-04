"use server";

import { sendAdminLog } from "@/lib/discord";
import { prisma } from "@/lib/prisma";

const REVIEW_STATUSES = ["VERIFIED", "SOLUTION_INCORRECT"] as const;

type ReviewStatus = (typeof REVIEW_STATUSES)[number];

const MAX_REASON_LENGTH = 1000;

export async function setProblemReviewStatus(
  problemId: string,
  password: string,
  reviewStatus: ReviewStatus,
) {
  if (password !== process.env.VERIFY_PASSWORD) {
    return { success: false, error: "Wrong password" } as const;
  }

  if (!REVIEW_STATUSES.includes(reviewStatus)) {
    return { success: false, error: "Invalid review status" } as const;
  }

  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { contestId: true, index: true, name: true },
  });

  await prisma.problem.update({
    where: { id: problemId },
    data: { reviewStatus },
  });

  if (problem) {
    const tag = `${problem.contestId}${problem.index}`;
    const link = `https://nudge.zaydkrunz.com/problem/${problem.contestId}/${problem.index}`;
    const isVerified = reviewStatus === "VERIFIED";
    await sendAdminLog({
      title: isVerified ? "✅ Problem Verified" : "⚠️ Marked Incorrect",
      description: `**[${tag} — ${problem.name}](${link})**`,
      color: isVerified ? 0x10b981 : 0xf59e0b, // emerald / amber
    });
  }

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
  if (password !== process.env.VERIFY_PASSWORD) {
    return { success: false, error: "Wrong password" } as const;
  }

  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: { contestId: true, index: true, name: true },
  });

  await prisma.problem.update({
    where: { id: problemId },
    data: {
      generationStatus: "PENDING",
      generationAttempts: 0,
      reviewStatus: "UNREVIEWED",
    },
  });

  if (problem) {
    const tag = `${problem.contestId}${problem.index}`;
    const link = `https://nudge.zaydkrunz.com/problem/${problem.contestId}/${problem.index}`;
    await sendAdminLog({
      title: "🔁 Regeneration Queued",
      description: `**[${tag} — ${problem.name}](${link})**\nAttempt counter reset, will be picked up by next generation run.`,
      color: 0x8b5cf6, // violet
    });
  }

  return { success: true } as const;
}
