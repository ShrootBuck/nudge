"use server";

import { prisma } from "@/lib/prisma";

const REVIEW_STATUSES = ["VERIFIED", "SOLUTION_INCORRECT"] as const;

type ReviewStatus = (typeof REVIEW_STATUSES)[number];

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

  await prisma.problem.update({
    where: { id: problemId },
    data: { reviewStatus },
  });

  return { success: true } as const;
}
