#!/bin/sh
#
# Container entrypoint for pg-backup.
#
# Registers the MinIO (S3) endpoint with the mc client, creates the backup
# bucket if missing, then starts cron in the foreground so scheduled backups
# keep running while the container stays alive.
#
set -eu

# Point mc at MinIO and create the bucket (no-op if it already exists).
mc alias set backup-minio "${MINIO_ENDPOINT}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}"
mc mb --ignore-existing "backup-minio/${MINIO_BUCKET}"

# Run cron in foreground (-f) with moderate log verbosity (-l 2).
exec crond -f -l 2
