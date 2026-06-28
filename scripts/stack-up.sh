#!/usr/bin/env bash
#
# Start the full project stack for local development and CI testing.
#
# Writes .env files via generate-env-files.sh (skips existing files so passwords
# are preserved), then applies local port/host overrides for reproducible test runs.
# Creates the shared Docker network, starts services in dependency order, waits
# for health checks, and seeds test data (go-blog admin, Portainer admin).
#
# Environment (all optional — defaults suit local test runs):
#   REPO_DIR / DEPLOY_ROOT   Root directory for compose projects
#   DOCKER_NETWORK           Shared network name (default: projects-net)
#   *_PORT                   Host ports for each service (see below)
#   POSTGRES_WAIT_TIMEOUT    Seconds to wait for PostgreSQL health (default: 120)
#   CONTAINER_WAIT_TIMEOUT   Seconds to wait for other containers (default: 120)
#
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
STACK_ROOT="${DEPLOY_ROOT:-$REPO_DIR}"
DOCKER_NETWORK="${DOCKER_NETWORK:-projects-net}"

# Host ports exposed for tests (override to avoid conflicts on busy machines).
FRESHRSS_PORT="${FRESHRSS_HTTP_PORT:-8081}"
STATIC_SERVER_PORT="${STATIC_SERVER_HTTP_PORT:-8082}"
GO_BLOG_PORT="${GO_BLOG_HTTP_PORT:-8083}"
PORTAINER_PORT="${PORTAINER_HTTP_PORT:-8084}"
PGADMIN_PORT="${PGADMIN_HTTP_PORT:-8085}"
HTTP_PROXY_PORT="${HTTP_PROXY_PORT:-3128}"
SOCKS_PROXY_PORT="${SOCKS_PROXY_PORT:-1080}"
MINIO_API_PORT="${MINIO_API_PORT:-9002}"
MINIO_CONSOLE_PORT="${MINIO_CONSOLE_PORT:-9003}"
WG_EASY_WEB_PORT="${WG_EASY_WEB_PORT:-51821}"
WG_EASY_WG_PORT="${WG_EASY_WG_PORT:-51820}"

POSTGRES_WAIT_TIMEOUT="${POSTGRES_WAIT_TIMEOUT:-120}"
CONTAINER_WAIT_TIMEOUT="${CONTAINER_WAIT_TIMEOUT:-120}"

log() { printf '[stack-up] %s\n' "$*"; }
die() { log "ERROR: $*"; exit 1; }

require_docker() {
  command -v docker >/dev/null 2>&1 || die "Docker is required"
  docker compose version >/dev/null 2>&1 || die "Docker Compose plugin is required"
}

