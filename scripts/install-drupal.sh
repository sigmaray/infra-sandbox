#!/usr/bin/env bash
#
# Install Drupal via Drush (minimal profile) when the site is not yet bootstrapped.
#
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
STACK_ROOT="${DEPLOY_ROOT:-$REPO_DIR}"
ENV_FILE="${STACK_ROOT}/drupal/.env"

log() { printf '[install-drupal] %s\n' "$*"; }
die() { log "ERROR: $*"; exit 1; }

load_drupal_env() {
  [[ -f "${ENV_FILE}" ]] || die "Missing ${ENV_FILE}"

  while IFS= read -r line || [[ -n "${line}" ]]; do
    line="${line%%#*}"
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "${line}" ]] && continue
    [[ "${line}" == *=* ]] || continue

    local key="${line%%=*}"
    local value="${line#*=}"
    key="${key%"${key##*[![:space:]]}"}"
    value="${value#"${value%%[![:space:]]*}"}"

    if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "${value}" == \'*\' && "${value}" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi

    export "${key}=${value}"
  done < "${ENV_FILE}"
}

is_drupal_installed() {
  docker exec drupal /opt/drupal/vendor/bin/drush status --fields=bootstrap 2>/dev/null \
    | grep -Fq 'Successful'
}

install_drupal() {
  if is_drupal_installed; then
    log "Site already installed"
    return 0
  fi

  load_drupal_env

  local db_host="${DRUPAL_DATABASE_HOST:-shared-postgres}"
  local db_port="${DRUPAL_DATABASE_PORT:-5432}"
  local db_name="${DRUPAL_DATABASE_NAME:-drupal}"
  local db_user="${DRUPAL_DATABASE_USER:-drupal}"
  local db_password="${DRUPAL_DATABASE_PASSWORD:-}"

  log "Running drush site:install (minimal profile)..."

  docker exec drupal /opt/drupal/vendor/bin/drush site:install minimal \
    --db-url="pgsql://${db_user}:${db_password}@${db_host}:${db_port}/${db_name}" \
    --site-name="${DRUPAL_SITE_NAME:-My Drupal Site}" \
    --account-name="${DRUPAL_ADMIN_USER:-admin}" \
    --account-pass="${DRUPAL_ADMIN_PASSWORD:-test-admin}" \
    --account-mail="${DRUPAL_ADMIN_EMAIL:-admin@example.com}" \
    -y

  log "Installation complete"
}

install_drupal
