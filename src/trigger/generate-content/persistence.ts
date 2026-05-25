import { safeRevalidateTag } from "../../lib/cache-revalidate";
import { PROBLEM_LIST_TAG, problemTag } from "../../lib/cache-tags";
import { prisma } from "../../lib/prisma";
import {
  pipelineStateData,
  problemUpdateData,
} from "../../lib/problem-pipeline-db";
import type { ParsedContent } from "./content-schema";

export type GenerationAuditInfo = {
  displayName: string;
  responseId: string;
  resolvedModel: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  costCredits: number | null;
  finishReason: string | null;
  nativeFinishReason: string | null;
  providerName: string | null;
};

export async function saveProblemContent(
  problemId: string,
  parsed: ParsedContent,
  generation: GenerationAuditInfo,
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
        ...pipelineStateData("SUCCEEDED"),
        generatedByDisplayName: generation.displayName,
        generatedByModel: generation.resolvedModel,
        generationResponseId: generation.responseId,
        generationPromptTokens: generation.promptTokens,
        generationCompletionTokens: generation.completionTokens,
        generationTotalTokens: generation.totalTokens,
        generationCostCredits: generation.costCredits,
        generationFinishReason: generation.finishReason,
        generationNativeFinishReason: generation.nativeFinishReason,
        generationProviderName: generation.providerName,
        generationStartedAt: null,
        lastGenerationError: null,
      }),
      select: {
        contestId: true,
        index: true,
      },
    });
  });

  safeRevalidateTag(PROBLEM_LIST_TAG, "max");
  safeRevalidateTag(
    problemTag(updatedProblem.contestId, updatedProblem.index),
    "max",
  );
}
