#!/bin/sh
set -e

echo '{"level":"info","msg":"running database migrations","ts":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}'
pnpm exec prisma migrate deploy

echo '{"level":"info","msg":"starting server","port":"'"${PORT}"'","ts":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}'
exec node_modules/.bin/next start --port "${PORT}" --hostname "${HOSTNAME}"
