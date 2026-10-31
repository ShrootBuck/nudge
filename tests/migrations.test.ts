import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SQL } from "bun";

test.skipIf(!process.env.TEST_MIGRATION_DATABASE_URL)(
  "production startup applies migrations, preserves data, and blocks on failure",
  async () => {
    const url = new URL(process.env.TEST_MIGRATION_DATABASE_URL ?? "");
    expect(url.pathname).toMatch(/^\/nudge_migrations_test_/);
    expect(["localhost", "127.0.0.1", "[::1]"]).toContain(url.hostname);

    const repo = fileURLToPath(new URL("../", import.meta.url));
    const fixture = await mkdtemp(join(tmpdir(), "nudge-migrations-"));
    const schema = `migration_test_${randomUUID().replaceAll("-", "")}`;
    url.searchParams.delete("schema");
    const sql = new SQL(url.toString());
    url.searchParams.set("schema", schema);

    const run = async (command: string[]) => {
      const child = Bun.spawn(command, {
        cwd: fixture,
        env: {
          PATH: process.env.PATH,
          NODE_ENV: "test",
          DATABASE_URL: url.toString(),
          // Exercise DATABASE_URL fallback without inheriting local credentials.
          DIRECT_URL: " ",
        },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 15_000,
      });
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      return { code, stdout, stderr };
    };
    const start = () => run(["sh", join(repo, "scripts/start-production.sh")]);

    try {
      await sql.unsafe(`CREATE SCHEMA "${schema}"`);
      await cp(join(repo, "prisma"), join(fixture, "prisma"), {
        recursive: true,
      });
      await cp(
        join(repo, "prisma.config.ts"),
        join(fixture, "prisma.config.ts"),
      );
      await symlink(join(repo, "node_modules"), join(fixture, "node_modules"));
      const { scripts } = await Bun.file(join(repo, "package.json")).json();
      await Bun.write(
        join(fixture, "package.json"),
        JSON.stringify({
          scripts: {
            "db:deploy": scripts["db:deploy"],
            start: "bun verify-start.ts",
          },
        }),
      );
      await cp(
        join(repo, "tests/fixtures/migration-start.ts"),
        join(fixture, "verify-start.ts"),
      );

      const first = await start();
      expect(first.code, first.stderr).toBe(0);
      expect(first.stdout).toContain("APP_STARTED");
      const parity = await run([
        process.execPath,
        "--bun",
        "node_modules/prisma/build/index.js",
        "migrate",
        "diff",
        "--from-config-datasource",
        "--to-schema",
        "prisma/schema.prisma",
        "--exit-code",
      ]);
      expect(parity.code, parity.stdout + parity.stderr).toBe(0);
      await sql.unsafe(
        `INSERT INTO "${schema}"."SiteState" (id, "currentModel") VALUES ('existing', 'keep this')`,
      );

      const repeated = await start();
      expect(repeated.code, repeated.stderr).toBe(0);
      expect(repeated.stdout).toContain("No pending migrations to apply");
      expect(repeated.stdout).toContain("APP_STARTED");

      const addMigration = async (name: string, statement: string) => {
        const directory = join(fixture, "prisma/migrations", name);
        await mkdir(directory);
        await Bun.write(join(directory, "migration.sql"), statement);
      };
      await addMigration(
        "99990101000000_test_add_column",
        'ALTER TABLE "SiteState" ADD COLUMN "migrationProbe" TEXT;',
      );
      const upgraded = await start();
      expect(upgraded.code, upgraded.stderr).toBe(0);
      expect(upgraded.stdout).toContain("APP_STARTED");
      expect(
        await sql.unsafe<
          { currentModel: string; migrationProbe: string | null }[]
        >(
          `SELECT "currentModel", "migrationProbe" FROM "${schema}"."SiteState" WHERE id = 'existing'`,
        ),
      ).toEqual([{ currentModel: "keep this", migrationProbe: null }]);

      await addMigration("99990102000000_test_failure", "SELECT 1 / 0;");
      const failed = await start();
      expect(failed.code).not.toBe(0);
      expect(failed.stdout + failed.stderr).toContain("division by zero");
      expect(failed.stdout).not.toContain("APP_STARTED");

      const retry = await start();
      expect(retry.code).not.toBe(0);
      expect(retry.stdout + retry.stderr).toContain("P3009");
      expect(retry.stdout).not.toContain("APP_STARTED");
    } finally {
      await sql.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.close();
      await rm(fixture, { recursive: true, force: true });
    }
  },
  90_000,
);
