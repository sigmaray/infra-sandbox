#!/usr/bin/env bash
set -euo pipefail

/usr/local/bin/install-drupal.sh
exec docker-php-entrypoint "$@"
