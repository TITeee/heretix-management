#!/usr/bin/env bash
# Back up the heretix-management database from the Docker Compose stack in this repository.
#
#   scripts/backup.sh <backup-dir> [keep-days]
#
# Writes <backup-dir>/heretix-management-<UTC time>.dump (pg_dump custom format), checks that
# it can be read back, and then deletes dumps in <backup-dir> older than keep-days (14 by
# default). Prints the new file's path. Exits non-zero, and deletes nothing, if any step fails,
# so cron mail or a monitoring wrapper notices.
#
# The dump holds secrets (the heretix-api key, the Slack webhook URL, the AI API key, password
# and token hashes): keep the directory private and encrypt any copy that leaves this host.
# See docs/operations.md#backup-and-restore.
set -euo pipefail

if [ $# -lt 1 ] || [ $# -gt 2 ]; then
  echo "usage: $0 <backup-dir> [keep-days]" >&2
  exit 2
fi
dir=$1
keep=${2:-14}
case $keep in ''|*[!0-9]*) echo "keep-days must be a whole number of days" >&2; exit 2 ;; esac

cd "$(dirname "$0")/.."
umask 077
mkdir -p "$dir"

final="$dir/heretix-management-$(date -u +%Y%m%dT%H%M%SZ).dump"
tmp="$final.partial"
trap 'rm -f "$tmp"' EXIT

# A consistent snapshot of the running database; the app keeps running.
docker compose exec -T db pg_dump -U postgres -d heretix_management -Fc > "$tmp"
# A dump that cannot be listed cannot be restored either.
docker compose exec -T db pg_restore --list < "$tmp" > /dev/null
mv "$tmp" "$final"

# Only after a good dump: never leave the directory with fewer backups than before.
find "$dir" -maxdepth 1 -type f -name 'heretix-management-*.dump' -mtime +"$keep" -delete

echo "$final"
