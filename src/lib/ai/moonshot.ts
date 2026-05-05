import OpenAI from "openai";
import { getRequiredEnv } from "../env";
import { validateEffortForProvider } from "./effort";
import type {
  AIProvider,
  BatchRequest,
  BatchResult,
  BatchStatus,
  OutputSchema,
} from "./types";

type MoonshotEffort = "enabled" | "disabled";

type MoonshotBatchError = {
  code?: string;
  message?: string;
};

type MoonshotBatchLine = {
  custom_id?: string;
  error?: MoonshotBatchError | null;
  response?: {
    status_code?: number;
    body?: {
      error?: MoonshotBatchError | null;
      choices?: Array<{
        message?: {
          content?: string | null;
        } | null;
        finish_reason?: string | null;
      }>;
    } | null;
  } | null;
};

function parseMoonshotEffort(effort: string | undefined): MoonshotEffort {
  const validation = validateEffortForProvider("moonshot", effort);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  return (validation.effort ?? "enabled") as MoonshotEffort;
}

function formatMoonshotBatchError(
  error: MoonshotBatchError | null | undefined,
  fallback: string,
) {
  if (!error) {
    return fallback;
  }

  return error.code
    ? `${error.code}: ${error.message ?? fallback}`
    : (error.message ?? fallback);
}

function schemaPrompt(outputSchema: OutputSchema) {
  return `Return only a JSON object matching this schema. Do not wrap it in Markdown or include explanatory text.\n\nSchema name: ${outputSchema.name}\nSchema description: ${outputSchema.description}\nJSON Schema:\n${JSON.stringify(outputSchema.schema, null, 2)}`;
}

async function fetchImageAsBase64DataUri(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) {
      console.warn(`Image fetch failed for ${url}: ${response.status}`);
      return null;
    }

    const contentType =
      response.headers.get("content-type") || "application/octet-stream";
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.warn(`Image fetch error for ${url}:`, error);
    return null;
  }
}

async function toMoonshotUserContent(req: BatchRequest) {
  if (typeof req.userPrompt === "string") {
    return req.userPrompt;
  }

  const content = await Promise.all(
    req.userPrompt.map(async (item) => {
      if (item.type === "text") {
        return { type: "text" as const, text: item.text ?? "" };
      }

      if (item.type === "image_url" && item.image_url?.url) {
        const dataUri = await fetchImageAsBase64DataUri(item.image_url.url);
        if (dataUri) {
          return {
            type: "image_url" as const,
            image_url: { url: dataUri },
          };
        }

        // Fallback: keep original URL. Moonshot will fail this specific
        // request, but it won't bring down the whole batch.
        console.warn(
          `Failed to convert image to base64, falling back to URL: ${item.image_url.url}`,
        );
      }

      return {
        type: "image_url" as const,
        image_url: item.image_url ? { url: item.image_url.url } : undefined,
      };
    }),
  );

  return content;
}

function parseBatchLine(line: string): BatchResult {
  const result = JSON.parse(line) as MoonshotBatchLine;

  if (!result.custom_id) {
    throw new Error("Batch result line is missing custom_id");
  }

  if (result.error) {
    return {
      customId: result.custom_id,
      status: "failed",
      error: formatMoonshotBatchError(result.error, "Unknown error"),
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
      error: formatMoonshotBatchError(responseBody.error, "Unknown error"),
    };
  }

  const choice = responseBody.choices?.[0];
  const content = choice?.message?.content;
  if (!content || content.trim().length === 0) {
    return {
      customId: result.custom_id,
      status: "failed",
      error: `No text content in chat completion response${choice?.finish_reason ? ` (finish_reason ${choice.finish_reason})` : ""}`,
    };
  }

  try {
    return {
      customId: result.custom_id,
      status: "succeeded",
      output: JSON.parse(content),
    };
  } catch (error) {
    return {
      customId: result.custom_id,
      status: "failed",
      error: `Invalid JSON output: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export class MoonshotProvider implements AIProvider {
  readonly id = "moonshot";
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: getRequiredEnv("MOONSHOT_API_KEY"),
        baseURL: "https://api.moonshot.ai/v1",
      });
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
    const parsedEffort = parseMoonshotEffort(effort);

    const jsonlLines = await Promise.all(
      requests.map(async (req) => {
        const userContent = await toMoonshotUserContent(req);
        return JSON.stringify({
          custom_id: req.customId,
          method: "POST",
          url: "/v1/chat/completions",
          body: {
            model: modelId,
            messages: [
              { role: "system", content: req.systemPrompt },
              { role: "system", content: schemaPrompt(req.outputSchema) },
              { role: "user", content: userContent },
            ],
            response_format: { type: "json_object" },
            // Kimi K2.6 has a 256K context window. Default max_tokens is 32K.
            // We push this to 200K to give thinking + output as much room as
            // possible without exceeding the total context budget.
            max_tokens: 200000,
            thinking: { type: parsedEffort },
          },
        });
      }),
    );

    const file = await this.getClient().files.create({
      file: new File([jsonlLines.join("\n")], "batch.jsonl", {
        type: "application/jsonl",
      }),
      purpose: "batch",
    });

    const batch = await this.getClient().batches.create({
      input_file_id: file.id,
      endpoint: "/v1/chat/completions" as "/v1/responses",
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
