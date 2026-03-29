"use server";

import { prisma } from "@/lib/prisma";

export async function verifyProblem(problemId: string, password: string) {
  if (password !== process.env.VERIFY_PASSWORD) {
    return { success: false, error: "Wrong password" } as const;
  }

  await prisma.problem.update({
    where: { id: problemId },
    data: { verified: true },
  });

  return { success: true } as const;
}
