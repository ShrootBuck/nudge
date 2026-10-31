<div align="center">

# nudge

**Get unstuck without skipping straight to the answer.**

Progressive hints, clean editorials, and full C++ solutions for Codeforces problems. Generated through OpenCode, served at your own pace.

[Live Site](https://nudge.zaydkrunz.com)

</div>

---

## Development

Install dependencies and start the app with Bun 1.4.0 or newer (the lockfile uses a scoped override to keep Prisma on Effect 3 while OpenCode uses Effect 4):

```bash
bun install
bun run dev
```

Copy the variables documented in `.env.example` into your local environment. The app requires a PostgreSQL database whose schema matches `prisma/schema.prisma`.

After schema changes, apply them with `bunx prisma db push` and regenerate the client with `bunx prisma generate`.

The navbar displays the model and reasoning effort from the latest successfully saved generation. Its display string is stored in the singleton `SiteState` row and updated in the same transaction as the generated content. The indicator stays hidden until the first successful save; it does not query generation history or control model selection.

Run the full local quality gate before shipping:

```bash
bun run check
```

## What is this?

Most editorial sites give you the whole answer or nothing. Nudge sits in between: every problem has **progressive hints** that go from a gentle nudge toward the right area all the way to the key insight, plus a prose editorial and the full C++ solution when you're ready.

All content is generated locally through OpenCode, then stored in Postgres and served through a Next.js frontend. Problems are synced from the Codeforces API automatically.

## Local OpenCode generation

Generation is local-only, using the project-pinned OpenCode V2 CLI, client, and plugin packages (2.0.26). The server does not run OpenCode and there is no encoded cloud credential path. The generation agent allows tools automatically, including shell commands and file edits. Questions are disabled: the tool is removed and native permission rules deny it. Generation can run on macOS or Linux. Each run uses a temporary working directory and a one-hour timeout.

Nudge starts its own authenticated server on a random loopback port and shuts it down when the command finishes. It does not attach to or replace your personal OpenCode background service. The local client disables Bun's five-minute socket idle timeout so a quiet session wait can last for the full one-hour generation deadline; cancellation still interrupts it. Use `bun run opencode -- <command>` for the bundled CLI; your global `opencode` installation can have a different version.

1. Existing local provider credentials are reused. Check them with `bun run opencode -- auth list`. If needed, use `bun run opencode -- auth login` and select the provider/account you want to use. `bun run models` confirms which providers are available to Nudge.
2. Set `CACHE_REVALIDATION_URL=https://nudge.zaydkrunz.com` and the same strong `CACHE_REVALIDATION_SECRET` used by the deployed app. These authenticate the generator's HTTPS requests; keep the secret in your untracked environment, never in client code or Git.
3. Transcripts are stored in the deployed app's persistent `/data/transcripts` volume. No separate storage provider is required.
4. Generation claims work and submits results through `/api/generation`. The server validates content, records usage, writes Postgres, and invalidates caches. No database credentials, SSH tunnel, Tailscale, or separate terminal are required for generation.
5. Configure the model, reasoning variant, and public display label in `nudge.config.json` (see [Switching models or providers](#switching-models-or-providers)).

   ```json
   {
     "model": "openai/gpt-6-astra",
     "variant": "low",
     "display": {
       "model": "GPT-6 Astra",
       "reasoning": "low"
     }
   }
   ```

6. Run one queued generation:

   ```bash
   bun run opencode:next
   ```

   To run several queued generations sequentially:

   ```bash
   bun run opencode:next -- 3
   ```

   The explicit form also works:

   ```bash
   bun run opencode:next -- --count 3
   ```

For a no-write preview of the next candidate:

```bash
bun run opencode:next -- --dry-run
```

Each real run claims one eligible problem and creates an isolated OpenCode session. A local V2 plugin exposes `nudge_submit_result`, which validates the result against Nudge's JSON schema. Plain JSON text is not accepted as a submission; if the model finishes without submitting, Nudge sends at most two reminders before failing. The existing content validation still runs before persistence.

Claims and result submissions are safe to retry after a dropped response. If submission still fails after retries, the command saves a credential-free `.opencode-runs/<claim-id>.pending.json` and prints `bun run opencode:resume -- <path>` to retry the upload without running generation again. Stale or replaced claims are rejected.

The agent receives problem metadata and both Codeforces problem URLs, then retrieves the complete statement and researches solutions with its own tools. This includes PDF statements and relevant diagrams; Nudge does not scrape HTML or prefetch statement images/editorial pages before starting the session. Retrieval failures and fallback attempts appear in the generation transcript. A PDF or missing editorial alone is not an unsolvable result; the agent must identify a concrete statement/resource blocker after trying alternatives.

Nudge persists the generated hints/editorial/solution, records whole-session token usage (including tool turns and cached tokens), mirrors the exact `opencode session export` bytes into `.opencode-runs`, uploads that file to the Coolify app's transcript endpoint, and prints both transcript locations. A session is deleted only after its transcript has been mirrored; export failures leave it available in OpenCode and report a warning. Ctrl-C, SIGTERM, and the one-hour timeout interrupt the V2 session before cleanup. OpenCode reads provider credentials from its normal local credential store; Nudge never copies them into project configuration.

## Switching models or providers

Never hand-type a model ID from memory; copy it verbatim from the CLI. `bun run models` queries the same bundled OpenCode runtime that generation spawns and validates against, drilling down in three steps:

1. **Connect the provider** (skip if already authed): run `bun run opencode -- auth login`, then confirm with `bun run opencode -- auth list`.
2. **Pick a provider**: `bun run models` lists connected providers.
3. **Pick a model**: `bun run models <provider>` lists its models, marking with ✓ the ones that support tools and image input. Copy the full `provider/model-id` string, slashes and dashes included.
4. **Pick a variant**: `bun run models <provider>/<model>` shows the valid `variant` values, the model's display name, and a ready-to-paste `nudge.config.json` block.
5. **Verify without generating anything**: `bun run opencode:next -- --dry-run` runs preflight, which validates the model ID, variant, and required capabilities against live provider metadata and prints the exact display name. A typo'd variant fails fast with `does not expose the <variant> variant` instead of wasting a generation.

Notes:

- The config is strict-parsed on startup: unknown keys or a `model` missing the `provider/` prefix are rejected immediately.
- `variant` is optional and must be one of the variant keys from step 4.
- `display.model` is the public label — free text, so fix naming there, not in `model`. `display.reasoning` is optional and falls back to `variant` when omitted. The label renders as `display.model (reasoning)`, or just `display.model` when neither is set, so the checked-in configuration renders `GPT-6 Astra (low)`.
- `display.*` is cosmetic and safe to edit anytime, but the label is stored on each problem at generation time — existing content keeps the label it was generated with, and the new label applies to future generations.

## Coolify deployment

Deploy the repository with its Dockerfile on port 3000. Set the runtime variables in `.env.example`, and mount a persistent volume at `/data/transcripts`, writable by the image's `bun` user (UID 1000). Keep PostgreSQL private on the Coolify Docker network. Generation uses the authenticated HTTPS API. `bun run db:tunnel` is only needed for optional administrative access, such as Prisma Studio or schema changes; no public database port is needed.

Configure a Coolify scheduled task with command `bun run jobs:daily` and cron `0 7 * * *` (UTC), which is midnight in America/Phoenix. It runs the Codeforces sync and report digest; a PostgreSQL advisory lock prevents overlapping runs. `bun run jobs:daily -- --check` validates database connectivity and locking without running either job. Disable the previous cloud schedules before enabling this task.

The health check is `/api/health`. In Coolify, choose a container-command health check with `bun scripts/healthcheck.ts`; the image does not require curl or wget. Verify public problem pages, transcript downloads, and authenticated cache invalidation after deploys. Back up both PostgreSQL and the transcript volume; they must be restored together. Do not delete the migration source until data counts and transcript checksums match.

Production deploys automatically from `main` through a signed, push-only GitHub webhook to Coolify. The database backup runs at 08:00 UTC and the transcript-directory backup at 08:05 UTC, each retaining 14 archives. Coolify stores these under `/data/coolify/backups/databases/` and `/data/coolify/backups/volumes/` on the server. These local backups need a separate off-server copy to protect against disk or host loss.
