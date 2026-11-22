import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const scenarios = [
  { mode: "empty", available: 0, completed: 0, code: 0 },
  { mode: "empty", available: 2, completed: 2, code: 0 },
  { mode: "parallel", available: 10, completed: 7, code: 0 },
  { mode: "parallel", available: 5, completed: 5, code: 0 },
  { mode: "failed", available: 10, completed: 6, code: 1 },
  { mode: "fatal", available: 10, completed: 2, code: 1 },
  { mode: "interrupt", available: 10, completed: 0, code: 130 },
];
for (const scenario of scenarios) {
  const { mode, available, completed } = scenario;
  test(`batch ${mode} with ${available} eligible problems`, async () => {
    const child = Bun.spawn(
      [
        process.execPath,
        fileURLToPath(
          new URL("./fixtures/opencode-next-exhaustion.ts", import.meta.url),
        ),
      ],
      {
        env: {
          ...process.env,
          TEST_BATCH_MODE: mode,
          CACHE_REVALIDATION_URL: "https://nudge.example",
          TEST_AVAILABLE_PROBLEMS: String(available),
        },
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
    expect(code, stderr).toBe(scenario.code);
    if (scenario.code === 0) expect(stderr).toBe("");
    expect(stdout).toContain("batch verified");
    const count = mode === "empty" ? 100_000 : 7;
    if (available < count)
      expect(stdout).toContain("No eligible generation candidates.");
    if (mode !== "interrupt")
      expect(stdout).toContain(`${completed}/${count} requested generations`);
  });
}
