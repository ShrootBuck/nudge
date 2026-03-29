<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Nudge

Nudge is a read-only platform for Codeforces competitive programming problems. It stores problems and provides AI-generated content for each one: progressive hints, a prose editorial, and a C++ solution.

## Core Flow

```
Codeforces API -> sync-problems (weekly) -> DB -> backfill (manual) -> generate-content-scheduler (daily) -> generate-problem-content -> Anthropic Batch API -> wait 1 day (checkpointed) -> collect result -> hints + editorial + solution -> DB
```

## Tech Stack

- **Runtime**: Bun
- **Framework**: Next.js 16 (App Router)
- **Database**: PostgreSQL on Supabase (transaction pooler for runtime, direct connection for CLI)
- **ORM**: Prisma v7 with `@prisma/adapter-pg`
- **Background jobs**: trigger.dev v4
- **AI**: Anthropic Batch API via `@anthropic-ai/sdk` (`claude-sonnet-4-5`)
- **Styling**: Tailwind CSS v4, ShadCN will be added soon-ish
- **Linting/Formatting**: Biome

## Database Schema

- **Problem** — `contestId` + `index` (unique), `name`, `rating`, `tags[]`, `generationStatus`
- **Hint** — 5 per problem (`order` 1-5), progressive (gentle nudge -> near-giveaway)
- **Editorial** — 1 per problem, prose explanation of the solution approach
- **Solution** — 1 per problem, complete C++ code using the user's template

`generationStatus` lifecycle: `UNQUEUED` -> `PENDING` -> `PROCESSING` -> `COMPLETED` (or `FAILED`)

## Key Files

- `prisma/schema.prisma` — database schema
- `prisma.config.ts` — Prisma CLI config (uses `DIRECT_URL`)
- `src/lib/prisma.ts` — runtime Prisma client (uses `DATABASE_URL` via pooler)
- `src/trigger/db.ts` — trigger.dev Prisma client (same pooler)
- `src/trigger/sync-problems.ts` — weekly Codeforces API sync (scheduled)
- `src/trigger/backfill.ts` — manually mark problems as PENDING by filters
- `src/trigger/generate-content.ts` — Batch API submission + 1-day checkpointed wait + result collection, plus daily scheduler
- `trigger.config.ts` — trigger.dev build config with Prisma extension

## Environment Variables

- `DATABASE_URL` — Supabase transaction pooler connection (runtime)
- `DIRECT_URL` — Supabase direct connection (Prisma CLI)
- `TRIGGER_SECRET_KEY` / `TRIGGER_PROJECT_REF` — trigger.dev credentials
- `ANTHROPIC_API_KEY` — for AI generation

## Verification System (not yet implemented)

AI-generated content is unverified by default. Problems need manual verification before being shown as trusted.

- Each problem page has a hidden "Verify" button at the bottom
- Clicking it prompts for a password
- Password is checked against a value stored in an env var (e.g. `VERIFY_PASSWORD`)
- No auth system — just a simple password check
- Verified problems get a checkmark in the UI
- `verified` field already exists on Problem model (`Boolean @default(false)`)

## Current State

- First Codeforces sync complete (~11k problems in DB, all `UNQUEUED`)
- AI generation pipeline uses Anthropic Batch API (50% cost savings, 1-day checkpointed wait per problem, zero compute while waiting)
- Generation not yet run (waiting on API credits)
- Frontend not yet built
- Sample seed data: problem 1A "Theatre Square" with full content (`prisma/seed.ts`)
