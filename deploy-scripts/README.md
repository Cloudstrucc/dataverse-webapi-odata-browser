# Azure Deployment Scripts for Dataverse API Explorer

Deploy the Dataverse WebAPI OData Browser to Azure App Service with these idempotent scripts.

## Prerequisites

- [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli) installed and logged in (`az login`)
- An Azure AD App Registration with Dataverse permissions
- Node.js application files in the parent directory

## Quick Start

```bash
# 1. Copy sample.env to .env and configure
cp sample.envfile .env

# 2. Edit .env with your values
vim .env

# 3. Run scripts in order
./1-create-azure-resources.sh
./2-configure-app-settings.sh
./3-deploy-app.sh
./4-https-only.sh
```

## Configuration (.env)

### Required Settings

| Variable             | Description                          | Example                           |
| -------------------- | ------------------------------------ | --------------------------------- |
| `APP_NAME`         | Azure Web App name (globally unique) | `my-dataverse-explorer`         |
| `RESOURCE_GROUP`   | Azure Resource Group name            | `rg-dataverse-explorer`         |
| `LOCATION`         | Azure region                         | `canadacentral`                 |
| `APP_SERVICE_PLAN` | App Service Plan name                | `asp-dataverse-explorer`        |
| `SKU`              | App Service tier                     | `B1` (Basic), `S1` (Standard) |

### Azure AD Authentication

| Variable           | Description                                                          | Example                         |
| ------------------ | -------------------------------------------------------------------- | ------------------------------- |
| `client_id`      | Azure AD App Registration Client ID                                  | `3fc17671-754e-497f-a37a-...` |
| `tenant_id`      | Azure AD Tenant ID                                                   | `24a46daa-7b87-4566-...`      |
| `client_secret`  | Azure AD Client Secret                                               | `Txa8Q~Bl0EsK0Kgrp...`        |
| `session_secret` | Express session secret (auto-generated if `RANDOM_SESSION_SECRET`) | `RANDOM_SESSION_SECRET`       |

### Dataverse Configuration

| Variable          | Description                         | Example                                    |
| ----------------- | ----------------------------------- | ------------------------------------------ |
| `dataverse_url` | Your Dataverse environment URL      | `https://org.crm3.dynamics.com/`         |
| `scopes`        | OAuth scopes for user auth          | `https://org.crm3.dynamics.com/.default` |
| `app_scopes`    | OAuth scopes for app-only auth      | `https://org.crm3.dynamics.com/.default` |
| `redirectUri`   | OAuth redirect (auto-set for Azure) | `http://localhost:3000/auth/callback`    |

### Schema File Mode (NEW)

Generate OpenAPI documentation from a JSON schema file instead of querying Dataverse. This is faster and gives precise control over which tables appear.

| Variable             | Description                                      | Example                             |
| -------------------- | ------------------------------------------------ | ----------------------------------- |
| `SCHEMA_FILE_PATH` | Path to JSON schema file (relative to server.js) | `./digital-signature-schema.json` |
| `PUBLISHER_PREFIX` | Dataverse publisher prefix for table names       | `cs`                              |

**Schema File Mode Benefits:**

- ⚡ Faster - no Dataverse metadata queries
- 🎯 Precise - only your tables appear in Swagger
- 📝 Documented - descriptions from your schema
- 🔒 Offline - works without Dataverse connection for docs

**When to use Schema File Mode:**

- You have custom tables with a known schema
- You want consistent API documentation
- You need faster startup times

**When to use Dataverse Query Mode:**

- You want to discover all available entities
- You need real-time metadata from Dataverse
- Leave `SCHEMA_FILE_PATH` empty

### Path Filter (Alternative to Schema Mode)

| Variable        | Description                                | Example              |
| --------------- | ------------------------------------------ | -------------------- |
| `PATH_FILTER` | Filter paths by pattern (case-insensitive) | `digitalsignature` |

> **Note:** If `SCHEMA_FILE_PATH` is set, it takes precedence over `PATH_FILTER`.

### Agency Branding

| Variable                | Description                   | Example                      |
| ----------------------- | ----------------------------- | ---------------------------- |
| `AGENCY_NAME`         | Organization name in header   | `Elections Canada`         |
| `AGENCY_URL`          | Organization website URL      | `https://www.elections.ca` |
| `AGENCY_HEADER_BG`    | Header background color (hex) | `#26374a`                  |
| `AGENCY_ACCENT_COLOR` | Accent/red bar color (hex)    | `#af3c43`                  |

## Scripts

### 1-create-azure-resources.sh

Creates Azure resources (idempotent - skips existing):

- Resource Group
- App Service Plan
- Web App (Node.js 20 LTS)

```bash
./1-create-azure-resources.sh
```

### 2-configure-app-settings.sh

Configures/updates all application settings:

- Azure AD credentials
- Dataverse connection
- Schema file settings (NEW)
- Agency branding
- Auto-generates session secret if needed
- Sets Azure redirect URI

```bash
./2-configure-app-settings.sh
```

**Important:** After running, add the displayed redirect URI to your Azure AD App Registration.

### 3-deploy-app.sh

Deploys application code via:

1. **ZIP Deploy** - Package and upload local files
2. **GitHub Deploy** - Connect to a GitHub repository

```bash
./3-deploy-app.sh
```

**For Schema File Mode:** Ensure your `digital-signature-schema.json` file is in the app root directory before deploying.

### 4-https-only.sh

Final configuration:

- Enable HTTPS-only
- Enable Always On (prevents cold starts)
- Set startup command (`node server.js`)
- Restart application

```bash
./4-https-only.sh
```

