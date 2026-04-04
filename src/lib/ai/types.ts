/**
 * Provider-agnostic tool definition for structured output.
 * Each provider translates this into its own API format.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
}

/**
 * A single request within a batch.
 */
export interface BatchRequest {
  customId: string;
  systemPrompt: string;
  userPrompt: string;
  tools: ToolDefinition[];
}

/**
 * The result of a single request in a completed batch.
 */
export interface BatchResult {
  customId: string;
  status: "succeeded" | "failed";
  /** The parsed input from the first tool call, if the request succeeded. */
  toolCallInput?: unknown;
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
  /** Unique identifier matching the `provider` column in ModelConfig (e.g. "anthropic"). */
  readonly id: string;

  /**
   * Submit a batch of requests for processing.
   * @returns An opaque batch ID for polling and result retrieval.
   */
  createBatch(modelId: string, requests: BatchRequest[]): Promise<string>;

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
