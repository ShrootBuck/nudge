import type {
  AIProvider,
  BatchRequest,
  BatchResult,
  BatchStatus,
} from "./types";

/**
 * OpenAI Batch API provider (stub).
 *
 * To implement:
 * 1. `bun add openai`
 * 2. Fill in the three methods below using OpenAI's Batch API:
 *    - Upload a JSONL file of chat completion requests
 *    - Create a batch referencing that file
 *    - Poll for completion
 *    - Download and parse the result JSONL
 *
 * Tool calls map to OpenAI's function calling — convert ToolDefinition into
 * the `tools` array format with `{ type: "function", function: { ... } }`.
 *
 * @see https://platform.openai.com/docs/guides/batch
 */
export class OpenAIProvider implements AIProvider {
  readonly id = "openai";

  async createBatch(
    _modelId: string,
    _requests: BatchRequest[],
  ): Promise<string> {
    // TODO: implement
    // 1. Convert requests to OpenAI chat completion format
    // 2. Upload JSONL via files.create()
    // 3. Create batch via batches.create()
    // 4. Return batch.id
    throw new Error(
      'OpenAI provider not yet implemented. Install "openai" and fill in the batch methods.',
    );
  }

  async checkBatchStatus(_batchId: string): Promise<BatchStatus> {
    // TODO: implement
    // Map OpenAI statuses: "completed" → "ended", "failed"/"expired" → "failed", else "processing"
    throw new Error("OpenAI provider not yet implemented.");
  }

  // biome-ignore lint/correctness/useYield: stub — will yield once implemented
  async *getBatchResults(_batchId: string): AsyncIterable<BatchResult> {
    // TODO: implement
    // 1. Download output file via files.content()
    // 2. Parse JSONL lines
    // 3. Extract tool_calls[0].function.arguments from each response
    // 4. Yield BatchResult for each entry
    throw new Error("OpenAI provider not yet implemented.");
  }
}
