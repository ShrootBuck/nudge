import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionTransferData } from "@opencode/client";
import { OPEN_CODE_GENERATION_CONFIG } from "../src/lib/ai/config";
import {
  buildOpenCodeRuntimeConfig,
  LocalOpenCodeRuntime,
} from "../src/lib/ai/opencode";
import { startOpenCodeServer } from "../src/lib/ai/opencode-server";
import { STRUCTURED_OUTPUT_TOOL } from "../src/lib/ai/request";
import { problemOutputSchema } from "../src/lib/generate-content/content-schema";

type ModelRequest = {
  messages: { role: string; content: unknown }[];
  tools?: { function: { name: string; parameters: unknown } }[];
};

function modelResponse(call: number, result: Record<string, unknown> | null) {
  const chunk = (delta: object, finish: string | null, usage?: object) =>
    `data: ${JSON.stringify({
      id: `chatcmpl_${call}`,
      object: "chat.completion.chunk",
      created: 1,
      model: OPEN_CODE_GENERATION_CONFIG.modelId,
      choices: [{ index: 0, delta, finish_reason: finish }],
      ...(usage ? { usage } : {}),
    })}\n\n`;
  return new Response(
    [
      chunk(
        result
          ? {
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id: `call_${call}`,
                  type: "function",
                  function: {
                    name: STRUCTURED_OUTPUT_TOOL,
                    arguments: JSON.stringify(result),
                  },
                },
              ],
            }
          : { role: "assistant", content: "Done." },
        null,
      ),
      chunk({}, result ? "tool_calls" : "stop", {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      }),
      "data: [DONE]\n\n",
    ].join(""),
    { headers: { "content-type": "text/event-stream" } },
  );
}

async function createTestInstance(directory: string, providerUrl: string) {
  const config = buildOpenCodeRuntimeConfig();
  config.providers = {
    [OPEN_CODE_GENERATION_CONFIG.providerId]: {
      name: "Local test provider",
      package: "@opencode/ai/providers/openai-compatible",
      settings: { baseURL: `${providerUrl}v1`, apiKey: "local-test-only" },
      models: {
        [OPEN_CODE_GENERATION_CONFIG.modelId]: {
          name: "Test model",
          capabilities: {
            tools: true,
            input: ["text", "image"],
            output: ["text"],
          },
          limit: { context: 100_000, output: 10_000 },
          variants: OPEN_CODE_GENERATION_CONFIG.variant
            ? [{ id: OPEN_CODE_GENERATION_CONFIG.variant }]
            : [],
        },
      },
    },
  };
  return startOpenCodeServer({
    config,
    environment: {
      NODE_ENV: "test",
      PATH: process.env.PATH,
      XDG_DATA_HOME: join(directory, "data"),
      XDG_STATE_HOME: join(directory, "state"),
      XDG_CONFIG_HOME: join(directory, "config"),
      XDG_CACHE_HOME: join(directory, "cache"),
      OPENCODE_CONFIG_DIR: join(directory, "config", "opencode"),
      OPENCODE_DISABLE_MODELS_FETCH: "1",
      OPENCODE_DISABLE_FILEWATCHER: "1",
    },
  });
}

