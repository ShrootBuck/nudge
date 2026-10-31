#!/bin/sh
set -eu

# Keep the new container unready until its schema is available.
bun --bun run db:deploy
exec bun --bun run start
