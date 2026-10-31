import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

test("generation delegates retrieval to the agent, submits over HTTPS, and preserves interrupted uploads", async () => {
  // Isolate module mocks so no other test can inherit fake persistence.
  const child = Bun.spawn(
    [
      process.execPath,
      fileURLToPath(
        new URL("./fixtures/generation-execution.ts", import.meta.url),
      ),
    ],
    {
      env: { PATH: process.env.PATH, NODE_ENV: "test" },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10_000,
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  expect(stdout.trim()).toBe("ok");
});
