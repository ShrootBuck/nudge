import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

test("OpenCode waits outlive Bun's idle timeout but still honor cancellation and deadlines", async () => {
  const child = Bun.spawn(
    [
      process.execPath,
      fileURLToPath(
        new URL("./fixtures/opencode-transport.ts", import.meta.url),
      ),
    ],
    {
      env: { PATH: process.env.PATH, BUN_CONFIG_HTTP_IDLE_TIMEOUT: "1" },
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
    message: expect.stringContaining("Transport: The operation timed out."),
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
