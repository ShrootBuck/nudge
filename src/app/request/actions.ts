"use server";

import { prisma } from "@/lib/prisma";

export async function requestProblem(_prevState: unknown, formData: FormData) {
  const urlOrId = formData.get("problem") as string;
  if (!urlOrId) {
    return { error: "Please provide a problem." };
  }

  let contestId: number;
  let index: string;

  // Try to parse URL or ID
  // e.g., https://codeforces.com/problemset/problem/123/A
  // e.g., https://codeforces.com/contest/123/problem/A
  // e.g., 123A, 123 A, 123/A
  const match = urlOrId.match(
    /(?:problem\/|contest\/|^\s*)(\d+)(?:\/problem\/|\/|\s+|)([A-Za-z][A-Za-z0-9]*)\b/,
  );

  if (match) {
    contestId = parseInt(match[1], 10);
    index = match[2].toUpperCase();
  } else {
    // try matching 123A
    const simpleMatch = urlOrId.match(/^(\d+)([A-Za-z][A-Za-z0-9]*)$/);
    if (simpleMatch) {
      contestId = parseInt(simpleMatch[1], 10);
      index = simpleMatch[2].toUpperCase();
    } else {
      return {
        error:
          "Could not parse problem ID or URL. Please use format like '123 A' or a Codeforces URL.",
      };
    }
  }

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
      if (problem.generationStatus === "COMPLETED") {
        return {
          message: "This problem is already solved and available on Nudge!",
        };
      }

      // Mark as requested
      await prisma.problem.update({
        where: { id: problem.id },
        data: { requested: true },
      });
      return {
        message: `Problem ${contestId}${index} has been requested and prioritized!`,
      };
    }

    return {
      error: `Problem ${contestId}${index} does not exist in our database.`,
    };
  } catch (e) {
    console.error(e);
    return { error: "An error occurred while requesting the problem." };
  }
}