describe("bundled OpenCode V2 runtime", () => {
  test("runs the real V2 server, validates the result tool, exports and cleans up", async () => {
    const directory = await mkdtemp(join(tmpdir(), "nudge-v2-test-"));
    const requests: ModelRequest[] = [];
    const validContent = {
      status: "success",
      reason: null,
      hints: Array.from({ length: 5 }, (_, index) => ({
        order: index + 1,
        content: `Hint ${index + 1}`,
      })),
      editorial: "A sample explanation with $x$ and Unicode π.",
      solution: "int main() { return 0; }",
    };
    const invalidContent = structuredClone(validContent);
    invalidContent.hints[0].content = "Invalid NUL: \0";
    const provider = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const body = (await request.json()) as ModelRequest;
        requests.push(body);
        return modelResponse(
          requests.length,
          requests.length === 1
            ? invalidContent
            : requests.length === 2
              ? validContent
              : null,
        );
      },
    });
    let runtime: LocalOpenCodeRuntime | undefined;
    let transcriptPath: string | undefined;
    try {
      const instance = await createTestInstance(
        directory,
        String(provider.url),
      );
      runtime = new LocalOpenCodeRuntime(instance);
      expect((await runtime.preflight()).version).toBe("2.0.26");
      const result = await runtime.generate({
        systemPrompt: "Nudge test instruction: submit valid learning content.",
        userPrompt: "Return sample learning content.",
        outputSchema: problemOutputSchema,
        abortSignal: AbortSignal.timeout(20_000),
      });
      transcriptPath = result.transcriptPath;
      expect(JSON.parse(result.outputText)).toEqual(validContent);
      expect(result.transcriptWarning).toBeUndefined();
      if (!transcriptPath) throw new Error("Missing transcript");
      const bytes = await readFile(transcriptPath, "utf8");
      const transcript = JSON.parse(bytes) as SessionTransferData;
      expect(bytes).toBe(`${JSON.stringify(transcript, null, 2)}\n`);
      const calls = transcript.messages
        .flatMap((message) =>
          message.type === "assistant" ? message.content : [],
        )
        .filter(
          (part) =>
            part.type === "tool" && part.name === STRUCTURED_OUTPUT_TOOL,
        );
      expect(
        calls.map((part) => part.type === "tool" && part.state.status),
      ).toEqual(["error", "completed"]);
      expect(requests).toHaveLength(3);
      expect(JSON.stringify(requests[0].messages)).toContain(
        "Nudge test instruction",
      );
      expect(
        requests[0].tools?.some(
          (tool) => tool.function.name === STRUCTURED_OUTPUT_TOOL,
        ),
      ).toBe(true);
      expect(
        requests[0].tools?.some((tool) => tool.function.name === "question"),
      ).toBe(false);
      await expect(
        instance.client.session.get({ sessionID: transcript.info.id }),
      ).rejects.toThrow("not found");
    } finally {
      await runtime?.close();
      provider.stop(true);
      if (transcriptPath) await rm(transcriptPath, { force: true });
      await rm(directory, { recursive: true, force: true });
    }
  }, 40_000);

  test("interrupts durable work on cancellation and mirrors it before deleting the session", async () => {
    const directory = await mkdtemp(join(tmpdir(), "nudge-v2-abort-test-"));
    const received = Promise.withResolvers<void>();
    const provider = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        await request.json();
        received.resolve();
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(": waiting\n\n"));
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        );
      },
    });
    let runtime: LocalOpenCodeRuntime | undefined;
    let transcriptPath: string | undefined;
    const abort = new AbortController();
    try {
      const instance = await createTestInstance(
        directory,
        String(provider.url),
      );
      runtime = new LocalOpenCodeRuntime(instance);
      const result = runtime
        .generate({
          systemPrompt: "Submit the result.",
          userPrompt: "Return ok.",
          outputSchema: {
            name: "test_result",
            description: "Result",
            schema: {
              type: "object",
              properties: { value: { type: "string" } },
            },
          },
          abortSignal: AbortSignal.any([
            abort.signal,
            AbortSignal.timeout(20_000),
          ]),
        })
        .then(
          () => null,
          (error: unknown) => error,
        );
      await received.promise;
      const [sessionId] = Object.keys(await instance.client.session.active());
      expect(sessionId).toBeDefined();
      transcriptPath = join(
        process.cwd(),
        ".opencode-runs",
        `${sessionId}.json`,
      );
      const reason = new Error("Cancelled by test");
      abort.abort(reason);
      expect(await result).toBe(reason);
      expect(await instance.client.session.active()).toEqual({});
      const transcript = JSON.parse(
        await readFile(transcriptPath, "utf8"),
      ) as SessionTransferData;
      expect(transcript.info.outcome).toBe("interrupted");
      await expect(
        instance.client.session.get({ sessionID: sessionId }),
      ).rejects.toThrow("not found");
    } finally {
      abort.abort();
      await runtime?.close();
      provider.stop(true);
      if (transcriptPath) await rm(transcriptPath, { force: true });
      await rm(directory, { recursive: true, force: true });
    }
  }, 40_000);
});
