#!/usr/bin/env bash
#
# Install Drupal via Drush (minimal profile) when the site is not yet bootstrapped.
# Runs inside the Drupal container at startup.
#
set -euo pipefail

DRUSH="/opt/drupal/vendor/bin/drush"
ENV_FILE="${DRUPAL_ENV_FILE:-/opt/drupal/.env}"

log() { printf '[install-drupal] %s\n' "$*"; }
die() { log "ERROR: $*"; exit 1; }

load_drupal_env() {
  [[ -f "${ENV_FILE}" ]] || return 0

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

    if [[ -z "${!key:-}" ]]; then
      export "${key}=${value}"
    fi
  done < "${ENV_FILE}"
}

is_drupal_installed() {
  "${DRUSH}" status --fields=bootstrap 2>/dev/null | grep -Fq 'Successful'
}

wait_for_database() {
  local db_host="${DRUPAL_DATABASE_HOST:-shared-postgres}"
  local db_port="${DRUPAL_DATABASE_PORT:-5432}"
  local timeout="${POSTGRES_WAIT_TIMEOUT:-120}"
  local deadline=$((SECONDS + timeout))

  log "Waiting for PostgreSQL at ${db_host}:${db_port} (timeout: ${timeout}s)"
  while (( SECONDS < deadline )); do
    if (echo > "/dev/tcp/${db_host}/${db_port}") 2>/dev/null; then
      log "PostgreSQL is reachable"
      return 0
    fi
    sleep 2
  done

  die "PostgreSQL is not reachable at ${db_host}:${db_port}"
}

install_drupal() {
  if is_drupal_installed; then
    log "Site already installed"
    return 0
  fi

  load_drupal_env
  wait_for_database

  local db_host="${DRUPAL_DATABASE_HOST:-shared-postgres}"
  local db_port="${DRUPAL_DATABASE_PORT:-5432}"
  local db_name="${DRUPAL_DATABASE_NAME:-drupal}"
  local db_user="${DRUPAL_DATABASE_USER:-drupal}"
  local db_password="${DRUPAL_DATABASE_PASSWORD:-}"

  [[ -n "${db_password}" ]] || die "DRUPAL_DATABASE_PASSWORD is required"

  log "Running drush site:install (minimal profile)..."

  "${DRUSH}" site:install minimal \
    --db-url="pgsql://${db_user}:${db_password}@${db_host}:${db_port}/${db_name}" \
    --site-name="${DRUPAL_SITE_NAME:-My Drupal Site}" \
    --account-name="${DRUPAL_ADMIN_USER:-admin}" \
    --account-pass="${DRUPAL_ADMIN_PASSWORD:-test-admin}" \
    --account-mail="${DRUPAL_ADMIN_EMAIL:-admin@example.com}" \
    -y

  log "Installation complete"
}

install_drupal
