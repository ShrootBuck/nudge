/**
 * Provider-agnostic schema definition for structured output.
 */
export interface OutputSchema {
  name: string;
  description: string;
  schema: Record<string, unknown>;
}

/**
 * A single request within a batch.
 */
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

/**
 * The result of a single request in a completed batch.
 */
export interface BatchResult {
  customId: string;
  status: "succeeded" | "failed";
  /** The parsed JSON output if the request succeeded. */
  output?: unknown;
  /** Error description if the request failed. */
  error?: string;
}

export type BatchStatus = "processing" | "ended" | "failed";

/**
 * An AI provider that can process batches of generation requests.
 *
 * Providers are responsible for translating the generic batch interface
 * into their own API calls (Anthropic Batch API, OpenAI Batch API, etc.)
 * and parsing vendor-specific responses back into a common format.
 */
export interface AIProvider {
  /** Unique identifier matching the `provider` column in ProviderModel (e.g. "anthropic"). */
  readonly id: string;

  /**
   * Submit a batch of requests for processing.
   * @param effort Optional reasoning-effort level (provider-native string, e.g. "low" | "medium" | "high" | "max").
   * @returns An opaque batch ID for polling and result retrieval.
   */
  createBatch(
    modelId: string,
    requests: BatchRequest[],
    effort?: string,
  ): Promise<string>;

  /**
   * Check the current status of a previously submitted batch.
   */
  checkBatchStatus(batchId: string): Promise<BatchStatus>;

  /**
   * Stream results for a completed batch.
   * Should only be called after `checkBatchStatus` returns `"ended"`.
   */
  getBatchResults(batchId: string): AsyncIterable<BatchResult>;
}
