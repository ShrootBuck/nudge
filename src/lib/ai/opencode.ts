import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import {
  type AssistantMessage,
  type Config,
  createOpencode,
} from "@opencode-ai/sdk/v2";
import { OPEN_CODE_GENERATION_CONFIG } from "./config";
import { buildOpenCodePromptParts } from "./opencode-assets";
import { mirrorOpenCodeTranscript } from "./opencode-transcript";
import { buildStructuredOutputFormat } from "./request";
import type { GenerateOptions, StructuredResponse } from "./types";

const GENERATION_AGENT = "nudge-generation";
const GENERATION_TIMEOUT_MS = 60 * 60 * 1000;
const SERVER_STARTUP_TIMEOUT_MS = 30 * 1000;
const MAX_CODEFORCES_IMAGE_BYTES = 20 * 1024 * 1024;
const require = createRequire(import.meta.url);

type OpenCodeInstance = Awaited<ReturnType<typeof createOpencode>>;

export type OpenCodePreflight = {
  executablePath: string;
  version: string;
  providerName: string;
  modelName: string;
  modelReference: string;
  variant: string | null;
  displayName: string;
};

export type OpenCodeRuntime = {
  preflight(): Promise<OpenCodePreflight>;
  generate(options: GenerateOptions): Promise<StructuredResponse>;
  close(): Promise<void>;
};

const GENERATION_PERMISSION = {
  read: "deny",
  edit: "deny",
  glob: "deny",
  grep: "deny",
  list: "deny",
  bash: "deny",
  task: "deny",
  external_directory: "deny",
  todowrite: "deny",
  question: "deny",
  webfetch: "allow",
  websearch: "allow",
  lsp: "deny",
  doom_loop: "deny",
  skill: "deny",
} as const;

export function buildOpenCodeRuntimeConfig(): Config {
  return {
    share: "disabled",
    autoupdate: false,
    snapshot: false,
    formatter: false,
    lsp: false,
    attachment: {
      image: {
        auto_resize: true,
        max_base64_bytes: MAX_CODEFORCES_IMAGE_BYTES,
      },
    },
    default_agent: GENERATION_AGENT,
    agent: {
      [GENERATION_AGENT]: {
        description:
          "Generates structured Codeforces learning content for Nudge.",
        mode: "primary",
        model: OPEN_CODE_GENERATION_CONFIG.model,
        ...(OPEN_CODE_GENERATION_CONFIG.variant
          ? { variant: OPEN_CODE_GENERATION_CONFIG.variant }
          : {}),
        permission: GENERATION_PERMISSION,
      },
    },
    permission: GENERATION_PERMISSION,
  };
}

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object") {
    const candidate = error as {
      message?: unknown;
      data?: { message?: unknown };
    };
    if (typeof candidate.data?.message === "string") {
      return candidate.data.message;
    }
    if (typeof candidate.message === "string") {
      return candidate.message;
    }
    try {
      return JSON.stringify(error);
    } catch {
      // Fall through to String for non-serializable errors.
    }
  }
  return String(error);
}

function totalTokenCount(tokens: AssistantMessage["tokens"]) {
  const total = tokens.total ?? tokens.input + tokens.output + tokens.reasoning;
  return Number.isSafeInteger(total) && total >= 0 ? total : null;
}

function assistantErrorMessage(error: NonNullable<AssistantMessage["error"]>) {
  const data = "data" in error ? error.data : null;
  const detail =
    data && typeof data === "object" && "message" in data
      ? String(data.message)
      : JSON.stringify(data);
  return `${error.name}${detail ? `: ${detail}` : ""}`;
}

export function toStructuredResponse({
  message,
  providerName,
  transcriptPath,
}: {
  message: AssistantMessage;
  providerName?: string;
  transcriptPath?: string | null;
}): StructuredResponse {
  if (message.error) {
    throw new Error(assistantErrorMessage(message.error));
  }
  if (message.structured === undefined) {
    throw new Error(
      `OpenCode response missing structured output (id: ${message.id}, finish_reason: ${message.finish ?? "unknown"})`,
    );
  }

  return {
    outputText: JSON.stringify(message.structured),
    responseId: message.id,
    ...(transcriptPath ? { transcriptPath } : {}),
    ...(!transcriptPath
      ? {
          transcriptWarning: `Could not mirror OpenCode session ${message.sessionID}; it was retained in OpenCode for inspection.`,
        }
      : {}),
    displayName: OPEN_CODE_GENERATION_CONFIG.displayName,
    resolvedModel: `${message.providerID}/${message.modelID}`,
    finishReason: "stop",
    nativeFinishReason: message.finish?.trim() || null,
    providerName: `${providerName?.trim() || message.providerID} via OpenCode`,
    totalTokens: totalTokenCount(message.tokens),
  };
}

