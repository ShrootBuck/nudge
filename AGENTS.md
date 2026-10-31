<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

- Use Bun only (`bun`, `bunx`). Do not use npm.

## Database changes and deployment

- Production is managed at [Coolify](https://coolify.zaydkrunz.com). Pushes to `main` deploy the Dockerfile automatically.
- Every change to `prisma/schema.prisma` must include a reviewed SQL migration under `prisma/migrations/`. Against a local/disposable development database, run `bun run db:migrate --name <description> --create-only`, review the SQL, then `bun run db:migrate` and `bunx --bun prisma generate`. Commit the schema and migration together. Use `bun run db:deploy` to initialize a fresh development database from existing migrations.
- Prisma CLI commands use `DIRECT_URL` when nonempty, otherwise `DATABASE_URL`. Check both before running a database command; a local production tunnel is still production. Never run `db push`, `migrate dev`, `migrate reset`, or data-loss flags against production.
- The Docker startup command runs `scripts/start-production.sh`: `bun run db:deploy` (`prisma migrate deploy`) must succeed before Next starts. Migrations run with runtime database credentials on the private Docker network, never during image builds. Preserve this startup command; no separate Coolify migration hook or manual database step is needed for normal deploys.
- `prisma/migrations/0_init` is the baseline for the existing schema, including `preparedContent`. Nudge production was verified and baselined on 2026-10-31. Other existing databases must be verified to match and marked with `prisma migrate resolve --applied 0_init` exactly once; never execute the baseline SQL against populated tables or automatically mark migrations applied at startup. New databases apply it normally.
- Never edit or delete an applied migration. Add a new migration instead. Make changes compatible with the old and new app versions running during a rolling deploy: add first, migrate data separately if needed, and remove obsolete fields in a later release. A failed migration stops the new container; investigate the failure and any partial SQL changes before resolving it or retrying. Application rollback does not undo database migrations.
- Keep legacy problem preparation lazy: visitors populate missing `preparedContent` on read. Do not add a bulk backfill or AI regeneration to deployment.
- Before shipping, run `bun run check` and `bun run build`. For migration/startup integration coverage, run `TEST_MIGRATION_DATABASE_URL=<disposable local Postgres URL> bun test tests/migrations.test.ts`; the database name must start with `nudge_migrations_test_`.
