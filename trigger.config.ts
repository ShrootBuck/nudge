import { defineConfig } from "@trigger.dev/sdk";
import { prismaExtension } from "@trigger.dev/build/extensions/prisma";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF!,
  dirs: ["./src/trigger"],
  runtime: "bun",
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
      prismaExtension({
        mode: "legacy",
        version: "7.6.0",
        schema: "prisma/schema.prisma",
      }),
    ],
  },
});
