#!/usr/bin/env bash
#
# Stop the project stack and remove volumes (clean test state).
#
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
STACK_ROOT="${DEPLOY_ROOT:-$REPO_DIR}"

log() { printf '[stack-down] %s\n' "$*"; }

down_project() {
  local project="$1"
  if [[ -f "${STACK_ROOT}/${project}/docker-compose.yml" ]]; then
    log "Stopping ${project}"
    (cd "${STACK_ROOT}/${project}" && docker compose down -v --remove-orphans) || true
  fi
}

remove_legacy_container() {
  local name="$1"
  if docker container inspect "${name}" >/dev/null 2>&1; then
    log "Removing legacy container ${name}"
    docker rm -f "${name}" >/dev/null 2>&1 || true
  fi
}

main() {
  down_project reverse-proxy
  down_project go-blog
  down_project freshrss
  down_project static-server
  down_project postgresql
  remove_legacy_container drupal
  log "Stack stopped"
}

main "$@"
