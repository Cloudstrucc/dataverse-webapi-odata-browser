#!/bin/bash

# =============================================================================
# Azure App Service - Enable HTTPS Only
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

# Validate required variables
if [ -z "$APP_NAME" ] || [ -z "$RESOURCE_GROUP" ]; then
  echo "❌ Error: APP_NAME and RESOURCE_GROUP must be set in .env"
  exit 1
fi

echo ""
echo "🔒 Enabling HTTPS Only"
echo "   App Name: $APP_NAME"
echo "   Resource Group: $RESOURCE_GROUP"
echo ""

az webapp update \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --https-only true

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ HTTPS Only enabled successfully!"
  echo ""
  echo "🎉 Deployment complete!"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Your app is live at: https://${APP_NAME}.azurewebsites.net"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "⚠️  Don't forget to add the redirect URI to Azure AD:"
  echo "   https://${APP_NAME}.azurewebsites.net/auth/callback"
  echo ""
  echo "   Azure Portal → Azure AD → App registrations → Your app → Authentication"
  echo ""
else
  echo ""
  echo "❌ Failed to enable HTTPS Only"
  exit 1
fi