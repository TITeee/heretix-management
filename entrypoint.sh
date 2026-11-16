#!/bin/sh
set -e

echo '{"level":"info","msg":"running database migrations","ts":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}'
# The CLI itself, not `pnpm exec`: pnpm comes from corepack, which this user
# cannot use, so it was downloaded from the npm registry on every start, and a
# server without internet access could not start at all.
node_modules/.bin/prisma migrate deploy

echo '{"level":"info","msg":"starting server","port":"'"${PORT}"'","ts":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}'
exec node_modules/.bin/next start --port "${PORT}" --hostname "${HOSTNAME}"
