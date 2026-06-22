import { additionalPackages } from "@trigger.dev/build/extensions/core";
import { prismaExtension } from "@trigger.dev/build/extensions/prisma";
import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "",
  dirs: ["./src/trigger"],
  runtime: "bun",
  // Leave one minute after Codex's one-hour timeout to checkpoint auth and clean up.
  maxDuration: 3660,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 10,
      factor: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 30_000,
      randomize: true,
    },
  },
  build: {
    extensions: [
      additionalPackages({
        packages: ["@openai/codex@0.130.0"],
      }),
      prismaExtension({
        mode: "legacy",
        version: "7.8.0",
        schema: "prisma/schema.prisma",
      }),
    ],
  },
});
