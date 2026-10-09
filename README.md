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

Generation is local-only, using the project-pinned OpenCode V2 CLI, client, and plugin packages (2.0.26). Trigger.dev does not run OpenCode and there is no encoded cloud credential path. The generation agent allows tools automatically, including shell commands and file edits. Questions are disabled: the tool is removed and native permission rules deny it. Generation can run on macOS or Linux. Each run uses a temporary working directory and a one-hour timeout.

Nudge starts its own authenticated server on a random loopback port and shuts it down when the command finishes. It does not attach to or replace your personal OpenCode background service. Use `bun run opencode -- <command>` for the bundled CLI; your global `opencode` installation can have a different version.

1. Existing local provider credentials are reused. Check them with `bun run opencode -- auth list`. If needed, use `bun run opencode -- auth login` and select the provider/account you want to use. `bun run models` confirms which providers are available to Nudge.
2. Make sure `DATABASE_URL` points at the Nudge database.
3. Connect a public Vercel Blob store to the project and set `BLOB_READ_WRITE_TOKEN` locally. `bunx vercel env pull` can pull the connected store credentials.
4. Set `CACHE_REVALIDATION_URL` to the deployed app URL. Set the same strong `CACHE_REVALIDATION_SECRET` locally, in Trigger.dev, and in the deployed Next.js app. Local generation and Trigger.dev use these values to expire deployed problem caches after database writes.
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

Nudge persists the generated hints/editorial/solution, records whole-session token usage (including tool turns and cached tokens), mirrors the exact `opencode session export` bytes into `.opencode-runs`, uploads that file to the public Blob store, and prints both transcript locations. A session is deleted only after its transcript has been mirrored; export failures leave it available in OpenCode and report a warning. Ctrl-C, SIGTERM, and the one-hour timeout interrupt the V2 session before cleanup. OpenCode reads provider credentials from its normal local credential store; Nudge never copies them into project configuration.

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
