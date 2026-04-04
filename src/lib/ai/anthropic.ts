import Anthropic from "@anthropic-ai/sdk";
import type {
  AIProvider,
  BatchRequest,
  BatchResult,
  BatchStatus,
  ToolDefinition,
} from "./types";

/** Convert a generic tool definition into Anthropic's tool format. */
function toAnthropicTool(tool: ToolDefinition) {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: "object" as const,
      properties: tool.parameters.properties,
      required: tool.parameters.required,
    },
  };
}

export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic";
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic(); // uses ANTHROPIC_API_KEY env var
  }

  async createBatch(
    modelId: string,
    requests: BatchRequest[],
  ): Promise<string> {
    const batch = await this.client.messages.batches.create({
      requests: requests.map((req) => ({
        custom_id: req.customId,
        params: {
          model: modelId,
          max_tokens: 128000,
          thinking: {
            type: "enabled" as const,
            budget_tokens: 120000,
          },
          system: req.systemPrompt,
          messages: [{ role: "user" as const, content: req.userPrompt }],
          tools: req.tools.map(toAnthropicTool),
        },
      })),
    });

    return batch.id;
  }

  async checkBatchStatus(batchId: string): Promise<BatchStatus> {
    const batch = await this.client.messages.batches.retrieve(batchId);

    switch (batch.processing_status) {
      case "ended":
        return "ended";
      case "canceling":
        return "failed";
      default:
        // "in_progress" or any future status
        return "processing";
    }
  }

  async *getBatchResults(batchId: string): AsyncIterable<BatchResult> {
    const results = await this.client.messages.batches.results(batchId);

    for await (const entry of results) {
      if (entry.result.type !== "succeeded") {
        yield {
          customId: entry.custom_id,
          status: "failed",
          error: `Request ${entry.result.type}`,
        };
        continue;
      }

      const toolUse = entry.result.message.content.find(
        (block): block is Anthropic.Messages.ToolUseBlock =>
          block.type === "tool_use",
      );

      if (!toolUse) {
        yield {
          customId: entry.custom_id,
          status: "failed",
          error: "No tool_use block in response",
        };
        continue;
      }

      yield {
        customId: entry.custom_id,
        status: "succeeded",
        toolCallInput: toolUse.input,
      };
    }
  }
}
