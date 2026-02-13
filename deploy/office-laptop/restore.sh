#!/usr/bin/env bash
# Restore database from a backup file
# Usage: ./restore.sh backups/fhe_backup_20240115_020000.sql.gz
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: ./restore.sh <backup-file>"
  echo ""
  echo "Available backups:"
  ls -lh backups/fhe_backup_*.sql.gz 2>/dev/null || echo "  No backups found"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: File not found: $BACKUP_FILE"
  exit 1
fi

echo "WARNING: This will replace ALL data with the backup."
echo "Backup: $BACKUP_FILE"
read -p "Are you sure? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Cancelled."
  exit 0
fi

echo "Restoring..."
# Load DB_PASSWORD from .env
source .env
gunzip -c "$BACKUP_FILE" | docker compose -f docker-compose.prod.yml exec -T db psql -U fhe_user -d fhe_project_board

echo "Restore complete. Restarting app..."
docker compose -f docker-compose.prod.yml restart app
echo "Done!"
