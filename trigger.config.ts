import { defineConfig } from "@trigger.dev/sdk";
import { prismaExtension } from "@trigger.dev/build/extensions/prisma";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF!,
  dirs: ["./src/trigger"],
  runtime: "node",
  maxDuration: 300, // 5 minutes max per task
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
