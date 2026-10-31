import {
  generationRequestSchema,
  MAX_GENERATION_REQUEST_BYTES,
} from "@/lib/generation-contract";
import {
  selectAndClaimNextAutomaticGenerationProblem,
  selectNextAutomaticGenerationProblem,
} from "@/lib/generation-queue";
import {
  finishGeneration,
  GenerationConflict,
  GenerationInputError,
} from "@/lib/generation-service";
import { authorizedServiceRequest } from "@/lib/service-auth";

const privateHeaders = { "Cache-Control": "private, no-store" };
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: privateHeaders });
}

export async function GET(request: Request) {
  if (!authorizedServiceRequest(request))
    return json({ error: "Unauthorized" }, 401);
  return json(await selectNextAutomaticGenerationProblem());
}

export async function POST(request: Request) {
  if (!authorizedServiceRequest(request))
    return json({ error: "Unauthorized" }, 401);
  if (!request.body) return json({ error: "Missing body" }, 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_GENERATION_REQUEST_BYTES) {
        await reader.cancel();
        return json({ error: "Request too large" }, 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const parsed = (() => {
    try {
      return generationRequestSchema.safeParse(
        JSON.parse(Buffer.concat(chunks).toString("utf8")),
      );
    } catch {
      return null;
    }
  })();
  if (!parsed?.success)
    return json({ error: "Invalid generation request" }, 400);
  try {
    const submission = parsed.data;
    if (submission.action === "claim") {
      const selection = await selectAndClaimNextAutomaticGenerationProblem(
        submission.claimId,
      );
      if (selection && selection.problem.runState !== "RUNNING")
        throw new GenerationConflict("Generation claim already finished");
      return json(
        selection ? { ...selection, claimId: submission.claimId } : null,
      );
    }
    return json(await finishGeneration(submission));
  } catch (error) {
    if (error instanceof GenerationConflict)
      return json({ error: error.message }, 409);
    if (error instanceof GenerationInputError)
      return json({ error: error.message }, 400);
    console.error("Generation API failed", error);
    return json({ error: "Generation request failed" }, 500);
  }
}
