import { getRequiredEnv } from "../env";
import type { AIProvider, BatchRequest, BatchResult, BatchStatus } from "./types";

type XAIBatchState = {
  num_requests: number;
  num_pending: number;
  num_success: number;
  num_error: number;
  num_cancelled: number;
};

type XAIBatch = {
  batch_id: string;
  cancel_time?: string | null;
  state: XAIBatchState;
};

type XAIBatchResultItem = {
  batch_request_id: string;
  error_message?: string;
  batch_result?: {
    response?: {
      chat_get_completion?: {
        choices?: Array<{
          message?: {
            content?: string | null;
          } | null;
          finish_reason?: string | null;
        }>;
      };
    };
  };
};

type XAIBatchResultsPage = {
  results: XAIBatchResultItem[];
  pagination_token?: string | null;
};

const API_BASE = "https://api.x.ai/v1";

function getApiKey(): string {
  return getRequiredEnv("XAI_API_KEY");
}

async function xaiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`xAI API error (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
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

async function toXAIUserContent(req: BatchRequest) {
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
          return { type: "image_url" as const, image_url: { url: dataUri } };
        }
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

function parseBatchResultItem(item: XAIBatchResultItem): BatchResult {
  const customId = item.batch_request_id;
  if (!customId) {
    throw new Error("Batch result item is missing batch_request_id");
  }

  if (item.error_message) {
    return {
      customId,
      status: "failed",
      error: item.error_message,
    };
  }

  const chatCompletion = item.batch_result?.response?.chat_get_completion;
  const choice = chatCompletion?.choices?.[0];
  const content = choice?.message?.content;

  if (!content || content.trim().length === 0) {
    return {
      customId,
      status: "failed",
      error: `No text content in chat completion response${choice?.finish_reason ? ` (finish_reason ${choice.finish_reason})` : ""}`,
    };
  }

  try {
    return {
      customId,
      status: "succeeded",
      output: JSON.parse(content),
    };
  } catch (error) {
    return {
      customId,
      status: "failed",
      error: `Invalid JSON output: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export class XAIProvider implements AIProvider {
  readonly id = "xai";

  async createBatch(
    modelId: string,
    requests: BatchRequest[],
    _effort?: string,
  ): Promise<string> {

    const jsonlLines = await Promise.all(
      requests.map(async (req) => {
        const userContent = await toXAIUserContent(req);
        return JSON.stringify({
          custom_id: req.customId,
          method: "POST",
          url: "/v1/chat/completions",
          body: {
            model: modelId,
            messages: [
              { role: "system", content: req.systemPrompt },
              { role: "user", content: userContent },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: req.outputSchema.name,
                description: req.outputSchema.description,
                schema: req.outputSchema.schema,
                strict: true,
              },
            },
            max_tokens: 128000,
          },
        });
      }),
    );

    const jsonlContent = jsonlLines.join("\n");

    // Upload JSONL file
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([jsonlContent], { type: "application/jsonl" }),
      "batch.jsonl",
    );

    const fileRes = await fetch(`${API_BASE}/files`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getApiKey()}` },
      body: formData,
    });
    if (!fileRes.ok) {
      const text = await fileRes.text();
      throw new Error(`xAI file upload error (${fileRes.status}): ${text}`);
    }
    const fileData = (await fileRes.json()) as { id?: string };
    if (!fileData.id) {
      throw new Error("xAI file upload response missing file id");
    }

    // Create batch with file
    const batch = await xaiFetch<XAIBatch>("/batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "nudge-batch",
        input_file_id: fileData.id,
      }),
    });

    return batch.batch_id;
  }

  async checkBatchStatus(batchId: string): Promise<BatchStatus> {
    const batch = await xaiFetch<XAIBatch>(`/batches/${batchId}`);

    if (batch.cancel_time) {
      return "failed";
    }

    if (batch.state.num_pending === 0 && batch.state.num_requests > 0) {
      return "ended";
    }

    return "processing";
  }

  async *getBatchResults(batchId: string): AsyncIterable<BatchResult> {
    let paginationToken: string | null | undefined;
    const results = new Map<string, BatchResult>();

    do {
      const url = new URL(`${API_BASE}/batches/${batchId}/results`);
      url.searchParams.set("limit", "1000");
      if (paginationToken) {
        url.searchParams.set("pagination_token", paginationToken);
      }

      const page = await xaiFetch<XAIBatchResultsPage>(
        url.pathname + url.search,
      );

      for (const item of page.results) {
        const result = parseBatchResultItem(item);
        results.set(result.customId, result);
      }

      paginationToken = page.pagination_token;
    } while (paginationToken);

    if (results.size === 0) {
      throw new Error(`Batch ${batchId} has no results`);
    }

    for (const result of results.values()) {
      yield result;
    }
  }
}
