import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import { generateText } from "ai";
import { codexExec } from "ai-sdk-provider-codex-cli";
import { createCodexAssetDownloader } from "./codex-assets";
import { mirrorCodexTranscript } from "./codex-transcript";
import { buildMessages, buildStructuredOutput } from "./request";
import type { GenerateOptions, StructuredResponse } from "./types";

const MODEL = "gpt-5.6-sol";
export const CODEX_DISPLAY_NAME = "GPT-5.6 Sol (max)";
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

async function runCommand(command: string[]) {
  try {
    const { stdout, stderr } = await execFileAsync(
      command[0],
      command.slice(1),
      { env: process.env },
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
  const pathCandidates = pathEntries
    .filter(Boolean)
    .map((directory) => join(directory, "codex"));
  const packageCandidates = pathCandidates.filter((candidate) =>
    candidate.includes("node_modules/.bin/codex"),
  );
  const candidates = pathCandidates.filter(
    (candidate) => !candidate.includes("node_modules/.bin/codex"),
  );

  candidates.push("/opt/homebrew/bin/codex", "/usr/local/bin/codex");
  packageCandidates.push(join(process.cwd(), "node_modules", ".bin", "codex"));

  try {
    packageCandidates.push(require.resolve("@openai/codex/bin/codex.js"));
  } catch {
    // PATH may still provide a global Codex CLI.
  }

  for (const candidate of new Set([...candidates, ...packageCandidates])) {
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
  codexPath,
}: {
  codexPath?: string;
} = {}) {
  const resolvedCodexPath = codexPath ?? (await resolveCodexExecutable());
  const versionResult = await runCommand([resolvedCodexPath, "--version"]);
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

  const loginResult = await runCommand([resolvedCodexPath, "login", "status"]);
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

async function mirrorTranscriptSafely(workingDirectory: string) {
  try {
    return await mirrorCodexTranscript({ workingDirectory });
  } catch {
    return null;
  }
}

async function generateCodexExecStructuredResponse(
  options: GenerateOptions,
): Promise<StructuredResponse> {
  const codexPath = await resolveCodexExecutable();
  await verifyCodexCli({ codexPath });

  const workingDirectory = await mkdtemp(
    join(tmpdir(), "nudge-codex-generation-"),
  );
  let transcriptPath: string | null = null;
  let generationCompleted = false;

  try {
    const result = await generateText({
      model: codexExec(MODEL, {
        codexPath,
        cwd: workingDirectory,
        reasoningSummary: "detailed",
        approvalMode: "never",
        sandboxMode: "read-only",
        skipGitRepoCheck: true,
        color: "never",
        logger: false,
        configOverrides: {
          model_reasoning_effort: "max",
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

    generationCompleted = true;
    transcriptPath = await mirrorTranscriptSafely(workingDirectory);

    const outputText = JSON.stringify(result.output);

    if (!outputText) {
      throw new Error(
        `Codex response missing structured output (id: ${result.response.id}, finish_reason: ${result.finishReason})`,
      );
    }

    return {
      outputText,
      responseId: result.response.id,
      ...(transcriptPath ? { transcriptPath } : {}),
      ...(!transcriptPath
        ? {
            transcriptWarning:
              "Could not mirror the full Codex transcript to .codex-runs; check ~/.codex/sessions.",
          }
        : {}),
      displayName: CODEX_DISPLAY_NAME,
      resolvedModel: coalesceString(result.response.modelId, MODEL),
      finishReason: coalesceString(result.finishReason),
      nativeFinishReason: coalesceString(result.rawFinishReason),
      providerName: PROVIDER_NAME,
      totalTokens: coalesceTokenCount(result.totalUsage.totalTokens),
    };
  } finally {
    if (!generationCompleted) {
      await mirrorTranscriptSafely(workingDirectory);
    }
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

export async function generateCodexCliStructuredResponse(
  options: GenerateOptions,
) {
  return generateCodexExecStructuredResponse(options);
}

export async function verifyLocalCodexCli() {
  return verifyCodexCli();
}
