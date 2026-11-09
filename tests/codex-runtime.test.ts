import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readCodexOutcome } from "../src/lib/ai/codex";
import { codexEnvironment } from "../src/lib/ai/codex-cli";

test("only completed Codex turns count, with cached and reasoning tokens counted once", async () => {
  const directory = await mkdtemp(join(tmpdir(), "nudge-codex-event-test-"));
  const path = join(directory, "events.jsonl");
  const start = { type: "thread.started", thread_id: "example" };
  const write = (...events: unknown[]) =>
    writeFile(
      path,
      events.map((event) => JSON.stringify(event)).join("\n") + "\n",
    );
  try {
    await write(start, {
      type: "turn.completed",
      usage: {
        input_tokens: 100,
        cached_input_tokens: 60,
        output_tokens: 15,
        reasoning_output_tokens: 9,
      },
    });
    expect(await readCodexOutcome(path)).toEqual({
      threadId: "example",
      totalTokens: 115,
    });
    await write(start, {
      type: "item.completed",
      item: { type: "agent_message", text: "{}" },
    });
    await expect(readCodexOutcome(path)).rejects.toThrow(
      "without a completed turn",
    );
    await write(start, {
      type: "turn.failed",
      error: { message: "usage limit reached" },
    });
    await expect(readCodexOutcome(path)).rejects.toThrow("usage limit reached");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("worker credentials and API key overrides stay out of the Codex child", () => {
  const env = codexEnvironment();
  for (const name of [
    "CACHE_REVALIDATION_SECRET",
    "DATABASE_URL",
    "DIRECT_URL",
    "DISCORD_WEBHOOK_URL",
    "CODEX_API_KEY",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
  ])
    expect(env).not.toHaveProperty(name);
  expect(env.HOME).toBe(process.env.HOME);
});

test("cancellation terminates an active CLI and retains the partial native transcript", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      "--no-env-file",
      fileURLToPath(new URL("./fixtures/codex-abort.ts", import.meta.url)),
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 12_000,
    },
  );
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect({ code, stdout, stderr }).toEqual({
    code: 0,
    stdout: "ok\n",
    stderr: "",
  });
}, 15_000);
