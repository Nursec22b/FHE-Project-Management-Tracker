#!/usr/bin/env bash
# Run a manual database backup
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
docker compose -f docker-compose.prod.yml run --rm db-backup
