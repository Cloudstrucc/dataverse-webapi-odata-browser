#!/bin/bash

# =============================================================================
# Azure App Service - HTTPS & Final Configuration
# Idempotent: Checks and updates settings only if needed
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ Error: .env file not found at $ENV_FILE"
  exit 1
fi

echo "📂 Loading configuration from: $ENV_FILE"
export $(grep -v '^#' "$ENV_FILE" | grep -v '^$' | xargs)

if [ -z "$APP_NAME" ] || [ -z "$RESOURCE_GROUP" ]; then
  echo "❌ Error: APP_NAME and RESOURCE_GROUP must be set in .env"
  exit 1
fi

# Check Web App exists
if ! az webapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" &>/dev/null; then
  echo "❌ Error: Web App '$APP_NAME' not found. Run ./1-create-azure-resource.sh first"
  exit 1
fi

echo ""
echo "🔧 Configuring: $APP_NAME"
echo ""

# HTTPS Only
echo "🔒 HTTPS Only..."
HTTPS=$(az webapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --query "httpsOnly" -o tsv)
if [ "$HTTPS" = "true" ]; then
  echo "   ✓ Already enabled"
else
  az webapp update --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --https-only true --output none
  echo "   ✓ Enabled"
fi

# Always On
echo "⚡ Always On..."
ALWAYS=$(az webapp config show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --query "alwaysOn" -o tsv)
if [ "$ALWAYS" = "true" ]; then
  echo "   ✓ Already enabled"
else
  az webapp config set --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --always-on true --output none 2>/dev/null
  echo "   ✓ Enabled"
fi

# Startup command
echo "🚀 Startup command..."
az webapp config set --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --startup-file "node server.js" --output none
echo "   ✓ Set to 'node server.js'"

# Restart
echo "🔄 Restarting..."
az webapp restart --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --output none
echo "   ✓ Restarted"

APP_URL="https://${APP_NAME}.azurewebsites.net"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Deployment Complete!"
echo ""
echo "   🌐 $APP_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Display configuration summary
echo "📋 Configuration Summary:"
echo "   Agency: ${AGENCY_NAME:-Not set}"
if [ -n "$SCHEMA_FILE_PATH" ]; then
  echo ""
  echo "   Schema Mode: File-based filtering"
  echo "   Schema File: $SCHEMA_FILE_PATH"
  echo "   Publisher Prefix: ${PUBLISHER_PREFIX:-none}"
  echo ""
  echo "   The API documentation will only show tables defined"
  echo "   in your schema file with the '$PUBLISHER_PREFIX' prefix."
elif [ -n "$PATH_FILTER" ]; then
  echo ""
  echo "   Filter Mode: Path-based filtering"
  echo "   PATH_FILTER: $PATH_FILTER"
fi

echo ""
echo "⚠️  Add redirect URI to Azure AD:"
echo "   ${APP_URL}/auth/callback"
echo ""
echo "📋 Useful commands:"
echo "   az webapp log tail --name $APP_NAME --resource-group $RESOURCE_GROUP"
echo "   az webapp show --name $APP_NAME --resource-group $RESOURCE_GROUP --query state"
echo ""
echo "🔍 Verify settings:"
echo "   az webapp config appsettings list --name $APP_NAME --resource-group $RESOURCE_GROUP -o table"
echo ""