#!/bin/bash

# =============================================================================
# Azure App Service - Configure/Update App Settings
# Idempotent: Always updates settings (upsert operation)
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

# Set Azure redirect URI
redirectUri="https://${APP_NAME}.azurewebsites.net/auth/callback"

# Handle session secret - keep existing or generate new
if [ "$session_secret" = "RANDOM_SESSION_SECRET" ] || [ -z "$session_secret" ]; then
  EXISTING_SECRET=$(az webapp config appsettings list --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --query "[?name=='session_secret'].value" -o tsv 2>/dev/null)
  if [ -n "$EXISTING_SECRET" ]; then
    session_secret="$EXISTING_SECRET"
    echo "🔑 Using existing session secret"
  else
    session_secret=$(openssl rand -base64 32)
    echo "🔑 Generated new session secret"
  fi
fi

echo ""
echo "⚙️  Updating App Settings..."
echo "   App: $APP_NAME"
echo "   Redirect URI: $redirectUri"
if [ -n "$SCHEMA_FILE_PATH" ]; then
  echo "   Schema File: $SCHEMA_FILE_PATH"
  echo "   Publisher Prefix: ${PUBLISHER_PREFIX:-none}"
fi
echo ""

# Build the settings command
SETTINGS=(
  "client_id=$client_id"
  "tenant_id=$tenant_id"
  "client_secret=$client_secret"
  "session_secret=$session_secret"
  "dataverse_url=$dataverse_url"
  "scopes=$scopes"
  "app_scopes=$app_scopes"
  "redirectUri=$redirectUri"
  "AGENCY_NAME=$AGENCY_NAME"
  "AGENCY_URL=$AGENCY_URL"
  "AGENCY_HEADER_BG=$AGENCY_HEADER_BG"
  "AGENCY_ACCENT_COLOR=$AGENCY_ACCENT_COLOR"
)

# Add schema configuration if SCHEMA_FILE_PATH is set
if [ -n "$SCHEMA_FILE_PATH" ]; then
  SETTINGS+=("SCHEMA_FILE_PATH=$SCHEMA_FILE_PATH")
  if [ -n "$PUBLISHER_PREFIX" ]; then
    SETTINGS+=("PUBLISHER_PREFIX=$PUBLISHER_PREFIX")
  fi
  echo "📋 Using schema-based filtering (SCHEMA_FILE_PATH)"
elif [ -n "$PATH_FILTER" ]; then
  SETTINGS+=("PATH_FILTER=$PATH_FILTER")
  echo "📋 Using path-based filtering (PATH_FILTER)"
fi

az webapp config appsettings set \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --settings "${SETTINGS[@]}" \
  --output none

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ App settings updated!"
  echo ""
  if [ -n "$SCHEMA_FILE_PATH" ]; then
    echo "📦 Schema Configuration:"
    echo "   SCHEMA_FILE_PATH: $SCHEMA_FILE_PATH"
    echo "   PUBLISHER_PREFIX: ${PUBLISHER_PREFIX:-none}"
    echo ""
    echo "⚠️  Ensure '$SCHEMA_FILE_PATH' is included in your deployment!"
  fi
  echo ""
  echo "⚠️  Add this redirect URI to Azure AD app registration:"
  echo "   $redirectUri"
  echo ""
  echo "📌 Next: ./3-deploy-app.sh"
else
  echo "❌ Failed to update app settings"
  exit 1
fi