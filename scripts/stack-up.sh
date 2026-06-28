#!/usr/bin/env bash
#
# Start the full project stack for local development and CI testing.
#
# Writes known test credentials into .env files, creates the shared Docker
# network, starts services in dependency order, waits for health checks, and
# seeds test data (go-blog admin, Portainer admin).
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

# Overwrite .env files with fixed test values so CI and local runs are reproducible.
write_test_env_files() {
  log "Writing test .env files"

  # PostgreSQL: superuser + credentials for init script (FreshRSS, go-blog DBs).
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

  # Caddy virtual hosts for local testing (map via /etc/hosts or DNS).
  cat > "${STACK_ROOT}/reverse-proxy/.env" <<EOF
FRESHRSS_HOST=freshrss.localhost
FRESHRSS_ALT_HOST=freshrss.sigmalocal
FEEDS_HOST=feeds.localhost
FEEDS_ALT_HOST=feeds.sigmalocal
BLOG_HOST=blog.localhost
BLOG_ALT_HOST=blog.sigmalocal
PORTAINER_HOST=portainer.localhost
PORTAINER_ALT_HOST=portainer.sigmalocal
PGADMIN_HOST=pgadmin.localhost
PGADMIN_ALT_HOST=pgadmin.sigmalocal
CADDY_HTTP_PORT=80
EOF

  cat > "${STACK_ROOT}/portainer/.env" <<EOF
PORTAINER_HTTP_PORT=${PORTAINER_PORT}
EOF

  cat > "${STACK_ROOT}/pgadmin/.env" <<EOF
PGADMIN_HTTP_PORT=${PGADMIN_PORT}
PGADMIN_DEFAULT_EMAIL=admin@example.com
PGADMIN_DEFAULT_PASSWORD=test-pgadmin
PGADMIN_CONFIG_SERVER_MODE=True
PGADMIN_CONFIG_MASTER_PASSWORD_REQUIRED=False

PGADMIN_SERVER_HOST=shared-postgres
PGADMIN_SERVER_PORT=5432
PGADMIN_SERVER_USERNAME=postgres
PGADMIN_SERVER_PASSWORD=test-postgres-admin
EOF

  # Pre-register the shared PostgreSQL server in pgAdmin on first start.
  sed 's/"Password": "change-me"/"Password": "test-postgres-admin"/' \
    "${STACK_ROOT}/pgadmin/servers.json.example" > "${STACK_ROOT}/pgadmin/servers.json"

  cat > "${STACK_ROOT}/go-blog/.env" <<EOF
GO_BLOG_HTTP_PORT=${GO_BLOG_PORT}
GO_BLOG_SESSION_SECRET=test-go-blog-session-secret-32chars
GO_BLOG_SESSION_SECURE=0

GO_BLOG_DATABASE_HOST=shared-postgres
GO_BLOG_DATABASE_PORT=5432
GO_BLOG_DATABASE_NAME=goblog
GO_BLOG_DATABASE_USER=goblog
GO_BLOG_DATABASE_PASSWORD=test-goblog-db
EOF

  cat > "${STACK_ROOT}/http-proxy/.env" <<EOF
HTTP_PROXY_PORT=${HTTP_PROXY_PORT}
SOCKS_PROXY_PORT=${SOCKS_PROXY_PORT}
HTTP_PROXY_USER=test-proxy-user
HTTP_PROXY_PASSWORD=test-proxy-password
EOF

  cat > "${STACK_ROOT}/s3-storage/.env" <<EOF
MINIO_ROOT_USER=test-minio-admin
MINIO_ROOT_PASSWORD=test-minio-password
MINIO_API_PORT=${MINIO_API_PORT}
MINIO_CONSOLE_PORT=${MINIO_CONSOLE_PORT}
MINIO_BUCKET=pg-backups
EOF

  cat > "${STACK_ROOT}/pg-backup/.env" <<EOF
POSTGRES_HOST=shared-postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=test-postgres-admin
MINIO_ENDPOINT=http://s3-storage:9000
MINIO_ROOT_USER=test-minio-admin
MINIO_ROOT_PASSWORD=test-minio-password
MINIO_BUCKET=pg-backups
BACKUP_RETENTION_DAYS=30
EOF

  cat > "${STACK_ROOT}/wg-easy/.env" <<'EOF'
WG_HOST=127.0.0.1
PASSWORD_HASH=$$2a$$12$$Ssl6xzD/0HbOPYvGiKczDuTngT3TSqNNn37le52ifQNtg8UmYFPsO
LANG=en
EOF
  cat >> "${STACK_ROOT}/wg-easy/.env" <<EOF
WG_EASY_WEB_PORT=${WG_EASY_WEB_PORT}
WG_EASY_WG_PORT=${WG_EASY_WG_PORT}
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
  write_test_env_files
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