## Sample .env File

```env
# =============================================================================
# Azure Resource Configuration
# =============================================================================
APP_NAME=dataverse-api-explorer
RESOURCE_GROUP=rg-dataverse-explorer
LOCATION=canadacentral
APP_SERVICE_PLAN=asp-dataverse-explorer
SKU=B1

# =============================================================================
# Azure AD Configuration
# =============================================================================
client_id=your-client-id-here
tenant_id=your-tenant-id-here
client_secret=your-client-secret-here

# =============================================================================
# Application Configuration
# =============================================================================
session_secret=RANDOM_SESSION_SECRET

# =============================================================================
# Dataverse Configuration
# =============================================================================
dataverse_url=https://your-org.crm3.dynamics.com/
scopes=https://your-org.crm3.dynamics.com/.default
app_scopes=https://your-org.crm3.dynamics.com/.default
redirectUri=http://localhost:3000/auth/callback

# =============================================================================
# Schema File Configuration (NEW - Recommended for custom tables)
# =============================================================================
# Path to your JSON schema file defining custom tables
# Leave empty to query Dataverse for all entities
SCHEMA_FILE_PATH=./digital-signature-schema.json

# Publisher prefix added to all table/attribute names
# Example: "cs" results in cs_envelope, cs_document, etc.
PUBLISHER_PREFIX=cs

# =============================================================================
# Path Filter (Alternative - used if SCHEMA_FILE_PATH is empty)
# =============================================================================
# PATH_FILTER=digitalsignature

# =============================================================================
# Agency Branding
# =============================================================================
AGENCY_NAME=Elections Canada
AGENCY_URL=https://www.elections.ca
AGENCY_HEADER_BG=#26374a
AGENCY_ACCENT_COLOR=#af3c43
```

## Schema File Format

Create a `digital-signature-schema.json` file in your app root:

```json
{
  "tables": [
    {
      "logicalName": "envelope",
      "displayName": "Envelope",
      "displayNamePlural": "Envelopes",
      "description": "Digital signature envelope container",
      "primaryAttribute": {
        "schemaName": "Name",
        "displayName": "Envelope Name",
        "maxLength": 200
      },
      "attributes": [
        {
          "logicalName": "envelopeid",
          "schemaName": "EnvelopeId",
          "displayName": "Envelope ID",
          "type": "String",
          "maxLength": 100
        },
        {
          "logicalName": "status",
          "schemaName": "Status",
          "displayName": "Status",
          "type": "String",
          "maxLength": 50
        },
        {
          "logicalName": "sentdate",
          "schemaName": "SentDate",
          "displayName": "Sent Date",
          "type": "DateTime"
        }
      ]
    }
  ]
}
```

### Supported Attribute Types

| Type                 | OpenAPI Mapping        |
| -------------------- | ---------------------- |
| `String`           | `string`             |
| `Memo`             | `string`             |
| `Integer`          | `integer` (int32)    |
| `BigInt`           | `integer` (int64)    |
| `Boolean`          | `boolean`            |
| `Double`           | `number` (double)    |
| `Decimal`          | `number` (double)    |
| `Money`            | `number` (double)    |
| `DateTime`         | `string` (date-time) |
| `Date`             | `string` (date)      |
| `Lookup`           | `string` (uuid)      |
| `Uniqueidentifier` | `string` (uuid)      |
| `Picklist`         | `integer`            |

## Post-Deployment

### 1. Configure Azure AD Redirect URI

Add to your App Registration → Authentication → Redirect URIs:

```
https://YOUR-APP-NAME.azurewebsites.net/auth/callback
```

### 2. Verify Deployment

```bash
# Check app status
az webapp show --name $APP_NAME --resource-group $RESOURCE_GROUP --query state

# View logs
az webapp log tail --name $APP_NAME --resource-group $RESOURCE_GROUP

# Open in browser
open https://$APP_NAME.azurewebsites.net
```

### 3. Test Authentication

1. Navigate to your app URL
2. Click "Sign in as User" or "Sign in as Application"
3. Authenticate with Azure AD
4. Generate API Documentation

## Troubleshooting

### App won't start

```bash
# Check logs
az webapp log tail --name $APP_NAME --resource-group $RESOURCE_GROUP

# Verify settings
az webapp config appsettings list --name $APP_NAME --resource-group $RESOURCE_GROUP
```

### Schema file not found

- Ensure `digital-signature-schema.json` is in the app root (same folder as `server.js`)
- Check the path in `SCHEMA_FILE_PATH` is correct
- Redeploy after adding the file

### Authentication errors

- Verify redirect URI matches exactly in Azure AD
- Check client_id and client_secret are correct
- Ensure Azure AD app has Dataverse permissions

### CORS or redirect issues

- Ensure HTTPS-only is enabled
- Check redirect URI uses `https://` not `http://`

## Redeployment

Scripts are idempotent - run them again to update:

```bash
# Update settings only
./2-configure-app-settings.sh

# Redeploy code
./3-deploy-app.sh

# Update all
./1-create-azure-resources.sh && ./2-configure-app-settings.sh && ./3-deploy-app.sh && ./4-https-only.sh
```

## File Structure

```
your-app/
├── server.js
├── package.json
├── digital-signature-schema.json    # Your schema file
├── deploy/
│   ├── README.md                    # This file
│   ├── sample.env
│   ├── .env                         # Your configuration (git-ignored)
│   ├── 1-create-azure-resources.sh
│   ├── 2-configure-app-settings.sh
│   ├── 3-deploy-app.sh
│   └── 4-https-only.sh
└── ...
```
