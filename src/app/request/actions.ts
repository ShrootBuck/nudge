"use server";

import type { RunState } from "@prisma/client";
import { ApiError } from "@trigger.dev/sdk";
import {
  formatOpenAIDailyTokenUsage,
  getOpenAIDailyTokenUsage,
} from "@/lib/ai/token-budget";
import { getOptionalEnv, verifyAdminPassword } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { triggerGenerateContentTask } from "@/lib/trigger-tasks";

const PROBLEM_IDENTIFIER_PATTERN =
  /^(\d+)\s*(?:\/|\s)?\s*([A-Za-z][A-Za-z0-9]*)$/;
const URL_SUFFIX_PATTERN = /(\d+)\/(?:problem\/)?([A-Za-z][A-Za-z0-9]*)$/i;
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
  if (!Number.isSafeInteger(contestId) || contestId <= 0) {
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
    if (!Number.isSafeInteger(contestId) || contestId <= 0) {
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

function formatTriggerError(error: unknown) {
  if (error instanceof ApiError) {
    const status = error.status;
    const baseMessage =
      error.message?.trim() || "Trigger.dev rejected the request";
    let hint = "";

    if (status === 422) {
      hint =
        "This usually means the task is not deployed to this environment, the request is locked to an old TRIGGER_VERSION, or the payload is invalid.";
    } else if (status === 401 || status === 403) {
      hint = "Check TRIGGER_SECRET_KEY and project access.";
    }

    return {
      userMessage: `${baseMessage}${status ? ` (status ${status})` : ""}${
        hint ? ` ${hint}` : ""
      }`,
      logContext: {
        status,
        code: error.code,
        type: error.type,
        param: error.param,
        error: error.error,
      },
    };
  }

  if (error instanceof Error) {
    return {
      userMessage: error.message || "Unexpected error",
      logContext: { message: error.message, stack: error.stack },
    };
  }

  return {
    userMessage: "Unexpected error",
    logContext: { error },
  };
}

export async function requestProblem(_prevState: unknown, formData: FormData) {
  const input = toProblemInput(formData.get("problem"));
  const adminPassword = toProblemInput(formData.get("adminPassword"));
  if (!input) {
    return { error: "Please provide a problem." };
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
    const problem = await prisma.problem.findUnique({
      where: {
        contestId_index: {
          contestId,
          index,
        },
      },
      select: {
        id: true,
        runState: true,
      },
    });

    if (problem) {
      if (isCompletedRunState(problem.runState)) {
        return {
          message: "This problem is already solved and available on Nudge!",
          problemHref: `/problem/${contestId}/${index}`,
        };
      }

      if (!adminPassword) {
        return {
          error:
            "Automatic queueing is disabled right now. Use admin bypass to generate immediately.",
        };
      }

      const auth = verifyAdminPassword(adminPassword);
      if (!auth.ok) {
        return { error: auth.error };
      }

      if (!getOptionalEnv("TRIGGER_SECRET_KEY")) {
        return {
          error:
            "Trigger.dev is not configured on the server (missing TRIGGER_SECRET_KEY).",
        };
      }

      const budget = await getOpenAIDailyTokenUsage();
      if (budget.exhausted) {
        return {
          error: `OpenAI daily token grant exhausted (${formatOpenAIDailyTokenUsage(
            budget,
          )}).`,
        };
      }

      try {
        await triggerGenerateContentTask({
          problemId: problem.id,
          adminBypass: true,
        });

        return {
          message: `Admin bypass activated! Generation for ${contestId}${index} started immediately.`,
        };
      } catch (error) {
        const details = formatTriggerError(error);
        console.error("Admin bypass trigger failed", {
          problemId: problem.id,
          contestId,
          index,
          triggerVersion: process.env.TRIGGER_VERSION,
          ...details.logContext,
        });

        return {
          error: `Admin bypass failed to start generation. ${details.userMessage}`,
        };
      }
    }

    return {
      error: `Problem ${contestId}${index} does not exist in our database.`,
    };
  } catch (error) {
    console.error("requestProblem failed", error);
    return { error: "An error occurred while requesting the problem." };
  }
}
