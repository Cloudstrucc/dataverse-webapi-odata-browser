#!/bin/bash

# =============================================================================
# Azure App Service - Create Resources
# Reads configuration from .env file in the same directory
# =============================================================================

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Error: .env file not found at $ENV_FILE"
  exit 1
fi

echo "📂 Loading configuration from: $ENV_FILE"

# Load variables from .env file (ignore comments and empty lines)
export $(grep -v '^#' "$ENV_FILE" | grep -v '^$' | xargs)

# Set default location if not in .env
LOCATION="${LOCATION:-canadacentral}"

# Validate required variables
if [ -z "$APP_NAME" ] || [ -z "$RESOURCE_GROUP" ]; then
  echo "❌ Error: APP_NAME and RESOURCE_GROUP must be set in .env"
  exit 1
fi

echo ""
echo "🚀 Creating Azure Resources"
echo "   App Name: $APP_NAME"
echo "   Resource Group: $RESOURCE_GROUP"
echo "   Location: $LOCATION"
echo ""

# Create resource group
echo "📦 Creating resource group..."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION"

if [ $? -ne 0 ]; then
  echo "❌ Failed to create resource group"
  exit 1
fi

# Create App Service Plan
echo ""
echo "📋 Creating App Service Plan..."
az appservice plan create \
  --name "${APP_NAME}-plan" \
  --resource-group "$RESOURCE_GROUP" \
  --sku B1 \
  --is-linux

if [ $? -ne 0 ]; then
  echo "❌ Failed to create App Service Plan"
  exit 1
fi

# Create Web App with Node 20
echo ""
echo "🌐 Creating Web App..."
az webapp create \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --plan "${APP_NAME}-plan" \
  --runtime "NODE:20-lts"

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Azure resources created successfully!"
  echo ""
  echo "   Web App URL: https://${APP_NAME}.azurewebsites.net"
  echo ""
  echo "📌 Next steps:"
  echo "   1. Run ./2-configure-app-settings.sh"
  echo "   2. Run ./3-deploy-app.sh"
  echo "   3. Run ./4-https-only.sh"
  echo ""
else
  echo ""
  echo "❌ Failed to create Web App"
  echo "   The app name '$APP_NAME' may already be taken. Try a unique name."
  exit 1
fi