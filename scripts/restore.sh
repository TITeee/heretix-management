#!/usr/bin/env bash
# Restore the heretix-management database from a dump made by scripts/backup.sh.
#
#   scripts/restore.sh <dump-file>
#
# The dump is loaded into a new database first. Only when that succeeds is the current
# database renamed to heretix_management_before_restore_<UTC date_time> (kept, to go back to) and
# the new one put in its place. The app is stopped meanwhile and started again at the end;
# it runs any migrations a newer version needs. A dump from a newer heretix-management than
# the one running here is not supported.
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: $0 <dump-file>" >&2
  exit 2
fi
file=$1
[ -f "$file" ] || { echo "no such file: $file" >&2; exit 2; }

cd "$(dirname "$0")/.."
psql() { docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt "$@"; }

docker compose exec -T db pg_restore --list < "$file" > /dev/null

echo "This replaces the heretix-management database with $file."
echo "The current database is kept as heretix_management_before_restore_<time>."
printf "Type 'restore' to continue: "
read -r answer
[ "$answer" = "restore" ] || { echo "Nothing changed."; exit 1; }

# Lowercase only: an unquoted name with capitals would be folded to lowercase by CREATE DATABASE.
stamp=$(date -u +%Y%m%d_%H%M%S)
staging="heretix_management_restoring_$stamp"
previous="heretix_management_before_restore_$stamp"

psql -c "CREATE DATABASE $staging"
if ! docker compose exec -T db pg_restore -U postgres -d "$staging" --no-owner --exit-on-error < "$file"; then
  psql -c "DROP DATABASE $staging"
  echo "The restore failed; the current database was not touched." >&2
  exit 1
fi

docker compose stop app
psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'heretix_management' AND pid <> pg_backend_pid()" > /dev/null
psql -c "ALTER DATABASE heretix_management RENAME TO $previous"
psql -c "ALTER DATABASE $staging RENAME TO heretix_management"
docker compose start app

echo "Restored. The previous database is kept as $previous; drop it once you are sure:"
echo "  docker compose exec db psql -U postgres -c 'DROP DATABASE $previous'"
echo "Check Settings > Vulnerability API > Automatic Scans: the restore brought back the setting"
echo "the backup had, and scans should stay paused while heretix-api is incomplete."
