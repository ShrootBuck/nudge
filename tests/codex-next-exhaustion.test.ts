import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

for (const available of [0, 2]) {
  test(`100000 requested generations stop cleanly with ${available} eligible problems`, async () => {
    const child = Bun.spawn(
      [
        process.execPath,
        fileURLToPath(
          new URL("./fixtures/codex-next-exhaustion.ts", import.meta.url),
        ),
      ],
      {
        env: { ...process.env, TEST_AVAILABLE_PROBLEMS: String(available) },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        timeout: 10_000,
      },
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(stdout).toContain("No eligible generation candidates.");
    expect(stdout).toContain(
      `Finished ${available}/100000 requested generations`,
    );
    expect(stdout).toContain("exhaustion verified");
  });
}
