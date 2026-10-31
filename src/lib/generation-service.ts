import type { Problem } from "@prisma/client";
import { recordGenerationUsage } from "./ai/usage";
import { safeRevalidateTags } from "./cache-revalidate";
import { CURRENT_MODEL_TAG, PROBLEM_LIST_TAG, problemTag } from "./cache-tags";
import { formatProblemId } from "./codeforces-problem";
import { discordLog } from "./discord-log";
import { SITE_URL } from "./env";
import { problemResultSchema } from "./generate-content/content-schema";
import { saveProblemContent } from "./generate-content/persistence";
import type {
  GenerationRequest,
  GenerationResult,
} from "./generation-contract";
import { prisma } from "./prisma";
import { readTranscript, TRANSCRIPT_ROUTE } from "./transcript-storage";

export class GenerationConflict extends Error {}
export class GenerationInputError extends Error {}

function savedResult(problem: Problem): GenerationResult {
  if (
    problem.runState === "SUCCEEDED" ||
    problem.reviewStatus === "UNSOLVABLE"
  ) {
    return {
      processed: 1,
      outcome: problem.runState === "SUCCEEDED" ? "succeeded" : "unsolvable",
      displayName: problem.generatedByDisplayName ?? "Unknown",
      totalTokens: problem.generationTotalTokens,
    };
  }
  return {
    processed: 0,
    outcome: "failed",
    error: problem.lastGenerationError ?? "Generation failed",
  };
}

export async function finishGeneration(
  submission: Exclude<GenerationRequest, { action: "claim" }>,
) {
  const finished = await prisma.$transaction(
    async (tx) => {
      // Hold the claim's row lock until all writes commit. A stale worker cannot
      // overwrite a later run, and retried completions cannot double-save usage.
      await tx.$queryRaw`SELECT "id" FROM "Problem" WHERE "generationClaimId" = ${submission.claimId} FOR UPDATE`;
      const problem = await tx.problem.findUnique({
        where: { generationClaimId: submission.claimId },
      });
      if (!problem || problem.runState === "IDLE")
        throw new GenerationConflict("Generation claim is no longer active");
      if (problem.runState !== "RUNNING")
        return { problem, result: savedResult(problem), changed: false };

      let error: string | null =
        submission.action === "fail" ? submission.reason : null;
      if (submission.action === "complete") {
        const { response, transcriptKey } = submission;
        if (transcriptKey) {
          await readTranscript(transcriptKey).catch(
            (cause: NodeJS.ErrnoException) => {
              if (cause.code === "ENOENT")
                throw new GenerationInputError(
                  "Transcript has not been uploaded",
                );
              throw cause;
            },
          );
        }
        const transcriptUrl = transcriptKey
          ? new URL(`${TRANSCRIPT_ROUTE}${transcriptKey}`, SITE_URL).href
          : null;
        const audit = { ...response, transcriptUrl };
        const existingUsage = await tx.aiGenerationUsage.findUnique({
          where: { responseId: response.responseId },
          select: { problemId: true },
        });
        if (existingUsage && existingUsage.problemId !== problem.id)
          throw new GenerationInputError(
            "Response ID belongs to another problem",
          );
        await recordGenerationUsage({
          problemId: problem.id,
          response,
          client: tx,
        });

        const parsed = (() => {
          try {
            return problemResultSchema.parse(JSON.parse(response.outputText));
          } catch {
            error = "Generated output failed content validation";
            return null;
          }
        })();
        if (parsed?.status === "success") {
          await saveProblemContent(problem.id, parsed, audit, tx);
        } else {
          error ??=
            parsed?.reason ?? "Generated output failed content validation";
          await tx.problem.update({
            where: { id: problem.id },
            data: {
              runState: "FAILED",
              reviewStatus:
                parsed?.status === "unsolvable" ? "UNSOLVABLE" : "UNREVIEWED",
              generationStartedAt: null,
              lastGenerationError: error,
              generatedByDisplayName: response.displayName,
              generatedByModel: response.resolvedModel,
              generationResponseId: response.responseId,
              generationFinishReason: response.finishReason,
              generationNativeFinishReason: response.nativeFinishReason,
              generationProviderName: response.providerName,
              generationTotalTokens: response.totalTokens,
              generationTranscriptUrl: transcriptUrl,
            },
          });
        }
      } else {
        await tx.problem.update({
          where: { id: problem.id },
          data: {
            runState: "FAILED",
            generationStartedAt: null,
            lastGenerationError: error,
          },
        });
      }
      const updated = await tx.problem.findUniqueOrThrow({
        where: { id: problem.id },
      });
      return { problem: updated, result: savedResult(updated), changed: true };
    },
    { maxWait: 15_000, timeout: 30_000 },
  );

  const { problem, result, changed } = finished;
  // Retry cache invalidation even when the database already committed a prior request.
  await safeRevalidateTags(
    [
      PROBLEM_LIST_TAG,
      CURRENT_MODEL_TAG,
      problemTag(problem.contestId, problem.index),
    ],
    "expire",
  );
  if (changed && result.processed === 1) {
    const label = formatProblemId(problem.contestId, problem.index);
    const detail =
      result.outcome === "unsolvable"
        ? `🚫 **${label}** reported unsolvable: ${problem.lastGenerationError?.slice(0, 1500)}`
        : `⚡ Generated **${label}** using ${result.displayName}`;
    await discordLog({
      content: `${detail}\n${SITE_URL}/problem/${problem.contestId}/${problem.index}`,
    });
  }
  return result;
}
