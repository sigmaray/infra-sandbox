#!/usr/bin/env bash
#
# Stop the project stack and remove volumes (clean test state).
#
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

log() { printf '[stack-down] %s\n' "$*"; }

down_project() {
  local project="$1"
  if [[ -f "${REPO_DIR}/${project}/docker-compose.yml" ]]; then
    log "Stopping ${project}"
    (cd "${REPO_DIR}/${project}" && docker compose down -v --remove-orphans) || true
  fi
}

main() {
  down_project freshrss
  down_project drupal
  down_project postgresql
  log "Stack stopped"
}

main "$@"
