#!/bin/bash

# =============================================================================
# Azure App Service - Create or Update Resources
# Idempotent: Creates new resources or updates existing ones
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Error: .env file not found at $ENV_FILE"
  exit 1
fi

echo "📂 Loading configuration from: $ENV_FILE"
export $(grep -v '^#' "$ENV_FILE" | grep -v '^$' | xargs)

LOCATION="${LOCATION:-canadacentral}"

if [ -z "$APP_NAME" ] || [ -z "$RESOURCE_GROUP" ]; then
  echo "❌ Error: APP_NAME and RESOURCE_GROUP must be set in .env"
  exit 1
fi

echo ""
echo "🚀 Creating/Updating Azure Resources"
echo "   App Name: $APP_NAME"
echo "   Resource Group: $RESOURCE_GROUP"
echo "   Location: $LOCATION"
echo ""

# Resource Group
echo "📦 Resource Group..."
if [ "$(az group exists --name "$RESOURCE_GROUP")" = "true" ]; then
  echo "   ✓ Already exists - no changes needed"
else
  az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none
  echo "   ✓ Created"
fi

# App Service Plan
echo ""
echo "📋 App Service Plan..."
if az appservice plan show --name "${APP_NAME}-plan" --resource-group "$RESOURCE_GROUP" &>/dev/null; then
  echo "   ✓ Already exists - updating SKU..."
  az appservice plan update --name "${APP_NAME}-plan" --resource-group "$RESOURCE_GROUP" --sku B1 --output none
  echo "   ✓ Updated"
else
  az appservice plan create --name "${APP_NAME}-plan" --resource-group "$RESOURCE_GROUP" --sku B1 --is-linux --output none
  echo "   ✓ Created"
fi

# Web App
echo ""
echo "🌐 Web App..."
if az webapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" &>/dev/null; then
  echo "   ✓ Already exists - updating runtime..."
  az webapp config set --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --linux-fx-version "NODE|20-lts" --output none
  echo "   ✓ Updated to NODE 20 LTS"
else
  az webapp create --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --plan "${APP_NAME}-plan" --runtime "NODE:20-lts" --output none
  if [ $? -ne 0 ]; then
    echo "❌ Failed - app name '$APP_NAME' may be taken globally"
    exit 1
  fi
  echo "   ✓ Created"
fi

echo ""
echo "✅ Done! URL: https://${APP_NAME}.azurewebsites.net"
echo ""
echo "📌 Next: ./2-configure-app-settings.sh"