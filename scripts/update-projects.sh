#!/usr/bin/env bash
#
# Pull the latest infra-sandbox code from GitHub and redeploy changed projects.
#
# Typical VPS workflow:
#   git clone git@github.com:sigmaray/infra-sandbox.git ~/infra-sandbox
#   sudo REPO_DIR=~/infra-sandbox ./scripts/setup-vps.sh
#   REPO_DIR=~/infra-sandbox ./scripts/update-projects.sh
#
# Environment:
#   REPO_DIR          Path to the infra-sandbox git checkout (default: repo root)
#   DEPLOY_ROOT       Deployment directory (default: /opt/projects on VPS, else REPO_DIR)
#   GIT_REMOTE        Remote to pull from (default: origin)
#   GIT_BRANCH        Branch to track (default: current branch or main)
#   SKIP_GIT_PULL=1   Skip git fetch/pull (sync and restart only)
#   SKIP_RESTART=1    Sync files only, do not restart containers
#   FORCE_RESTART=1   Restart all projects even when nothing changed
#   PULL_IMAGES=1     Pull upstream images before restarting (freshrss, postgresql, static-server)
#   DRY_RUN=1         Print actions without changing anything
#   PROJECTS          Space-separated subset to update (default: all)
#
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
DEPLOY_ROOT="${DEPLOY_ROOT:-}"
DOCKER_NETWORK="${DOCKER_NETWORK:-projects-net}"
GIT_REMOTE="${GIT_REMOTE:-origin}"
GIT_BRANCH="${GIT_BRANCH:-}"

ALL_PROJECTS=(postgresql drupal freshrss static-server go-blog)
BUILD_PROJECTS=(drupal go-blog)
IMAGE_PROJECTS=(postgresql freshrss static-server)

log() { printf '[update-projects] %s\n' "$*"; }
die() { log "ERROR: $*"; exit 1; }

run() {
  if [[ "${DRY_RUN:-}" == "1" ]]; then
    log "DRY_RUN: $*"
  else
    "$@"
  fi
}

parse_projects() {
  if [[ -n "${PROJECTS:-}" ]]; then
    # shellcheck disable=SC2206
    SELECTED_PROJECTS=($PROJECTS)
  else
    SELECTED_PROJECTS=("${ALL_PROJECTS[@]}")
  fi
}

require_tools() {
  command -v git >/dev/null 2>&1 || die "git is required"
  command -v rsync >/dev/null 2>&1 || die "rsync is required"
  command -v docker >/dev/null 2>&1 || die "Docker is required"
  docker compose version >/dev/null 2>&1 || die "Docker Compose plugin is required"
}

resolve_deploy_root() {
  if [[ -z "$DEPLOY_ROOT" ]]; then
    if [[ -d /opt/projects && "${REPO_DIR}" != /opt/projects* ]]; then
      DEPLOY_ROOT="/opt/projects"
    else
      DEPLOY_ROOT="${REPO_DIR}"
    fi
  fi
}

resolve_git_branch() {
  if [[ -z "$GIT_BRANCH" ]]; then
    GIT_BRANCH="$(git -C "${REPO_DIR}" symbolic-ref -q --short HEAD 2>/dev/null || true)"
    GIT_BRANCH="${GIT_BRANCH:-main}"
  fi
}

git_pull() {
  [[ -d "${REPO_DIR}/.git" ]] || die "Not a git repository: ${REPO_DIR}"

  local old_rev new_rev
  old_rev="$(git -C "${REPO_DIR}" rev-parse HEAD)"
  log "Repository: ${REPO_DIR} (${old_rev:0:12})"
  log "Pulling ${GIT_REMOTE}/${GIT_BRANCH}"

  run git -C "${REPO_DIR}" fetch "${GIT_REMOTE}" "${GIT_BRANCH}"
  run git -C "${REPO_DIR}" merge --ff-only "${GIT_REMOTE}/${GIT_BRANCH}"

  new_rev="$(git -C "${REPO_DIR}" rev-parse HEAD)"
  if [[ "$old_rev" == "$new_rev" ]]; then
    log "Already up to date (${new_rev:0:12})"
    GIT_OLD_REV="$old_rev"
    GIT_NEW_REV="$new_rev"
    GIT_UPDATED=0
    return
  fi

  log "Updated ${old_rev:0:12} -> ${new_rev:0:12}"
  GIT_OLD_REV="$old_rev"
  GIT_NEW_REV="$new_rev"
  GIT_UPDATED=1
}

projects_changed_in_git() {
  local project file
  CHANGED_PROJECTS=()

  if [[ "${GIT_UPDATED:-0}" -ne 1 ]]; then
    return
  fi

  local changed_files
  changed_files="$(git -C "${REPO_DIR}" diff --name-only "${GIT_OLD_REV}..${GIT_NEW_REV}")"

  for project in "${SELECTED_PROJECTS[@]}"; do
    while IFS= read -r file; do
      [[ -z "$file" ]] && continue
      if [[ "$file" == "${project}/"* ]]; then
        CHANGED_PROJECTS+=("$project")
        break
      fi
    done <<< "$changed_files"
  done
}

