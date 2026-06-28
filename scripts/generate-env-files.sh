#!/usr/bin/env bash
#
# Generate .env files with random passwords for VPS deployment.
#
# Copies each project's .env.example to .env (when missing) and replaces
# placeholder passwords with cryptographically random values. Shared secrets
# (PostgreSQL, MinIO, DB users) stay consistent across services.
#
# Usage:
#   DEPLOY_ROOT=/opt/projects ./scripts/generate-env-files.sh
#
# Environment:
#   DEPLOY_ROOT        Target directory (default: parent of scripts/)
#   ONLY_IF_MISSING    Skip projects that already have .env (default: 1)
#   SAVE_CREDENTIALS   Write DEPLOY_ROOT/.initial-credentials (default: 1)
#
set -euo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ONLY_IF_MISSING="${ONLY_IF_MISSING:-1}"
SAVE_CREDENTIALS="${SAVE_CREDENTIALS:-1}"

PROJECTS=(postgresql s3-storage freshrss static-server go-blog pgadmin portainer wg-easy http-proxy reverse-proxy pg-backup)

log() { printf '[generate-env] %s\n' "$*"; }
die() { log "ERROR: $*"; exit 1; }

random_password() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 32
  else
    tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32
  fi
}

# Replace a single KEY=value line in an env file (safe for arbitrary values).
set_env_var() {
  local file="$1" key="$2" value="$3"
  local tmp line key_prefix

  key_prefix="${key}="
  tmp="$(mktemp)"
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == "${key_prefix}"* ]]; then
      printf '%s=%s\n' "$key" "$value"
    else
      printf '%s\n' "$line"
    fi
  done <"$file" >"$tmp"
  mv "$tmp" "$file"
}

wg_easy_password_hash() {
  local password="$1"
  local hash

  hash="$(
    docker run --rm ghcr.io/wg-easy/wg-easy:15 wgpw "$password" 2>/dev/null \
      | sed -n "s/^PASSWORD_HASH='\(.*\)'/\1/p"
  )"
  [[ -n "$hash" ]] || return 1
  # Docker Compose treats $ in .env as variable interpolation — escape each $.
  printf '%s' "$hash" | sed 's/\$/$$/g'
}

should_create_env() {
  local env_file="$1"
  [[ ! -f "$env_file" ]] || [[ "$ONLY_IF_MISSING" != "1" ]]
}

write_pgadmin_servers_json() {
  local file="${DEPLOY_ROOT}/pgadmin/servers.json"
  local example="${DEPLOY_ROOT}/pgadmin/servers.json.example"

  [[ -f "$example" ]] || die "Missing ${example}"
  sed 's/"Password": "change-me"/"Password": "'"${POSTGRES_PASSWORD}"'"/' "$example" >"$file"
}

write_credentials_file() {
  local file="${DEPLOY_ROOT}/.initial-credentials"
  cat >"$file" <<EOF
# Auto-generated credentials — store securely and remove this file when done.
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

PostgreSQL (postgres): ${POSTGRES_PASSWORD}
FreshRSS DB user (freshrss): ${FRESHRSS_DB_PASSWORD}
FreshRSS admin (${FRESHRSS_ADMIN_USER:-admin}): ${FRESHRSS_ADMIN_PASSWORD}
FreshRSS API: ${FRESHRSS_API_PASSWORD}
Go Blog DB user (goblog): ${GO_BLOG_DB_PASSWORD}
pgAdmin (${PGADMIN_DEFAULT_EMAIL:-admin@example.com}): ${PGADMIN_DEFAULT_PASSWORD}
MinIO (${MINIO_ROOT_USER:-minio-admin}): ${MINIO_ROOT_PASSWORD}
HTTP proxy (${HTTP_PROXY_USER:-proxy-user}): ${HTTP_PROXY_PASSWORD}
WireGuard UI (wg-easy): ${WG_EASY_UI_PASSWORD}
EOF
  chmod 600 "$file"
  log "Saved credentials to ${file}"
}

