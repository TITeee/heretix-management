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
# The build's own cache is no use at run time and is 140 MB.
RUN pnpm exec next build && rm -rf .next/cache

# ─── Stage 3: Production runner ──────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Install prod deps + generate Prisma client in runner
# (pnpm resolves symlinks natively; avoids broken symlinks from COPY)
#
# Ownership is set in the same step as the install, and by COPY --chown below:
# a chown -R of /app in a later step of its own copies all of node_modules into
# another layer, which doubled the image.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
RUN pnpm install --frozen-lockfile --prod && pnpm exec prisma generate && \
    chown -R nextjs:nodejs /app

# Copy build output
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

COPY --chown=nextjs:nodejs --chmod=755 entrypoint.sh ./entrypoint.sh

USER nextjs

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
