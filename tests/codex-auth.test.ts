import { afterEach, describe, expect, test } from "bun:test";
import { access, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createManagedCodexHome,
  decodeCodexAuthJson,
  withManagedCodexAuth,
} from "../src/lib/ai/codex-auth";

const temporaryDirectories: string[] = [];

function encodedAuth(overrides: Record<string, unknown> = {}) {
  return Buffer.from(
    JSON.stringify({
      auth_mode: "chatgpt",
      tokens: { access_token: "test", refresh_token: "test" },
      ...overrides,
    }),
    "utf8",
  ).toString("base64");
}

async function testDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "nudge-codex-auth-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("Codex managed authentication", () => {
  test("rejects invalid base64 and non-ChatGPT credentials", () => {
    expect(() => decodeCodexAuthJson("definitely-not-base64")).toThrow(
      "not valid base64",
    );
    expect(() =>
      decodeCodexAuthJson(encodedAuth({ auth_mode: "api" })),
    ).toThrow("ChatGPT-authenticated");
  });

  test("creates private credential files", async () => {
    const parentDirectory = await testDirectory();
    const { authPath, codexHome } = await createManagedCodexHome({
      encodedAuth: encodedAuth(),
      parentDirectory,
    });

    expect((await stat(codexHome)).mode & 0o777).toBe(0o700);
    expect((await stat(authPath)).mode & 0o777).toBe(0o600);
  });

  test("checkpoints refreshed credentials and removes the temporary home", async () => {
    const parentDirectory = await testDirectory();
    let capturedHome = "";
    let checkpointedAuth = "";

    const result = await withManagedCodexAuth({
      encodedAuth: encodedAuth(),
      parentDirectory,
      run: async (codexHome) => {
        capturedHome = codexHome;
        await writeFile(
          join(codexHome, "auth.json"),
          JSON.stringify({
            auth_mode: "chatgpt",
            tokens: { access_token: "refreshed" },
          }),
          "utf8",
        );
        return "generated";
      },
      checkpoint: async (value) => {
        checkpointedAuth = value;
      },
    });

    expect(result).toBe("generated");
    expect(
      JSON.parse(Buffer.from(checkpointedAuth, "base64").toString("utf8")),
    ).toEqual({
      auth_mode: "chatgpt",
      tokens: { access_token: "refreshed" },
    });
    expect(access(capturedHome)).rejects.toThrow();
  });

  test("fails the run and cleans up when credential checkpointing fails", async () => {
    const parentDirectory = await testDirectory();
    let capturedHome = "";

    await expect(
      withManagedCodexAuth({
        encodedAuth: encodedAuth(),
        parentDirectory,
        run: async (codexHome) => {
          capturedHome = codexHome;
          return "generated";
        },
        checkpoint: async () => {
          throw new Error("secret store unavailable");
        },
      }),
    ).rejects.toThrow("Codex credential checkpoint failed");

    expect(access(capturedHome)).rejects.toThrow();
  });
});
