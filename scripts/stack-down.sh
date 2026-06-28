#!/usr/bin/env bash
#
# Stop the full project stack and remove Docker volumes (clean test state).
#
# Stops services in reverse dependency order (apps first, database last).
# Uses "docker compose down -v" so the next stack-up starts from a fresh state.
# Intended for local development and CI teardown after tests.
#
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
# Where docker-compose.yml files live (repo root locally, /opt/projects on VPS).
STACK_ROOT="${DEPLOY_ROOT:-$REPO_DIR}"

log() { printf '[stack-down] %s\n' "$*"; }

# Stop one project and delete its named volumes; ignore errors if already stopped.
down_project() {
  local project="$1"
  if [[ -f "${STACK_ROOT}/${project}/docker-compose.yml" ]]; then
    log "Stopping ${project}"
    (cd "${STACK_ROOT}/${project}" && docker compose down -v --remove-orphans) || true
  fi
}

# Remove leftover containers from older stack layouts (safe no-op if absent).
remove_legacy_container() {
  local name="$1"
  if docker container inspect "${name}" >/dev/null 2>&1; then
    log "Removing legacy container ${name}"
    docker rm -f "${name}" >/dev/null 2>&1 || true
  fi
}

main() {
  # Reverse of stack-up order: dependents before shared infrastructure.
  down_project pg-backup
  down_project reverse-proxy
  down_project http-proxy
  down_project portainer
  down_project pgadmin
  down_project go-blog
  down_project freshrss
  down_project static-server
  down_project s3-storage
  down_project postgresql
  remove_legacy_container drupal
  log "Stack stopped"
}

main "$@"
