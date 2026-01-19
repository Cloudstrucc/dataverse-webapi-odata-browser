# 🚀 Dataverse API Explorer

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-16.x-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-lightgrey.svg)](https://expressjs.com/)

A powerful tool to explore and document your Microsoft Dataverse APIs with customizable filtering by publisher prefixes.

## ✨ Features

* 📚  **Interactive API Documentation** : Generate Swagger UI documentation for your Dataverse environment
* 🔍  **Publisher Filtering** : Filter entities by publisher with an easy-to-use dropdown
* 🔐  **Azure AD Authentication** : Secure access to your Dataverse environment
* 🔄  **Customizable Tenant** : Set different Azure AD tenants for different environments
* 📱  **Responsive Design** : Works on desktop and mobile devices

## 📋 Prerequisites

* [Node.js](https://nodejs.org/) (v14 or newer)
* Access to a Microsoft Dataverse environment
* Azure AD application with proper permissions

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
   * **Name** : Dataverse API Explorer
   * **Supported account types** : Accounts in this organizational directory only
   * **Redirect URI** : Web - http://localhost:3000/auth/callback
4. Click **Register**
5. Make note of the **Application (client) ID** and **Directory (tenant) ID**
6. Go to **Certificates & secrets** → **New client secret**
7. Create a new secret and copy its **Value** (you won't be able to see it again)
8. Go to **API Permissions** → **Add a permission** → **Dynamics CRM** → **Delegated permissions**
9. Select `user_impersonation` and click **Add permissions**
10. Click **Grant admin consent for [your tenant]**

### 4. Configure the .env file

Create a `.env` file in the root of the project with the following content:

```
# Azure AD Configuration
client_secret="YOUR_CLIENT_SECRET"
tenant_id="YOUR_TENANT_ID"

# Application Configuration
session_secret="RANDOM_SESSION_SECRET"

# Dataverse Configuration
dataverse_url="https://your-org.crm.dynamics.com/"
```

Replace the placeholders with your actual values:

* `YOUR_CLIENT_SECRET`: The client secret from Azure AD
* `YOUR_TENANT_ID`: The tenant ID from Azure AD
* `RANDOM_SESSION_SECRET`: A random string for session security
* `https://your-org.crm.dynamics.com/`: Your Dataverse environment URL

### 5. Start the application

```bash
npm start
```

The application will be available at http://localhost:3000.

## 📘 Usage Guide

### Signing In

1. Open http://localhost:3000 in your browser
2. (Optional) Set a different Azure AD tenant ID if needed
3. Click **Sign in with Microsoft**
4. Complete the authentication process

### Generating API Documentation

1. Enter your Dataverse environment URL (e.g., `https://your-org.crm3.dynamics.com/`)
2. Click **Load Publishers** to fetch available publishers from your environment
3. Select a publisher from the dropdown to filter entities by that publisher's prefix
4. Click **Generate API Docs** to create the Swagger UI documentation
5. Browse the generated documentation to explore your Dataverse APIs

### Using the API Documentation

* **Entity Lists** : Browse all entities filtered by the selected publisher
* **Operations** : See all available operations (GET, POST, PATCH, DELETE) for each entity
* **Parameters** : View and test query parameters like $select, $filter, $top
* **Schemas** : Explore the data structure of each entity

## 🔄 Environment Variables

| Variable           | Description                        | Example                                      |
| ------------------ | ---------------------------------- | -------------------------------------------- |
| `client_secret`  | Azure AD application client secret | `W7q8Q~BXbEk_iShmXXgxIcdTYqcVNJa4gCKAHaSP` |
| `tenant_id`      | Azure AD tenant ID                 | `24a46daa-7b87-4566-9eea-281326a1b75c`     |
| `session_secret` | Secret for session encryption      | `my-super-secret-key-12345`                |
| `dataverse_url`  | Default Dataverse environment URL  | `https://org.crm.dynamics.com/`            |

## 📝 Examples

### Basic Usage

1. Sign in with your Microsoft account
2. Enter your Dataverse URL: `https://contoso.crm.dynamics.com/`
3. Load publishers and select "Contoso Sales"
4. Generate API documentation
5. Explore the entities with the "contoso_" prefix

### Different Tenant

1. Enter tenant ID: `contoso-tenant-id`
2. Sign in with your Microsoft account
3. Enter your Dataverse URL: `https://contoso-test.crm.dynamics.com/`
4. Load publishers and select "Contoso Marketing"
5. Generate API documentation
6. Explore the entities with the "contosomarketing_" prefix

## 🛠️ Troubleshooting

### Authentication Issues

* Ensure your Azure AD app has the correct redirect URI
* Verify the client secret hasn't expired
* Check that your account has access to the Dataverse environment

### API Document Generation Issues

* Confirm the Dataverse URL is correct
* Ensure your account has sufficient permissions in Dataverse
* Check the publisher prefix is valid if filtering is applied

### Network Errors

* Verify your network connection
* Check if your organization restricts access to Dataverse APIs
* Ensure no firewall is blocking the connections

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

---

Developed with ❤️ by [Cloudstrucc](https://github.com/Cloudstrucc)
