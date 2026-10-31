import type { Prisma } from "@prisma/client";
import { pipelineStateData, problemUpdateData } from "../problem-pipeline-db";
import type { ParsedContent } from "./content-schema";

export type GenerationAuditInfo = {
  displayName: string;
  responseId: string;
  resolvedModel: string | null;
  finishReason: string | null;
  nativeFinishReason: string | null;
  providerName: string | null;
  totalTokens: number | null;
  transcriptUrl: string | null;
};

// The caller owns the transaction so content, usage, and claim completion commit together.
export async function saveProblemContent(
  problemId: string,
  parsed: ParsedContent,
  generation: GenerationAuditInfo,
  tx: Prisma.TransactionClient,
) {
  await tx.hint.deleteMany({ where: { problemId } });
  await tx.editorial.deleteMany({ where: { problemId } });
  await tx.solution.deleteMany({ where: { problemId } });

  if (parsed.hints.length > 0) {
    await tx.hint.createMany({
      data: parsed.hints.map((hint) => ({
        problemId,
        order: hint.order,
        content: hint.content,
      })),
    });
  }

  await tx.editorial.create({
    data: { problemId, content: parsed.editorial },
  });

  await tx.solution.create({
    data: { problemId, content: parsed.solution },
  });

  await tx.problem.update({
    where: { id: problemId },
    data: problemUpdateData({
      ...pipelineStateData("SUCCEEDED"),
      generatedByDisplayName: generation.displayName,
      generatedByModel: generation.resolvedModel,
      generationResponseId: generation.responseId,
      generationFinishReason: generation.finishReason,
      generationNativeFinishReason: generation.nativeFinishReason,
      generationProviderName: generation.providerName,
      generationTotalTokens: generation.totalTokens,
      generationTranscriptUrl: generation.transcriptUrl,
      generationStartedAt: null,
      lastGenerationError: null,
    }),
    select: {
      contestId: true,
      index: true,
    },
  });

  await tx.siteState.upsert({
    where: { id: "global" },
    create: { id: "global", currentModel: generation.displayName },
    update: { currentModel: generation.displayName },
  });
}
