# 🚀 Dataverse API Explorer

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-16.x-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-lightgrey.svg)](https://expressjs.com/)

A powerful tool to explore and document Microsoft Dataverse APIs with customizable filtering, dual authentication modes, and agency branding support.

> **Note:** This project includes an example implementation for Elections Canada demonstrating the theming capabilities. See [Customizing Agency Branding](#-customizing-agency-branding) to adapt it for your organization.

## ✨ Features

* 📚 **Interactive API Documentation**: Generate Swagger UI documentation for your Dataverse environment
* 🔍 **Publisher Filtering**: Filter entities by publisher with an easy-to-use dropdown
* 🎯 **Path Filtering**: Automatically filter API paths by pattern (e.g., `digitalsignature`)
* 🔐 **Dual Authentication**: 
  - **User Identity**: Sign in with your Microsoft account and security roles
  - **Application Identity**: Use app registration for service-to-service authentication
* 🛡️ **Permission-Based Filtering**: Only shows entities the authenticated identity can access
* 🎨 **Customizable Branding**: Easy agency/organization theming via environment variables
* 🔄 **Customizable Tenant**: Set different Azure AD tenants for different environments
* 📱 **Responsive Design**: Works on desktop and mobile devices

## 📋 Prerequisites

* [Node.js](https://nodejs.org/) (v16 or newer)
* Access to a Microsoft Dataverse environment
* Azure AD application with proper permissions
* (For Application auth) Application User created in Power Platform Admin Center

## 🔧 Setup & Configuration

### 1. Clone the repository

```bash
git clone https://github.com/Cloudstrucc/dataverse-webapi-odata-browser.git
cd dataverse-webapi-odata-browser
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up Azure AD Application

1. Go to the [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations** → **New registration**
3. Fill in the required information:
   * **Name**: Dataverse API Explorer
   * **Supported account types**: Accounts in this organizational directory only
   * **Redirect URI**: Web - `http://localhost:3000/auth/callback`
4. Click **Register**
5. Make note of the **Application (client) ID** and **Directory (tenant) ID**
6. Go to **Certificates & secrets** → **New client secret**
7. Create a new secret and copy its **Value** (you won't be able to see it again)
8. Go to **API Permissions** → **Add a permission** → **Dynamics CRM** → **Delegated permissions**
9. Select `user_impersonation` and click **Add permissions**
10. Click **Grant admin consent for [your tenant]**

### 4. (Optional) Set up Application User for App-Only Auth

To use "Sign in as Application" (client credentials flow):

1. Go to [Power Platform Admin Center](https://admin.powerplatform.microsoft.com/)
2. Select your environment → **Settings** → **Users + permissions** → **Application users**
3. Click **+ New app user**
4. Select your Azure AD app registration
5. Select a Business Unit
6. Assign appropriate Security Roles (e.g., a custom role with read access to required entities)

### 5. Configure the .env file

Copy the example file and update with your values:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Azure AD Configuration
client_id=YOUR_CLIENT_ID
tenant_id=YOUR_TENANT_ID
client_secret=YOUR_CLIENT_SECRET

# Application Configuration
session_secret=RANDOM_SESSION_SECRET

# Dataverse Configuration
dataverse_url=https://your-org.crm.dynamics.com/

# OAuth Configuration
scopes=https://your-org.crm.dynamics.com/.default
redirectUri=http://localhost:3000/auth/callback
app_scopes=https://your-org.crm.dynamics.com/.default

# Path Filter (optional)
PATH_FILTER=digitalsignature

# Agency Branding
AGENCY_NAME=Your Organization Name
AGENCY_URL=https://www.your-org.com
AGENCY_HEADER_BG=#26374a
AGENCY_ACCENT_COLOR=#af3c43
```

### 6. Start the application

```bash
npm start
```

The application will be available at http://localhost:3000.

## 🎨 Customizing Agency Branding

The application supports full agency/organization theming through environment variables. No code changes required!

### Branding Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `AGENCY_NAME` | Organization name shown in header/footer | `Elections Canada` | `Statistics Canada` |
| `AGENCY_URL` | Link in header navigation | `https://www.elections.ca` | `https://www.statcan.gc.ca` |
| `AGENCY_HEADER_BG` | Header background color (hex) | `#26374a` | `#1a365d` |
| `AGENCY_ACCENT_COLOR` | Accent color for buttons/badges | `#af3c43` | `#e53e3e` |

### Example Configurations

**Government of Canada (GC Web Theme):**
```env
AGENCY_NAME=Statistics Canada
AGENCY_URL=https://www.statcan.gc.ca
AGENCY_HEADER_BG=#26374a
AGENCY_ACCENT_COLOR=#af3c43
```

**Custom Corporate:**
```env
AGENCY_NAME=Acme Corporation
AGENCY_URL=https://www.acme.com
AGENCY_HEADER_BG=#1e40af
AGENCY_ACCENT_COLOR=#dc2626
```

**Dark Theme:**
```env
AGENCY_NAME=Tech Solutions Inc
AGENCY_URL=https://www.techsolutions.com
AGENCY_HEADER_BG=#111827
AGENCY_ACCENT_COLOR=#10b981
```

### Adding a Logo

To add a custom logo, modify the header section in `server.js`. Search for `gc-header-logo-name` and replace with an `<img>` tag:

```html
<!-- Replace this: -->
<span class="gc-header-logo-name">${AGENCY_NAME}</span>

<!-- With this: -->
<img src="/your-logo.png" alt="${AGENCY_NAME}" height="40">
```

Place your logo file in the `public` directory.

## 🎯 Path Filtering

Filter the generated API documentation to show only specific routes.

### Configuration

Set the `PATH_FILTER` environment variable:

```env
# Show only paths containing "digitalsignature"
PATH_FILTER=digitalsignature

# Show paths containing "signature" OR "document"
PATH_FILTER=(signature|document)

# Show all paths with a specific prefix
PATH_FILTER=/cs_

# Disable filtering (show all paths)
PATH_FILTER=
```

### How It Works

1. The full OpenAPI spec is generated from Dataverse metadata
2. Paths are filtered using case-insensitive regex matching
3. Unused schemas are automatically cleaned up
4. The filtered spec is displayed in Swagger UI

## 📘 Usage Guide

### Signing In

1. Open http://localhost:3000 in your browser
2. (Optional) Set a different Azure AD tenant ID if needed
3. Choose authentication method:
   - **Sign in as User**: Uses your Microsoft account with your security roles
   - **Sign in as Application**: Uses the app registration's identity and assigned roles
4. Complete the authentication process

### Generating API Documentation

1. Enter your Dataverse environment URL (e.g., `https://your-org.crm3.dynamics.com/`)
2. Click **Load Publishers** to fetch available publishers
3. (Optional) Select a publisher to filter entities by prefix
4. Click **Generate API Docs**
5. Browse the generated Swagger documentation

### Using the Bearer Token

1. On the API documentation page, click **Show Token**
2. Click **Copy Token** to copy it to clipboard
3. Click the **Authorize** button in Swagger UI
4. Paste the token and click **Authorize**
5. You can now execute API requests directly from the documentation

## 🔄 Environment Variables Reference

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `client_id` | Azure AD application client ID | Yes | `3fc17671-754e-497f-a37a-41a9ddbd5a38` |
| `tenant_id` | Azure AD tenant ID | Yes | `24a46daa-7b87-4566-9eea-281326a1b75c` |
| `client_secret` | Azure AD application client secret | Yes | `W7q8Q~BXbEk...` |
| `session_secret` | Secret for session encryption | Yes | `my-super-secret-key` |
| `dataverse_url` | Default Dataverse environment URL | No | `https://org.crm.dynamics.com/` |
| `scopes` | OAuth scopes for user auth | Yes | `https://org.crm.dynamics.com/.default` |
| `app_scopes` | OAuth scopes for app auth | Yes | `https://org.crm.dynamics.com/.default` |
| `redirectUri` | OAuth redirect URI | Yes | `http://localhost:3000/auth/callback` |
| `PATH_FILTER` | Filter pattern for API paths | No | `digitalsignature` |
| `AGENCY_NAME` | Organization name for branding | No | `Elections Canada` |
| `AGENCY_URL` | Organization website URL | No | `https://www.elections.ca` |
| `AGENCY_HEADER_BG` | Header background color | No | `#26374a` |
| `AGENCY_ACCENT_COLOR` | Accent color | No | `#af3c43` |

## 🛠️ Troubleshooting

### Authentication Issues

* Ensure your Azure AD app has the correct redirect URI (`http://localhost:3000/auth/callback`)
* Verify the client secret hasn't expired
* Check that your account has access to the Dataverse environment
* For app-only auth, verify the Application User is created and has security roles

### API Document Generation Issues

* Confirm the Dataverse URL is correct and accessible
* Ensure your account/app has sufficient permissions in Dataverse
* Check the publisher prefix is valid if filtering is applied
* If no entities appear, verify the identity has read permissions

### Path Filter Not Working

* Ensure `PATH_FILTER` is set correctly in `.env`
* Pattern matching is case-insensitive
* Use regex patterns for complex matching: `(pattern1|pattern2)`
* Check console output for filter results

### Network Errors

* Verify your network connection
* Check if your organization restricts access to Dataverse APIs
* Ensure no firewall is blocking the connections
* For Canadian government environments, use the correct CRM region (e.g., `.crm3.dynamics.com`)

## 📁 Project Structure

```
dataverse-webapi-odata-browser/
├── server.js           # Main application file
├── .env.example        # Example environment configuration
├── .env                # Your environment configuration (not in git)
├── package.json        # Node.js dependencies
├── public/             # Static files (logos, etc.)
├── temp/               # Temporary files (generated specs)
└── README.md           # This file
```

## 🚀 Deployment

### Option 1: Azure App Service (Recommended for Full Functionality)

Azure App Service is the recommended deployment option as it supports the full Node.js backend with authentication.

#### Requirements
- [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli) installed
- Azure subscription

#### Step-by-Step Deployment

**1. Create Azure Resources**

```bash
# Login to Azure
az login

# Set variables
RESOURCE_GROUP="rg-dataverse-api-explorer"
APP_NAME="dataverse-api-explorer"  # Must be globally unique
LOCATION="canadacentral"  # Use your preferred region

# Create resource group
az group create --name $RESOURCE_GROUP --location $LOCATION

# Create App Service Plan (B1 is minimum for always-on)
az appservice plan create \
  --name "${APP_NAME}-plan" \
  --resource-group $RESOURCE_GROUP \
  --sku B1 \
  --is-linux

# Create Web App
az webapp create \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --plan "${APP_NAME}-plan" \
  --runtime "NODE:18-lts"
```

**2. Configure Application Settings**

```bash
# Set environment variables
az webapp config appsettings set \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --settings \
    client_id="YOUR_CLIENT_ID" \
    tenant_id="YOUR_TENANT_ID" \
    client_secret="YOUR_CLIENT_SECRET" \
    session_secret="$(openssl rand -base64 32)" \
    dataverse_url="https://your-org.crm.dynamics.com/" \
    scopes="https://your-org.crm.dynamics.com/.default" \
    app_scopes="https://your-org.crm.dynamics.com/.default" \
    redirectUri="https://${APP_NAME}.azurewebsites.net/auth/callback" \
    PATH_FILTER="digitalsignature" \
    AGENCY_NAME="Your Agency Name" \
    AGENCY_URL="https://www.your-agency.ca" \
    AGENCY_HEADER_BG="#26374a" \
    AGENCY_ACCENT_COLOR="#af3c43"
```

**3. Update Azure AD App Registration**

Add the new redirect URI to your Azure AD app registration:
- Go to Azure Portal → Azure AD → App registrations → Your app
- Add redirect URI: `https://<APP_NAME>.azurewebsites.net/auth/callback`

**4. Deploy the Application**

```bash
# Option A: Deploy from local folder using ZIP deploy
zip -r deploy.zip . -x "node_modules/*" -x ".git/*" -x ".env"
az webapp deployment source config-zip \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --src deploy.zip

# Option B: Deploy from GitHub
az webapp deployment source config \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --repo-url "https://github.com/YOUR_USERNAME/dataverse-webapi-odata-browser" \
  --branch main \
  --manual-integration
```

**5. Enable HTTPS Only**

```bash
az webapp update \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --https-only true
```

Your app will be available at: `https://<APP_NAME>.azurewebsites.net`

---

### Option 2: Azure Static Web Apps (Swagger UI Only)

If you only need to display pre-generated Swagger documentation (no dynamic generation), you can use Azure Static Web Apps for a cost-effective, serverless solution.

#### Prerequisites (web apps)
- Pre-generated `swagger.json` file
- GitHub repository

**1. Create Static Swagger UI Site**

Create a new folder structure:

```
static-swagger/
├── index.html
├── swagger.json          # Your pre-generated OpenAPI spec
└── staticwebapp.config.json
```

**2. Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>API Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css">
  <style>
    :root {
      --agency-header-bg: #26374a;
      --agency-accent: #af3c43;
    }
    body { margin: 0; padding: 0; }
    .header {
      background-color: var(--agency-header-bg);
      color: white;
      padding: 1rem 2rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .header h1 { margin: 0; font-size: 1.25rem; }
    .accent-bar { height: 4px; background-color: var(--agency-accent); }
    .swagger-ui .topbar { display: none; }
  </style>
</head>
<body>
  <header class="header">
    <h1>Your Agency - API Documentation</h1>
  </header>
  <div class="accent-bar"></div>
  <div id="swagger-ui"></div>
  
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      SwaggerUIBundle({
        url: "./swagger.json",
        dom_id: '#swagger-ui',
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>
```

**3. Create staticwebapp.config.json**

```json
{
  "navigationFallback": {
    "rewrite": "/index.html"
  },
  "mimeTypes": {
    ".json": "application/json"
  }
}
```

**4. Deploy to Azure Static Web Apps**

```bash
# Install SWA CLI
npm install -g @azure/static-web-apps-cli

# Login and deploy
swa login
swa deploy ./static-swagger --env production
```

Or deploy via Azure Portal:
1. Go to Azure Portal → Create Resource → Static Web App
2. Connect to your GitHub repository
3. Set app location to `/static-swagger`
4. Deploy

---

### Option 3: Azure Blob Storage Static Website

For simple static hosting without GitHub integration.

**1. Create Storage Account**

```bash
STORAGE_ACCOUNT="swaborgstorage"  # Must be globally unique
RESOURCE_GROUP="rg-dataverse-api-explorer"

# Create storage account
az storage account create \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --location canadacentral \
  --sku Standard_LRS \
  --kind StorageV2

# Enable static website hosting
az storage blob service-properties update \
  --account-name $STORAGE_ACCOUNT \
  --static-website \
  --index-document index.html \
  --404-document index.html
```

**2. Upload Files**

```bash
# Upload static files
az storage blob upload-batch \
  --account-name $STORAGE_ACCOUNT \
  --source ./static-swagger \
  --destination '$web'
```

**3. Get Website URL**

```bash
az storage account show \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --query "primaryEndpoints.web" \
  --output tsv
```

**4. (Optional) Add Custom Domain with Azure CDN**

```bash
# Create CDN profile
az cdn profile create \
  --name "${STORAGE_ACCOUNT}-cdn" \
  --resource-group $RESOURCE_GROUP \
  --sku Standard_Microsoft

# Create CDN endpoint
az cdn endpoint create \
  --name "${STORAGE_ACCOUNT}-endpoint" \
  --profile-name "${STORAGE_ACCOUNT}-cdn" \
  --resource-group $RESOURCE_GROUP \
  --origin "${STORAGE_ACCOUNT}.z13.web.core.windows.net" \
  --origin-host-header "${STORAGE_ACCOUNT}.z13.web.core.windows.net"
```

---

### Option 4: Power Pages Integration

Embed the Swagger documentation within a Power Pages site using a custom web template with an iframe or a PCF (Power Apps Component Framework) control.

#### Option 4a: Iframe Embed (Simplest)

**1. Deploy Swagger UI to Azure** (using Option 1, 2, or 3 above)

**2. Create a Web Template in Power Pages**

Go to Power Pages Management → Web Templates → New:

**Name:** `Swagger API Documentation`

**Source:**
```html
{% extends 'Layout 1 Column' %}

{% block main %}
<div class="container-fluid px-0">
  <style>
    .api-docs-header {
      background-color: #26374a;
      color: white;
      padding: 1.5rem 2rem;
      margin-bottom: 0;
    }
    .api-docs-header h1 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 600;
    }
    .accent-bar {
      height: 4px;
      background-color: #af3c43;
    }
    .swagger-container {
      width: 100%;
      height: calc(100vh - 200px);
      min-height: 600px;
      border: none;
    }
    .swagger-iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
    .api-notice {
      background-color: #fff3cd;
      border: 1px solid #ffc107;
      padding: 1rem;
      margin: 0;
      font-size: 0.9rem;
    }
  </style>
  
  <div class="api-docs-header">
    <h1>{{ page.title | default: 'API Documentation' }}</h1>
    <p class="mb-0 mt-2" style="opacity: 0.8;">Interactive documentation for Dataverse APIs</p>
  </div>
  <div class="accent-bar"></div>
  
  {% if user %}
    <div class="swagger-container">
      <iframe 
        src="https://YOUR-SWAGGER-APP.azurewebsites.net/api-docs" 
        class="swagger-iframe"
        title="API Documentation"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups">
      </iframe>
    </div>
  {% else %}
    <div class="api-notice">
      <strong>Authentication Required:</strong> Please <a href="{{ sitemarkers['Login'].url }}">sign in</a> to view the API documentation.
    </div>
  {% endif %}
</div>
{% endblock %}
```

**3. Create a Page Template**

Go to Power Pages Management → Page Templates → New:
- **Name:** `API Documentation Template`
- **Web Template:** Select "Swagger API Documentation"
- **Use Website Header and Footer:** Yes

**4. Create a Web Page**

Go to Power Pages Management → Web Pages → New:
- **Name:** `API Documentation`
- **Page Template:** Select "API Documentation Template"
- **Partial URL:** `api-docs`

**5. Add to Navigation (Optional)**

Add a Web Link to your site's navigation pointing to the new page.

---

#### Option 4b: Custom PCF Control (Advanced)

For a more integrated experience, create a PCF control that renders Swagger UI directly.

**1. Create PCF Project**

```bash
# Install Power Platform CLI
npm install -g pac

# Create new PCF project
mkdir SwaggerViewer
cd SwaggerViewer
pac pcf init --namespace YourOrg --name SwaggerViewer --template field

# Install dependencies
npm install swagger-ui
```

**2. Update ControlManifest.Input.xml**

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest>
  <control namespace="YourOrg" constructor="SwaggerViewer" 
           version="1.0.0" display-name-key="Swagger Viewer" 
           description-key="Displays Swagger/OpenAPI documentation">
    <property name="specUrl" display-name-key="Spec URL" 
              description-key="URL to the OpenAPI specification" 
              of-type="SingleLine.URL" usage="bound" required="true"/>
    <resources>
      <code path="index.ts" order="1"/>
      <css path="css/swagger-ui.css" order="1"/>
    </resources>
  </control>
</manifest>
```

**3. Implement index.ts**

```typescript
import { IInputs, IOutputs } from "./generated/ManifestTypes";
import SwaggerUI from "swagger-ui";
import "swagger-ui/dist/swagger-ui.css";

export class SwaggerViewer implements ComponentFramework.StandardControl<IInputs, IOutputs> {
    private _container: HTMLDivElement;
    private _specUrl: string;

    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        state: ComponentFramework.Dictionary,
        container: HTMLDivElement
    ): void {
        this._container = container;
        this._specUrl = context.parameters.specUrl.raw || "";
        this.renderSwagger();
    }

    private renderSwagger(): void {
        if (this._specUrl) {
            this._container.innerHTML = '<div id="swagger-ui"></div>';
            SwaggerUI({
                url: this._specUrl,
                dom_id: "#swagger-ui",
                presets: [SwaggerUI.presets.apis, SwaggerUI.SwaggerUIStandalonePreset],
                layout: "StandaloneLayout"
            });
        }
    }

    public updateView(context: ComponentFramework.Context<IInputs>): void {
        const newUrl = context.parameters.specUrl.raw || "";
        if (newUrl !== this._specUrl) {
            this._specUrl = newUrl;
            this.renderSwagger();
        }
    }

    public destroy(): void {
        this._container.innerHTML = "";
    }

    public getOutputs(): IOutputs {
        return {};
    }
}
```

**4. Build and Deploy**

```bash
# Build the control
npm run build

# Create solution
pac solution init --publisher-name YourPublisher --publisher-prefix yourprefix
pac solution add-reference --path ./

# Build solution
msbuild /t:restore
msbuild

# Deploy to environment
pac auth create --url https://your-org.crm.dynamics.com
pac pcf push --publisher-prefix yourprefix
```

**5. Add to Power Pages**

Once deployed, you can add the PCF control to a model-driven form or use it via a custom connector in Power Pages.

---

#### Option 4c: Liquid + JavaScript (No External Hosting)

Embed Swagger UI directly in Power Pages without external hosting by storing the spec in a Web File.

**1. Upload swagger.json as Web File**

Go to Power Pages Management → Web Files → New:
- **Name:** `swagger-spec`
- **Partial URL:** `swagger.json`
- **Upload:** Your generated swagger.json file

**2. Create Web Template**

```html
{% extends 'Layout 1 Column' %}

{% block main %}
<div class="container-fluid px-0">
  <style>
    .api-header { background: #26374a; color: white; padding: 1.5rem 2rem; }
    .api-header h1 { margin: 0; font-size: 1.5rem; }
    .accent-bar { height: 4px; background: #af3c43; }
    #swagger-ui { padding: 1rem; }
    .swagger-ui .topbar { display: none; }
  </style>
  
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css">
  
  <div class="api-header">
    <h1>{{ page.title }}</h1>
  </div>
  <div class="accent-bar"></div>
  
  <div id="swagger-ui"></div>
  
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      SwaggerUIBundle({
        url: "{{ website.url }}/swagger.json",
        dom_id: '#swagger-ui',
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: "StandaloneLayout"
      });
    };
  </script>
</div>
{% endblock %}
```

---

### Deployment Comparison

| Feature | App Service | Static Web App | Blob Storage | Power Pages |
|---------|-------------|----------------|--------------|-------------|
| Dynamic API Generation | ✅ | ❌ | ❌ | ❌ |
| User/App Authentication | ✅ | ❌ | ❌ | Via Portal |
| Path Filtering | ✅ | Pre-generated | Pre-generated | Pre-generated |
| Agency Branding | ✅ Dynamic | Static | Static | ✅ Liquid |
| Cost | ~$13-55/mo | Free-$9/mo | ~$1/mo | Included |
| Custom Domain | ✅ | ✅ | Via CDN | ✅ |
| Best For | Full functionality | Static docs | Simple hosting | Portal integration |

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📜 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgements

* [Microsoft Dataverse](https://docs.microsoft.com/en-us/powerapps/maker/data-platform/data-platform-intro)
* [Swagger UI](https://swagger.io/tools/swagger-ui/)
* [Express.js](https://expressjs.com/)
* [Bootstrap](https://getbootstrap.com/)
* [MSAL Node](https://github.com/AzureAD/microsoft-authentication-library-for-js)

---

Developed with ❤️ by [Cloudstrucc](https://github.com/Cloudstrucc)