generate_secrets() {
  POSTGRES_PASSWORD="$(random_password)"
  FRESHRSS_DB_PASSWORD="$(random_password)"
  GO_BLOG_DB_PASSWORD="$(random_password)"
  GO_BLOG_SESSION_SECRET="$(random_password)"
  MINIO_ROOT_PASSWORD="$(random_password)"
  FRESHRSS_ADMIN_PASSWORD="$(random_password)"
  FRESHRSS_API_PASSWORD="$(random_password)"
  PGADMIN_DEFAULT_PASSWORD="$(random_password)"
  HTTP_PROXY_PASSWORD="$(random_password)"
  WG_EASY_UI_PASSWORD="$(random_password)"

  WG_EASY_PASSWORD_HASH="$(wg_easy_password_hash "$WG_EASY_UI_PASSWORD")" \
    || die "Failed to generate WireGuard password hash (is Docker available?)"
}

create_env_from_example() {
  local project="$1"
  local env_example="${DEPLOY_ROOT}/${project}/.env.example"
  local env_file="${DEPLOY_ROOT}/${project}/.env"

  [[ -f "$env_example" ]] || return 0
  if ! should_create_env "$env_file"; then
    log "Keeping existing ${env_file}"
    return 0
  fi

  cp "$env_example" "$env_file"
  chmod 600 "$env_file"
  log "Created ${env_file}"

  case "$project" in
    postgresql)
      set_env_var "$env_file" POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
      set_env_var "$env_file" FRESHRSS_DB_PASSWORD "$FRESHRSS_DB_PASSWORD"
      set_env_var "$env_file" GO_BLOG_DB_PASSWORD "$GO_BLOG_DB_PASSWORD"
      ;;
    freshrss)
      set_env_var "$env_file" FRESHRSS_DB_PASSWORD "$FRESHRSS_DB_PASSWORD"
      set_env_var "$env_file" FRESHRSS_ADMIN_PASSWORD "$FRESHRSS_ADMIN_PASSWORD"
      set_env_var "$env_file" FRESHRSS_API_PASSWORD "$FRESHRSS_API_PASSWORD"
      ;;
    go-blog)
      set_env_var "$env_file" GO_BLOG_DATABASE_PASSWORD "$GO_BLOG_DB_PASSWORD"
      set_env_var "$env_file" GO_BLOG_SESSION_SECRET "$GO_BLOG_SESSION_SECRET"
      ;;
    pgadmin)
      set_env_var "$env_file" PGADMIN_DEFAULT_PASSWORD "$PGADMIN_DEFAULT_PASSWORD"
      set_env_var "$env_file" PGADMIN_SERVER_PASSWORD "$POSTGRES_PASSWORD"
      write_pgadmin_servers_json
      ;;
    s3-storage)
      set_env_var "$env_file" MINIO_ROOT_PASSWORD "$MINIO_ROOT_PASSWORD"
      ;;
    pg-backup)
      set_env_var "$env_file" POSTGRES_PASSWORD "$POSTGRES_PASSWORD"
      set_env_var "$env_file" MINIO_ROOT_PASSWORD "$MINIO_ROOT_PASSWORD"
      ;;
    http-proxy)
      set_env_var "$env_file" HTTP_PROXY_PASSWORD "$HTTP_PROXY_PASSWORD"
      ;;
    wg-easy)
      set_env_var "$env_file" PASSWORD_HASH "$WG_EASY_PASSWORD_HASH"
      ;;
  esac
}

main() {
  local project created_any=0

  for project in "${PROJECTS[@]}"; do
    local env_file="${DEPLOY_ROOT}/${project}/.env"
    local env_example="${DEPLOY_ROOT}/${project}/.env.example"
    if [[ -f "$env_example" ]] && should_create_env "$env_file"; then
      created_any=1
    fi
  done

  if [[ "$created_any" -eq 0 ]]; then
    log "All .env files already exist — nothing to generate"
    return 0
  fi

  generate_secrets

  for project in "${PROJECTS[@]}"; do
    create_env_from_example "$project"
  done

  if [[ "$SAVE_CREDENTIALS" == "1" ]]; then
    write_credentials_file
  fi
}

main "$@"
