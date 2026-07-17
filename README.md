<div align="center">

# nudge

**Get unstuck without skipping straight to the answer.**

Progressive hints, clean editorials, and full C++ solutions for Codeforces problems. Generated through OpenCode, served at your own pace.

[Live Site](https://nudge.zaydkrunz.com)

</div>

---

## What is this?

Most editorial sites give you the whole answer or nothing. Nudge sits in between: every problem has **progressive hints** that go from a gentle nudge toward the right area all the way to the key insight, plus a prose editorial and the full C++ solution when you're ready.

All content is generated locally through OpenCode, then stored in Postgres and served through a Next.js frontend. Problems are synced from the Codeforces API automatically.

## Local OpenCode generation

Generation is local-only. Trigger.dev does not run OpenCode and there is no encoded cloud credential path.

1. Sign in with `opencode auth login`, choose OpenAI, and select ChatGPT Plus/Pro. Confirm `opencode auth list` shows OpenAI OAuth.
2. Make sure `DATABASE_URL` points at the Nudge database.
3. Connect a public Vercel Blob store to the project and set `BLOB_READ_WRITE_TOKEN` locally. `bunx vercel env pull` can pull the connected store credentials.
4. Configure the model, reasoning variant, and public display label in `nudge.config.json` (see [Switching models or providers](#switching-models-or-providers)).

   ```json
   {
     "model": "openai/gpt-5.6-sol",
     "variant": "max",
     "display": {
       "model": "GPT-5.6 Sol",
       "reasoning": "max"
     }
   }
   ```

5. Run one queued generation:

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

Each real run claims one eligible problem, creates an isolated OpenCode session, persists the generated hints/editorial/solution, records usage, mirrors the exact `opencode export` bytes into `.opencode-runs`, uploads that file to the public Blob store, and prints both transcript locations. OpenCode reads provider credentials from its normal local credential store; Nudge never copies them into project configuration.

## Switching models or providers

Never hand-type a model ID from memory; copy it verbatim from the CLI. Use `bun run opencode` so you query the same bundled OpenCode binary that generation spawns and validates against.

1. **Connect the provider** (skip if already authed): run `opencode auth login`, then confirm with `opencode auth list`.
2. **Find the exact model ID**: `bun run opencode models` lists every available model as `provider/model-id`; `bun run opencode models <provider>` filters to one provider. Copy the whole line, slashes and dashes included.
3. **Find valid variants and the display name**: `bun run opencode models <provider> --verbose` prints a JSON block per model. The keys of its `variants` object are the only valid `variant` values, and its `name` field is a good basis for `display.model`. Nudge also requires `capabilities.toolcall` and `capabilities.input.image` to be `true` — check before committing to a model.
4. **Update `nudge.config.json`**:
   - `model`: the exact `provider/model-id` string from step 2.
   - `variant`: optional. Must be one of the variant keys from step 3.
   - `display.model`: the public label. Free text — this is where you fix the name, not in `model`.
   - `display.reasoning`: optional. Falls back to `variant` when omitted. The public label renders as `display.model (reasoning)`, or just `display.model` when neither is set, so the default configuration renders `GPT-5.6 Sol (max)`.
5. **Verify without generating anything**: `bun run opencode:next -- --dry-run` runs preflight, which validates the model ID, variant, and required capabilities against live provider metadata and prints the exact display name. A typo'd variant fails fast with `does not expose the <variant> variant` instead of wasting a generation.

Notes:

- The config is strict-parsed on startup: unknown keys or a `model` missing the `provider/` prefix are rejected immediately.
- `display.*` is cosmetic and safe to edit anytime, but the label is stored on each problem at generation time — existing content keeps the label it was generated with, and the new label applies to future generations.
