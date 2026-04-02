<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Nudge

Nudge is a read-only platform for Codeforces competitive programming problems. It stores problems and provides AI-generated content for each one: progressive hints, a prose editorial, and a C++ solution.

## Tech Stack

- **Runtime**: Bun
- **Framework**: Next.js 16 (App Router)
- **Database**: PostgreSQL on Supabase (transaction pooler for runtime, direct connection for CLI)
- **ORM**: Prisma v7 with `@prisma/adapter-pg`
- **Background jobs**: trigger.dev v4
- **AI**: Anthropic Batch API via `@anthropic-ai/sdk` (`claude-opus-4.6` as of now)
- **Styling**: Tailwind CSS v4, ShadCN will be added soon-ish?
- **Linting/Formatting**: Biome

## Future Ideas

- **Multi-language solutions**: Currently C++ only. Could support Python, Java, etc. Would need schema changes (multiple solutions per problem, each with a `language` field) and UI for language switching.
