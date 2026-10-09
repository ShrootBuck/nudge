import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import type {
  ConfigEntry,
  OpenCodeClient,
  PermissionRuleset,
  SessionTransferData,
  TokenUsageInfo,
} from "@opencode/client";
import { MAX_CODEFORCES_IMAGE_BYTES } from "./codeforces-images";
import { OPEN_CODE_GENERATION_CONFIG } from "./config";
import { buildOpenCodePromptInput } from "./opencode-assets";
import { startOpenCodeServer } from "./opencode-server";
import { mirrorOpenCodeTranscript } from "./opencode-transcript";
import {
  buildStructuredOutputSchema,
  STRUCTURED_OUTPUT_RETRIES,
  STRUCTURED_OUTPUT_TOOL,
} from "./request";
import type { GenerateOptions, StructuredResponse } from "./types";

const GENERATION_AGENT = "nudge-generation";
const GENERATION_TIMEOUT_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 30_000;
type OpenCodeConfig = Extract<ConfigEntry, { type: "document" }>["info"];
type OpenCodeInstance = Awaited<ReturnType<typeof startOpenCodeServer>>;

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

export function buildOpenCodeRuntimeConfig(): OpenCodeConfig {
  const permissions: PermissionRuleset = [
    { action: "*", resource: "*", effect: "allow" },
    { action: "question", resource: "*", effect: "deny" },
  ];
  return {
    share: "disabled",
    update: "disable",
    snapshots: false,
    formatter: false,
    lsp: false,
    media: {
      image: {
        auto_resize: true,
        max_base64_bytes: MAX_CODEFORCES_IMAGE_BYTES,
      },
    },
    websearch: { provider: "exa" },
    default_agent: GENERATION_AGENT,
    agents: {
      [GENERATION_AGENT]: {
        description:
          "Generates structured Codeforces learning content for Nudge.",
        mode: "primary",
        model: `${OPEN_CODE_GENERATION_CONFIG.model}${OPEN_CODE_GENERATION_CONFIG.variant ? `#${OPEN_CODE_GENERATION_CONFIG.variant}` : ""}`,
        permissions,
      },
    },
    permissions,
  };
}

export function buildOpenCodeGenerationConfig(
  options: GenerateOptions,
): OpenCodeConfig {
  return {
    agents: {
      [GENERATION_AGENT]: {
        system: `${options.systemPrompt}\n\nThis is unattended generation. Questions are disabled. Complete the task using the supplied information and available tools. Submit your final result by calling ${STRUCTURED_OUTPUT_TOOL} with every required schema field. Do not substitute JSON in a text reply for that tool. After a successful submission, end the response without further tool calls.`,
      },
    },
    plugins: [
      {
        package: fileURLToPath(new URL("./opencode-plugin", import.meta.url)),
        options: { schema: buildStructuredOutputSchema(options) },
      },
    ],
  };
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const candidate = error as {
      message?: unknown;
      data?: { message?: unknown };
    };
    if (typeof candidate.data?.message === "string")
      return candidate.data.message;
    if (typeof candidate.message === "string") return candidate.message;
    try {
      return JSON.stringify(error);
    } catch {
      /* Use the string fallback. */
    }
  }
  return String(error);
}

function totalTokenCount(tokens: TokenUsageInfo) {
  const total =
    tokens.input +
    tokens.output +
    tokens.reasoning +
    tokens.cache.read +
    tokens.cache.write;
  return Number.isSafeInteger(total) && total >= 0 ? total : null;
}

function structuredSubmission(session: SessionTransferData) {
  for (const message of session.messages.toReversed()) {
    if (message.type !== "assistant") continue;
    for (const part of message.content.toReversed()) {
      if (
        part.type === "tool" &&
        part.name === STRUCTURED_OUTPUT_TOOL &&
        part.state.status === "completed"
      ) {
        return { message, output: part.state.input };
      }
    }
  }
  return null;
}

function assertSuccessfulSession(session: SessionTransferData) {
  if (session.info.outcome === "succeeded") return;
  const message = session.messages
    .toReversed()
    .find((item) => item.type === "assistant" && item.error);
  const detail =
    message?.type === "assistant" && message.error
      ? `${message.error.type}: ${message.error.message}`
      : `session ${session.info.id} ${session.info.outcome ?? "did not finish"}`;
  throw new Error(`OpenCode ${detail}`);
}

export function toStructuredResponse({
  session,
  providerName,
  transcriptPath,
}: {
  session: SessionTransferData;
  providerName?: string;
  transcriptPath?: string | null;
}): StructuredResponse {
  assertSuccessfulSession(session);
  const submission = structuredSubmission(session);
  if (!submission) {
    throw new Error(
      `OpenCode response missing a successful ${STRUCTURED_OUTPUT_TOOL} submission (session: ${session.info.id})`,
    );
  }
  const { message, output } = submission;
  return {
    outputText: JSON.stringify(output),
    responseId: message.id,
    ...(transcriptPath
      ? { transcriptPath }
      : {
          transcriptWarning: `Could not mirror OpenCode session ${session.info.id}; it was retained in OpenCode for inspection.`,
        }),
    displayName: OPEN_CODE_GENERATION_CONFIG.displayName,
    resolvedModel: `${message.model.providerID}/${message.model.id}`,
    finishReason: "stop",
    nativeFinishReason: message.rawFinish?.trim() || message.finish || null,
    providerName: `${providerName?.trim() || message.model.providerID} via OpenCode`,
    totalTokens: totalTokenCount(session.info.tokens),
  };
}

