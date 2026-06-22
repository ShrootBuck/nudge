import {
  chmod,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { envvars } from "@trigger.dev/sdk";

export const CODEX_AUTH_ENV_NAME = "CODEX_AUTH_JSON_BASE64";

type ManagedCodexAuthOptions<T> = {
  encodedAuth: string | undefined;
  run: (codexHome: string) => Promise<T>;
  checkpoint?: (encodedAuth: string) => Promise<void>;
  parentDirectory?: string;
};

function normalizedBase64(value: string) {
  return value.replace(/\s+/g, "").replace(/=+$/g, "");
}

export function decodeCodexAuthJson(encodedAuth: string) {
  const trimmed = encodedAuth.trim();
  if (!trimmed) {
    throw new Error(`Missing required secret: ${CODEX_AUTH_ENV_NAME}`);
  }

  const decoded = Buffer.from(trimmed, "base64");
  if (
    decoded.length === 0 ||
    normalizedBase64(decoded.toString("base64")) !== normalizedBase64(trimmed)
  ) {
    throw new Error(`${CODEX_AUTH_ENV_NAME} is not valid base64`);
  }

  const authJson = decoded.toString("utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(authJson);
  } catch {
    throw new Error(`${CODEX_AUTH_ENV_NAME} does not contain valid JSON`);
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    (parsed as { auth_mode?: unknown }).auth_mode !== "chatgpt"
  ) {
    throw new Error(
      `${CODEX_AUTH_ENV_NAME} must contain ChatGPT-authenticated Codex credentials`,
    );
  }

  return authJson;
}

export async function createManagedCodexHome({
  encodedAuth,
  parentDirectory = tmpdir(),
}: {
  encodedAuth: string;
  parentDirectory?: string;
}) {
  const authJson = decodeCodexAuthJson(encodedAuth);
  const codexHome = await mkdtemp(join(parentDirectory, "nudge-codex-home-"));

  try {
    await chmod(codexHome, 0o700);
    const authPath = join(codexHome, "auth.json");
    await writeFile(authPath, authJson, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await chmod(authPath, 0o600);

    return { authPath, codexHome };
  } catch (error) {
    await rm(codexHome, { recursive: true, force: true });
    throw error;
  }
}

export async function encodeCodexAuthFile(authPath: string) {
  const authJson = await readFile(authPath, "utf8");
  const encoded = Buffer.from(authJson, "utf8").toString("base64");
  decodeCodexAuthJson(encoded);
  return encoded;
}

export async function checkpointTriggerCodexAuth(encodedAuth: string) {
  await envvars.update(CODEX_AUTH_ENV_NAME, { value: encodedAuth });
  process.env[CODEX_AUTH_ENV_NAME] = encodedAuth;
}

function localCodexAuthPath() {
  const codexHome = process.env.CODEX_HOME?.trim() || join(homedir(), ".codex");
  return join(codexHome, "auth.json");
}

async function checkpointLocalCodexAuth(authPath: string, encodedAuth: string) {
  const authJson = decodeCodexAuthJson(encodedAuth);
  const temporaryPath = `${authPath}.nudge-refresh`;

  try {
    await writeFile(temporaryPath, authJson, {
      encoding: "utf8",
      mode: 0o600,
    });
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, authPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function withManagedCodexAuth<T>({
  encodedAuth,
  run,
  checkpoint = checkpointTriggerCodexAuth,
  parentDirectory,
}: ManagedCodexAuthOptions<T>) {
  const { authPath, codexHome } = await createManagedCodexHome({
    encodedAuth: encodedAuth ?? "",
    parentDirectory,
  });

  let result: T | undefined;
  let runError: unknown;
  let checkpointError: unknown;

  try {
    result = await run(codexHome);
  } catch (error) {
    runError = error;
  }

  try {
    const refreshedAuth = await encodeCodexAuthFile(authPath);
    await checkpoint(refreshedAuth);
  } catch (error) {
    checkpointError = error;
  }

  await rm(codexHome, { recursive: true, force: true });

  if (checkpointError) {
    throw new AggregateError(
      runError ? [runError, checkpointError] : [checkpointError],
      "Codex credential checkpoint failed",
    );
  }

  if (runError) {
    throw runError;
  }

  return result as T;
}

export async function withLocalCodexAuth<T>({
  run,
}: {
  run: (codexHome: string) => Promise<T>;
}) {
  const authPath = localCodexAuthPath();
  let encodedAuth: string;

  try {
    encodedAuth = Buffer.from(await readFile(authPath)).toString("base64");
  } catch (error) {
    throw new Error(
      `Could not read local Codex credentials at ${authPath}. Run codex login with file-based credential storage.`,
      { cause: error },
    );
  }

  return withManagedCodexAuth({
    encodedAuth,
    run,
    checkpoint: (refreshedAuth) =>
      checkpointLocalCodexAuth(authPath, refreshedAuth),
  });
}
