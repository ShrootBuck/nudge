import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

test.skipIf(!process.env.TEST_DATABASE_URL)(
  "generation HTTPS API authenticates, saves atomically, and handles retries and stale claims",
  async () => {
    const child = Bun.spawn(
      [
        process.execPath,
        fileURLToPath(new URL("./fixtures/generation-api.ts", import.meta.url)),
      ],
      {
        env: {
          PATH: process.env.PATH,
          NODE_ENV: "test",
          DATABASE_URL: process.env.TEST_DATABASE_URL,
        },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 30_000,
      },
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(stdout.trim()).toBe("ok");
  },
  35_000,
);
