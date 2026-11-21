FROM oven/bun:1.4.5-alpine AS base
WORKDIR /app
RUN apk upgrade --no-cache && apk add --no-cache openssl
COPY package.json bun.lock ./
COPY prisma ./prisma
COPY prisma.config.ts ./

FROM base AS build
RUN bun install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun --bun run build

FROM base AS production
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
RUN bun install --production --frozen-lockfile && rm -rf /root/.bun/install/cache
COPY --from=build --chown=bun:bun /app/.next ./.next
COPY public ./public
COPY next.config.ts nudge.config.json tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
RUN mkdir -p /data/transcripts && chown -R bun:bun /data
USER bun
EXPOSE 3000
CMD ["sh", "scripts/start-production.sh"]
