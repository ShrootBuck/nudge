import OpenAI from "openai";
import type {
  AIProvider,
  BatchRequest,
  BatchResult,
  BatchStatus,
  ToolDefinition,
} from "./types";

/** Convert a generic tool definition into OpenAI's function format. */
function toOpenAIFunction(tool: ToolDefinition) {
  return {
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object" as const,
        properties: tool.parameters.properties,
        required: tool.parameters.required,
      },
    },
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

  async createBatch(
    modelId: string,
    requests: BatchRequest[],
    effort?: string,
  ): Promise<string> {
    // Convert requests to OpenAI batch format (JSONL)
    const jsonlLines = requests.map((req) => {
      const batchItem = {
        custom_id: req.customId,
        method: "POST" as const,
        url: "/v1/chat/completions",
        body: {
          model: modelId,
          messages: [
            {
              role: "system" as const,
              content: req.systemPrompt,
            },
            {
              role: "user" as const,
              content: req.userPrompt,
            },
          ],
          tools: req.tools.map(toOpenAIFunction),
          tool_choice: "required" as const,
          ...(effort && { reasoning_effort: effort }),
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
      endpoint: "/v1/chat/completions",
      completion_window: "24h",
    });

    return batch.id;
  }

  async checkBatchStatus(batchId: string): Promise<BatchStatus> {
    const batch = await this.getClient().batches.retrieve(batchId);

    switch (batch.status) {
      case "completed":
        return "ended";
      case "failed":
      case "expired":
        return "failed";
      default:
        // "validating", "in_progress", "cancelling"
        return "processing";
    }
  }

  async *getBatchResults(batchId: string): AsyncIterable<BatchResult> {
    const batch = await this.getClient().batches.retrieve(batchId);

    if (!batch.output_file_id) {
      throw new Error("Batch has no output file");
    }

    // Download the output file
    const fileContent = await this.getClient().files.content(
      batch.output_file_id,
    );

    // Parse JSONL response
    const text = await fileContent.text();
    const lines = text.trim().split("\n");

    for (const line of lines) {
      if (!line) continue;

      const result = JSON.parse(line);

      if (result.error) {
        yield {
          customId: result.custom_id,
          status: "failed",
          error: result.error.message || "Unknown error",
        };
        continue;
      }

      const response = result.response.body;
      if (response.error) {
        yield {
          customId: result.custom_id,
          status: "failed",
          error: response.error.message || "Unknown error",
        };
        continue;
      }

      const choice = response.choices?.[0];
      if (!choice) {
        yield {
          customId: result.custom_id,
          status: "failed",
          error: "No choice in response",
        };
        continue;
      }

      const toolCall = choice.message.tool_calls?.[0];
      if (!toolCall) {
        yield {
          customId: result.custom_id,
          status: "failed",
          error: "No tool call in response",
        };
        continue;
      }

      yield {
        customId: result.custom_id,
        status: "succeeded",
        toolCallInput: JSON.parse(toolCall.function.arguments),
      };
    }
  }
}
