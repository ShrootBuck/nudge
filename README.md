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
4. Configure the model, reasoning variant, and public display label in `nudge.config.json`.

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

To switch models or providers, connect the provider with `opencode auth login`, use `opencode models <provider>` to find the exact model ID, and update `nudge.config.json`. The public label is composed from `display.model` and `display.reasoning`, so the default configuration renders `GPT-5.6 Sol (max)`.
