#!/bin/bash

# Set Azure resource variables
RESOURCE_GROUP="rg-dataverse-api-explorer"
APP_NAME="dataverse-api-explorer"

# Path to your .env file
ENV_FILE=".env"

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found!"
  exit 1
fi

# Load variables from .env file
export $(grep -v '^#' "$ENV_FILE" | grep -v '^$' | xargs)

# Override redirectUri for Azure (not localhost)
REDIRECT_URI="https://${APP_NAME}.azurewebsites.net/auth/callback"

# Generate a secure session secret if not set or is default
if [ "$session_secret" = "RANDOM_SESSION_SECRET" ] || [ -z "$session_secret" ]; then
  session_secret=$(openssl rand -base64 32)
fi

# Set all app settings
az webapp config appsettings set \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --settings \
    client_id="$client_id" \
    tenant_id="$tenant_id" \
    client_secret="$client_secret" \
    session_secret="$session_secret" \
    dataverse_url="$dataverse_url" \
    scopes="$scopes" \
    app_scopes="$app_scopes" \
    redirectUri="$REDIRECT_URI" \
    PATH_FILTER="$PATH_FILTER" \
    AGENCY_NAME="$AGENCY_NAME" \
    AGENCY_URL="$AGENCY_URL" \
    AGENCY_HEADER_BG="$AGENCY_HEADER_BG" \
    AGENCY_ACCENT_COLOR="$AGENCY_ACCENT_COLOR"

echo ""
echo "✅ App settings configured successfully!"
echo ""
echo "⚠️  Don't forget to add this redirect URI to your Azure AD app registration:"
echo "   $REDIRECT_URI"