import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deleteSession,
  getSessionMessages,
  query,
  type SDKResultMessage,
  type SDKSystemMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import {
  buildClaudeCodePromptContent,
  type ClaudeCodePromptBlock,
} from "./claude-code-assets";
import { toStrictJsonSchema } from "./request";
import type { GenerateOptions, StructuredResponse } from "./types";

const GENERATION_TIMEOUT_MS = 60 * 60 * 1000;
const GENERATION_TOOLS = ["WebSearch", "WebFetch"];
const TRANSCRIPT_DIRECTORY = join(process.cwd(), ".claude-runs");
const require = createRequire(import.meta.url);

export const CLAUDE_CODE_GENERATION_CONFIG = {
  model: "claude-opus-5",
  effort: "max",
  displayName: "Claude Opus 5 (max)",
} as const;

export type ClaudeCodePreflight = {
  sdkVersion: string;
  cliVersion: string;
  apiKeySource: string;
  resolvedModel: string;
  effort: string;
  displayName: string;
};

export type ClaudeCodeRuntime = {
  preflight(): Promise<ClaudeCodePreflight>;
  generate(options: GenerateOptions): Promise<StructuredResponse>;
  close(): Promise<void>;
};

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      // Fall through to String for non-serializable errors.
    }
  }
  return String(error);
}

function safeSessionFilename(sessionId: string) {
  return sessionId.replaceAll(/[^a-zA-Z0-9_-]/g, "_");
}

function totalTokenCount(result: SDKResultMessage) {
  const total = Object.values(result.modelUsage).reduce(
    (sum, usage) =>
      sum +
      usage.inputTokens +
      usage.outputTokens +
      usage.cacheCreationInputTokens +
      usage.cacheReadInputTokens,
    0,
  );
  return Number.isSafeInteger(total) && total > 0 ? total : null;
}

function buildOutputSchema(options: GenerateOptions) {
  return {
    ...toStrictJsonSchema(options.outputSchema.schema),
    title: options.outputSchema.name,
    description: options.outputSchema.description,
  };
}

async function* singleUserMessage(
  content: ClaudeCodePromptBlock[],
): AsyncGenerator<SDKUserMessage> {
  yield {
    type: "user",
    message: { role: "user", content },
    parent_tool_use_id: null,
  };
}