sync_project() {
  local project="$1"
  local source="${REPO_DIR}/${project}/"
  local target="${DEPLOY_ROOT}/${project}"

  [[ -d "$source" ]] || die "Missing project directory in repository: ${source}"

  log "Syncing ${project} -> ${target}/"
  mkdir -p "${target}"
  run rsync -a --delete \
    --exclude '.env' \
    --exclude 'data/' \
    "${source}" "${target}/"
}

sync_projects() {
  for project in "${SELECTED_PROJECTS[@]}"; do
    sync_project "$project"
  done
}

project_is_selected() {
  local needle="$1"
  local project
  for project in "${SELECTED_PROJECTS[@]}"; do
    [[ "$project" == "$needle" ]] && return 0
  done
  return 1
}

projects_to_restart() {
  RESTART_PROJECTS=()

  if [[ "${FORCE_RESTART:-}" == "1" ]]; then
    RESTART_PROJECTS=("${SELECTED_PROJECTS[@]}")
    return
  fi

  if [[ "${GIT_UPDATED:-0}" -eq 1 && ${#CHANGED_PROJECTS[@]} -gt 0 ]]; then
    RESTART_PROJECTS=("${CHANGED_PROJECTS[@]}")
    return
  fi

  if [[ "${SKIP_GIT_PULL:-}" == "1" ]]; then
    RESTART_PROJECTS=("${SELECTED_PROJECTS[@]}")
  fi
}

needs_build() {
  local project="$1"
  local item
  for item in "${BUILD_PROJECTS[@]}"; do
    [[ "$item" == "$project" ]] && return 0
  done
  return 1
}

needs_image_pull() {
  local project="$1"
  local item
  for item in "${IMAGE_PROJECTS[@]}"; do
    [[ "$item" == "$project" ]] && return 0
  done
  return 1
}

compose_up_project() {
  local project="$1"
  local dir="${DEPLOY_ROOT}/${project}"

  [[ -f "${dir}/docker-compose.yml" ]] || die "Missing docker-compose.yml: ${dir}"

  log "Restarting ${project}"
  if needs_build "$project"; then
    run bash -c "cd '${dir}' && docker compose up -d --build"
  elif [[ "${PULL_IMAGES:-}" == "1" ]] && needs_image_pull "$project"; then
    run bash -c "cd '${dir}' && docker compose pull && docker compose up -d"
  else
    run bash -c "cd '${dir}' && docker compose up -d"
  fi
}

restart_projects() {
  local project

  if [[ ${#RESTART_PROJECTS[@]} -eq 0 ]]; then
    log "No project restarts required"
    return
  fi

  log "Projects to restart: ${RESTART_PROJECTS[*]}"

  if project_is_selected postgresql && printf '%s\n' "${RESTART_PROJECTS[@]}" | grep -qx postgresql; then
    compose_up_project postgresql
  fi

  for project in static-server drupal freshrss go-blog; do
    project_is_selected "$project" || continue
    printf '%s\n' "${RESTART_PROJECTS[@]}" | grep -qx "$project" || continue
    compose_up_project "$project"
  done
}

fix_deploy_root_ownership() {
  local deploy_user="${SUDO_USER:-${DEPLOY_USER:-}}"
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    return
  fi
  if [[ -z "$deploy_user" || "$deploy_user" == "root" ]]; then
    return
  fi

  log "Setting ownership of ${DEPLOY_ROOT} to ${deploy_user}"
  run chown -R "${deploy_user}:${deploy_user}" "${DEPLOY_ROOT}"
}

print_summary() {
  cat <<EOF

================================================================================
Update complete.

Repository:     ${REPO_DIR} @ ${GIT_NEW_REV:-unknown}
Deploy root:    ${DEPLOY_ROOT}
Git updated:    ${GIT_UPDATED:-0}
Restarted:      ${RESTART_PROJECTS[*]:-(none)}

Re-run with FORCE_RESTART=1 to restart all selected projects.
Re-run with PULL_IMAGES=1 to refresh upstream Docker images.
================================================================================
EOF
}

main() {
  parse_projects
  require_tools
  resolve_deploy_root
  resolve_git_branch

  log "Deploy root: ${DEPLOY_ROOT}"

  GIT_UPDATED=0
  if [[ "${SKIP_GIT_PULL:-}" == "1" ]]; then
    log "SKIP_GIT_PULL=1, skipping git fetch/pull"
    GIT_NEW_REV="$(git -C "${REPO_DIR}" rev-parse HEAD 2>/dev/null || echo unknown)"
  else
    git_pull
  fi

  projects_changed_in_git
  sync_projects
  projects_to_restart

  if [[ "${SKIP_RESTART:-}" == "1" ]]; then
    log "SKIP_RESTART=1, skipping container restarts"
  else
    restart_projects
  fi

  fix_deploy_root_ownership
  print_summary
}

main "$@"
