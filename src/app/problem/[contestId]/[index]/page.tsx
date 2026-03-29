import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProblemContent } from "./problem-content";

export default async function ProblemPage({
  params,
}: {
  params: Promise<{ contestId: string; index: string }>;
}) {
  const { contestId, index } = await params;
  const contestIdNum = Number.parseInt(contestId, 10);

  if (Number.isNaN(contestIdNum)) notFound();

  const problem = await prisma.problem.findUnique({
    where: {
      contestId_index: { contestId: contestIdNum, index: index.toUpperCase() },
    },
    include: {
      hints: { orderBy: { order: "asc" } },
      editorial: true,
      solution: true,
    },
  });

  if (!problem) notFound();

  return <ProblemContent problem={problem} />;
}
