#!/bin/sh
set -eu

mc alias set backup-minio "${MINIO_ENDPOINT}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}"
mc mb --ignore-existing "backup-minio/${MINIO_BUCKET}"

exec crond -f -l 2
