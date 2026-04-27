import { revalidateTag } from "next/cache";
import { PROBLEM_LIST_TAG, problemTag } from "../../lib/cache-tags";
import { prisma } from "../../lib/prisma";
import {
  pipelineStateData,
  problemUpdateData,
} from "../../lib/problem-pipeline-db";
import type { ParsedContent } from "./content-schema";

export type ModelInfo = { provider: string; modelId: string };

export async function saveProblemContent(
  problemId: string,
  parsed: ParsedContent,
  model: ModelInfo,
) {
  const updatedProblem = await prisma.$transaction(async (tx) => {
    await tx.hint.deleteMany({ where: { problemId } });
    await tx.editorial.deleteMany({ where: { problemId } });
    await tx.solution.deleteMany({ where: { problemId } });

    await Promise.all(
      parsed.hints.map((hint) =>
        tx.hint.create({
          data: {
            problemId,
            order: hint.order,
            content: hint.content,
          },
        }),
      ),
    );

    await tx.editorial.create({
      data: { problemId, content: parsed.editorial },
    });

    await tx.solution.create({
      data: { problemId, content: parsed.solution },
    });

    return tx.problem.update({
      where: { id: problemId },
      data: problemUpdateData({
        ...pipelineStateData("READY", "SUCCEEDED"),
        generatedByProvider: model.provider,
        generatedByModel: model.modelId,
        activeBatchId: null,
        processingStartedAt: null,
        lastGenerationError: null,
      }),
      select: {
        contestId: true,
        index: true,
      },
    });
  });

  revalidateTag(PROBLEM_LIST_TAG, "max");
  revalidateTag(
    problemTag(updatedProblem.contestId, updatedProblem.index),
    "max",
  );
}
