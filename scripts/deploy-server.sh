#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/1657748192-beep/social-scheduler.git}"
BRANCH="${BRANCH:-main}"
WORK_DIR="${WORK_DIR:-/opt/social-scheduler}"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/social-scheduler-releases}"
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.server.yml)

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

ensure_env_value() {
  local key="$1"
  local value="$2"

  if grep -q "^${key}=" .env 2>/dev/null; then
    local current
    current="$(grep "^${key}=" .env | tail -1 | cut -d= -f2-)"
    if [ -z "$current" ] || [[ "$current" == change-this* ]] || [[ "$current" == replace-with* ]] || [[ "$current" == your-* ]]; then
      sed -i "s|^${key}=.*|${key}=${value}|" .env
    fi
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

env_value() {
  local key="$1"
  grep "^${key}=" .env 2>/dev/null | tail -1 | cut -d= -f2-
}

is_missing_or_placeholder() {
  local value="$1"
  [ -z "$value" ] || [[ "$value" == change-this* ]] || [[ "$value" == replace-with* ]] || [[ "$value" == your-* ]]
}

force_env_value() {
  local key="$1"
  local value="$2"

  if grep -q "^${key}=" .env 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

random_hex() {
  openssl rand -hex "$1"
}

prepare_git_checkout() {
  require_command git

  if [ -d "$WORK_DIR/.git" ]; then
    log "Updating existing git checkout in $WORK_DIR"
    cd "$WORK_DIR"
    git fetch origin "$BRANCH"
    git reset --hard "origin/${BRANCH}"
    return
  fi

  log "Converting $WORK_DIR into a git-managed deployment"
  mkdir -p "$BACKUP_ROOT"

  local timestamp tmp_dir backup_dir env_backup
  timestamp="$(date '+%Y%m%d%H%M%S')"
  tmp_dir="/tmp/social-scheduler-${timestamp}"
  backup_dir="${BACKUP_ROOT}/social-scheduler-${timestamp}"
  env_backup="/tmp/social-scheduler-env-${timestamp}"

  rm -rf "$tmp_dir"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$tmp_dir"

  if [ -f "$WORK_DIR/.env" ]; then
    cp "$WORK_DIR/.env" "$env_backup"
  elif [ -f "$WORK_DIR/.env.server" ]; then
    cp "$WORK_DIR/.env.server" "$env_backup"
  elif [ -f "$WORK_DIR/.env.production" ]; then
    cp "$WORK_DIR/.env.production" "$env_backup"
  fi

  if [ -e "$WORK_DIR" ]; then
    mv "$WORK_DIR" "$backup_dir"
  fi

  mv "$tmp_dir" "$WORK_DIR"

  if [ -f "$env_backup" ]; then
    cp "$env_backup" "$WORK_DIR/.env"
  fi

  log "Previous deployment saved at $backup_dir"
  cd "$WORK_DIR"
}

prepare_env() {
  cd "$WORK_DIR"

  if [ ! -f .env ]; then
    log "Creating .env"
    touch .env
  fi

  force_env_value POSTGRES_USER "${POSTGRES_USER:-app}"
  force_env_value POSTGRES_DB "${POSTGRES_DB:-social_scheduler}"
  force_env_value PUBLIC_API_URL "${PUBLIC_API_URL:-https://app.bufferhelp.com}"
  force_env_value PUBLIC_WEB_URL "${PUBLIC_WEB_URL:-https://app.bufferhelp.com}"
  ensure_env_value POSTGRES_PASSWORD "$(random_hex 24)"
  ensure_env_value JWT_SECRET "$(random_hex 48)"
  force_env_value JWT_EXPIRES_IN "30d"
  ensure_env_value TOKEN_ENCRYPTION_KEY "$(random_hex 32)"
  ensure_env_value FACEBOOK_CLIENT_ID "${FACEBOOK_CLIENT_ID:-1743484710132300}"
  ensure_env_value FACEBOOK_OAUTH_SCOPES "public_profile"

  if is_missing_or_placeholder "$(env_value FACEBOOK_CLIENT_SECRET)"; then
    log "WARNING: FACEBOOK_CLIENT_SECRET is empty or still a placeholder. Facebook OAuth will not work until it is set in $WORK_DIR/.env"
  fi
}

compose() {
  docker compose --env-file .env "${COMPOSE_FILES[@]}" "$@"
}

sync_database_password() {
  local db_user db_pass
  db_user="$(grep '^POSTGRES_USER=' .env | tail -1 | cut -d= -f2-)"
  db_pass="$(grep '^POSTGRES_PASSWORD=' .env | tail -1 | cut -d= -f2-)"

  log "Ensuring PostgreSQL is running"
  compose up -d postgres redis

  log "Waiting for PostgreSQL"
  for _ in $(seq 1 60); do
    if docker exec social_scheduler_postgres pg_isready -U "$db_user" >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done

  log "Syncing PostgreSQL role password"
  local sql
  sql="$(DB_USER="$db_user" DB_PASS="$db_pass" python3 - <<'PY'
import os

user = os.environ["DB_USER"].replace('"', '""')
password = os.environ["DB_PASS"].replace("'", "''")
print(f"ALTER USER \"{user}\" WITH PASSWORD '{password}';")
PY
)"
  docker exec -i social_scheduler_postgres psql -U "$db_user" -d postgres -v ON_ERROR_STOP=1 -c "$sql"
}

deploy() {
  cd "$WORK_DIR"

  log "Validating compose config"
  compose config --quiet

  sync_database_password

  log "Building application images"
  compose build api worker web

  log "Starting services"
  compose up -d postgres redis api worker web reverse-proxy

  log "Container status"
  compose ps

  log "Waiting for API health"
  for _ in $(seq 1 60); do
    if curl -fsS "https://app.bufferhelp.com/api/v1/health"; then
      echo
      log "DEPLOY_OK"
      return
    fi
    sleep 3
  done

  log "API did not become healthy. Recent logs:"
  docker logs --tail=160 social_scheduler_api || true
  exit 1
}

main() {
  require_command docker
  require_command openssl
  require_command python3
  require_command curl

  prepare_git_checkout
  prepare_env
  deploy
}

main "$@"
