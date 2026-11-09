import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

test("OpenCode disables transport idle timeouts but still honors cancellation and deadlines", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      fileURLToPath(
        new URL("./fixtures/opencode-transport.ts", import.meta.url),
      ),
    ],
    {
      env: { PATH: process.env.PATH },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 20_000,
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  const [control, completed, cancelled, deadline] = JSON.parse(stdout);
  expect(control).toMatchObject({
    status: "rejected",
    causeName: "TimeoutError",
  });
  expect(completed).toEqual({ status: "fulfilled" });
  expect(cancelled).toMatchObject({
    status: "rejected",
    causeMessage: "Cancelled by test",
  });
  expect(deadline).toMatchObject({
    status: "rejected",
    causeName: "TimeoutError",
  });
}, 25_000);
