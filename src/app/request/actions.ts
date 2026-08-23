"use server";

import type { RunState } from "@prisma/client";
import {
  AUTOMATIC_GENERATION_MAX_ATTEMPTS,
  automaticGenerationProblemWhere,
} from "@/lib/generation-queue";
import { prisma } from "@/lib/prisma";

const MAX_POSTGRES_INT = 2_147_483_647;
const MAX_REQUEST_INPUT_LENGTH = 2_048;
const REQUEST_PRIORITY_CAP = 100;
const PROBLEM_IDENTIFIER_PATTERN =
  /^(\d+)\s*(?:\/|\s)?\s*([A-Za-z][A-Za-z0-9]{0,9})$/;
const URL_SUFFIX_PATTERN = /(\d+)\/(?:problem\/)?([A-Za-z][A-Za-z0-9]{0,9})$/i;
const URL_WITH_SCHEME_PATTERN = /^[a-z][a-z\d+\-.]*:\/\//i;

function toProblemInput(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseProblemIdentifier(input: string) {
  const match = input.match(PROBLEM_IDENTIFIER_PATTERN);
  if (!match) {
    return null;
  }

  const contestId = Number.parseInt(match[1], 10);
  if (
    !Number.isSafeInteger(contestId) ||
    contestId <= 0 ||
    contestId > MAX_POSTGRES_INT
  ) {
    return null;
  }

  return {
    contestId,
    index: match[2].toUpperCase(),
  };
}

function normalizeCodeforcesUrlInput(input: string) {
  if (input.startsWith("//")) {
    return `https:${input}`;
  }

  if (URL_WITH_SCHEME_PATTERN.test(input)) {
    return input;
  }

  return `https://${input}`;
}

function parseRequestedProblem(input: string) {
  const parsedIdentifier = parseProblemIdentifier(input);
  if (parsedIdentifier) {
    return parsedIdentifier;
  }

  try {
    const url = new URL(normalizeCodeforcesUrlInput(input));
    const hostname = url.hostname.toLowerCase();

    if (
      hostname !== "codeforces.com" &&
      !hostname.endsWith(".codeforces.com")
    ) {
      return null;
    }

    const cleanPath = url.pathname.replace(/\/+$/, "");
    const pathMatch = cleanPath.match(URL_SUFFIX_PATTERN);
    if (!pathMatch) {
      return null;
    }

    const contestId = Number.parseInt(pathMatch[1], 10);
    if (
      !Number.isSafeInteger(contestId) ||
      contestId <= 0 ||
      contestId > MAX_POSTGRES_INT
    ) {
      return null;
    }

    return {
      contestId,
      index: pathMatch[2].toUpperCase(),
    };
  } catch {
    return null;
  }
}

function isCompletedRunState(runState: RunState) {
  return runState === "SUCCEEDED";
}

function isRunningRunState(runState: RunState) {
  return runState === "RUNNING";
}

function formatRequestCount(count: number) {
  return `${count.toLocaleString()} request${count === 1 ? "" : "s"}`;
}

export async function requestProblem(_prevState: unknown, formData: FormData) {
  const input = toProblemInput(formData.get("problem"));
  if (!input) {
    return { error: "Please provide a problem." };
  }
  if (input.length > MAX_REQUEST_INPUT_LENGTH) {
    return { error: "That problem ID or URL is too long." };
  }

  const parsedProblem = parseRequestedProblem(input);
  if (!parsedProblem) {
    return {
      error:
        "Could not parse problem ID or URL. Use formats like '123 A', '123A', '123/A', or a Codeforces URL.",
    };
  }

  const { contestId, index } = parsedProblem;

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
      where: {
        contestId_index: {
          contestId,
          index,
        },
      },
      select: {
        runState: true,
        reviewStatus: true,
        generationAttempts: true,
        requestedCount: true,
      },
    });

    if (!problem) {
      return {
        error: `Problem ${contestId}${index} does not exist in our database.`,
      };
    }

    if (updated.count === 1) {
      if (isCompletedRunState(problem.runState)) {
        if (problem.reviewStatus === "INCORRECT") {
          return {
            error:
              "This problem is marked incorrect and needs maintainer review before it can be regenerated.",
          };
        }
        return {
          message: "This problem is already solved and available on Nudge!",
          problemHref: `/problem/${contestId}/${index}`,
        };
      }
      if (isRunningRunState(problem.runState)) {
        return {
          message: `Queued ${contestId}${index}; generation is now running.`,
          problemHref: `/problem/${contestId}/${index}`,
        };
      }
      if (problem.reviewStatus === "UNSOLVABLE") {
        return {
          error:
            "This problem is parked as unsolvable and needs maintainer review before another attempt.",
        };
      }
      if (problem.generationAttempts >= AUTOMATIC_GENERATION_MAX_ATTEMPTS) {
        return {
          error:
            "This problem exhausted its automatic attempts and needs maintainer review before another try.",
        };
      }

      return {
        message: `Queued ${contestId}${index}. It now has ${formatRequestCount(
          problem.requestedCount,
        )}; the next local generation run prioritizes requested problems.`,
        problemHref: `/problem/${contestId}/${index}`,
      };
    }

    if (isCompletedRunState(problem.runState)) {
      if (problem.reviewStatus === "INCORRECT") {
        return {
          error:
            "This problem is marked incorrect and needs maintainer review before it can be regenerated.",
        };
      }

      return {
        message: "This problem is already solved and available on Nudge!",
        problemHref: `/problem/${contestId}/${index}`,
      };
    }

    if (isRunningRunState(problem.runState)) {
      return {
        message: `Generation for ${contestId}${index} is already running.`,
        problemHref: `/problem/${contestId}/${index}`,
      };
    }

    if (problem.reviewStatus === "UNSOLVABLE") {
      return {
        error:
          "This problem is parked as unsolvable and needs maintainer review before another attempt.",
      };
    }

    if (problem.generationAttempts >= AUTOMATIC_GENERATION_MAX_ATTEMPTS) {
      return {
        error:
          "This problem exhausted its automatic attempts and needs maintainer review before another try.",
      };
    }

    if (problem.requestedCount >= REQUEST_PRIORITY_CAP) {
      return {
        message: `${contestId}${index} is already queued at maximum priority (${formatRequestCount(REQUEST_PRIORITY_CAP)}).`,
        problemHref: `/problem/${contestId}/${index}`,
      };
    }

    return {
      error: "Problem state changed while processing the request; try again.",
    };
  } catch (error) {
    console.error("requestProblem failed", error);
    return { error: "An error occurred while requesting the problem." };
  }
}