function createGenerationAbort(externalSignal?: AbortSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(
      new Error(
        `OpenCode generation timed out after ${GENERATION_TIMEOUT_MS / 60_000} minutes`,
      ),
    );
  }, GENERATION_TIMEOUT_MS);
  timeout.unref?.();

  const forwardExternalAbort = () => {
    controller.abort(
      externalSignal?.reason ?? new DOMException("Aborted", "AbortError"),
    );
  };

  if (externalSignal?.aborted) {
    forwardExternalAbort();
  } else {
    externalSignal?.addEventListener("abort", forwardExternalAbort, {
      once: true,
    });
  }

  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", forwardExternalAbort);
    },
  };
}

function configureBundledOpenCode() {
  const packagePath = require.resolve("opencode-ai/package.json");
  const packageDirectory = dirname(packagePath);
  const binaryDirectory = join(dirname(packageDirectory), ".bin");
  const executablePath = join(
    binaryDirectory,
    process.platform === "win32" ? "opencode.cmd" : "opencode",
  );
  const pathEntries = (process.env.PATH ?? "").split(delimiter);
  if (!pathEntries.includes(binaryDirectory)) {
    process.env.PATH = [binaryDirectory, ...pathEntries].join(delimiter);
  }

  process.env.OPENCODE_ENABLE_EXA = "1";
  process.env.OPENCODE_DISABLE_AUTOUPDATE = "1";

  const packageMetadata = require(packagePath) as { version: string };
  return {
    executablePath,
    expectedVersion: packageMetadata.version,
  };
}

class LocalOpenCodeRuntime implements OpenCodeRuntime {
  private closed = false;
  private readonly providerNames = new Map<string, string>();

  constructor(
    private readonly instance: OpenCodeInstance,
    private readonly executablePath: string,
    private readonly expectedVersion: string,
  ) {}

  async preflight(): Promise<OpenCodePreflight> {
    const healthResult = await this.instance.client.global.health({
      throwOnError: true,
    });
    if (!healthResult.data.healthy) {
      throw new Error("OpenCode server health check failed");
    }
    if (healthResult.data.version !== this.expectedVersion) {
      throw new Error(
        `Expected OpenCode ${this.expectedVersion}, but the server reported ${healthResult.data.version}`,
      );
    }

    const providerResult = await this.instance.client.provider.list(
      { directory: process.cwd() },
      { throwOnError: true },
    );
    for (const provider of providerResult.data.all) {
      this.providerNames.set(provider.id, provider.name);
    }

    const provider = providerResult.data.all.find(
      (candidate) => candidate.id === OPEN_CODE_GENERATION_CONFIG.providerId,
    );
    if (!provider) {
      throw new Error(
        `OpenCode provider ${OPEN_CODE_GENERATION_CONFIG.providerId} is unavailable`,
      );
    }
    if (!providerResult.data.connected.includes(provider.id)) {
      throw new Error(
        `OpenCode provider ${provider.name} is not connected; run opencode auth login`,
      );
    }

    const model = provider.models[OPEN_CODE_GENERATION_CONFIG.modelId];
    if (!model) {
      throw new Error(
        `OpenCode model ${OPEN_CODE_GENERATION_CONFIG.model} is unavailable; run opencode models ${provider.id}`,
      );
    }
    if (!model.capabilities.toolcall) {
      throw new Error(
        `OpenCode model ${OPEN_CODE_GENERATION_CONFIG.model} does not support the tool calls required for structured output`,
      );
    }
    if (!model.capabilities.input.image) {
      throw new Error(
        `OpenCode model ${OPEN_CODE_GENERATION_CONFIG.model} does not support the image inputs required by Nudge`,
      );
    }

    const variant = OPEN_CODE_GENERATION_CONFIG.variant;
    if (variant && !model.variants?.[variant]) {
      throw new Error(
        `OpenCode model ${OPEN_CODE_GENERATION_CONFIG.model} does not expose the ${variant} variant`,
      );
    }

    return {
      executablePath: this.executablePath,
      version: healthResult.data.version,
      providerName: provider.name,
      modelName: model.name,
      modelReference: OPEN_CODE_GENERATION_CONFIG.model,
      variant,
      displayName: OPEN_CODE_GENERATION_CONFIG.displayName,
    };
  }

