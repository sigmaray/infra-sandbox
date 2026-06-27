#!/usr/bin/env bash
#
# Start the full project stack for local/CI testing.
#
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
STACK_ROOT="${DEPLOY_ROOT:-$REPO_DIR}"
DOCKER_NETWORK="${DOCKER_NETWORK:-projects-net}"
FRESHRSS_PORT="${FRESHRSS_HTTP_PORT:-8081}"
STATIC_SERVER_PORT="${STATIC_SERVER_HTTP_PORT:-8082}"
GO_BLOG_PORT="${GO_BLOG_HTTP_PORT:-8083}"
POSTGRES_WAIT_TIMEOUT="${POSTGRES_WAIT_TIMEOUT:-120}"
CONTAINER_WAIT_TIMEOUT="${CONTAINER_WAIT_TIMEOUT:-120}"

log() { printf '[stack-up] %s\n' "$*"; }
die() { log "ERROR: $*"; exit 1; }

require_docker() {
  command -v docker >/dev/null 2>&1 || die "Docker is required"
  docker compose version >/dev/null 2>&1 || die "Docker Compose plugin is required"
}

write_test_env_files() {
  log "Writing test .env files"

  cat > "${STACK_ROOT}/postgresql/.env" <<'EOF'
POSTGRES_USER=postgres
POSTGRES_PASSWORD=test-postgres-admin
POSTGRES_DB=postgres

FRESHRSS_DB_USER=freshrss
FRESHRSS_DB_PASSWORD=test-freshrss-db
GO_BLOG_DB_USER=goblog
GO_BLOG_DB_PASSWORD=test-goblog-db
EOF

  cat > "${STACK_ROOT}/freshrss/.env" <<EOF
TZ=UTC
CRON_MIN=*/15

FRESHRSS_BASE_URL=http://127.0.0.1:${FRESHRSS_PORT}
FRESHRSS_DB_NAME=freshrss
FRESHRSS_DB_USER=freshrss
FRESHRSS_DB_PASSWORD=test-freshrss-db

FRESHRSS_ADMIN_USER=admin
FRESHRSS_ADMIN_PASSWORD=test-admin
FRESHRSS_ADMIN_EMAIL=admin@example.com
FRESHRSS_API_PASSWORD=test-api
FRESHRSS_LANGUAGE=en

FRESHRSS_HTTP_PORT=${FRESHRSS_PORT}
EOF

  cat > "${STACK_ROOT}/static-server/.env" <<EOF
STATIC_SERVER_HTTP_PORT=${STATIC_SERVER_PORT}
EOF

  cat > "${STACK_ROOT}/reverse-proxy/.env" <<EOF
FRESHRSS_HOST=freshrss.localhost
FEEDS_HOST=feeds.localhost
BLOG_HOST=blog.localhost
CADDY_HTTP_PORT=80
EOF

  cat > "${STACK_ROOT}/go-blog/.env" <<EOF
GO_BLOG_HTTP_PORT=${GO_BLOG_PORT}

GO_BLOG_DATABASE_HOST=shared-postgres
GO_BLOG_DATABASE_PORT=5432
GO_BLOG_DATABASE_NAME=goblog
GO_BLOG_DATABASE_USER=goblog
GO_BLOG_DATABASE_PASSWORD=test-goblog-db
EOF
}

ensure_network() {
  if docker network inspect "${DOCKER_NETWORK}" >/dev/null 2>&1; then
    log "Docker network '${DOCKER_NETWORK}' already exists"
  else
    docker network create "${DOCKER_NETWORK}"
    log "Created Docker network '${DOCKER_NETWORK}'"
  fi
}

compose_up() {
  local project="$1"
  log "Starting ${project}"
  if [[ "${project}" == "go-blog" ]]; then
    (cd "${STACK_ROOT}/${project}" && docker compose up -d --build)
  else
    (cd "${STACK_ROOT}/${project}" && docker compose up -d)
  fi
}

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

main() {
  require_docker
  log "Stack root: ${STACK_ROOT}"
  write_test_env_files
  ensure_network

  compose_up postgresql
  wait_for_postgres
  verify_postgres_databases

  compose_up static-server
  wait_for_container static-server

  compose_up freshrss
  wait_for_container freshrss

  compose_up go-blog
  wait_for_container go-blog

  compose_up reverse-proxy
  wait_for_container reverse-proxy

  log "Stack is ready"
}

main "$@"
