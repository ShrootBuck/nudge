import assert from "node:assert/strict";
import { SQL } from "bun";

const url = new URL(process.env.DATABASE_URL ?? "");
assert.match(url.pathname, /^\/nudge_migrations_test_/);
const schema = url.searchParams.get("schema") ?? "";
assert.match(schema, /^migration_test_[a-f0-9]+$/);
// `schema` is Prisma's URL option, not a PostgreSQL connection parameter.
url.searchParams.delete("schema");
const sql = new SQL(url.toString());
try {
  // Stand in for Next, checking that application tables exist before serving.
  await sql.unsafe(`SELECT id FROM "${schema}"."SiteState" LIMIT 1`);
  console.log("APP_STARTED");
} finally {
  await sql.close();
}
