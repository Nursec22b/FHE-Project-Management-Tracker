#!/bin/bash
# Azure deployment script for FHE Project Board
# Prerequisites: Azure CLI installed and logged in (az login)
#
# Usage: ./deploy/azure-deploy.sh <resource-group> <location>
# Example: ./deploy/azure-deploy.sh fhe-project-board eastus

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
echo "=== Deployment Complete ==="
echo ""
echo "App URL: https://${APP_NAME}.azurewebsites.net"
echo "Database URL: $DATABASE_URL"
echo ""
echo "IMPORTANT - Save these credentials securely:"
echo "  DB Password: $DB_PASSWORD"
echo "  JWT Secret: $JWT_SECRET"
echo ""
echo "Next steps:"
echo "  1. Run database migrations: Connect to the database and run the migration SQL"
echo "  2. Configure Azure AD app registration for email automation (if needed)"
echo "  3. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET in app settings"
echo "  4. Set EMAIL_MONITORED_MAILBOX to the shared mailbox for email automation"
echo ""
