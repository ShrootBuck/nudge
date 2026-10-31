import { z } from "zod";

// JSON can contain NUL; PostgreSQL text cannot.
const text = z.string().refine((value) => !value.includes("\0"));
const shortText = text.trim().min(1).max(500);
export const MAX_GENERATION_REQUEST_BYTES = 4 * 1024 * 1024;

export const generationResponseSchema = z.strictObject({
  outputText: text.max(1_500_000),
  responseId: shortText,
  displayName: shortText,
  resolvedModel: shortText.nullable(),
  finishReason: shortText.nullable(),
  nativeFinishReason: shortText.nullable(),
  providerName: shortText.nullable(),
  totalTokens: z.number().int().min(0).max(2_147_483_647).nullable(),
});

export const generationRequestSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("claim"), claimId: z.uuid() }),
  z.strictObject({
    action: z.literal("complete"),
    claimId: z.uuid(),
    response: generationResponseSchema,
    transcriptKey: z
      .string()
      .regex(/^[a-f0-9]{64}\.json$/)
      .nullable(),
  }),
  z.strictObject({
    action: z.literal("fail"),
    claimId: z.uuid(),
    reason: text.trim().min(1).max(4_000),
  }),
]);

export type GenerationRequest = z.infer<typeof generationRequestSchema>;
export type GenerationCompletion = Extract<
  GenerationRequest,
  { action: "complete" }
>;

export const generationResultSchema = z.discriminatedUnion("processed", [
  z.object({
    processed: z.literal(1),
    outcome: z.enum(["succeeded", "unsolvable"]),
    displayName: shortText,
    totalTokens: z.number().int().nullable(),
  }),
  z.object({
    processed: z.literal(0),
    outcome: z.literal("failed"),
    error: z.string(),
  }),
]);
export type GenerationResult = z.infer<typeof generationResultSchema>;

export const generationSelectionSchema = z.object({
  selectionReason: z.enum(["requested", "backfill"]),
  problem: z.object({
    id: z.string(),
    contestId: z.number().int(),
    index: z.string(),
    name: z.string(),
    rating: z.number().int().nullable(),
    tags: z.array(z.string()),
    requestedCount: z.number().int(),
    generationAttempts: z.number().int(),
    runState: z.enum(["IDLE", "RUNNING", "SUCCEEDED", "FAILED"]),
    generationTranscriptUrl: z.string().nullable(),
  }),
});
export const generationClaimSchema = generationSelectionSchema.extend({
  claimId: z.uuid(),
});
export type GenerationClaim = z.infer<typeof generationClaimSchema>;
