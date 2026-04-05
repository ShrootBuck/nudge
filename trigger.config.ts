import { prismaExtension } from "@trigger.dev/build/extensions/prisma";
import { defineConfig } from "@trigger.dev/sdk";
import { getRequiredEnv } from "./src/lib/env";

export default defineConfig({
  project: getRequiredEnv("TRIGGER_PROJECT_REF"),
  dirs: ["./src/trigger"],
  runtime: "bun",
  maxDuration: 300, // required in v4.4.3, in seconds (5 min of compute time)
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
