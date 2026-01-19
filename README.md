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