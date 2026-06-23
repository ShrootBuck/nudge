import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import { streamText, type TextStreamPart, type ToolSet } from "ai";
import { codexExec } from "ai-sdk-provider-codex-cli";
import { createCodexAssetDownloader } from "./codex-assets";
import {
  CODEX_AUTH_ENV_NAME,
  withLocalCodexAuth,
  withManagedCodexAuth,
} from "./codex-auth";
import { buildMessages, buildStructuredOutput } from "./request";
import type {
  GenerateOptions,
  GenerationTraceEvent,
  StructuredResponse,
} from "./types";

const MODEL = "gpt-5.5";
export const CODEX_DISPLAY_NAME = "GPT-5.5 (xhigh)";
const PROVIDER_NAME = "Codex CLI";
const GENERATION_TIMEOUT_MS = 60 * 60 * 1000;
const MIN_CODEX_VERSION = "0.130.0";
const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

function compareVersions(left: string, right: string) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);

  for (let index = 0; index < 3; index++) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

async function runCommand(command: string[], env?: Record<string, string>) {
  try {
    const { stdout, stderr } = await execFileAsync(
      command[0],
      command.slice(1),
      { env: env ? { ...process.env, ...env } : process.env },
    );
    return {
      exitCode: 0,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
  } catch (error) {
    const details = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
    };

    return {
      exitCode: details.code ?? 1,
      stdout: details.stdout?.trim() ?? "",
      stderr: details.stderr?.trim() ?? String(error),
    };
  }
}

export async function resolveCodexExecutable() {
  const pathEntries = (process.env.PATH ?? "").split(delimiter);
  const candidates = pathEntries
    .filter(Boolean)
    .map((directory) => join(directory, "codex"));

  candidates.push(join(process.cwd(), "node_modules", ".bin", "codex"));

  try {
    candidates.push(require.resolve("@openai/codex/bin/codex.js"));
  } catch {
    // The Trigger build installs this package explicitly; PATH may still work.
  }

  for (const candidate of new Set(candidates)) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Keep searching PATH.
    }
  }

  throw new Error("Could not find the Codex CLI executable on PATH");
}

export async function verifyCodexCli({
  codexHome,
  codexPath,
}: {
  codexHome?: string;
  codexPath?: string;
} = {}) {
  const resolvedCodexPath = codexPath ?? (await resolveCodexExecutable());
  const env = codexHome ? { CODEX_HOME: codexHome } : undefined;
  const versionResult = await runCommand([resolvedCodexPath, "--version"], env);
  if (versionResult.exitCode !== 0) {
    throw new Error(
      `Could not run Codex CLI: ${versionResult.stderr || versionResult.stdout}`,
    );
  }

  const version = versionResult.stdout.match(/\d+\.\d+\.\d+/)?.[0];
  if (!version) {
    throw new Error(
      `Could not parse Codex CLI version from: ${versionResult.stdout}`,
    );
  }

  if (compareVersions(version, MIN_CODEX_VERSION) < 0) {
    throw new Error(
      `Codex CLI ${version} is too old; ${MIN_CODEX_VERSION}+ is required`,
    );
  }

  const loginResult = await runCommand(
    [resolvedCodexPath, "login", "status"],
    env,
  );
  const loginStatus = loginResult.stdout || loginResult.stderr;
  if (
    loginResult.exitCode !== 0 ||
    !/logged in using chatgpt/i.test(loginStatus)
  ) {
    throw new Error(
      `Codex CLI is not logged in with ChatGPT: ${
        loginStatus || "unknown status"
      }`,
    );
  }

  return { codexPath: resolvedCodexPath, version };
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
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
        });
        break;
      case "tool-result":
        emitTrace(options, {
          type: "tool-result",
          toolCallId: part.toolCallId,
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

async function generateCodexExecStructuredResponse(
  options: GenerateOptions,
  codexHome?: string,
): Promise<StructuredResponse> {
  const codexPath = await resolveCodexExecutable();
  await verifyCodexCli({ codexHome, codexPath });

  const workingDirectory = await mkdtemp(
    join(tmpdir(), "nudge-codex-generation-"),
  );

  try {
    const result = streamText({
      model: codexExec(MODEL, {
        codexPath,
        cwd: workingDirectory,
        reasoningEffort: "xhigh",
        reasoningSummary: "detailed",
        approvalMode: "never",
        sandboxMode: "read-only",
        skipGitRepoCheck: true,
        color: "never",
        logger: false,
        env: codexHome ? { CODEX_HOME: codexHome } : undefined,
        configOverrides: {
          web_search: "live",
        },
      }),
      system: options.systemPrompt,
      messages: buildMessages(options.userPrompt),
      output: buildStructuredOutput(options),
      abortSignal: options.abortSignal,
      experimental_download: createCodexAssetDownloader({
        abortSignal: options.abortSignal,
      }),
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
      displayName: CODEX_DISPLAY_NAME,
      resolvedModel: coalesceString(response.modelId, MODEL),
      finishReason: coalesceString(finishReason),
      nativeFinishReason: coalesceString(rawFinishReason),
      providerName: PROVIDER_NAME,
      totalTokens: coalesceTokenCount(usage.totalTokens),
    };
  } finally {
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

export async function generateCodexCliStructuredResponse(
  options: GenerateOptions,
) {
  return withLocalCodexAuth({
    run: (codexHome) => generateCodexExecStructuredResponse(options, codexHome),
  });
}

export async function verifyLocalCodexCli() {
  return withLocalCodexAuth({
    run: (codexHome) => verifyCodexCli({ codexHome }),
  });
}

export async function generateManagedCodexStructuredResponse(
  options: GenerateOptions,
) {
  return withManagedCodexAuth({
    encodedAuth: process.env[CODEX_AUTH_ENV_NAME],
    run: (codexHome) => generateCodexExecStructuredResponse(options, codexHome),
  });
}
