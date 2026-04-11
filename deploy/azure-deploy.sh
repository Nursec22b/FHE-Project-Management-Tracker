#!/bin/bash
# FHE Project Board — Azure Deployment Script
#
# ── How to run this (no local installs needed) ───────────────────────────────
#  1. Go to https://portal.azure.com
#  2. Click the Cloud Shell icon (>_) in the top toolbar
#  3. Choose "Bash" if prompted
#  4. Clone the repo and run this script:
#
#       git clone https://github.com/Nursec22b/FHE-Project-Management-Tracker.git
#       cd FHE-Project-Management-Tracker
#       bash deploy/azure-deploy.sh fhe-project-board eastus
#
# ── What it does ─────────────────────────────────────────────────────────────
#  Creates everything in Azure automatically:
#    • Resource group
#    • Container Registry (builds the Docker image in Azure — no Docker needed)
#    • PostgreSQL 16 Flexible Server
#    • App Service Plan (B1 Linux, ~$13/mo)
#    • Web App with HTTPS
#
#  The app auto-runs DB migrations and seeds default admin on first boot.
#  No manual database setup needed after this script finishes.
#
# ── Estimated monthly cost ───────────────────────────────────────────────────
#  App Service B1:        ~$13/mo
#  PostgreSQL B1ms:       ~$25/mo
#  Container Registry:    ~$5/mo
#  Total:                 ~$43/mo
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

RESOURCE_GROUP="${1:-fhe-project-board}"
LOCATION="${2:-eastus}"
APP_NAME="fhe-project-board"
ACR_NAME="fheprojectboard"
DB_SERVER_NAME="fhe-project-board-db"
DB_NAME="fhe_project_board"
DB_ADMIN_USER="fheadmin"
APP_PLAN_NAME="fhe-project-board-plan"

echo "=== FHE Project Board - Azure Deployment ==="
echo "Resource Group: $RESOURCE_GROUP"
echo "Location: $LOCATION"
echo ""

# Create resource group
echo "1. Creating resource group..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION"

# Create Azure Container Registry
echo "2. Creating Container Registry..."
az acr create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$ACR_NAME" \
  --sku Basic \
  --admin-enabled true

# Build and push Docker image
echo "3. Building and pushing Docker image..."
az acr build \
  --registry "$ACR_NAME" \
  --image "$APP_NAME:latest" \
  --file Dockerfile .

# Create PostgreSQL flexible server
echo "4. Creating PostgreSQL database..."
DB_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | head -c 32)
az postgres flexible-server create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DB_SERVER_NAME" \
  --location "$LOCATION" \
  --admin-user "$DB_ADMIN_USER" \
  --admin-password "$DB_PASSWORD" \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --storage-size 32 \
  --version 16

# Create the database
az postgres flexible-server db create \
  --resource-group "$RESOURCE_GROUP" \
  --server-name "$DB_SERVER_NAME" \
  --database-name "$DB_NAME"

# Allow Azure services to connect
az postgres flexible-server firewall-rule create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DB_SERVER_NAME" \
  --rule-name AllowAzureServices \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0

# Create App Service plan
echo "5. Creating App Service plan..."
az appservice plan create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_PLAN_NAME" \
  --is-linux \
  --sku B1

# Create Web App
echo "6. Creating Web App..."
ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv)
az webapp create \
  --resource-group "$RESOURCE_GROUP" \
  --plan "$APP_PLAN_NAME" \
  --name "$APP_NAME" \
  --docker-registry-server-url "https://${ACR_NAME}.azurecr.io" \
  --docker-registry-server-user "$ACR_NAME" \
  --docker-registry-server-password "$ACR_PASSWORD" \
  --container-image-name "${ACR_NAME}.azurecr.io/${APP_NAME}:latest"

# Configure environment variables
echo "7. Setting environment variables..."
JWT_SECRET=$(openssl rand -base64 48 | tr -d '/+=' | head -c 48)
DATABASE_URL="postgresql://${DB_ADMIN_USER}:${DB_PASSWORD}@${DB_SERVER_NAME}.postgres.database.azure.com:5432/${DB_NAME}?sslmode=require"

az webapp config appsettings set \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_NAME" \
  --settings \
    NODE_ENV=production \
    PORT=8080 \
    DATABASE_URL="$DATABASE_URL" \
    JWT_SECRET="$JWT_SECRET" \
    JWT_EXPIRES_IN=7d \
    UPLOAD_DIR=/app/uploads \
    MAX_FILE_SIZE_MB=25 \
    CLIENT_URL="https://${APP_NAME}.azurewebsites.net" \
    WEBSITES_PORT=8080

# Enable HTTPS only
az webapp update \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_NAME" \
  --https-only true

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║   Deployment Complete!                                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  App URL:  https://${APP_NAME}.azurewebsites.net"
echo ""
echo "  ┌─ Save these credentials somewhere secure ──────────────────┐"
echo "  │  DB Password:  $DB_PASSWORD"
echo "  │  JWT Secret:   $JWT_SECRET"
echo "  │  Database URL: $DATABASE_URL"
echo "  └────────────────────────────────────────────────────────────┘"
echo ""
echo "  The app will be live in ~2 minutes while Azure pulls the"
echo "  container image. Database migrations and the default admin"
echo "  account are created automatically on first boot."
echo ""
echo "  ── Your next steps ──────────────────────────────────────────"
echo ""
echo "  1. OPEN the app:"
echo "       https://${APP_NAME}.azurewebsites.net"
echo ""
echo "  2. LOG IN with the default admin account:"
echo "       Email:    admin@floridahorizoneng.com"
echo "       Password: admin123"
echo "       ⚠  Change this password immediately!"
echo ""
echo "  3. CREATE user accounts for all FHE staff (Admin → Users)"
echo ""
echo "  4. FILL IN scripts/member-map.json with Trello username → FHE"
echo "     email mappings, then run the Trello import:"
echo "       cd server"
echo "       DATABASE_URL='$DATABASE_URL' \\"
echo "         npx ts-node ../scripts/import-trello.ts ../exports/mattamy.json"
echo ""
echo "  5. OPTIONAL — Email automation (Microsoft 365):"
echo "       Register an Azure AD App with Mail.Read permission, then:"
echo "       az webapp config appsettings set \\"
echo "         --resource-group $RESOURCE_GROUP --name $APP_NAME \\"
echo "         --settings \\"
echo "           AZURE_TENANT_ID=<your-tenant-id> \\"
echo "           AZURE_CLIENT_ID=<your-client-id> \\"
echo "           AZURE_CLIENT_SECRET=<your-client-secret> \\"
echo "           EMAIL_MONITORED_MAILBOX=tasks@floridahorizoneng.com"
echo ""
echo "  6. OPTIONAL — Custom domain via Cloudflare:"
echo "       Add CNAME in Cloudflare: board → ${APP_NAME}.azurewebsites.net"
echo "       (use DNS-only / grey cloud, not proxied)"
echo "       Then: az webapp config hostname add \\"
echo "         --resource-group $RESOURCE_GROUP \\"
echo "         --webapp-name $APP_NAME \\"
echo "         --hostname board.floridahorizoneng.com"
echo ""
