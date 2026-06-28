#!/usr/bin/env bash
#
# PostgreSQL first-boot init script (runs once when the data volume is empty).
#
# Creates application-specific users and databases for FreshRSS and go-blog.
# Credentials come from environment variables set in postgresql/.env
# (FRESHRSS_DB_*, GO_BLOG_DB_*).
#
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE USER ${FRESHRSS_DB_USER} WITH PASSWORD '${FRESHRSS_DB_PASSWORD}';
  CREATE DATABASE freshrss OWNER ${FRESHRSS_DB_USER};

  CREATE USER ${GO_BLOG_DB_USER} WITH PASSWORD '${GO_BLOG_DB_PASSWORD}';
  CREATE DATABASE goblog OWNER ${GO_BLOG_DB_USER};
EOSQL
