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
  output?: unknown;
  error?: string;
  tokensUsed?: number;
}

export type BatchStatus = "processing" | "ended" | "failed";

export interface AIProvider {
  readonly id: string;

  createBatch(
    modelId: string,
    requests: BatchRequest[],
    effort?: string,
  ): Promise<string>;

  checkBatchStatus(batchId: string): Promise<BatchStatus>;

  getBatchResults(batchId: string): AsyncIterable<BatchResult>;
}
