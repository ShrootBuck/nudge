import { mock } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = await mkdtemp(join(tmpdir(), "nudge-abort-test-"));
process.chdir(root);
const marker = join(root, "ready.json");
const firstLine = '{"type":"thread.started","thread_id":"abort-test"}\n';
mock.module("../../src/lib/ai/codex-cli", () => ({
  codexEnvironment: () => ({}),
  codexCommand: () => [
    process.execPath,
    "--no-env-file",
    "-e",
    `
    process.on("SIGTERM",()=>{});
    process.stdout.write(${JSON.stringify(firstLine)});
    await Bun.write(${JSON.stringify(marker)},JSON.stringify({pid:process.pid,cwd:process.cwd()}));
    setInterval(()=>{},1000);
  `,
  ],
}));
const { generateWithCodex } = await import("../../src/lib/ai/codex");
const abort = new AbortController();
try {
  const generation = generateWithCodex({
    systemPrompt: "system",
    userPrompt: "user",
    outputSchema: {
      name: "test",
      description: "test",
      schema: { type: "object" },
    },
    abortSignal: abort.signal,
  });
  const stopWaiting = AbortSignal.timeout(5000);
  while (!(await Bun.file(marker).exists())) {
    stopWaiting.throwIfAborted();
    await Bun.sleep(15);
  }
  const { pid, cwd } = await Bun.file(marker).json();
  const reason = new Error("user interrupted");
  abort.abort(reason);
  await assert.rejects(generation, (error) => error === reason);
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  assert.equal(await Bun.file(marker).exists(), true);
  await assert.rejects(readdir(cwd), { code: "ENOENT" });
  const [transcript] = await readdir(join(root, ".codex-runs"));
  assert.equal(
    await readFile(join(root, ".codex-runs", transcript), "utf8"),
    firstLine,
  );
} finally {
  abort.abort();
  process.chdir(tmpdir());
  await rm(root, { recursive: true, force: true });
}
console.log("ok");
