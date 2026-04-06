import Anthropic from "@anthropic-ai/sdk";
import { normalizeEffort, validateEffortForProvider } from "./effort";
import type {
  AIProvider,
  BatchRequest,
  BatchResult,
  BatchStatus,
} from "./types";

const ANTHROPIC_OUTPUT_300K_BETA = "output-300k-2026-03-24";
const ANTHROPIC_BATCH_MAX_TOKENS = 300000;

type AnthropicEffort = "low" | "medium" | "high" | "max";

function parseAnthropicEffort(
  effort: string | undefined,
  modelId: string,
): AnthropicEffort | undefined {
  const normalizedEffort = normalizeEffort(effort);
  if (!normalizedEffort) {
    return undefined;
  }

  const validation = validateEffortForProvider("anthropic", normalizedEffort);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  if (validation.effort === "max" && !modelId.includes("opus-4-6")) {
    throw new Error(
      `Effort "max" is only supported on Claude Opus 4.6 (model: ${modelId}).`,
    );
  }

  return validation.effort as AnthropicEffort;
}

function enforceStructuredSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const copy = { ...schema };

  if (copy.type === "object" && copy.properties) {
    const props = copy.properties as Record<string, Record<string, unknown>>;
    copy.properties = Object.fromEntries(
      Object.entries(props).map(([key, value]) => [
        key,
        enforceStructuredSchema(value),
      ]),
    );
    copy.additionalProperties = false;
  }

  if (copy.type === "array" && copy.items) {
    copy.items = enforceStructuredSchema(copy.items as Record<string, unknown>);
  }

  if (Array.isArray(copy.anyOf)) {
    copy.anyOf = copy.anyOf.map((variant) =>
      enforceStructuredSchema(variant as Record<string, unknown>),
    );
  }

  if (Array.isArray(copy.allOf)) {
    copy.allOf = copy.allOf.map((variant) =>
      enforceStructuredSchema(variant as Record<string, unknown>),
    );
  }

  return copy;
}

export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic";
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!this.client) {
      this.client = new Anthropic();
    }
    return this.client;
  }

  async createBatch(
    modelId: string,
    requests: BatchRequest[],
    effort?: string,
  ): Promise<string> {
    const parsedEffort = parseAnthropicEffort(effort, modelId);

    const batch = await this.getClient().messages.batches.create(
      {
        requests: requests.map((req) => ({
          custom_id: req.customId,
          params: {
            model: modelId,
            max_tokens: ANTHROPIC_BATCH_MAX_TOKENS,
            thinking: {
              type: "adaptive" as const,
            },
            system: req.systemPrompt,
            messages: [
              {
                role: "user" as const,
                content:
                  typeof req.userPrompt === "string"
                    ? req.userPrompt
                    : req.userPrompt.map((item) => {
                        if (item.type === "image_url" && item.image_url) {
                          return {
                            type: "image" as const,
                            source: {
                              type: "url" as const,
                              url: item.image_url.url,
                            },
                          };
                        }
                        return { type: "text" as const, text: item.text || "" };
                      }),
              },
            ],
            output_config: {
              ...(parsedEffort ? { effort: parsedEffort } : {}),
              format: {
                type: "json_schema" as const,
                schema: enforceStructuredSchema(req.outputSchema.schema),
              },
            },
          },
        })),
      },
      {
        headers: {
          "anthropic-beta": ANTHROPIC_OUTPUT_300K_BETA,
        },
      },
    );

    return batch.id;
  }

  async checkBatchStatus(batchId: string): Promise<BatchStatus> {
    const batch = await this.getClient().messages.batches.retrieve(batchId);

    switch (batch.processing_status) {
      case "ended":
        return "ended";
      case "canceling":
        return "failed";
      default:
        // Treat in progress and unknown future statuses as still processing
        return "processing";
    }
  }

  async *getBatchResults(batchId: string): AsyncIterable<BatchResult> {
    const results = await this.getClient().messages.batches.results(batchId);

    for await (const entry of results) {
      if (entry.result.type !== "succeeded") {
        yield {
          customId: entry.custom_id,
          status: "failed",
          error: `Request ${entry.result.type}`,
        };
        continue;
      }

      const textContent = entry.result.message.content
        .filter(
          (block): block is Anthropic.Messages.TextBlock =>
            block.type === "text",
        )
        .map((block) => block.text)
        .join("")
        .trim();

      const stopReason = entry.result.message.stop_reason ?? "unknown";
      const outputTokens = entry.result.message.usage?.output_tokens;

      if (!textContent) {
        yield {
          customId: entry.custom_id,
          status: "failed",
          error:
            `No text block in response (stop_reason ${stopReason}` +
            (outputTokens ? `, output_tokens ${outputTokens}` : "") +
            (stopReason === "max_tokens"
              ? "; likely exhausted output tokens before final JSON"
              : "") +
            ")",
        };
        continue;
      }

      try {
        yield {
          customId: entry.custom_id,
          status: "succeeded",
          output: JSON.parse(textContent),
        };
      } catch (error) {
        yield {
          customId: entry.custom_id,
          status: "failed",
          error: `Invalid JSON output (${stopReason}): ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
  }
}
