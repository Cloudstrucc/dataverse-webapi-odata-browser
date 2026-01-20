#!/bin/bash

# =============================================================================
# Azure App Service - Deploy/Redeploy Application
# Idempotent: Deploys new code or updates existing deployment
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
echo "🚀 Deploying to: $APP_NAME"
echo ""
echo "Choose deployment method:"
echo "  1) ZIP Deploy (local folder)"
echo "  2) GitHub Deploy"
read -p "Choice [1/2]: " CHOICE

case $CHOICE in
  1)
    APP_DIR="$SCRIPT_DIR/.."
    if [ ! -f "$APP_DIR/server.js" ]; then
      echo "❌ server.js not found. Ensure deploy folder is inside your app."
      exit 1
    fi
    
    # Check for schema file if SCHEMA_FILE_PATH is configured
    if [ -n "$SCHEMA_FILE_PATH" ]; then
      # Resolve schema path relative to APP_DIR
      SCHEMA_FULL_PATH="$APP_DIR/$SCHEMA_FILE_PATH"
      # Remove leading ./ if present for cleaner path resolution
      SCHEMA_FULL_PATH="${SCHEMA_FULL_PATH/\/.\//\/}"
      
      if [ ! -f "$SCHEMA_FULL_PATH" ]; then
        echo ""
        echo "⚠️  Warning: Schema file not found at: $SCHEMA_FULL_PATH"
        echo "   SCHEMA_FILE_PATH is set to: $SCHEMA_FILE_PATH"
        echo ""
        read -p "Continue without schema file? [y/N]: " CONTINUE
        if [ "$CONTINUE" != "y" ] && [ "$CONTINUE" != "Y" ]; then
          echo "❌ Deployment cancelled. Add schema file and retry."
          exit 1
        fi
      else
        echo "✓ Schema file found: $SCHEMA_FILE_PATH"
        
        # Validate JSON syntax
        if command -v jq &>/dev/null; then
          if ! jq empty "$SCHEMA_FULL_PATH" 2>/dev/null; then
            echo "❌ Error: Schema file has invalid JSON syntax"
            exit 1
          fi
          TABLE_COUNT=$(jq '.tables | length' "$SCHEMA_FULL_PATH")
          echo "  📋 Tables defined: $TABLE_COUNT"
          if [ -n "$PUBLISHER_PREFIX" ]; then
            echo "  📋 Publisher prefix: $PUBLISHER_PREFIX"
          fi
        fi
      fi
    fi
    
    cd "$APP_DIR"
    rm -f deploy.zip
    
    echo ""
    echo "📦 Packaging..."
    
    # Include schema file in deployment (don't exclude it!)
    zip -rq deploy.zip . -x "node_modules/*" ".git/*" ".env" "deploy/*" "*.zip" ".DS_Store" "temp/*"
    
    # Verify schema is in the zip if configured
    if [ -n "$SCHEMA_FILE_PATH" ]; then
      SCHEMA_IN_ZIP=$(unzip -l deploy.zip | grep -c "${SCHEMA_FILE_PATH#./}" || true)
      if [ "$SCHEMA_IN_ZIP" -gt 0 ]; then
        echo "   ✓ Schema file included in package"
      else
        echo "   ⚠️  Schema file may not be in package - check path"
      fi
    fi
    
    echo "☁️  Uploading..."
    az webapp deployment source config-zip --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --src deploy.zip --output none
    RESULT=$?
    rm -f deploy.zip
    
    if [ $RESULT -eq 0 ]; then
      echo "🔄 Restarting..."
      az webapp restart --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --output none
      echo "✅ Deployed successfully!"
    else
      echo "❌ Deployment failed"
      exit 1
    fi
    ;;
    
  2)
    CURRENT=$(az webapp deployment source show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --query "repoUrl" -o tsv 2>/dev/null)
    
    if [ -n "$CURRENT" ]; then
      echo "Current repo: $CURRENT"
      echo "  1) Sync latest"
      echo "  2) Reconfigure"
      read -p "Choice [1/2]: " GH_CHOICE
      
      if [ "$GH_CHOICE" = "1" ]; then
        az webapp deployment source sync --name "$APP_NAME" --resource-group "$RESOURCE_GROUP"
        echo "✅ Synced!"
      else
        az webapp deployment source delete --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --output none 2>/dev/null
        CURRENT=""
      fi
    fi
    
    if [ -z "$CURRENT" ] || [ "$GH_CHOICE" = "2" ]; then
      read -p "Repo URL [https://github.com/Cloudstrucc/dataverse-webapi-odata-browser]: " REPO
      REPO="${REPO:-https://github.com/Cloudstrucc/dataverse-webapi-odata-browser}"
      read -p "Branch [main]: " BRANCH
      BRANCH="${BRANCH:-main}"
      
      az webapp deployment source config --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --repo-url "$REPO" --branch "$BRANCH" --manual-integration
      echo "✅ Configured: $REPO ($BRANCH)"
      
      if [ -n "$SCHEMA_FILE_PATH" ]; then
        echo ""
        echo "⚠️  Important: Ensure '$SCHEMA_FILE_PATH' exists in your repository!"
        echo "   The schema file must be committed to: $REPO"
      fi
    fi
    ;;
    
  *)
    echo "❌ Invalid choice"
    exit 1
    ;;
esac

echo ""
echo "🌐 App: https://${APP_NAME}.azurewebsites.net"
echo ""
if [ -n "$SCHEMA_FILE_PATH" ]; then
  echo "📋 API docs will show tables from: $SCHEMA_FILE_PATH"
  echo "   With prefix: ${PUBLISHER_PREFIX:-none}"
  echo ""
fi
echo "📌 Next: ./4-https-only.sh"