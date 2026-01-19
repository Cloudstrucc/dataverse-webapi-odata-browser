#!/bin/bash

# =============================================================================
# Azure App Service - Deploy Application
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
echo "🚀 Deploying Application"
echo "   App Name: $APP_NAME"
echo "   Resource Group: $RESOURCE_GROUP"
echo ""

# Ask user which deployment method to use
echo "Choose deployment method:"
echo "  1) ZIP Deploy (from local folder)"
echo "  2) GitHub Deploy"
echo ""
read -p "Enter choice [1 or 2]: " DEPLOY_CHOICE

case $DEPLOY_CHOICE in
  1)
    # Option A: Deploy from local folder using ZIP deploy
    echo ""
    echo "📦 Creating deployment package..."
    
    # Go to parent directory (where the app code should be)
    APP_DIR="$SCRIPT_DIR/.."
    
    if [ ! -f "$APP_DIR/server.js" ]; then
      echo "❌ Error: server.js not found in $APP_DIR"
      echo "   Make sure this script is in a 'deploy' subfolder of your app"
      exit 1
    fi
    
    cd "$APP_DIR"
    
    # Create zip excluding unnecessary files
    zip -r deploy.zip . \
      -x "node_modules/*" \
      -x ".git/*" \
      -x ".env" \
      -x "deploy/*" \
      -x "*.zip" \
      -x ".DS_Store" \
      -x "temp/*"
    
    echo ""
    echo "☁️  Uploading to Azure..."
    az webapp deployment source config-zip \
      --name "$APP_NAME" \
      --resource-group "$RESOURCE_GROUP" \
      --src deploy.zip
    
    # Clean up zip file
    rm -f deploy.zip
    
    if [ $? -eq 0 ]; then
      echo ""
      echo "✅ Deployment successful!"
    else
      echo ""
      echo "❌ Deployment failed"
      exit 1
    fi
    ;;
    
  2)
    # Option B: Deploy from GitHub
    echo ""
    read -p "Enter GitHub repo URL [https://github.com/Cloudstrucc/dataverse-webapi-odata-browser]: " REPO_URL
    REPO_URL="${REPO_URL:-https://github.com/Cloudstrucc/dataverse-webapi-odata-browser}"
    
    read -p "Enter branch name [main]: " BRANCH
    BRANCH="${BRANCH:-main}"
    
    echo ""
    echo "🔗 Configuring GitHub deployment..."
    az webapp deployment source config \
      --name "$APP_NAME" \
      --resource-group "$RESOURCE_GROUP" \
      --repo-url "$REPO_URL" \
      --branch "$BRANCH" \
      --manual-integration
    
    if [ $? -eq 0 ]; then
      echo ""
      echo "✅ GitHub deployment configured!"
      echo "   The app will pull from: $REPO_URL (branch: $BRANCH)"
    else
      echo ""
      echo "❌ GitHub deployment configuration failed"
      exit 1
    fi
    ;;
    
  *)
    echo "❌ Invalid choice. Please run again and select 1 or 2."
    exit 1
    ;;
esac

echo ""
echo "🌐 Your app is available at: https://${APP_NAME}.azurewebsites.net"
echo ""
echo "📌 Next step: Run ./4-https-only.sh"
echo ""