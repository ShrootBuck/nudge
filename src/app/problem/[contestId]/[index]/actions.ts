"use server";

import type { RunState } from "@prisma/client";
import { updateTag } from "next/cache";
import { PROBLEM_LIST_TAG, problemTag } from "@/lib/cache-tags";
import { sendAdminLog } from "@/lib/discord";
import { SITE_URL, verifyAdminPassword } from "@/lib/env";
import { deleteGenerationTranscript } from "@/lib/generation-transcript";
import { prisma } from "@/lib/prisma";
import {
  pipelineStateData,
  problemUpdateData,
} from "@/lib/problem-pipeline-db";

const REVIEW_STATUSES = ["VERIFIED", "INCORRECT"] as const;

type ReviewStatus = (typeof REVIEW_STATUSES)[number];

const MAX_REASON_LENGTH = 1000;
const MAX_OPEN_REPORTS_PER_PROBLEM = 5;
const REGENERATION_TRANSACTION_MAX_WAIT_MS = 15_000;
const REGENERATION_TRANSACTION_TIMEOUT_MS = 15_000;
const REPORT_TRANSACTION_MAX_WAIT_MS = 15_000;
const REPORT_TRANSACTION_TIMEOUT_MS = 15_000;

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
    select: {
      contestId: true,
      index: true,
      name: true,
      runState: true,
      editorial: { select: { id: true } },
      solution: { select: { id: true } },
      _count: { select: { hints: true } },
    },
  });

  if (!problem) {
    return { success: false, error: "Problem not found" } as const;
  }

  if (
    problem.runState !== "SUCCEEDED" ||
    problem._count.hints === 0 ||
    !problem.editorial ||
    !problem.solution
  ) {
    return {
      success: false,
      error: "Only complete generated content can be reviewed",
    } as const;
  }

  const resolvedAt = new Date();
  const resolvedReportCount = await prisma.$transaction(async (tx) => {
    const updated = await tx.problem.updateMany({
      where: { id: problemId, runState: "SUCCEEDED" },
      data: { reviewStatus },
    });
    if (updated.count !== 1) return null;

    const resolvedReports = await tx.report.updateMany({
      where: { problemId, resolvedAt: null },
      data: { resolvedAt, resolution: reviewStatus },
    });
    return resolvedReports.count;
  });

  if (resolvedReportCount === null) {
    return {
      success: false,
      error: "Problem state changed; refresh and try again",
    } as const;
  }

  updateTag(PROBLEM_LIST_TAG);
  updateTag(problemTag(problem.contestId, problem.index));

  const tag = `${problem.contestId}${problem.index}`;
  const link = `${SITE_URL}/problem/${problem.contestId}/${problem.index}`;
  const logConfig = {
    VERIFIED: `✅ Verified **${tag}**`,
    INCORRECT: `⚠️ Marked **${tag}** incorrect`,
  } as const;
  const reportSummary =
    resolvedReportCount > 0
      ? `\n${resolvedReportCount} open report${resolvedReportCount === 1 ? " was" : "s were"} resolved by this action.`
      : "";
  await sendAdminLog({
    content: `${logConfig[reviewStatus]}${reportSummary}\n${link}`,
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
      generationTranscriptUrl: true,
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
      const transitioned = await tx.problem.updateMany({
        where: { id: problemId, runState: { not: "RUNNING" } },
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
          generationTranscriptUrl: null,
        }),
      });
      if (transitioned.count !== 1) return null;

      await tx.hint.deleteMany({ where: { problemId } });
      await tx.editorial.deleteMany({ where: { problemId } });
      await tx.solution.deleteMany({ where: { problemId } });

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

  if (resolvedReportCount === null) {
    return {
      success: false,
      error:
        "Generation started while this request was running; try again later",
    } as const;
  }

  if (problem.generationTranscriptUrl) {
    await deleteGenerationTranscript(problem.generationTranscriptUrl).catch(
      (error) => {
        console.error("Failed to delete regenerated problem transcript", error);
      },
    );
  }

  updateTag(PROBLEM_LIST_TAG);
  updateTag(problemTag(problem.contestId, problem.index));

  const tag = `${problem.contestId}${problem.index}`;
  const link = `${SITE_URL}/problem/${problem.contestId}/${problem.index}`;
  const reportSummary =
    resolvedReportCount > 0
      ? `\n${resolvedReportCount} open report${resolvedReportCount === 1 ? " was" : "s were"} resolved by this regeneration.`
      : "";
  await sendAdminLog({
    content: `♻️ Queued regeneration for **${tag}** — existing content deleted${reportSummary}\n${link}`,
  });

  return { success: true } as const;
}

export async function reportProblem(problemId: string, reason: string) {
  if (typeof problemId !== "string" || typeof reason !== "string") {
    return { success: false, error: "Invalid report" } as const;
  }

  const trimmed = reason.trim();
  if (!trimmed) {
    return { success: false, error: "Please describe the issue" } as const;
  }
  if (trimmed.length > MAX_REASON_LENGTH) {
    return {
      success: false,
      error: `Report must be ${MAX_REASON_LENGTH} characters or fewer`,
    } as const;
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const [problem] = await tx.$queryRaw<Array<{ runState: RunState }>>`
        SELECT "runState"
        FROM "Problem"
        WHERE "id" = ${problemId}
        FOR UPDATE
      `;

      if (!problem) return "not-found" as const;
      if (problem.runState !== "SUCCEEDED") return "not-complete" as const;

      const openReportCount = await tx.report.count({
        where: { problemId, resolvedAt: null },
      });
      if (openReportCount >= MAX_OPEN_REPORTS_PER_PROBLEM) {
        return "at-limit" as const;
      }

      await tx.report.create({
        data: {
          problemId,
          reason: trimmed,
        },
      });
      return "created" as const;
    },
    {
      maxWait: REPORT_TRANSACTION_MAX_WAIT_MS,
      timeout: REPORT_TRANSACTION_TIMEOUT_MS,
    },
  );

  switch (result) {
    case "not-found":
      return { success: false, error: "Problem not found" } as const;
    case "not-complete":
      return {
        success: false,
        error: "Only completed generated content can be reported",
      } as const;
    case "at-limit":
      return {
        success: false,
        error: "This problem already has several open reports",
      } as const;
    case "created":
      return { success: true } as const;
  }
}
