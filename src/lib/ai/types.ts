export interface OutputSchema {
  name: string;
  description: string;
  schema: Record<string, unknown>;
}

export interface BatchRequest {
  customId: string;
  systemPrompt: string;
  userPrompt:
    | string
    | Array<{
        type: "text" | "image_url";
        text?: string;
        image_url?: { url: string };
      }>;
  outputSchema: OutputSchema;
}

export interface BatchResult {
  customId: string;
  status: "succeeded" | "failed";
  // Parsed JSON output when the request succeeds
  output?: unknown;
  // Error text when the request fails
  error?: string;
}

export type BatchStatus = "processing" | "ended" | "failed";

// Shared provider interface for batch generation
export interface AIProvider {
  // Matches the provider column in ProviderModel like anthropic or openai
  readonly id: string;

  // Submit a batch and return a provider batch id for polling
  createBatch(
    modelId: string,
    requests: BatchRequest[],
    effort?: string,
  ): Promise<string>;

  // Check current batch status
  checkBatchStatus(batchId: string): Promise<BatchStatus>;

  // Stream results after checkBatchStatus returns ended
  getBatchResults(batchId: string): AsyncIterable<BatchResult>;
}
