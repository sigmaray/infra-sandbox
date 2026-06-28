#!/usr/bin/env bash
#
# Generate 3proxy.cfg from .env (single source of truth for credentials).
#
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${DIR}/.env"
CFG_FILE="${DIR}/3proxy.cfg"

[[ -f "${ENV_FILE}" ]] || {
  echo "Missing ${ENV_FILE} — copy .env.example to .env first" >&2
  exit 1
}

# shellcheck disable=SC1090
source "${ENV_FILE}"

: "${HTTP_PROXY_USER:?HTTP_PROXY_USER is required in .env}"
: "${HTTP_PROXY_PASSWORD:?HTTP_PROXY_PASSWORD is required in .env}"

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

chmod 600 "${CFG_FILE}"
