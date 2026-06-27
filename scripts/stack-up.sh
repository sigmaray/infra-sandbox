#!/usr/bin/env bash
#
# Start the full project stack for local/CI testing.
#
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
DOCKER_NETWORK="${DOCKER_NETWORK:-projects-net}"
DRUPAL_PORT="${DRUPAL_HTTP_PORT:-8080}"
FRESHRSS_PORT="${FRESHRSS_HTTP_PORT:-8081}"
STATIC_SERVER_PORT="${STATIC_SERVER_HTTP_PORT:-8082}"
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

  cat > "${REPO_DIR}/postgresql/.env" <<'EOF'
POSTGRES_USER=postgres
POSTGRES_PASSWORD=test-postgres-admin
POSTGRES_DB=postgres

DRUPAL_DB_USER=drupal
DRUPAL_DB_PASSWORD=test-drupal-db
FRESHRSS_DB_USER=freshrss
FRESHRSS_DB_PASSWORD=test-freshrss-db
EOF

  cat > "${REPO_DIR}/drupal/.env" <<EOF
DRUPAL_SITE_NAME=My Drupal Site
DRUPAL_ADMIN_USER=admin
DRUPAL_ADMIN_PASSWORD=test-admin
DRUPAL_ADMIN_EMAIL=admin@example.com

DRUPAL_DATABASE_HOST=shared-postgres
DRUPAL_DATABASE_PORT=5432
DRUPAL_DATABASE_NAME=drupal
DRUPAL_DATABASE_USER=drupal
DRUPAL_DATABASE_PASSWORD=test-drupal-db

DRUPAL_HTTP_PORT=${DRUPAL_PORT}
EOF

  cat > "${REPO_DIR}/freshrss/.env" <<EOF
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

  cat > "${REPO_DIR}/static-server/.env" <<EOF
STATIC_SERVER_HTTP_PORT=${STATIC_SERVER_PORT}
EOF
}

generate_test_feeds() {
  log "Generating test RSS feeds"
  STATIC_SERVER_HTTP_PORT="${STATIC_SERVER_PORT}" \
    npx --yes tsx "${REPO_DIR}/scripts/generate-test-feeds.mts"
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
  (cd "${REPO_DIR}/${project}" && docker compose up -d)
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
    "SELECT 1 FROM pg_database WHERE datname = 'drupal'" | grep -q 1
  docker exec shared-postgres psql -U postgres -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname = 'freshrss'" | grep -q 1
  docker exec shared-postgres psql -U drupal -d drupal -c 'SELECT 1' >/dev/null
  docker exec shared-postgres psql -U freshrss -d freshrss -c 'SELECT 1' >/dev/null
  log "PostgreSQL databases verified"
}

main() {
  require_docker
  write_test_env_files
  ensure_network

  compose_up postgresql
  wait_for_postgres
  verify_postgres_databases

  generate_test_feeds

  compose_up static-server
  wait_for_container static-server

  compose_up drupal
  wait_for_container drupal

  compose_up freshrss
  wait_for_container freshrss

  log "Installing Drupal via web installer"
  (cd "${REPO_DIR}" && npx --yes tsx scripts/install-drupal.mts)

  log "Stack is ready"
}

main "$@"
