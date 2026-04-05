import OpenAI from "openai";
import type {
  AIProvider,
  BatchRequest,
  BatchResult,
  BatchStatus,
  ToolDefinition,
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
      output?: Array<{
        type?: string;
        arguments?: string;
      }>;
      choices?: Array<{
        message?: {
          tool_calls?: Array<{
            function?: {
              arguments?: string;
            };
          }>;
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

  const responseToolCallArguments = responseBody.output?.find(
    (item) => item.type === "function_call",
  )?.arguments;

  if (responseToolCallArguments) {
    try {
      return {
        customId: result.custom_id,
        status: "succeeded",
        toolCallInput: JSON.parse(responseToolCallArguments),
      };
    } catch (error) {
      return {
        customId: result.custom_id,
        status: "failed",
        error: `Invalid tool call JSON: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  if (responseBody.output) {
    return {
      customId: result.custom_id,
      status: "failed",
      error: "No function call in response output",
    };
  }

  const choice = responseBody.choices?.[0];
  if (!choice) {
    return {
      customId: result.custom_id,
      status: "failed",
      error: "No choice in response",
    };
  }

  const toolCallArguments =
    choice.message?.tool_calls?.[0]?.function?.arguments;
  if (!toolCallArguments) {
    return {
      customId: result.custom_id,
      status: "failed",
      error: "No tool call in response",
    };
  }

  try {
    return {
      customId: result.custom_id,
      status: "succeeded",
      toolCallInput: JSON.parse(toolCallArguments),
    };
  } catch (error) {
    return {
      customId: result.custom_id,
      status: "failed",
      error: `Invalid tool call JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
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
    copy.items = enforceStrictSchema(
      copy.items as Record<string, unknown>,
    );
  }

  return copy;
}

/** Convert a generic tool definition into OpenAI's function format. */
function toOpenAITool(tool: ToolDefinition) {
  return {
    type: "function" as const,
    name: tool.name,
    description: tool.description,
    parameters: enforceStrictSchema({
      type: "object" as const,
      properties: tool.parameters.properties,
      required: tool.parameters.required,
    }),
    strict: true,
  };
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
    // GPT-5 batch models reject function tools + reasoning effort on
    // /v1/chat/completions, so use the Responses API for batch generation.
    const jsonlLines = requests.map((req) => {
      const batchItem = {
        custom_id: req.customId,
        method: "POST" as const,
        url: "/v1/responses",
        body: {
          model: modelId,
          instructions: req.systemPrompt,
          input: req.userPrompt,
          tools: req.tools.map(toOpenAITool),
          tool_choice: "required" as const,
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
