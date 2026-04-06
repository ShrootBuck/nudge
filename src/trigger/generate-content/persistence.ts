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
  await prisma.$transaction([
    prisma.hint.deleteMany({ where: { problemId } }),
    prisma.editorial.deleteMany({ where: { problemId } }),
    prisma.solution.deleteMany({ where: { problemId } }),

    ...parsed.hints.map((hint) =>
      prisma.hint.create({
        data: {
          problemId,
          order: hint.order,
          content: hint.content,
        },
      }),
    ),

    prisma.editorial.create({
      data: { problemId, content: parsed.editorial },
    }),

    prisma.solution.create({
      data: { problemId, content: parsed.solution },
    }),

    prisma.problem.update({
      where: { id: problemId },
      data: problemUpdateData({
        ...pipelineStateData("READY", "SUCCEEDED"),
        generatedByProvider: model.provider,
        generatedByModel: model.modelId,
        activeBatchId: null,
        processingStartedAt: null,
        lastGenerationError: null,
      }),
    }),
  ]);
}