  generate = async (options: GenerateOptions): Promise<StructuredResponse> => {
    if (this.closed) {
      throw new Error("OpenCode runtime is closed");
    }

    const workingDirectory = await mkdtemp(
      join(tmpdir(), "nudge-opencode-generation-"),
    );
    const generationAbort = createGenerationAbort(options.abortSignal);
    let sessionId: string | null = null;
    let transcriptPath: string | null = null;
    let abortPromise: Promise<void> | null = null;

    const captureTranscript = async () => {
      if (!sessionId) {
        return null;
      }
      try {
        const exportProcess = Bun.spawn(
          [this.executablePath, "export", sessionId],
          {
            cwd: workingDirectory,
            env: process.env,
            stdout: "pipe",
            stderr: "pipe",
          },
        );
        const [stdout, stderr, exitCode] = await Promise.all([
          new Response(exportProcess.stdout).arrayBuffer(),
          new Response(exportProcess.stderr).text(),
          exportProcess.exited,
        ]);
        const transcript = new Uint8Array(stdout);
        if (exitCode !== 0) {
          throw new Error(
            `OpenCode session export failed: ${stderr.trim() || new TextDecoder().decode(transcript).trim()}`,
          );
        }
        return await mirrorOpenCodeTranscript({
          sessionId,
          transcript,
        });
      } catch {
        return null;
      }
    };

    const abortSession = () => {
      if (!sessionId || abortPromise) {
        return;
      }
      abortPromise = this.instance.client.session
        .abort(
          { sessionID: sessionId, directory: workingDirectory },
          { throwOnError: true },
        )
        .then(() => undefined)
        .catch(() => undefined);
    };

    try {
      if (generationAbort.signal.aborted) {
        throw generationAbort.signal.reason;
      }
      const sessionResult = await this.instance.client.session.create(
        {
          directory: workingDirectory,
          title: "Nudge content generation",
          agent: GENERATION_AGENT,
          model: {
            id: OPEN_CODE_GENERATION_CONFIG.modelId,
            providerID: OPEN_CODE_GENERATION_CONFIG.providerId,
            ...(OPEN_CODE_GENERATION_CONFIG.variant
              ? { variant: OPEN_CODE_GENERATION_CONFIG.variant }
              : {}),
          },
        },
        { throwOnError: true },
      );
      sessionId = sessionResult.data.id;
      generationAbort.signal.addEventListener("abort", abortSession, {
        once: true,
      });
      if (generationAbort.signal.aborted) {
        abortSession();
        throw generationAbort.signal.reason;
      }

      const parts = await buildOpenCodePromptParts({
        input: options.userPrompt,
        workingDirectory,
        abortSignal: generationAbort.signal,
      });
      const promptResult = await this.instance.client.session.prompt(
        {
          sessionID: sessionId,
          directory: workingDirectory,
          agent: GENERATION_AGENT,
          model: {
            providerID: OPEN_CODE_GENERATION_CONFIG.providerId,
            modelID: OPEN_CODE_GENERATION_CONFIG.modelId,
          },
          ...(OPEN_CODE_GENERATION_CONFIG.variant
            ? { variant: OPEN_CODE_GENERATION_CONFIG.variant }
            : {}),
          system: options.systemPrompt,
          format: buildStructuredOutputFormat(options),
          parts,
        },
        { throwOnError: true, signal: generationAbort.signal },
      );

      transcriptPath = await captureTranscript();
      const providerName =
        this.providerNames.get(promptResult.data.info.providerID) ??
        promptResult.data.info.providerID;
      return toStructuredResponse({
        message: promptResult.data.info,
        providerName,
        transcriptPath,
      });
    } catch (error) {
      await abortPromise;
      transcriptPath ??= await captureTranscript();
      if (generationAbort.signal.aborted) {
        throw generationAbort.signal.reason;
      }
      throw new Error(`OpenCode generation failed: ${describeError(error)}`, {
        cause: error,
      });
    } finally {
      generationAbort.signal.removeEventListener("abort", abortSession);
      generationAbort.dispose();
      await abortPromise;

      if (sessionId && transcriptPath) {
        await this.instance.client.session
          .delete(
            { sessionID: sessionId, directory: workingDirectory },
            { throwOnError: true },
          )
          .catch(() => undefined);
      }
      await rm(workingDirectory, { recursive: true, force: true });
    }
  };

  async close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.instance.server.close();
  }
}

export async function createLocalOpenCodeRuntime(): Promise<OpenCodeRuntime> {
  const { executablePath, expectedVersion } = configureBundledOpenCode();
  const instance = await createOpencode({
    port: 0,
    timeout: SERVER_STARTUP_TIMEOUT_MS,
    config: buildOpenCodeRuntimeConfig(),
  });
  return new LocalOpenCodeRuntime(instance, executablePath, expectedVersion);
}
