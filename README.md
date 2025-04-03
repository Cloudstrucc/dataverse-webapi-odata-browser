# Dataverse API Documentation Generator

This application generates interactive OpenAPI documentation for Microsoft Dataverse environments using the OData metadata endpoint.

## Setup Instructions

1. Clone or download this repository
2. Install dependencies:

```bash
npm install
```

3. Create a `temp` directory in the project root:

```bash
mkdir temp
```

4. Start the server:

```bash
npm start
```

5. Open your browser and navigate to: `http://localhost:3000`

## How It Works

1. Sign in with your Azure AD credentials
2. Enter your Dataverse environment URL (e.g., `https://your-org.api.crm.dynamics.com/api/data/v9.2/`)
3. The application will:
   * Fetch the OData metadata from your Dataverse environment
   * Convert the EDMX XML metadata to an OpenAPI specification
   * Display interactive API documentation using Swagger UI

## Features

* **Azure AD Authentication** : Securely authenticates with your Dynamics 365/Dataverse environment
* **Automatic Metadata Processing** : Converts EDMX metadata to OpenAPI format
* **Interactive Documentation** : Explore and test your Dataverse APIs with Swagger UI
* **Bearer Token Integration** : Automatically includes your authentication token for API testing

## Troubleshooting

### JSON Metadata Format Not Supported

If you encounter an error mentioning "JSON metadata is not supported", this is normal. The application explicitly requests XML format to handle this issue.

### Schema Processing Issues

If entity sets or types aren't correctly displayed, check the server logs for details on the XML parsing process. The application attempts to handle both single and multiple entity scenarios.

### Authentication Errors

If you encounter authentication errors, verify:

* Your Azure AD app registration has the correct permissions
* The redirect URI matches your local server
* The client ID and secret are correct

## Customization

You can modify the `convertEdmxToOpenApi` function in `server.js` to customize how the OpenAPI specification is generated. The current implementation:

1. Parses the EDMX XML metadata
2. Extracts entity types and sets information
3. Converts EDM types to OpenAPI types
4. Generates paths for basic CRUD operations on each entity

## Security Note

This application includes Azure AD client credentials in the code for demonstration purposes. In a production environment, store these credentials securely using environment variables or a secret management service.
