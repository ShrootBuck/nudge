import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { buildCodexPromptInput } from "./codex-assets";
import { codexCommand, codexEnvironment } from "./codex-cli";
import { generationConfig } from "./config";
import type { GenerateOptions, StructuredResponse } from "./types";

const GENERATION_TIMEOUT_MS = 60 * 60 * 1000;

export async function readCodexOutcome(transcriptPath: string) {
  let threadId: string | undefined;
  let completed = false;
  let error: string | undefined;
  let totalTokens: number | null = null;
  const input = createReadStream(transcriptPath);
  try {
    for await (const line of createInterface({ input, crlfDelay: Infinity })) {
      const event = JSON.parse(line);
      if (event.type === "thread.started") threadId = event.thread_id;
      if (event.type === "error") error = event.message;
      if (event.type === "turn.failed") {
        throw new Error(event.error?.message || error || "Codex turn failed");
      }
      if (event.type === "turn.completed") {
        completed = true;
        // Codex input includes cached reads and output includes reasoning.
        const usage = event.usage;
        if (
          Number.isSafeInteger(usage?.input_tokens) &&
          Number.isSafeInteger(usage?.output_tokens)
        )
          totalTokens = usage.input_tokens + usage.output_tokens;
      }
    }
  } finally {
    input.destroy();
  }
  if (!completed || typeof threadId !== "string" || !threadId)
    throw new Error(error || "Codex exited without a completed turn");
  return { threadId, totalTokens };
}

function killProcessGroup(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(-pid, signal);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== "ESRCH") throw cause;
  }
}

async function generationArgs(
  workspace: string,
  systemPrompt: string,
  schemaPath: string,
  resultPath: string,
  images: string[],
) {
  const readable = [await realpath(process.execPath)];
  if (process.platform === "darwin") {
    // Homebrew Poppler and the macOS C++ toolchain live outside /usr/bin.
    readable.push(
      "/opt/homebrew",
      "/usr/local/include",
      "/Library/Developer/CommandLineTools",
    );
  }
  const fileRules = [
    '":root"="deny"',
    '":minimal"="read"',
    '":workspace_roots"="write"',
    ...readable.map((path) => `${JSON.stringify(path)}="read"`),
  ];
  const config = [
    `model_reasoning_effort=${JSON.stringify(generationConfig.reasoningEffort)}`,
    'forced_login_method="chatgpt"',
    'model_provider="openai"',
    "project_doc_max_bytes=0",
    "allow_login_shell=false",
    "features.memories=false",
    "features.hooks=false",
    "features.plugins=false",
    "features.apps=false",
    "features.multi_agent=false",
    "features.shell_snapshot=false",
    'default_permissions="nudge"',
    `permissions.nudge.filesystem={${fileRules.join(",")}}`,
    "features.network_proxy=true",
    "permissions.nudge.network.enabled=true",
    'permissions.nudge.network.domains={"*"="allow"}',
    `shell_environment_policy.set.TMPDIR=${JSON.stringify(workspace)}`,
    `developer_instructions=${JSON.stringify(systemPrompt)}`,
  ];
  return [
    "-a",
    "never",
    "--search",
    "exec",
    "--json",
    "--ephemeral",
    "--strict-config",
    "--ignore-user-config",
    "--ignore-rules",
    "--skip-git-repo-check",
    "-m",
    generationConfig.model,
    ...config.flatMap((value) => ["-c", value]),
    "--output-schema",
    schemaPath,
    "--output-last-message",
    resultPath,
    ...images.flatMap((image) => ["--image", image]),
    "-",
  ];
}

async function runCodex(
  args: string[],
  workspace: string,
  text: string,
  transcriptPath: string,
  signal: AbortSignal,
) {
  const transcript = await open(transcriptPath, "wx", 0o600);
  try {
    const fd = transcript.fd;
    signal.throwIfAborted();
    const child = Bun.spawn(codexCommand(args), {
      cwd: workspace,
      env: codexEnvironment(),
      detached: true,
      stdin: new Blob([text]),
      stdout: fd,
      stderr: "pipe",
    });
    let forceKill: ReturnType<typeof setTimeout> | undefined;
    const abort = () => {
      killProcessGroup(child.pid, "SIGTERM");
      forceKill = setTimeout(
        () => killProcessGroup(child.pid, "SIGKILL"),
        2_000,
      );
      forceKill.unref();
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      const [code, stderr] = await Promise.all([
        child.exited,
        new Response(child.stderr).text(),
      ]);
      signal.throwIfAborted();
      return { code, stderr };
    } finally {
      signal.removeEventListener("abort", abort);
      clearTimeout(forceKill);
      if (signal.aborted) killProcessGroup(child.pid, "SIGKILL");
    }
  } finally {
    await transcript.close();
  }
}

export async function generateWithCodex(
  options: GenerateOptions,
): Promise<StructuredResponse> {
  const deadline = AbortSignal.timeout(GENERATION_TIMEOUT_MS);
  const signal = options.abortSignal
    ? AbortSignal.any([options.abortSignal, deadline])
    : deadline;
  signal.throwIfAborted();
  const runRoot = await mkdtemp(join(await realpath(tmpdir()), "nudge-codex-"));
  const workspace = join(runRoot, "workspace");
  // The model can write in the workspace. Only the parent and Codex itself
  // can write the schema, final message and public event log.
  const schemaPath = join(runRoot, "schema.json");
  const resultPath = join(runRoot, "result.json");
  const runs = resolve(".codex-runs");
  const transcriptPath = join(runs, `${randomUUID()}.jsonl`);
  try {
    await mkdir(workspace);
    await writeFile(schemaPath, JSON.stringify(options.outputSchema.schema), {
      mode: 0o600,
    });
    const { text, images } = await buildCodexPromptInput({
      input: options.userPrompt,
      workingDirectory: workspace,
      abortSignal: signal,
    });
    await mkdir(runs, { recursive: true, mode: 0o700 });
    const args = await generationArgs(
      workspace,
      options.systemPrompt,
      schemaPath,
      resultPath,
      images,
    );
    const { code, stderr } = await runCodex(
      args,
      workspace,
      text,
      transcriptPath,
      signal,
    );
    // On failure, the most useful provider error is often in stdout's turn.failed.
    const outcome = await readCodexOutcome(transcriptPath).catch((cause) => {
      if (code !== 0 && stderr.trim())
        throw new Error(`${cause.message}; ${stderr.trim().slice(-1500)}`);
      throw cause;
    });
    if (code !== 0)
      throw new Error(
        `Codex exited with status ${code}: ${stderr.trim().slice(-1500)}`,
      );
    const outputText = await readFile(resultPath, "utf8");
    JSON.parse(outputText);
    return {
      outputText,
      responseId: outcome.threadId,
      transcriptPath,
      displayName: generationConfig.displayName,
      resolvedModel: generationConfig.model,
      finishReason: "stop",
      nativeFinishReason: "turn.completed",
      providerName: "OpenAI via Codex CLI",
      totalTokens: outcome.totalTokens,
    };
  } catch (cause) {
    if (options.abortSignal?.aborted) throw options.abortSignal.reason;
    const message = deadline.aborted
      ? "timed out after 60 minutes"
      : cause instanceof Error
        ? cause.message
        : String(cause);
    throw new Error(
      `Codex generation failed: ${message} (run log: ${transcriptPath})`,
      { cause },
    );
  } finally {
    await rm(runRoot, { recursive: true, force: true });
  }
}