function createGenerationAbort(externalSignal?: AbortSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(
      new Error(
        `Claude Code generation timed out after ${GENERATION_TIMEOUT_MS / 60_000} minutes`,
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
    controller,
    dispose() {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", forwardExternalAbort);
    },
  };
}

// A run that never reached the model still reports `subtype: "success"` — auth
// and API failures only show up as `is_error` plus a synthetic result string.
export function assertUsableResult(
  result: SDKResultMessage,
): asserts result is Extract<SDKResultMessage, { subtype: "success" }> {
  if (result.subtype !== "success") {
    throw new Error(
      `Claude Code run ended as ${result.subtype}${
        result.errors.length > 0 ? `: ${result.errors.join("; ")}` : ""
      }`,
    );
  }
  if (result.is_error) {
    throw new Error(
      `Claude Code run failed${
        result.terminal_reason ? ` (${result.terminal_reason})` : ""
      }: ${result.result || "unknown error"}`,
    );
  }
}

export function toStructuredResponse({
  result,
  resolvedModel,
  transcriptPath,
}: {
  result: SDKResultMessage;
  resolvedModel?: string | null;
  transcriptPath?: string | null;
}): StructuredResponse {
  assertUsableResult(result);

  if (result.structured_output == null) {
    throw new Error(
      `Claude Code response missing structured output (session: ${result.session_id}, stop_reason: ${result.stop_reason ?? "unknown"})`,
    );
  }

  return {
    outputText: JSON.stringify(result.structured_output),
    responseId: result.session_id,
    ...(transcriptPath ? { transcriptPath } : {}),
    ...(!transcriptPath
      ? {
          transcriptWarning: `Could not mirror Claude Code session ${result.session_id}; it was retained in Claude Code for inspection.`,
        }
      : {}),
    displayName: CLAUDE_CODE_GENERATION_CONFIG.displayName,
    resolvedModel:
      resolvedModel?.trim() ||
      Object.keys(result.modelUsage)[0] ||
      CLAUDE_CODE_GENERATION_CONFIG.model,
    finishReason: "stop",
    nativeFinishReason: result.stop_reason?.trim() || null,
    providerName: "Anthropic via Claude Code",
    totalTokens: totalTokenCount(result),
  };
}

class LocalClaudeCodeRuntime implements ClaudeCodeRuntime {
  private closed = false;

  async preflight(): Promise<ClaudeCodePreflight> {
    const { version: sdkVersion } =
      require("@anthropic-ai/claude-agent-sdk/package.json") as {
        version: string;
      };
    const workingDirectory = await mkdtemp(
      join(tmpdir(), "nudge-claude-code-preflight-"),
    );

    let init: SDKSystemMessage | null = null;
    let result: SDKResultMessage | null = null;

    try {
      const stream = query({
        prompt: "Reply with OK.",
        options: {
          model: CLAUDE_CODE_GENERATION_CONFIG.model,
          effort: "low",
          thinking: { type: "disabled" },
          systemPrompt: "Reply with the single word OK.",
          cwd: workingDirectory,
          settingSources: [],
          tools: [],
          permissionMode: "dontAsk",
          maxTurns: 1,
          persistSession: false,
        },
      });

      try {
        for await (const message of stream) {
          if (message.type === "system" && message.subtype === "init") {
            init = message;
          } else if (message.type === "result") {
            result = message;
          }
        }
      } catch (error) {
        if (!result) {
          throw error;
        }
      }
    } catch (error) {
      throw new Error(`Claude Code preflight failed: ${describeError(error)}`, {
        cause: error,
      });
    } finally {
      await rm(workingDirectory, { recursive: true, force: true });
    }

    if (!result) {
      throw new Error("Claude Code preflight failed: no result message");
    }
    try {
      assertUsableResult(result);
    } catch (error) {
      throw new Error(
        `Claude Code preflight failed: ${describeError(error)}. Sign in again with the Claude Code CLI (\`claude\`, then \`/login\`), or set ANTHROPIC_API_KEY to bill the Anthropic API instead.`,
        { cause: error },
      );
    }
    if (!init) {
      throw new Error("Claude Code preflight failed: no session init message");
    }

    return {
      sdkVersion,
      cliVersion: init.claude_code_version,
      apiKeySource: init.apiKeySource,
      resolvedModel: init.model,
      effort: CLAUDE_CODE_GENERATION_CONFIG.effort,
      displayName: CLAUDE_CODE_GENERATION_CONFIG.displayName,
    };
  }

  generate = async (options: GenerateOptions): Promise<StructuredResponse> => {
    if (this.closed) {
      throw new Error("Claude Code runtime is closed");
    }

    const workingDirectory = await mkdtemp(
      join(tmpdir(), "nudge-claude-code-generation-"),
    );
    const generationAbort = createGenerationAbort(options.abortSignal);
    let sessionId: string | null = null;
    let resolvedModel: string | null = null;
    let transcriptPath: string | null = null;

    const captureTranscript = async () => {
      if (!sessionId) {
        return null;
      }
      try {
        const messages = await getSessionMessages(sessionId, {
          dir: workingDirectory,
          includeSystemMessages: true,
        });
        await mkdir(TRANSCRIPT_DIRECTORY, { recursive: true });
        const destinationPath = join(
          TRANSCRIPT_DIRECTORY,
          `${safeSessionFilename(sessionId)}.json`,
        );
        await writeFile(destinationPath, JSON.stringify(messages, null, 2));
        return destinationPath;
      } catch {
        return null;
      }
    };

    try {
      if (generationAbort.controller.signal.aborted) {
        throw generationAbort.controller.signal.reason;
      }

      const content = await buildClaudeCodePromptContent({
        input: options.userPrompt,
        abortSignal: generationAbort.controller.signal,
      });

      const stream = query({
        prompt: singleUserMessage(content),
        options: {
          model: CLAUDE_CODE_GENERATION_CONFIG.model,
          effort: CLAUDE_CODE_GENERATION_CONFIG.effort,
          thinking: { type: "adaptive" },
          systemPrompt: options.systemPrompt,
          cwd: workingDirectory,
          // Mirror the OpenCode agent's lockdown: a scratch cwd, no user or
          // project settings, web research only, and `dontAsk` so anything
          // outside that set is denied instead of hanging on a prompt.
          settingSources: [],
          tools: [...GENERATION_TOOLS],
          allowedTools: [...GENERATION_TOOLS],
          permissionMode: "dontAsk",
          outputFormat: {
            type: "json_schema",
            schema: buildOutputSchema(options),
          },
          abortController: generationAbort.controller,
        },
      });

      let result: SDKResultMessage | null = null;
      try {
        for await (const message of stream) {
          if (message.type === "system" && message.subtype === "init") {
            sessionId = message.session_id;
            resolvedModel = message.model;
          } else if (message.type === "result") {
            result = message;
          }
        }
      } catch (error) {
        // query() throws after yielding a failing result; that result carries
        // the useful detail, so prefer it over the generic thrown error.
        if (!result) {
          throw error;
        }
      }

      transcriptPath = await captureTranscript();

      if (!result) {
        throw new Error("Claude Code ended without a result message");
      }

      return toStructuredResponse({ result, resolvedModel, transcriptPath });
    } catch (error) {
      transcriptPath ??= await captureTranscript();
      if (generationAbort.controller.signal.aborted) {
        throw generationAbort.controller.signal.reason;
      }
      throw new Error(
        `Claude Code generation failed: ${describeError(error)}`,
        {
          cause: error,
        },
      );
    } finally {
      generationAbort.dispose();

      if (sessionId && transcriptPath) {
        await deleteSession(sessionId, { dir: workingDirectory }).catch(
          () => undefined,
        );
      }
      await rm(workingDirectory, { recursive: true, force: true });
    }
  };

  async close() {
    this.closed = true;
  }
}

export async function createLocalClaudeCodeRuntime(): Promise<ClaudeCodeRuntime> {
  return new LocalClaudeCodeRuntime();
}
