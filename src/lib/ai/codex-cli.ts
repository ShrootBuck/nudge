import { tmpdir } from "node:os";
import { z } from "zod";
import { generationConfig } from "./config";

const cli = require.resolve("@openai/codex/bin/codex.js");
const expectedVersion: string = require("@openai/codex/package.json").version;

// Bun loads the worker's .env files on startup. Only the parent makes
// authenticated Nudge requests. Codex authenticates separately via ChatGPT.
export function codexEnvironment(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const key of [
    "HOME",
    "USER",
    "LOGNAME",
    "PATH",
    "TMPDIR",
    "LANG",
    "LC_ALL",
    "CODEX_HOME",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_STATE_HOME",
    "XDG_CACHE_HOME",
  ]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

export function codexCommand(args: string[]) {
  return [process.execPath, "--no-env-file", cli, ...args];
}

async function inspectCli(args: string[]) {
  const child = Bun.spawn(codexCommand(args), {
    cwd: tmpdir(),
    env: codexEnvironment(),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code !== 0)
    throw new Error(
      `Codex ${args.join(" ")} failed: ${stderr.trim() || stdout.trim() || code}`,
    );
  return { stdout, stderr };
}

const catalogSchema = z.object({
  models: z.array(
    z.object({
      slug: z.string(),
      display_name: z.string(),
      input_modalities: z.array(z.string()),
      supported_reasoning_levels: z.array(z.object({ effort: z.string() })),
      visibility: z.string(),
    }),
  ),
});

export async function listCodexModels() {
  const { stdout } = await inspectCli(["debug", "models"]);
  return catalogSchema.parse(JSON.parse(stdout)).models;
}

export async function preflightCodex() {
  const { stdout, stderr } = await inspectCli(["login", "status"]).catch(() => {
    throw new Error(
      "Sign in with ChatGPT using bun run codex -- login before starting generation.",
    );
  });
  if (!/^Logged in using ChatGPT\b/im.test(`${stdout}\n${stderr}`))
    throw new Error(
      "Nudge requires a ChatGPT login. Use bun run codex -- login and select Sign in with ChatGPT.",
    );
  const [version, models] = await Promise.all([
    inspectCli(["--version"]),
    listCodexModels(),
  ]);
  if (version.stdout.trim() !== `codex-cli ${expectedVersion}`)
    throw new Error(
      `Expected Codex CLI ${expectedVersion}, got ${version.stdout.trim()}`,
    );
  const model = models.find((m) => m.slug === generationConfig.model);
  if (!model)
    throw new Error(
      `Unknown Codex model ${generationConfig.model}. See bun run models.`,
    );
  if (!model.input_modalities.includes("image"))
    throw new Error(`${model.slug} does not support image input for diagrams.`);
  if (
    !model.supported_reasoning_levels.some(
      (level) => level.effort === generationConfig.reasoningEffort,
    )
  )
    throw new Error(
      `${model.slug} does not support ${generationConfig.reasoningEffort} reasoning. See bun run models ${model.slug}.`,
    );
  return { version: expectedVersion, ...generationConfig };
}
