#!/usr/bin/env bash
# Pull latest code, rebuild, and restart with zero-downtime-ish deploy
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$SCRIPT_DIR"

echo "=== FHE Project Board — Update ==="
echo ""

# 1. Backup first
echo "[1/4] Backing up database..."
docker compose -f docker-compose.prod.yml run --rm db-backup

# 2. Pull latest code
echo "[2/4] Pulling latest code..."
cd "$PROJECT_ROOT"
git pull origin main

# 3. Rebuild
echo "[3/4] Rebuilding application..."
cd "$SCRIPT_DIR"
docker compose -f docker-compose.prod.yml build app

# 4. Restart
echo "[4/4] Restarting..."
docker compose -f docker-compose.prod.yml up -d app

echo ""
echo "Update complete! App is restarting..."
echo "Check status: docker compose -f docker-compose.prod.yml ps"
