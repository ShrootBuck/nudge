import "dotenv/config";
import { defineConfig } from "prisma/config";

const directUrl = process.env.DIRECT_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  // `prisma generate` does not need a live database URL during CI/build installs.
  datasource: directUrl
    ? {
        url: directUrl,
      }
    : undefined,
});