# Replace a single KEY=value line in an env file (safe for arbitrary values).
set_env_var() {
  local file="$1" key="$2" value="$3"
  local tmp line key_prefix

  [[ -f "$file" ]] || return 0
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

# Create missing .env files with test credentials; keep existing files unchanged.
ensure_env_files() {
  log "Ensuring .env files exist"
  DEPLOY_ROOT="${STACK_ROOT}" ONLY_IF_MISSING=1 USE_TEST_SECRETS=1 SAVE_CREDENTIALS=0 \
    bash "${STACK_ROOT}/scripts/generate-env-files.sh"
}

# Update ports and local-only settings without touching passwords or other secrets.
apply_local_env_overrides() {
  log "Applying local .env overrides (ports and hosts)"

  set_env_var "${STACK_ROOT}/freshrss/.env" FRESHRSS_HTTP_PORT "${FRESHRSS_PORT}"
  set_env_var "${STACK_ROOT}/freshrss/.env" FRESHRSS_BASE_URL "http://127.0.0.1:${FRESHRSS_PORT}"

  set_env_var "${STACK_ROOT}/static-server/.env" STATIC_SERVER_HTTP_PORT "${STATIC_SERVER_PORT}"
  set_env_var "${STACK_ROOT}/portainer/.env" PORTAINER_HTTP_PORT "${PORTAINER_PORT}"
  set_env_var "${STACK_ROOT}/pgadmin/.env" PGADMIN_HTTP_PORT "${PGADMIN_PORT}"
  set_env_var "${STACK_ROOT}/go-blog/.env" GO_BLOG_HTTP_PORT "${GO_BLOG_PORT}"

  set_env_var "${STACK_ROOT}/http-proxy/.env" HTTP_PROXY_PORT "${HTTP_PROXY_PORT}"
  set_env_var "${STACK_ROOT}/http-proxy/.env" SOCKS_PROXY_PORT "${SOCKS_PROXY_PORT}"

  set_env_var "${STACK_ROOT}/s3-storage/.env" MINIO_API_PORT "${MINIO_API_PORT}"
  set_env_var "${STACK_ROOT}/s3-storage/.env" MINIO_CONSOLE_PORT "${MINIO_CONSOLE_PORT}"

  set_env_var "${STACK_ROOT}/wg-easy/.env" WG_HOST "127.0.0.1"
  set_env_var "${STACK_ROOT}/wg-easy/.env" WG_EASY_WEB_PORT "${WG_EASY_WEB_PORT}"
  set_env_var "${STACK_ROOT}/wg-easy/.env" WG_EASY_WG_PORT "${WG_EASY_WG_PORT}"
}

ensure_network() {
  if docker network inspect "${DOCKER_NETWORK}" >/dev/null 2>&1; then
    log "Docker network '${DOCKER_NETWORK}' already exists"
  else
    docker network create "${DOCKER_NETWORK}"
    log "Created Docker network '${DOCKER_NETWORK}'"
  fi
}

# Start a compose project; go-blog and pg-backup need a local image build.
compose_up() {
  local project="$1"
  log "Starting ${project}"
  if [[ "${project}" == "go-blog" || "${project}" == "pg-backup" ]]; then
    (cd "${STACK_ROOT}/${project}" && docker compose up -d --build)
  else
    (cd "${STACK_ROOT}/${project}" && docker compose up -d)
  fi
}

# Poll Docker health status until PostgreSQL reports healthy or timeout.
wait_for_postgres() {
  log "Waiting for PostgreSQL to become healthy (timeout: ${POSTGRES_WAIT_TIMEOUT}s)"
  local deadline=$((SECONDS + POSTGRES_WAIT_TIMEOUT))
  while (( SECONDS < deadline )); do
    if docker inspect --format='{{.State.Health.Status}}' shared-postgres 2>/dev/null | grep -q healthy; then
      log "PostgreSQL is healthy"
      return 0
    fi
    sleep 1
  done
  die "PostgreSQL did not become healthy in time"
}

# MinIO exposes a liveness endpoint on the API port once it accepts traffic.
wait_for_s3_storage() {
  log "Waiting for S3 storage to become ready (timeout: ${CONTAINER_WAIT_TIMEOUT}s)"
  local deadline=$((SECONDS + CONTAINER_WAIT_TIMEOUT))
  while (( SECONDS < deadline )); do
    if curl -sf "http://127.0.0.1:${MINIO_API_PORT}/minio/health/live" >/dev/null 2>&1; then
      log "S3 storage is ready"
      return 0
    fi
    sleep 1
  done
  die "S3 storage did not become ready in time"
}

# Wait until container state is "running" (no health check required).
wait_for_container() {
  local name="$1"
  local timeout="${2:-${CONTAINER_WAIT_TIMEOUT}}"
  log "Waiting for container '${name}' to start (timeout: ${timeout}s)"
  local deadline=$((SECONDS + timeout))
  while (( SECONDS < deadline )); do
    local status
    status="$(docker inspect --format='{{.State.Status}}' "${name}" 2>/dev/null || true)"
    if [[ "${status}" == "running" ]]; then
      log "Container '${name}' is running"
      return 0
    fi
    sleep 1
  done
  die "Container '${name}' did not start in time"
}

# Wait until container health check reports "healthy".
wait_for_healthy() {
  local name="$1"
  local timeout="${2:-${CONTAINER_WAIT_TIMEOUT}}"
  log "Waiting for container '${name}' to become healthy (timeout: ${timeout}s)"
  local deadline=$((SECONDS + timeout))
  while (( SECONDS < deadline )); do
    local health
    health="$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "${name}" 2>/dev/null || true)"
    if [[ "${health}" == "healthy" ]]; then
      log "Container '${name}' is healthy"
      return 0
    fi
    sleep 1
  done
  die "Container '${name}' did not become healthy in time"
}

# Portainer requires a one-time admin init via API on first boot.
init_portainer_admin() {
  log "Ensuring Portainer admin user exists"
  local deadline=$((SECONDS + CONTAINER_WAIT_TIMEOUT))
  local status="000"

  while (( SECONDS < deadline )); do
    status="$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:${PORTAINER_PORT}/api/users/admin/init" \
      -H 'Content-Type: application/json' \
      -d '{"Username":"admin","Password":"test-portainer-admin-password"}' || true)"
    case "${status}" in
      200|204|409|422)
        # 200/204 = created; 409/422 = already initialized.
        case "${status}" in
          200|204) log "Portainer admin user created" ;;
          *) log "Portainer admin user already exists" ;;
        esac
        return 0
        ;;
    esac
    sleep 2
  done

  die "Failed to initialize Portainer admin user (HTTP ${status})"
}

# Confirm init script created FreshRSS and go-blog databases and users.
verify_postgres_databases() {
  log "Verifying PostgreSQL databases and users"
  docker exec shared-postgres psql -U postgres -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname = 'freshrss'" | grep -q 1
  docker exec shared-postgres psql -U postgres -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname = 'goblog'" | grep -q 1
  docker exec shared-postgres psql -U freshrss -d freshrss -c 'SELECT 1' >/dev/null
  docker exec shared-postgres psql -U goblog -d goblog -c 'SELECT 1' >/dev/null
  log "PostgreSQL databases verified"
}

# Create default admin account inside the go-blog application.
seed_go_blog_users() {
  log "Seeding go-blog test admin user"
  docker exec go-blog ./blog users-seed
}

main() {
  require_docker
  log "Stack root: ${STACK_ROOT}"
  ensure_env_files
  apply_local_env_overrides
  ensure_network

  # Start shared infrastructure first, then apps that depend on it.
  compose_up postgresql
  wait_for_postgres
  verify_postgres_databases

  compose_up s3-storage
  wait_for_healthy s3-storage

  compose_up static-server
  wait_for_healthy static-server

  compose_up freshrss
  wait_for_healthy freshrss

  compose_up go-blog
  wait_for_healthy go-blog
  seed_go_blog_users

  compose_up pgadmin
  wait_for_healthy pgadmin

  compose_up portainer
  wait_for_healthy portainer
  init_portainer_admin

  compose_up wg-easy
  wait_for_healthy wg-easy

  bash "${STACK_ROOT}/http-proxy/generate-3proxy-cfg.sh"
  compose_up http-proxy
  wait_for_healthy http-proxy

  compose_up reverse-proxy
  wait_for_healthy reverse-proxy

  compose_up pg-backup
  wait_for_healthy pg-backup

  log "Stack is ready"
}

main "$@"
