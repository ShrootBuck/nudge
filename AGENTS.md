<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# Nudge

Nudge is a read-only platform for Codeforces competitive programming problems. It stores problems and provides AI-generated content for each one: progressive hints, a prose editorial, and a C++ solution.

USE BUN ALWAYS, NEVER NPM SLUDGE!

## Future Ideas

- **Multi-language solutions**: Currently C++ only. Could support Python, Java, etc. Would need schema changes (multiple solutions per problem, each with a `language` field) and UI for language switching.
- **Interview Mode**: A toggle to strip away the lore and "flavor text" of standard Codeforces problems, reformatting them into the sterile, highly dense math/algorithmic questions you'd see in a Citadel or big tech interview. It would also feature AI-generated follow-up constraints (e.g., "optimize to $O(1)$ space") and a high-pressure visual timer to simulate a real interview environment.
