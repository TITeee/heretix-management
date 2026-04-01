# syntax=docker/dockerfile:1

# ─── Stage 1: Full install (for build) ───────────────────────────────────────
FROM node:22-alpine AS deps

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ─── Stage 2: Build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm exec prisma generate
RUN pnpm exec next build

# ─── Stage 3: Production runner ──────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Install prod deps + generate Prisma client in runner
# (pnpm resolves symlinks natively; avoids broken symlinks from COPY)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
RUN pnpm install --frozen-lockfile --prod && pnpm exec prisma generate

# Copy build output
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh && chown -R nextjs:nodejs /app

USER nextjs

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
