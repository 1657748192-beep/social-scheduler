#!/usr/bin/env bash
set -euo pipefail

WORK_DIR="${WORK_DIR:-/opt/social-scheduler}"
BACKUP_DIR="${BACKUP_DIR:-$WORK_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

cd "$WORK_DIR"

if [ ! -f .env ]; then
  echo "Missing $WORK_DIR/.env" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

POSTGRES_USER_VALUE="$(grep '^POSTGRES_USER=' .env | tail -1 | cut -d= -f2-)"
POSTGRES_DB_VALUE="$(grep '^POSTGRES_DB=' .env | tail -1 | cut -d= -f2-)"
POSTGRES_USER_VALUE="${POSTGRES_USER_VALUE:-app}"
POSTGRES_DB_VALUE="${POSTGRES_DB_VALUE:-social_scheduler}"

backup_file="$BACKUP_DIR/social_scheduler_$(date '+%Y%m%d_%H%M%S').sql.gz"

docker exec social_scheduler_postgres pg_dump \
  -U "$POSTGRES_USER_VALUE" \
  "$POSTGRES_DB_VALUE" | gzip > "$backup_file"

find "$BACKUP_DIR" -name 'social_scheduler_*.sql.gz' -mtime +"$RETENTION_DAYS" -delete

echo "Backup written to $backup_file"
