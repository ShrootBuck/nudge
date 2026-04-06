import OpenAI from "openai";
import { normalizeEffort, validateEffortForProvider } from "./effort";
import type {
  AIProvider,
  BatchRequest,
  BatchResult,
  BatchStatus,
} from "./types";

type OpenAIEffort = "none" | "low" | "medium" | "high" | "xhigh";

type OpenAIBatchError = {
  code?: string;
  message?: string;
};

type OpenAIBatchOutputMessageContent = {
  type?: string;
  text?: string;
  refusal?: string;
};

type OpenAIBatchOutputItem = {
  type?: string;
  text?: string;
  content?: OpenAIBatchOutputMessageContent[];
};

type OpenAIBatchLine = {
  custom_id?: string;
  error?: OpenAIBatchError | null;
  response?: {
    status_code?: number;
    body?: {
      error?: OpenAIBatchError | null;
      status?: string;
      incomplete_details?: {
        reason?: string;
      } | null;
      output_text?: string;
      output?: OpenAIBatchOutputItem[];
    } | null;
  } | null;
};

function parseOpenAIEffort(
  effort: string | undefined,
): OpenAIEffort | undefined {
  const normalizedEffort = normalizeEffort(effort);
  if (!normalizedEffort) {
    return undefined;
  }

  const validation = validateEffortForProvider("openai", normalizedEffort);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  return validation.effort as OpenAIEffort;
}

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

function extractOutputText(
  body: NonNullable<OpenAIBatchLine["response"]>["body"],
) {
  if (!body) {
    return null;
  }

  if (
    typeof body.output_text === "string" &&
    body.output_text.trim().length > 0
  ) {
    return body.output_text;
  }

  for (const item of body.output ?? []) {
    if (
      (item.type === "output_text" || item.type === "text") &&
      typeof item.text === "string" &&
      item.text.trim().length > 0
    ) {
      return item.text;
    }

    if (item.type === "message") {
      for (const contentItem of item.content ?? []) {
        if (
          contentItem.type === "output_text" &&
          typeof contentItem.text === "string" &&
          contentItem.text.trim().length > 0
        ) {
          return contentItem.text;
        }
      }
    }
  }

  return null;
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

  const jsonString = extractOutputText(responseBody);

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

  if (
    responseBody.status === "incomplete" &&
    responseBody.incomplete_details?.reason === "max_output_tokens"
  ) {
    return {
      customId: result.custom_id,
      status: "failed",
      error:
        "Response incomplete (max_output_tokens): likely exhausted reasoning/output budget before final JSON",
    };
  }

  return {
    customId: result.custom_id,
    status: "failed",
    error: `No text content in response output${responseBody.status ? ` (status ${responseBody.status})` : ""}`,
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
    const parsedEffort = parseOpenAIEffort(effort);

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
          ...(parsedEffort ? { reasoning: { effort: parsedEffort } } : {}),
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
