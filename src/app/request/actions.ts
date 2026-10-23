"use server";

import {
  formatProblemId,
  MAX_PROBLEM_INPUT_LENGTH,
  parseCodeforcesProblem,
} from "@/lib/codeforces-problem";
import {
  AUTOMATIC_GENERATION_MAX_ATTEMPTS,
  automaticGenerationProblemWhere,
} from "@/lib/generation-queue";
import { prisma } from "@/lib/prisma";

const REQUEST_PRIORITY_CAP = 100;

export type RequestProblemState = {
  input: string;
  error?: string;
  message?: string;
  problemHref?: string;
};

function formatRequestCount(count: number) {
  return `${count.toLocaleString()} request${count === 1 ? "" : "s"}`;
}

export async function requestProblem(
  _prevState: RequestProblemState | null,
  formData: FormData,
): Promise<RequestProblemState> {
  const rawInput = formData.get("problem");
  const input = typeof rawInput === "string" ? rawInput.trim() : "";
  if (!input) return { input, error: "Please provide a problem." };
  if (input.length > MAX_PROBLEM_INPUT_LENGTH) {
    return {
      input: input.slice(0, MAX_PROBLEM_INPUT_LENGTH),
      error: "That problem ID or URL is too long.",
    };
  }

  const parsedProblem = parseCodeforcesProblem(input);
  if (!parsedProblem) {
    return {
      input,
      error:
        "Enter a problem ID like '123A', '123 A', or '123/A', or a Codeforces problem URL. For numeric indexes, include a separator, like '921/01'.",
    };
  }

  const { contestId, index } = parsedProblem;
  const label = formatProblemId(contestId, index);
  const problemHref = `/problem/${contestId}/${index}`;

  try {
    const updated = await prisma.problem.updateMany({
      where: {
        contestId,
        index,
        ...automaticGenerationProblemWhere(),
        requestedCount: { lt: REQUEST_PRIORITY_CAP },
      },
      data: { requestedCount: { increment: 1 } },
    });
    const problem = await prisma.problem.findUnique({
      where: { contestId_index: { contestId, index } },
      select: {
        runState: true,
        reviewStatus: true,
        generationAttempts: true,
        requestedCount: true,
      },
    });

    if (!problem) {
      return {
        input,
        error: `Problem ${label} isn't in our catalog yet. We sync the Codeforces problemset daily; new problems may take a day to appear. Gym and private group problems aren't included in this sync.`,
      };
    }
    if (problem.reviewStatus === "UNSOLVABLE") {
      return {
        input,
        error:
          "This problem needs maintainer review before another generation attempt.",
      };
    }
    if (problem.reviewStatus === "INCORRECT") {
      return {
        input,
        error:
          "This problem is marked incorrect and needs maintainer review before it can be regenerated.",
      };
    }
    if (problem.runState === "SUCCEEDED") {
      return {
        input,
        message: "This problem is already available on Nudge!",
        problemHref,
      };
    }
    if (problem.runState === "RUNNING") {
      return {
        input,
        message: `Generation for ${label} is already running.`,
        problemHref,
      };
    }
    if (problem.generationAttempts >= AUTOMATIC_GENERATION_MAX_ATTEMPTS) {
      return {
        input,
        error:
          "This problem exhausted its automatic attempts and needs maintainer review before another try.",
      };
    }
    if (updated.count === 1) {
      return {
        input,
        message: `Queued ${label}. It now has ${formatRequestCount(problem.requestedCount)}; requested problems are prioritized when generation next runs.`,
        problemHref,
      };
    }
    if (problem.requestedCount >= REQUEST_PRIORITY_CAP) {
      return {
        input,
        message: `${label} is already queued at maximum priority (${formatRequestCount(REQUEST_PRIORITY_CAP)}).`,
        problemHref,
      };
    }
    return {
      input,
      error: "Problem state changed while processing the request; try again.",
    };
  } catch (error) {
    console.error("requestProblem failed", error);
    return {
      input,
      error:
        "An error occurred while requesting the problem. Please try again.",
    };
  }
}
