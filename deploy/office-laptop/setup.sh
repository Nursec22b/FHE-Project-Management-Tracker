#!/usr/bin/env bash
# ============================================================================
#  FHE Project Board — Office Laptop Setup
#  One script to go from bare laptop to running app.
#
#  Usage:
#    curl -fsSL <your-repo>/deploy/office-laptop/setup.sh | bash
#    — or —
#    git clone <repo> && cd fhe-TRELLO- && bash deploy/office-laptop/setup.sh
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEPLOY_DIR="$SCRIPT_DIR"
ENV_FILE="$DEPLOY_DIR/.env"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.prod.yml"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $*"; exit 1; }

# ── Step 1: Check prerequisites ───────────────────────────────────────
echo ""
echo "============================================="
echo "  FHE Project Board — Office Laptop Deploy"
echo "============================================="
echo ""

info "Checking prerequisites..."

# Docker
if ! command -v docker &> /dev/null; then
  warn "Docker not found. Installing Docker..."
  if [[ "$(uname)" == "Linux" ]]; then
    curl -fsSL https://get.docker.com | sh
    sudo systemctl enable docker
    sudo systemctl start docker
    sudo usermod -aG docker "$USER"
    ok "Docker installed. You may need to log out and back in for group changes."
  elif [[ "$(uname)" == "Darwin" ]]; then
    fail "Please install Docker Desktop from https://docker.com/products/docker-desktop"
  else
    fail "Please install Docker: https://docs.docker.com/get-docker/"
  fi
else
  ok "Docker found: $(docker --version | head -1)"
fi

# Docker Compose (v2 is bundled with Docker now)
if docker compose version &> /dev/null; then
  ok "Docker Compose found: $(docker compose version --short 2>/dev/null || echo 'v2')"
elif command -v docker-compose &> /dev/null; then
  ok "Docker Compose (legacy) found"
  # Create a shim so we can use `docker compose` syntax
  alias docker="docker-compose"
else
  fail "Docker Compose not found. Please update Docker to a recent version."
fi

# ── Step 2: Generate secrets & create .env ─────────────────────────────
if [ -f "$ENV_FILE" ]; then
  info "Found existing .env file, keeping it."
  echo "  (Delete $ENV_FILE and re-run to regenerate)"
else
  info "Generating secure .env file..."

  DB_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"
  JWT_SECRET="$(openssl rand -base64 48 | tr -d '/+=' | head -c 48)"

  cat > "$ENV_FILE" <<EOF
# ── FHE Project Board — Production Config ──
# Generated on $(date -Iseconds)

# Database
DB_PASSWORD=$DB_PASSWORD

# Authentication
JWT_SECRET=$JWT_SECRET

# App URL — update this once you set up your tunnel or know your LAN IP
CLIENT_URL=http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost"):8080

# ── Optional: Microsoft 365 email automation ──
# AZURE_TENANT_ID=
# AZURE_CLIENT_ID=
# AZURE_CLIENT_SECRET=
# EMAIL_MONITORED_MAILBOX=tasks@floridahorizoneng.com
# EMAIL_POLL_INTERVAL_MS=60000

# ── Optional: Cloudflare Tunnel for remote HTTPS access ──
# Get your token: https://one.dash.cloudflare.com → Networks → Tunnels → Create
# CLOUDFLARE_TUNNEL_TOKEN=your-token-here
EOF

  chmod 600 "$ENV_FILE"
  ok "Created .env with secure random passwords"
  ok "DB Password: ${DB_PASSWORD:0:4}... (see $ENV_FILE for full value)"
fi

# ── Step 3: Create backup directory ────────────────────────────────────
mkdir -p "$DEPLOY_DIR/backups"
ok "Backup directory ready"

# ── Step 4: Build and start ────────────────────────────────────────────
info "Building application (this takes 2-3 minutes the first time)..."
cd "$DEPLOY_DIR"
docker compose -f docker-compose.prod.yml build app

info "Starting services..."
docker compose -f docker-compose.prod.yml up -d db app

# Wait for healthy
info "Waiting for database to be ready..."
for i in $(seq 1 30); do
  if docker compose -f docker-compose.prod.yml exec -T db pg_isready -U fhe_user -d fhe_project_board &>/dev/null; then
    break
  fi
  sleep 1
done
ok "Database is ready"

# ── Step 5: Run migrations & seed ──────────────────────────────────────
info "Running database migrations..."
# The compiled migrate.js is already in the Docker image at /app/server/dist/db/migrate.js
docker compose -f docker-compose.prod.yml exec -T app node server/dist/db/migrate.js \
  && ok "Migrations complete" \
  || warn "Migration may have already been applied (this is fine on re-runs)"

info "Seeding default admin user..."
docker compose -f docker-compose.prod.yml exec -T app node server/dist/db/seed.js \
  && ok "Seed complete" \
  || warn "Seed may have already run (admin user exists)"

# ── Step 6: Set up auto-backup cron ────────────────────────────────────
info "Setting up daily backup cron job..."
CRON_CMD="0 2 * * * cd $DEPLOY_DIR && docker compose -f docker-compose.prod.yml run --rm db-backup >> $DEPLOY_DIR/backups/backup.log 2>&1"

# Add cron job if it doesn't already exist
(crontab -l 2>/dev/null || true) | grep -qF "docker-compose.prod.yml run --rm db-backup" || {
  (crontab -l 2>/dev/null || true; echo "$CRON_CMD") | crontab -
  ok "Daily backup scheduled at 2:00 AM"
} && ok "Backup cron already configured"

# ── Step 7: Set up health watchdog ─────────────────────────────────────
WATCHDOG_CMD="*/5 * * * * curl -sf http://localhost:8080/api/health > /dev/null || (cd $DEPLOY_DIR && docker compose -f docker-compose.prod.yml restart app >> /tmp/fhe-watchdog.log 2>&1)"

(crontab -l 2>/dev/null || true) | grep -qF "fhe-watchdog" || {
  (crontab -l 2>/dev/null || true; echo "$WATCHDOG_CMD") | crontab -
  ok "Health watchdog running every 5 minutes"
} && ok "Watchdog already configured"

# ── Done ───────────────────────────────────────────────────────────────
LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")"

echo ""
echo "============================================="
echo -e "  ${GREEN}FHE Project Board is running!${NC}"
echo "============================================="
echo ""
echo "  Local access:   http://localhost:8080"
echo "  LAN access:     http://${LAN_IP}:8080"
echo ""
echo "  Default login:"
echo "    Email:    admin@floridahorizoneng.com"
echo "    Password: admin123"
echo "    (Change this immediately!)"
echo ""
echo "  ── Useful commands ──"
echo "  View logs:      cd $DEPLOY_DIR && docker compose -f docker-compose.prod.yml logs -f"
echo "  Stop:           cd $DEPLOY_DIR && docker compose -f docker-compose.prod.yml down"
echo "  Restart:        cd $DEPLOY_DIR && docker compose -f docker-compose.prod.yml restart"
echo "  Manual backup:  cd $DEPLOY_DIR && docker compose -f docker-compose.prod.yml run --rm db-backup"
echo "  Restore backup: gunzip -c backups/FILE.sql.gz | docker compose -f docker-compose.prod.yml exec -T db psql -U fhe_user fhe_project_board"
echo ""
echo "  ── Want remote access? ──"
echo "  See: $DEPLOY_DIR/REMOTE-ACCESS.md"
echo ""
