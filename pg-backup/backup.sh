#!/bin/sh
set -eu

TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
BACKUP_FILE="/tmp/pg-backup-${TIMESTAMP}.sql.gz"
ALIAS=backup-minio

mc alias set "${ALIAS}" "${MINIO_ENDPOINT}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}"
mc mb --ignore-existing "${ALIAS}/${MINIO_BUCKET}"

export PGPASSWORD="${POSTGRES_PASSWORD}"
pg_dumpall -h "${POSTGRES_HOST}" -U "${POSTGRES_USER}" | gzip > "${BACKUP_FILE}"

mc cp "${BACKUP_FILE}" "${ALIAS}/${MINIO_BUCKET}/daily/${TIMESTAMP}.sql.gz"
rm -f "${BACKUP_FILE}"

if [ -n "${BACKUP_RETENTION_DAYS:-}" ]; then
  mc rm --recursive --force --older-than "${BACKUP_RETENTION_DAYS}d" \
    "${ALIAS}/${MINIO_BUCKET}/daily/" || true
fi
