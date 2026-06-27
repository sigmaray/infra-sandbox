#!/usr/bin/env bash
#
# Initial setup for a DigitalOcean VPS (4 GB RAM).
# Installs Docker, creates project directories, and prepares shared infrastructure.
#
# Usage (as root or with sudo):
#   curl -fsSL ... | bash
#   ./scripts/setup-vps.sh
#
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/projects}"
DOCKER_NETWORK="${DOCKER_NETWORK:-projects-net}"
SWAP_SIZE_GB="${SWAP_SIZE_GB:-2}"

PROJECTS=(postgresql drupal freshrss)

log() { printf '[setup-vps] %s\n' "$*"; }
die() { log "ERROR: $*"; exit 1; }

require_root() {
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    die "Run this script as root (sudo ./scripts/setup-vps.sh)"
  fi
}

detect_os() {
  if [[ -f /etc/os-release ]]; then
    # shellcheck source=/dev/null
    . /etc/os-release
    echo "${ID:-unknown}"
  else
    echo "unknown"
  fi
}

setup_swap() {
  if swapon --show | grep -q '/swapfile'; then
    log "Swap already configured, skipping"
    return
  fi

  log "Creating ${SWAP_SIZE_GB}G swap file (recommended for 4 GB RAM VPS)"
  fallocate -l "${SWAP_SIZE_GB}G" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=$((SWAP_SIZE_GB * 1024))
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
}

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    log "Docker already installed: $(docker --version)"
    return
  fi

  local os
  os="$(detect_os)"
  [[ "$os" == "ubuntu" || "$os" == "debian" ]] || die "Unsupported OS: $os (expected Ubuntu/Debian)"

  log "Installing Docker..."
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg

  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/"${os}"/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  local codename
  codename="$(. /etc/os-release && echo "${VERSION_CODENAME}")"
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/${os} ${codename} stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  systemctl enable --now docker
  log "Docker installed: $(docker --version)"
}

add_deploy_user_to_docker() {
  local deploy_user="${SUDO_USER:-${DEPLOY_USER:-}}"
  if [[ -z "$deploy_user" || "$deploy_user" == "root" ]]; then
    log "No non-root deploy user detected; skip docker group membership"
    return
  fi

  if id -nG "$deploy_user" | grep -qw docker; then
    log "User '$deploy_user' already in docker group"
  else
    usermod -aG docker "$deploy_user"
    log "Added '$deploy_user' to docker group (re-login required)"
  fi
}

create_directories() {
  log "Creating deployment directories under ${DEPLOY_ROOT}"
  mkdir -p "${DEPLOY_ROOT}"

  for project in "${PROJECTS[@]}"; do
    local target="${DEPLOY_ROOT}/${project}"
    mkdir -p "${target}"

    if [[ -d "${REPO_DIR}/${project}" ]]; then
      log "Syncing ${project} from repository"
      rsync -a --delete \
        --exclude '.env' \
        --exclude 'data/' \
        "${REPO_DIR}/${project}/" "${target}/"
    fi
  done

  chmod 755 "${DEPLOY_ROOT}"
}

create_docker_network() {
  if docker network inspect "${DOCKER_NETWORK}" >/dev/null 2>&1; then
    log "Docker network '${DOCKER_NETWORK}' already exists"
  else
    docker network create "${DOCKER_NETWORK}"
    log "Created Docker network '${DOCKER_NETWORK}'"
  fi
}

setup_env_files() {
  for project in "${PROJECTS[@]}"; do
    local env_example="${DEPLOY_ROOT}/${project}/.env.example"
    local env_file="${DEPLOY_ROOT}/${project}/.env"
    if [[ -f "$env_example" && ! -f "$env_file" ]]; then
      cp "$env_example" "$env_file"
      chmod 600 "$env_file"
      log "Created ${env_file} from .env.example — edit passwords before starting services"
    fi
  done
}

print_next_steps() {
  cat <<EOF

================================================================================
VPS setup complete.

Deployment root:  ${DEPLOY_ROOT}
Docker network:   ${DOCKER_NETWORK}

Start services in order:

  1. PostgreSQL (shared database):
     cd ${DEPLOY_ROOT}/postgresql && docker compose up -d

  2. Drupal:
     cd ${DEPLOY_ROOT}/drupal && docker compose up -d

  3. FreshRSS:
     cd ${DEPLOY_ROOT}/freshrss && docker compose up -d

Edit .env files in each directory and set strong passwords before production use.
Re-login (or run 'newgrp docker') if you were added to the docker group.

To update configs from this repository, re-run:
  REPO_DIR=${REPO_DIR} ${REPO_DIR}/scripts/setup-vps.sh
================================================================================
EOF
}

main() {
  require_root
  log "Repository: ${REPO_DIR}"
  log "Deploy root: ${DEPLOY_ROOT}"

  setup_swap
  install_docker
  add_deploy_user_to_docker
  create_directories
  create_docker_network
  setup_env_files
  print_next_steps
}

main "$@"
