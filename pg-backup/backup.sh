#!/bin/sh
#
# Dump all PostgreSQL databases, compress the dump, upload to MinIO (S3),
# and delete local backups older than BACKUP_RETENTION_DAYS.
#
# Runs on a schedule via cron inside the pg-backup container (see crontab).
# Required env vars: POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD,
# MINIO_ENDPOINT, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD, MINIO_BUCKET.
#
set -eu

# UTC timestamp used in the backup filename (e.g. 20250628-143000).
TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
BACKUP_FILE="/tmp/pg-backup-${TIMESTAMP}.sql.gz"
ALIAS=backup-minio

# Configure MinIO client and ensure the target bucket exists.
mc alias set "${ALIAS}" "${MINIO_ENDPOINT}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}"
mc mb --ignore-existing "${ALIAS}/${MINIO_BUCKET}"

# Dump every database on the server and gzip the output to a temp file.
export PGPASSWORD="${POSTGRES_PASSWORD}"
pg_dumpall -h "${POSTGRES_HOST}" -U "${POSTGRES_USER}" | gzip > "${BACKUP_FILE}"

# Upload to s3://<bucket>/daily/<timestamp>.sql.gz and remove the local copy.
mc cp "${BACKUP_FILE}" "${ALIAS}/${MINIO_BUCKET}/daily/${TIMESTAMP}.sql.gz"
rm -f "${BACKUP_FILE}"

# Optional: prune old daily backups from MinIO (ignore errors if none match).
if [ -n "${BACKUP_RETENTION_DAYS:-}" ]; then
  mc rm --recursive --force --older-than "${BACKUP_RETENTION_DAYS}d" \
    "${ALIAS}/${MINIO_BUCKET}/daily/" || true
fi
