<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Nudge Agent Notes

## Non-negotiables

- Use Bun only (`bun`, `bunx`). Do not use npm.
- Keep AI integrations on current APIs only. No legacy shims/fallback paths.
- OpenAI generation must use Responses/Batches (`/v1/responses`), not Chat Completions.
- Anthropic generation must use Messages/Batches with current `output_config` + effort controls.

## Commands that matter

- Install deps: `bun install`
- Dev app: `bun dev`
- Trigger.dev dev worker (registers tasks in `src/trigger`): `bunx trigger dev`
- Lint: `bun run lint` (Biome)
- Format: `bun run format`
- Build: `bun run build` (runs `prisma generate` first)
- Prisma schema push: `bunx prisma db push`
- Prisma Studio: `bun run db:studio`

## Environment + database gotchas

- Runtime DB uses `DATABASE_URL` via `@prisma/adapter-pg` in `src/lib/prisma.ts`.
- Prisma config reads `DIRECT_URL` for direct datasource override in `prisma.config.ts` (migrations/schema operations).
- `postinstall` runs `prisma generate`; if Prisma types look stale, run `bunx prisma generate`.
- Required envs vary by feature; check `.env.example` (`TRIGGER_*`, DB URLs, provider keys, `DISCORD_WEBHOOK_URL`, `VERIFY_PASSWORD`).

## Architecture quick map

- App router UI: `src/app`.
- Shared server libs: `src/lib`.
- Background jobs: `src/trigger` (`sync-problems`, `generate-content-scheduler`, `generation-state-watchdog`, `report-digest`, and manual `backfill`).
- Data model: `prisma/schema.prisma`.

## Pipeline invariants to not break

- Problem pipeline state is explicit: `queueState` (`BACKLOG|READY`) and `runState` (`IDLE|RUNNING|SUCCEEDED|FAILED`). Reuse helpers in `src/lib/problem-pipeline-db.ts`.
- Generation scheduler only picks `READY` + (`IDLE` or `FAILED`) and enforces `generationAttempts < 3`.
- Exactly one `ProviderModel` row must be active. `getActiveModelConfig()` throws if zero or multiple actives.
