"use server";

import { prisma } from "@/lib/prisma";
import { resolveRunState } from "@/lib/problem-pipeline";
import { problemUpdateData } from "@/lib/problem-pipeline-db";

const MAX_REQUESTED_COUNT = 2_000_000_000;

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

export async function requestProblem(_prevState: unknown, formData: FormData) {
  const input = toProblemInput(formData.get("problem"));
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
    // See if the problem exists in the db
    const problem = await prisma.problem.findUnique({
      where: {
        contestId_index: {
          contestId,
          index,
        },
      },
    });

    if (problem) {
      const problemRecord = problem as Record<string, unknown>;
      const runState = resolveRunState(
        typeof problemRecord.runState === "string"
          ? problemRecord.runState
          : null,
      );

      const currentRequestedCount =
        typeof problemRecord.requestedCount === "number"
          ? Math.max(0, Math.trunc(problemRecord.requestedCount))
          : 0;

      if (runState === "SUCCEEDED") {
        return {
          message: "This problem is already solved and available on Nudge!",
        };
      }

      await prisma.problem.update({
        where: { id: problem.id },
        data: problemUpdateData({
          requestedCount: Math.min(
            currentRequestedCount + 1,
            MAX_REQUESTED_COUNT,
          ),
          requestedAt: new Date(),
        }),
      });

      return {
        message: `Problem ${contestId}${index} has been requested and prioritized!`,
      };
    }

    return {
      error: `Problem ${contestId}${index} does not exist in our database.`,
    };
  } catch {
    return { error: "An error occurred while requesting the problem." };
  }
}
