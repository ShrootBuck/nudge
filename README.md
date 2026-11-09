<div align="center">

# nudge

**Get unstuck without skipping straight to the answer.**

Progressive hints, clean editorials, and full C++ solutions for Codeforces problems. Generated with Codex CLI, served at your own pace.

[Live Site](https://nudge.zaydkrunz.com)

</div>

---

## Development

Install dependencies and start the app with Bun 1.4.0 or newer:

```bash
bun install
bun run dev
```

Copy the variables documented in `.env.example` into your local environment. The app requires a PostgreSQL database whose schema matches `prisma/schema.prisma`.

Initialize a fresh development database with `bun run db:deploy`. For a schema change, point `DATABASE_URL` (and `DIRECT_URL`, if set) at a local/disposable development database, then:

```bash
bun run db:migrate --name describe_the_change --create-only
# Review the generated prisma/migrations/<timestamp>_describe_the_change/migration.sql.
bun run db:migrate
bunx --bun prisma generate
```

Commit the SQL migration together with `prisma/schema.prisma`. Deployments apply pending migrations automatically. Prisma commands prefer a nonempty `DIRECT_URL` and otherwise use `DATABASE_URL`; never run development migration commands or `db push` against production, including through the SSH tunnel.

The navbar displays the model and reasoning effort from the latest successfully saved generation. Its display string is stored in the singleton `SiteState` row and updated in the same transaction as the generated content. The browser fetches it from `/api/current-model`, with a 60-second HTTP cache, so the badge does not force otherwise static pages to render at request time. The indicator stays hidden until the first successful save; it does not query generation history or control model selection.

### Prepared problem content

Successful generations prepare sanitized Markdown, KaTeX math, and highlighted code before acquiring the database transaction lock. The prepared documents and their source text commit together in `Problem.preparedContent`. A source-content hash and `PREPARED_CONTENT_VERSION` prevent reuse after a content or renderer change. Bump that version when changing parser, sanitization, math, or highlighting behavior, including dependency upgrades that affect output.

Readers reuse the saved documents across server restarts. Older rows are prepared and saved once when first read; no AI regeneration is needed. Only prepared documents and copyable solution code reach the browser, which handles reveals without downloading the parser, KaTeX renderer, or Shiki. Public problem component output is also cached in Next's process-local cache and invalidated by the existing problem tags when content or review state changes.

Production intentionally prepares older problems when visitors read them; deployment does not run a bulk backfill. If an explicit administrative backfill is needed later, these commands require `DATABASE_URL` access (and `CACHE_REVALIDATION_URL` / `CACHE_REVALIDATION_SECRET` for the write command):

```bash
bun run content:prepare --check
bun run content:prepare
```

`--check` does not write and exits with status 1 if any completed problems need preparation. The write command processes bounded batches, preserves catalog ordering, and refreshes completed problem page caches. Re-running it skips matching documents and retries cache invalidation.

Run the full local quality gate before shipping:

```bash
bun run check
```

Migration/startup integration tests use a separate disposable local PostgreSQL database whose name starts with `nudge_migrations_test_`:

```bash
TEST_MIGRATION_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/nudge_migrations_test_local bun test tests/migrations.test.ts
```

The test creates and removes its own schema. It checks fresh initialization, repeat startup, applying a new migration while preserving data, and refusing to start after a migration failure.

## What is this?

Most editorial sites give you the whole answer or nothing. Nudge sits in between: every problem has **progressive hints** that go from a gentle nudge toward the right area all the way to the key insight, plus a prose editorial and the full C++ solution when you're ready.

All content is generated locally with Codex CLI, then stored in Postgres and served through a Next.js frontend. Problems are synced from the Codeforces API automatically.

## Local Codex generation

Install the locked dependencies with `bun install --frozen-lockfile`. Nudge uses its pinned `@openai/codex` CLI (0.167.0) on macOS or Linux. Each claim runs one unattended `codex exec` in a fresh workspace. Generation uses your existing **ChatGPT Codex usage**. To sign in on the worker, run `bun run codex -- login` and choose **Sign in with ChatGPT**. Check the account mode with `bun run codex -- login status`.

Set `CACHE_REVALIDATION_URL` and `CACHE_REVALIDATION_SECRET` on the worker for Nudge’s HTTPS API. The parent process handles claims and uploads. The Codex child receives a limited environment and uses its own saved login. The web server stores the results and transcripts.

```sh
bun run codex:next -- --dry-run   # validate CLI, login, model and reasoning; preview the queue
bun run codex:next               # generate and publish one problem
bun run codex:next -- 3          # generate up to three, sequentially
```

In an interactive batch, press **p** to pause after the active claim, **p** again to resume, or **q** to finish the current problem and exit cleanly. **Ctrl+C** and SIGTERM cancel the active run. A run times out after one hour.

The agent gets the problem metadata and both Codeforces URLs. It retrieves the complete statement, uses OpenAI-hosted live web search for editorials, and can download PDFs or diagrams with a sandboxed shell. Install a C++ compiler with the Codeforces headers and Poppler (`pdftotext` and `pdftoppm`) on the worker. Give the worker writable temporary and `.codex-runs` directories and access to the public web. The agent can mark a problem unsolvable with a concrete reason when it cannot obtain the required information or solve the problem after a substantive attempt.

Codex returns the hints, editorial, and C++ through `--output-schema`. The server validates the content before saving it. Each problem’s transcript is the exact JSONL emitted by `codex exec --json`, including the search and command events, messages, and reported usage. The worker saves it in `.codex-runs/` and uploads it to the web server’s persistent transcript volume. Previous JSON downloads still work.

The worker saves a pending result before upload. If the network drops, run the printed `bun run codex:resume -- <pending.json>` command to retry the same transcript and claim. Resume also accepts existing pending files by path. Stale claims are rejected.

## Switching models

Run `bun run models` to see the pinned CLI’s catalog and `bun run models <model-id>` to inspect a model’s reasoning levels and image support. Set the model ID and reasoning effort in `nudge.config.json`, then run the dry run before claiming work.

```json
{
  "model": "gpt-6-luna",
  "reasoningEffort": "low",
  "display": { "model": "GPT-6 Luna" }
}
```

The public label uses the display name and reasoning effort, e.g. `GPT-6 Luna (low)`. An optional `display.reasoning` overrides the label. Each problem retains the label recorded at generation time.

## Coolify deployment

Deploy the repository with its Dockerfile on port 3000 in [Coolify](https://coolify.zaydkrunz.com). Set the runtime variables in `.env.example`, and mount a persistent volume at `/data/transcripts`, writable by the image's `bun` user (UID 1000). Keep PostgreSQL private on the Coolify Docker network. Generation uses the authenticated HTTPS API. `bun run db:tunnel` is only needed for optional administrative access, such as Prisma Studio; no public database port is needed.

The Docker command runs `scripts/start-production.sh`, which applies committed migrations with `bun run db:deploy` before starting Next. A migration failure exits the new container before it can serve traffic. Builds only generate Prisma Client and compile the app; database changes happen at runtime. Keep the Docker startup command in Coolify rather than overriding it with `next start`, and do not add a duplicate migration hook. `bun run db:status` shows migration history without applying changes.

`prisma/migrations/0_init` captures the schema at the switch from `db push` to Prisma Migrate, including the nullable `preparedContent` field. Nudge production was verified and baselined on 2026-10-31; no further baseline step is needed there. A fresh database applies it automatically. For another existing populated database, first check it with `bunx --bun prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`; only if it matches, register the baseline once with `bunx --bun prisma migrate resolve --applied 0_init`. This records migration history without recreating tables or changing problem content. Never put baseline resolution in the startup script.

Keep migrations compatible with the previous app version during rolling deployments. Never edit applied migrations; use a new migration to make subsequent changes. Failed migrations may leave partial SQL changes, so inspect the database and deploy logs before using `prisma migrate resolve` to recover. Rolling back the app does not reverse schema changes. See [Prisma's production migration workflow](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production).

Configure a Coolify scheduled task with command `bun run jobs:daily` and cron `0 7 * * *` (UTC), which is midnight in America/Phoenix. It runs the Codeforces sync and report digest; a PostgreSQL advisory lock prevents overlapping runs. `bun run jobs:daily -- --check` validates database connectivity and locking without running either job. Disable the previous cloud schedules before enabling this task.

The health check is `/api/health`. In Coolify, choose a container-command health check with `bun scripts/healthcheck.ts`; the image does not require curl or wget. Verify public problem pages, transcript downloads, and authenticated cache invalidation after deploys. Back up both PostgreSQL and the transcript volume; they must be restored together. Do not delete the migration source until data counts and transcript checksums match.

Production deploys automatically from `main` through a signed, push-only GitHub webhook to Coolify. The database backup runs at 08:00 UTC and the transcript-directory backup at 08:05 UTC, each retaining 14 archives. Coolify stores these under `/data/coolify/backups/databases/` and `/data/coolify/backups/volumes/` on the server. These local backups need a separate off-server copy to protect against disk or host loss.
