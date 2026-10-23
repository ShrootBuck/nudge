import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

// Separate processes keep fake DB/services out of every other test.
for (const [fixture, description] of [
  [
    "request-problem",
    "requests preserve numeric IDs and respect availability, review, and retry states",
  ],
  [
    "sync-problems",
    "sync bounds database concurrency and invalidates committed writes after partial failure",
  ],
]) {
  test(description, async () => {
    const child = Bun.spawn(
      [
        process.execPath,
        fileURLToPath(new URL(`./fixtures/${fixture}.ts`, import.meta.url)),
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
}
