import { constants } from "node:fs";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { streamText, type TextStreamPart, type ToolSet } from "ai";
import { createCodexAppServer } from "ai-sdk-provider-codex-cli";
import { buildMessages, buildStructuredOutput } from "./request";
import type {
  GenerateOptions,
  GenerationTraceEvent,
  StructuredResponse,
} from "./types";

const MODEL = "gpt-5.5";
const DISPLAY_NAME = "GPT-5.5 (xhigh)";
const PROVIDER_NAME = "Codex CLI";
const GENERATION_TIMEOUT_MS = 60 * 60 * 1000;
const MIN_CODEX_VERSION = "0.130.0";
const SERVICE_TIER_OVERRIDE = 'service_tier="flex"';

function createCodexWrapperSource(codexPath: string) {
  return `import { spawn } from "node:child_process";

const child = spawn(
  ${JSON.stringify(codexPath)},
  ["-c", ${JSON.stringify(SERVICE_TIER_OVERRIDE)}, ...process.argv.slice(2)],
  { stdio: "inherit" },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  process.exitCode =
    code ?? (signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1);
});
`;
}

export async function resolveGlobalCodexExecutable() {
  const pathEntries = (process.env.PATH ?? "").split(delimiter);

  for (const directory of pathEntries) {
    if (!directory || directory.includes("node_modules/.bin")) {
      continue;
    }

    const candidate = join(directory, "codex");
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Keep searching PATH.
    }
  }

  throw new Error(
    "Could not find a global Codex CLI executable outside node_modules/.bin",
  );
}

function coalesceString(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function coalesceTokenCount(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function emitTrace(options: GenerateOptions, event: GenerationTraceEvent) {
  try {
    options.onTraceEvent?.(event);
  } catch {
    // Terminal tracing is best-effort and must not break a generation.
  }
}

async function consumeTrace(
  stream: AsyncIterable<TextStreamPart<ToolSet>>,
  options: GenerateOptions,
) {
  for await (const part of stream) {
    switch (part.type) {
      case "reasoning-start":
        emitTrace(options, { type: "reasoning-start" });
        break;
      case "reasoning-delta":
        emitTrace(options, { type: "reasoning-delta", text: part.text });
        break;
      case "reasoning-end":
        emitTrace(options, { type: "reasoning-end" });
        break;
      case "text-start":
        emitTrace(options, { type: "output-start" });
        break;
      case "text-delta":
        emitTrace(options, { type: "output-delta", text: part.text });
        break;
      case "text-end":
        emitTrace(options, { type: "output-end" });
        break;
      case "tool-call":
        emitTrace(options, {
          type: "tool-call",
          toolName: part.toolName,
          input: part.input,
        });
        break;
      case "tool-result":
        emitTrace(options, {
          type: "tool-result",
          toolName: part.toolName,
          output: part.output,
        });
        break;
      case "tool-error":
        emitTrace(options, {
          type: "error",
          error: part.error,
        });
        break;
      case "error":
        emitTrace(options, {
          type: "error",
          error: part.error,
        });
        break;
    }
  }
}

export async function generateCodexCliStructuredResponse(
  options: GenerateOptions,
): Promise<StructuredResponse> {
  const codexPath = await resolveGlobalCodexExecutable();
  const workingDirectory = await mkdtemp(
    join(tmpdir(), "nudge-codex-generation-"),
  );
  const codexWrapperPath = join(workingDirectory, "codex-wrapper.mjs");
  let provider: ReturnType<typeof createCodexAppServer> | null = null;

  try {
    await writeFile(
      codexWrapperPath,
      createCodexWrapperSource(codexPath),
      "utf8",
    );
    provider = createCodexAppServer({
      defaultSettings: {
        codexPath: codexWrapperPath,
        cwd: workingDirectory,
        effort: "xhigh",
        summary: "detailed",
        approvalPolicy: "never",
        sandboxPolicy: "read-only",
        autoApprove: false,
        threadMode: "stateless",
        minCodexVersion: MIN_CODEX_VERSION,
        requestTimeoutMs: GENERATION_TIMEOUT_MS,
        logger: false,
      },
    });

    const result = streamText({
      model: provider(MODEL),
      system: options.systemPrompt,
      messages: buildMessages(options.userPrompt),
      output: buildStructuredOutput(options),
      abortSignal: options.abortSignal,
      maxRetries: 0,
      timeout: {
        totalMs: GENERATION_TIMEOUT_MS,
      },
    });

    const trace = options.onTraceEvent
      ? consumeTrace(result.fullStream, options)
      : Promise.resolve();
    const [output, response, finishReason, rawFinishReason, usage] =
      await Promise.all([
        result.output,
        result.response,
        result.finishReason,
        result.rawFinishReason,
        result.totalUsage,
        trace,
      ]);

    const outputText = JSON.stringify(output);

    if (!outputText) {
      throw new Error(
        `Codex response missing structured output (id: ${response.id}, finish_reason: ${finishReason})`,
      );
    }

    return {
      outputText,
      responseId: response.id,
      displayName: DISPLAY_NAME,
      resolvedModel: coalesceString(response.modelId, MODEL),
      finishReason: coalesceString(finishReason),
      nativeFinishReason: coalesceString(rawFinishReason),
      providerName: PROVIDER_NAME,
      totalTokens: coalesceTokenCount(usage.totalTokens),
    };
  } finally {
    await provider?.close();
    await rm(workingDirectory, { recursive: true, force: true });
  }
}
