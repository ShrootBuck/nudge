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
