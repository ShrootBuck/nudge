import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { delimiter, dirname, join } from "node:path";
import { OpenCode } from "@opencode/client";

const require = createRequire(import.meta.url);
const SERVER_STARTUP_TIMEOUT_MS = 30_000;
const SERVER_SHUTDOWN_TIMEOUT_MS = 5_000;

async function* readChunks(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function startOpenCodeServer({
  config,
  environment = process.env,
}: {
  config: object;
  environment?: NodeJS.ProcessEnv;
}) {
  const packagePath = require.resolve("@opencode/cli/package.json");
  const metadata = require(packagePath) as {
    version: string;
    bin: { opencode: string };
  };
  const executablePath = join(dirname(packagePath), metadata.bin.opencode);
  const password = randomBytes(32).toString("base64url");
  const serverEnvironment = {
    ...environment,
    PATH: [join(process.cwd(), "node_modules", ".bin"), environment.PATH]
      .filter(Boolean)
      .join(delimiter),
    OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
    OPENCODE_CONFIG_PROJECT_DISABLE: "0",
    OPENCODE_DISABLE_PROJECT_CONFIG: "0",
    OPENCODE_PASSWORD: password,
    OPENCODE_SERVER_PASSWORD: password,
    OPENCODE_DISABLE_AUTOUPDATE: "1",
  };
  // --stdio owns a private server whose lifetime is tied to this stdin pipe.
  // It neither discovers nor replaces the user's background OpenCode service.
  const child = Bun.spawn(
    [
      executablePath,
      "serve",
      "--stdio",
      "--hostname",
      "127.0.0.1",
      "--port",
      "0",
    ],
    { env: serverEnvironment, stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  );
  let stderr = "";
  const drainStderr = (async () => {
    const decoder = new TextDecoder();
    for await (const chunk of readChunks(child.stderr)) {
      stderr = (stderr + decoder.decode(chunk, { stream: true })).slice(-8_192);
    }
  })();
  let closing: Promise<void> | undefined;
  const close = () => {
    closing ??= (async () => {
      child.stdin.end();
      const killTimeout = setTimeout(
        () => child.kill("SIGKILL"),
        SERVER_SHUTDOWN_TIMEOUT_MS,
      );
      try {
        await child.exited;
        await drainStderr;
      } finally {
        clearTimeout(killTimeout);
      }
    })();
    return closing;
  };

  let startupTimeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const url = await new Promise<string>((resolve, reject) => {
      startupTimeout = setTimeout(() => {
        reject(
          new Error(`OpenCode server startup timed out. ${stderr.trim()}`),
        );
      }, SERVER_STARTUP_TIMEOUT_MS);
      const readStdout = async () => {
        const decoder = new TextDecoder();
        let pending = "";
        for await (const chunk of readChunks(child.stdout)) {
          pending += decoder.decode(chunk, { stream: true });
          let newline = pending.indexOf("\n");
          while (newline !== -1) {
            const line = pending.slice(0, newline);
            pending = pending.slice(newline + 1);
            try {
              const endpoint = JSON.parse(line) as { url?: string };
              if (endpoint.url) {
                const parsed = new URL(endpoint.url);
                if (
                  parsed.protocol === "http:" &&
                  parsed.hostname === "127.0.0.1"
                ) {
                  resolve(endpoint.url);
                }
              }
            } catch {
              // Plugins can print diagnostics before the server announces itself.
            }
            newline = pending.indexOf("\n");
          }
          pending = pending.slice(-8_192);
        }
      };
      void readStdout().catch(reject);
      void child.exited.then(async (code) => {
        await drainStderr;
        reject(new Error(`OpenCode server exited (${code}). ${stderr.trim()}`));
      }, reject);
    });
    const headers = {
      authorization: `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`,
    };
    return {
      executablePath,
      expectedVersion: metadata.version,
      environment: serverEnvironment,
      client: OpenCode.make({ baseUrl: url, headers }),
      server: { url, close },
    };
  } catch (error) {
    await close();
    throw error;
  } finally {
    clearTimeout(startupTimeout);
  }
}