function createGenerationAbort(externalSignal?: AbortSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () =>
      controller.abort(
        new Error(
          `OpenCode generation timed out after ${GENERATION_TIMEOUT_MS / 60_000} minutes`,
        ),
      ),
    GENERATION_TIMEOUT_MS,
  );
  timeout.unref?.();
  const forwardExternalAbort = () =>
    controller.abort(
      externalSignal?.reason ?? new DOMException("Aborted", "AbortError"),
    );
  if (externalSignal?.aborted) forwardExternalAbort();
  else
    externalSignal?.addEventListener("abort", forwardExternalAbort, {
      once: true,
    });
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", forwardExternalAbort);
    },
  };
}

export async function listOpenCodeModels(
  client: OpenCodeClient,
  directory = process.cwd(),
) {
  await waitForOpenCodePlugins(client, directory);
  const location = { directory };
  const request = { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
  const [providers, models] = await Promise.all([
    client.provider.list({ location }, request),
    client.model.list({ location }, request),
  ]);
  return { providers: providers.data, models: models.data };
}

async function waitForOpenCodePlugins(
  client: OpenCodeClient,
  directory: string,
  required = [
    "opencode.config.agent",
    "opencode.config.provider",
    "opencode.config.policy",
  ],
  externalSignal?: AbortSignal,
) {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = externalSignal
    ? AbortSignal.any([timeout, externalSignal])
    : timeout;
  // V2 announces its HTTP endpoint before location plugins finish activating.
  // Reading the catalog immediately can otherwise return an empty/default view.
  while (true) {
    const { data } = await client.plugin.list(
      { location: { directory } },
      { signal },
    );
    for (const id of required) {
      const plugin = data.find((candidate) => candidate.id === id);
      if (plugin?.state.status === "failed") {
        throw new Error(`OpenCode plugin ${id} failed: ${plugin.state.error}`);
      }
    }
    if (
      required.every((id) =>
        data.some(
          (plugin) => plugin.id === id && plugin.state.status === "active",
        ),
      )
    )
      return;
    await delay(100, undefined, { signal });
  }
}

export class LocalOpenCodeRuntime implements OpenCodeRuntime {
  private closed = false;
  private readonly providerNames = new Map<string, string>();

  constructor(private readonly instance: OpenCodeInstance) {}

  async preflight(): Promise<OpenCodePreflight> {
    const health = await this.instance.client.server.info({
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (health.version !== this.instance.expectedVersion) {
      throw new Error(
        `Expected OpenCode ${this.instance.expectedVersion}, but the server reported ${health.version}`,
      );
    }
    const { providers, models } = await listOpenCodeModels(
      this.instance.client,
    );
    for (const provider of providers)
      this.providerNames.set(provider.id, provider.name);
    const provider = providers.find(
      (candidate) => candidate.id === OPEN_CODE_GENERATION_CONFIG.providerId,
    );
    if (!provider || provider.activation === "disabled") {
      throw new Error(
        `OpenCode provider ${OPEN_CODE_GENERATION_CONFIG.providerId} is unavailable; run bun run opencode -- auth login`,
      );
    }
    const model = models.find(
      (candidate) =>
        candidate.providerID === provider.id &&
        candidate.id === OPEN_CODE_GENERATION_CONFIG.modelId,
    );
    if (!model?.enabled) {
      throw new Error(
        `OpenCode model ${OPEN_CODE_GENERATION_CONFIG.model} is unavailable or not connected; run bun run models ${provider.id} or bun run opencode -- auth login`,
      );
    }
    if (!model.capabilities.tools) {
      throw new Error(
        `OpenCode model ${OPEN_CODE_GENERATION_CONFIG.model} does not support the tool calls required for structured output`,
      );
    }
    if (!model.capabilities.input.includes("image")) {
      throw new Error(
        `OpenCode model ${OPEN_CODE_GENERATION_CONFIG.model} does not support the image inputs required by Nudge`,
      );
    }
    const variant = OPEN_CODE_GENERATION_CONFIG.variant;
    if (
      variant &&
      !model.variants.some((candidate) => candidate.id === variant)
    ) {
      throw new Error(
        `OpenCode model ${OPEN_CODE_GENERATION_CONFIG.model} does not expose the ${variant} variant`,
      );
    }
    return {
      executablePath: this.instance.executablePath,
      version: health.version,
      providerName: provider.name,
      modelName: model.name,
      modelReference: OPEN_CODE_GENERATION_CONFIG.model,
      variant,
      displayName: OPEN_CODE_GENERATION_CONFIG.displayName,
    };
  }

  generate = async (options: GenerateOptions): Promise<StructuredResponse> => {
    if (this.closed) throw new Error("OpenCode runtime is closed");
    const workingDirectory = await mkdtemp(
      join(tmpdir(), "nudge-opencode-generation-"),
    );
    const generationAbort = createGenerationAbort(options.abortSignal);
    let sessionId: string | null = null;
    let transcriptPath: string | null = null;
    let abortPromise: Promise<void> | null = null;

    const captureTranscript = async () => {
      if (!sessionId) return null;
      try {
        const exportProcess = Bun.spawn(
          [
            this.instance.executablePath,
            "session",
            "export",
            sessionId,
            "--server",
            this.instance.server.url,
          ],
          {
            cwd: workingDirectory,
            env: this.instance.environment,
            stdout: "pipe",
            stderr: "pipe",
            timeout: REQUEST_TIMEOUT_MS,
          },
        );
        const [stdout, exitCode] = await Promise.all([
          new Response(exportProcess.stdout).arrayBuffer(),
          exportProcess.exited,
          new Response(exportProcess.stderr).text(),
        ]);
        if (exitCode !== 0) return null;
        return await mirrorOpenCodeTranscript({
          sessionId,
          transcript: new Uint8Array(stdout),
        });
      } catch {
        return null;
      }
    };
    const abortSession = () => {
      if (!sessionId || abortPromise) return;
      abortPromise = this.instance.client.session
        .interrupt(
          { sessionID: sessionId },
          { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
        )
        .then(() => undefined)
        .catch(() => undefined);
    };

    try {
      generationAbort.signal.throwIfAborted();
      await writeFile(
        join(workingDirectory, "opencode.json"),
        JSON.stringify(buildOpenCodeGenerationConfig(options)),
      );
      await waitForOpenCodePlugins(
        this.instance.client,
        workingDirectory,
        [
          "opencode.config.agent",
          "opencode.config.policy",
          "nudge.structured-output",
        ],
        generationAbort.signal,
      );
      const session = await this.instance.client.session.create(
        {
          location: { directory: workingDirectory },
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
        { signal: generationAbort.signal },
      );
      sessionId = session.id;
      generationAbort.signal.addEventListener("abort", abortSession, {
        once: true,
      });
      generationAbort.signal.throwIfAborted();
      const input = await buildOpenCodePromptInput({
        input: options.userPrompt,
        workingDirectory,
        abortSignal: generationAbort.signal,
      });
      const request = { signal: generationAbort.signal };
      await this.instance.client.session.prompt(
        { sessionID: sessionId, ...input },
        request,
      );
      let exported: SessionTransferData | undefined;
      for (let attempt = 0; attempt <= STRUCTURED_OUTPUT_RETRIES; attempt++) {
        await this.instance.client.session.wait(
          { sessionID: sessionId },
          request,
        );
        exported = await this.instance.client.session.export(
          { sessionID: sessionId },
          request,
        );
        assertSuccessfulSession(exported);
        if (
          structuredSubmission(exported) ||
          attempt === STRUCTURED_OUTPUT_RETRIES
        )
          break;
        await this.instance.client.session.prompt(
          {
            sessionID: sessionId,
            text: `The result has not been submitted. Call ${STRUCTURED_OUTPUT_TOOL} with your complete result matching its schema.`,
          },
          request,
        );
      }
      generationAbort.signal.throwIfAborted();
      transcriptPath = await captureTranscript();
      generationAbort.signal.throwIfAborted();
      if (!exported) throw new Error("OpenCode returned no session transcript");
      return toStructuredResponse({
        session: exported,
        providerName: this.providerNames.get(
          OPEN_CODE_GENERATION_CONFIG.providerId,
        ),
        transcriptPath,
      });
    } catch (error) {
      // Cancelling an HTTP request does not cancel V2's durably queued work.
      abortSession();
      await abortPromise;
      transcriptPath ??= await captureTranscript();
      if (generationAbort.signal.aborted) throw generationAbort.signal.reason;
      throw new Error(`OpenCode generation failed: ${describeError(error)}`, {
        cause: error,
      });
    } finally {
      generationAbort.signal.removeEventListener("abort", abortSession);
      generationAbort.dispose();
      await abortPromise;
      if (sessionId && transcriptPath) {
        await this.instance.client.session
          .remove(
            { sessionID: sessionId },
            {
              signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            },
          )
          .catch(() => undefined);
      }
      await rm(workingDirectory, { recursive: true, force: true });
    }
  };

  async close() {
    if (this.closed) return;
    this.closed = true;
    await this.instance.server.close();
  }
}

export async function createLocalOpenCodeInstance() {
  const instance = await startOpenCodeServer({
    config: buildOpenCodeRuntimeConfig(),
  });
  return {
    instance,
    executablePath: instance.executablePath,
    expectedVersion: instance.expectedVersion,
  };
}

export async function createLocalOpenCodeRuntime(): Promise<OpenCodeRuntime> {
  const { instance } = await createLocalOpenCodeInstance();
  return new LocalOpenCodeRuntime(instance);
}
