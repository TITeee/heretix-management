# syntax=docker/dockerfile:1

# ─── Stage 1: Production dependencies ────────────────────────────────────────
FROM node:22-alpine AS deps

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

# ─── Stage 2: Full install + build ───────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm exec prisma generate
RUN pnpm exec next build

# ─── Stage 3: Production runner ──────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

COPY --from=deps    /app/node_modules   ./node_modules
COPY --from=builder /app/.next          ./.next
COPY --from=builder /app/public         ./public
COPY --from=builder /app/package.json   ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/prisma         ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

RUN pnpm exec prisma generate

COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh && chown -R nextjs:nodejs /app

USER nextjs

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
