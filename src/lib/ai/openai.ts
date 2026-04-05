import OpenAI from "openai";
import type {
  AIProvider,
  BatchRequest,
  BatchResult,
  BatchStatus,
} from "./types";

type OpenAIBatchError = {
  code?: string;
  message?: string;
};

type OpenAIBatchLine = {
  custom_id?: string;
  error?: OpenAIBatchError | null;
  response?: {
    status_code?: number;
    body?: {
      error?: OpenAIBatchError | null;
      output_text?: string;
      output?: Array<{
        type?: string;
        text?: string;
        name?: string;
        arguments?: string;
      }>;
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    } | null;
  } | null;
};

function formatOpenAIBatchError(
  error: OpenAIBatchError | null | undefined,
  fallback: string,
) {
  if (!error) {
    return fallback;
  }

  return error.code
    ? `${error.code}: ${error.message ?? fallback}`
    : (error.message ?? fallback);
}

function parseBatchLine(line: string): BatchResult {
  const result = JSON.parse(line) as OpenAIBatchLine;

  if (!result.custom_id) {
    throw new Error("Batch result line is missing custom_id");
  }

  if (result.error) {
    return {
      customId: result.custom_id,
      status: "failed",
      error: formatOpenAIBatchError(result.error, "Unknown error"),
    };
  }

  const responseBody = result.response?.body;
  if (!responseBody) {
    const statusCode = result.response?.status_code;
    return {
      customId: result.custom_id,
      status: "failed",
      error: statusCode
        ? `No response body in batch result (status ${statusCode})`
        : "No response body in batch result",
    };
  }

  if (responseBody.error) {
    return {
      customId: result.custom_id,
      status: "failed",
      error: formatOpenAIBatchError(responseBody.error, "Unknown error"),
    };
  }

  // Responses API returns output_text or an output array
  let jsonString = responseBody.output_text;
  if (!jsonString && responseBody.output) {
    const textOutput = responseBody.output.find((item) => item.type === "text");
    if (textOutput?.text) {
      jsonString = textOutput.text;
    }
  }

  // Chat Completions API fallback
  if (!jsonString && responseBody.choices?.[0]?.message?.content) {
    jsonString = responseBody.choices[0].message.content;
  }

  if (jsonString) {
    try {
      return {
        customId: result.custom_id,
        status: "succeeded",
        output: JSON.parse(jsonString),
      };
    } catch (error) {
      return {
        customId: result.custom_id,
        status: "failed",
        error: `Invalid JSON output: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  return {
    customId: result.custom_id,
    status: "failed",
    error: "No text content in response output",
  };
}

/**
 * Recursively enforce OpenAI strict-mode constraints on a JSON Schema:
 * - Every object must have `additionalProperties: false`
 * - Every object must list ALL its properties in `required`
 *
 * @see https://developers.openai.com/api/docs/guides/structured-outputs
 */
function enforceStrictSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const copy = { ...schema };

  if (copy.type === "object" && copy.properties) {
    const props = copy.properties as Record<string, Record<string, unknown>>;
    copy.properties = Object.fromEntries(
      Object.entries(props).map(([key, value]) => [
        key,
        enforceStrictSchema(value),
      ]),
    );
    copy.additionalProperties = false;

    // Strict mode requires every property to appear in `required`
    if (!copy.required) {
      copy.required = Object.keys(props);
    }
  }

  if (copy.type === "array" && copy.items) {
    copy.items = enforceStrictSchema(copy.items as Record<string, unknown>);
  }

  if (Array.isArray(copy.anyOf)) {
    copy.anyOf = copy.anyOf.map((s) =>
      enforceStrictSchema(s as Record<string, unknown>),
    );
  }

  return copy;
}

export class OpenAIProvider implements AIProvider {
  readonly id = "openai";
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI(); // uses OPENAI_API_KEY env var
    }
    return this.client;
  }

  private async readBatchResultsFile(fileId: string): Promise<BatchResult[]> {
    const fileContent = await this.getClient().files.content(fileId);
    const text = await fileContent.text();

    return text
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map(parseBatchLine);
  }

  async createBatch(
    modelId: string,
    requests: BatchRequest[],
    effort?: string,
  ): Promise<string> {
    const jsonlLines = requests.map((req) => {
      const inputContent =
        typeof req.userPrompt === "string"
          ? req.userPrompt
          : [
              {
                type: "message" as const,
                role: "user" as const,
                content: req.userPrompt.map((item) => {
                  if (item.type === "text") {
                    return { type: "input_text", text: item.text };
                  }
                  if (item.type === "image_url") {
                    return {
                      type: "input_image",
                      image_url: item.image_url?.url,
                    };
                  }
                  return item;
                }),
              },
            ];

      const batchItem = {
        custom_id: req.customId,
        method: "POST" as const,
        url: "/v1/responses",
        body: {
          model: modelId,
          instructions: req.systemPrompt,
          input: inputContent,
          text: {
            format: {
              type: "json_schema" as const,
              name: req.outputSchema.name,
              description: req.outputSchema.description,
              strict: true,
              schema: enforceStrictSchema(req.outputSchema.schema),
            },
          },
          max_output_tokens: 128000,
          ...(effort && { reasoning: { effort } }),
        },
      };
      return JSON.stringify(batchItem);
    });

    const jsonlContent = jsonlLines.join("\n");

    // Upload the JSONL file
    const file = await this.getClient().files.create({
      file: new File([jsonlContent], "batch.jsonl", {
        type: "application/jsonl",
      }),
      purpose: "batch",
    });

    // Create the batch
    const batch = await this.getClient().batches.create({
      input_file_id: file.id,
      endpoint: "/v1/responses",
      completion_window: "24h",
    });

    return batch.id;
  }

  async checkBatchStatus(batchId: string): Promise<BatchStatus> {
    const batch = await this.getClient().batches.retrieve(batchId);

    switch (batch.status) {
      case "completed":
      case "expired":
        return "ended";
      case "failed":
      case "cancelled":
        return "failed";
      default:
        // "validating", "in_progress", "finalizing", "cancelling"
        return "processing";
    }
  }

  async *getBatchResults(batchId: string): AsyncIterable<BatchResult> {
    const batch = await this.getClient().batches.retrieve(batchId);
    const results = new Map<string, BatchResult>();

    for (const fileId of [batch.error_file_id, batch.output_file_id]) {
      if (!fileId) {
        continue;
      }

      const fileResults = await this.readBatchResultsFile(fileId);
      for (const result of fileResults) {
        results.set(result.customId, result);
      }
    }

    if (results.size === 0) {
      throw new Error(
        `Batch ${batchId} has no output or error file (status ${batch.status}, completed=${batch.request_counts?.completed ?? 0}, failed=${batch.request_counts?.failed ?? 0})`,
      );
    }

    for (const result of results.values()) {
      yield result;
    }
  }
}
