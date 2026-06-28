#!/usr/bin/env bash
#
# Generate 3proxy.cfg from .env (single source of truth for proxy credentials).
#
# Reads HTTP_PROXY_USER and HTTP_PROXY_PASSWORD from .env and writes a
# 3proxy config file with DNS, auth, and proxy listener settings.
# Called by setup-vps.sh, stack-up.sh, and update-projects.sh before starting
# the http-proxy container.
#
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${DIR}/.env"
CFG_FILE="${DIR}/3proxy.cfg"

[[ -f "${ENV_FILE}" ]] || {
  echo "Missing ${ENV_FILE} — copy .env.example to .env first" >&2
  exit 1
}

# Load proxy credentials from .env.
# shellcheck disable=SC1090
source "${ENV_FILE}"

: "${HTTP_PROXY_USER:?HTTP_PROXY_USER is required in .env}"
: "${HTTP_PROXY_PASSWORD:?HTTP_PROXY_PASSWORD is required in .env}"

# Write 3proxy config: Docker DNS + public DNS, auth, single user, port 3128.
cat > "${CFG_FILE}" <<EOF
nserver 127.0.0.11
nserver 8.8.8.8
nserver 8.8.4.4
nscache 65536
log
auth strong
users ${HTTP_PROXY_USER}:CL:${HTTP_PROXY_PASSWORD}
allow ${HTTP_PROXY_USER}
proxy -p3128
EOF

# Restrict read access — file contains the proxy password.
chmod 600 "${CFG_FILE}"
