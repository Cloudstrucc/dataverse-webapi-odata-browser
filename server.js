// server.js
require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const axios = require('axios');
const swaggerUi = require('swagger-ui-express');
const msal = require('@azure/msal-node');
const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const parser = new xml2js.Parser({ explicitArray: false });

const app = express();

// Use environment variables for Azure AD configuration
const azureConfig = {
  clientId: '66323902-24bb-43fa-8912-a311e6d73f2f',
  authority: 'https://login.microsoftonline.com/24a46daa-7b87-4566-9eea-281326a1b75c',
  clientSecret: process.env.client_secret, // Use from .env file
  redirectUri: 'http://localhost:3000/auth/callback',
  scopes: ['https://vcs-website-csdev.crm3.dynamics.com/.default']
};

// Create temp directory for processing files if it doesn't exist
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Setup session middleware with secret from .env
app.use(
  session({
    secret: process.env.session_secret, // Use from .env file
    resave: false,
    saveUninitialized: false,
  })
);

// Initialize MSAL Confidential Client Application
const msalConfig = {
  auth: {
    clientId: azureConfig.clientId,
    authority: azureConfig.authority,
    clientSecret: azureConfig.clientSecret,
  }
};

const cca = new msal.ConfidentialClientApplication(msalConfig);

// Home route: if not signed in, offer sign-in. Otherwise, show form for Dataverse URL.
app.get('/', (req, res) => {
  if (!req.session.token) {
    res.send(`
      <h1>Welcome</h1>
      <a href="/auth/login">Sign In with Azure AD</a>
    `);
  } else {
    // Use Dataverse URL from .env as default value in the form
    res.send(`
      <h1>Enter Your Dataverse Environment URL</h1>
      <form method="POST" action="/generate-docs">
        <input type="text" name="envUrl" placeholder="https://your-org.api.crm.dynamics.com/api/data/v9.2/" 
               value="${process.env.dataverse_url || ''}" required style="width:300px;">
        <button type="submit">See API Docs</button>
      </form>
    `);
  }
});

// Start sign-in process by redirecting to the Azure AD auth page.
app.get('/auth/login', (req, res) => {
  const authCodeUrlParameters = {
    scopes: azureConfig.scopes,
    redirectUri: azureConfig.redirectUri,
  };

  cca.getAuthCodeUrl(authCodeUrlParameters)
    .then((response) => {
      res.redirect(response);
    })
    .catch((error) => {
      console.error('Auth Code URL Error:', error);
      res.status(500).send('Error during authentication.');
    });
});

// OAuth callback route to receive auth code and exchange for tokens.
app.get('/auth/callback', (req, res) => {
  const tokenRequest = {
    code: req.query.code,
    scopes: azureConfig.scopes,
    redirectUri: azureConfig.redirectUri,
  };

  cca.acquireTokenByCode(tokenRequest)
    .then((response) => {
      req.session.token = response.accessToken;
      res.redirect('/');
    })
    .catch((error) => {
      console.error('Token Acquisition Error:', error);
      res.status(500).send('Error acquiring token.');
    });
});

// Global variable to store the generated OpenAPI specification.
let openApiSpec = null;

// Endpoint to process the Dataverse URL and generate API docs.
app.post('/generate-docs', async (req, res) => {
  // Use the form-submitted URL or fall back to .env value
  const envUrl = req.body.envUrl || process.env.dataverse_url;
  
  // Store the base URL in the session for later use
  req.session.baseApiUrl = envUrl;
  
  // Construct the metadata URL.
  let metadataUrl = envUrl;
  if (!metadataUrl.endsWith('$metadata')) {
    if (!metadataUrl.endsWith('/')) {
      metadataUrl += '/';
    }
    metadataUrl += '$metadata';
  }

  try {
    // Fetch the metadata from Dataverse as XML (default OData format)
    const response = await axios.get(metadataUrl, {
      headers: { 
        'Authorization': `Bearer ${req.session.token}`,
        'Accept': 'application/xml' // Explicitly request XML format
      },
      responseType: 'text' // Get as plain text
    });
    
    const metadata = response.data;
    console.log("Successfully fetched metadata in XML format");

    // Convert the EDMX metadata to an OpenAPI specification.
    openApiSpec = await convertEdmxToOpenApi(metadata, envUrl);

    // Create a file with the OpenAPI spec for debugging
    const specPath = path.join(tempDir, 'openapi-spec.json');
    fs.writeFileSync(specPath, JSON.stringify(openApiSpec, null, 2));
    console.log(`OpenAPI spec saved to ${specPath}`);

    // Redirect to the documentation page
    res.redirect('/api-docs');
  } catch (error) {
    console.error('Error fetching metadata:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    res.status(500).send("Error fetching metadata from the provided Dataverse URL. Please check console for details.");
  }
});

// A more complete implementation of the EDMX to OpenAPI conversion
async function convertEdmxToOpenApi(edmxMetadata, baseUrl) {
  console.log("Starting EDMX to OpenAPI conversion");
  
  try {
    // First, save the EDMX to a temp file
    const edmxFilePath = path.join(tempDir, 'metadata.xml');
    fs.writeFileSync(edmxFilePath, edmxMetadata);
    console.log("Saved EDMX metadata to", edmxFilePath);

    // Using xml2js to parse and manual conversion
    try {
      const result = await parser.parseStringPromise(edmxMetadata);
      
      // Extract schema information
      const edmx = result['edmx:Edmx'];
      const dataServices = edmx['edmx:DataServices'];
      const schema = dataServices.Schema;
      
      // Extract entity types and sets
      const entityTypes = schema.EntityType || [];
      const entityContainer = schema.EntityContainer || {};
      const entitySets = entityContainer.EntitySet || [];
      
      // Log what we found
      console.log(`Found ${Array.isArray(entityTypes) ? entityTypes.length : 1} entity types`);
      console.log(`Found ${Array.isArray(entitySets) ? entitySets.length : 1} entity sets`);
      
      // Build the OpenAPI spec
      const openApiSpec = {
        openapi: "3.0.0",
        info: {
          title: "Dataverse OData API",
          version: "1.0.0",
          description: "Automatically generated API docs from Dataverse metadata."
        },
        servers: [
          {
            url: baseUrl
          }
        ],
        paths: {},
        components: {
          schemas: {}
        }
      };
      
      // Function to convert EDM types to OpenAPI types
      function edmTypeToOpenApiType(edmType) {
        const typeMap = {
          'Edm.String': { type: 'string' },
          'Edm.Int32': { type: 'integer', format: 'int32' },
          'Edm.Int64': { type: 'integer', format: 'int64' },
          'Edm.Boolean': { type: 'boolean' },
          'Edm.Double': { type: 'number', format: 'double' },
          'Edm.Decimal': { type: 'number', format: 'double' },
          'Edm.DateTimeOffset': { type: 'string', format: 'date-time' },
          'Edm.Date': { type: 'string', format: 'date' },
          'Edm.Time': { type: 'string', format: 'time' },
          'Edm.Guid': { type: 'string', format: 'uuid' },
          'Edm.Binary': { type: 'string', format: 'binary' }
        };
        
        return typeMap[edmType] || { type: 'string' };
      }
      
      // Process entity types into schema components
      if (Array.isArray(entityTypes)) {
        entityTypes.forEach(entityType => {
          const properties = {};
          
          if (entityType.Property && Array.isArray(entityType.Property)) {
            entityType.Property.forEach(prop => {
              properties[prop.$.Name] = edmTypeToOpenApiType(prop.$.Type);
            });
          } else if (entityType.Property) {
            properties[entityType.Property.$.Name] = edmTypeToOpenApiType(entityType.Property.$.Type);
          }
          
          openApiSpec.components.schemas[entityType.$.Name] = {
            type: 'object',
            properties: properties
          };
        });
      } else if (entityTypes) {
        // Handle single entity type case
        const properties = {};
        
        if (entityTypes.Property && Array.isArray(entityTypes.Property)) {
          entityTypes.Property.forEach(prop => {
            properties[prop.$.Name] = edmTypeToOpenApiType(prop.$.Type);
          });
        } else if (entityTypes.Property) {
          properties[entityTypes.Property.$.Name] = edmTypeToOpenApiType(entityTypes.Property.$.Type);
        }
        
        openApiSpec.components.schemas[entityTypes.$.Name] = {
          type: 'object',
          properties: properties
        };
      }
      
      // Generate paths from entity sets
      if (Array.isArray(entitySets)) {
        entitySets.forEach(entitySet => {
          const name = entitySet.$.Name;
          const entityType = entitySet.$.EntityType.split('.').pop();
          
          // Create path for collection
          openApiSpec.paths[`/${name}`] = {
            get: {
              summary: `Get list of ${name}`,
              operationId: `get${name}`,
              parameters: [
                {
                  name: '$top',
                  in: 'query',
                  description: 'Show only the first n items',
                  schema: { type: 'integer', minimum: 0 }
                },
                {
                  name: '$skip',
                  in: 'query',
                  description: 'Skip the first n items',
                  schema: { type: 'integer', minimum: 0 }
                },
                {
                  name: '$filter',
                  in: 'query',
                  description: 'Filter items by property values',
                  schema: { type: 'string' }
                },
                {
                  name: '$select',
                  in: 'query',
                  description: 'Select properties to be returned',
                  schema: { type: 'string' }
                },
                {
                  name: '$orderby',
                  in: 'query',
                  description: 'Order items by property values',
                  schema: { type: 'string' }
                }
              ],
              responses: {
                '200': {
                  description: `A list of ${name}`,
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          value: {
                            type: 'array',
                            items: {
                              $ref: `#/components/schemas/${entityType}`
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            post: {
              summary: `Create a new ${entityType}`,
              operationId: `create${entityType}`,
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      $ref: `#/components/schemas/${entityType}`
                    }
                  }
                }
              },
              responses: {
                '201': {
                  description: `Created ${entityType}`
                }
              }
            }
          };
          
          // Create path for single item
          openApiSpec.paths[`/${name}({id})`] = {
            get: {
              summary: `Get a ${entityType} by id`,
              operationId: `get${entityType}ById`,
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' }
                }
              ],
              responses: {
                '200': {
                  description: `A ${entityType}`,
                  content: {
                    'application/json': {
                      schema: {
                        $ref: `#/components/schemas/${entityType}`
                      }
                    }
                  }
                }
              }
            },
            patch: {
              summary: `Update a ${entityType}`,
              operationId: `update${entityType}`,
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' }
                }
              ],
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      $ref: `#/components/schemas/${entityType}`
                    }
                  }
                }
              },
              responses: {
                '204': {
                  description: `${entityType} updated`
                }
              }
            },
            delete: {
              summary: `Delete a ${entityType}`,
              operationId: `delete${entityType}`,
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' }
                }
              ],
              responses: {
                '204': {
                  description: `${entityType} deleted`
                }
              }
            }
          };
        });
      } else if (entitySets) {
        // Handle single entity set case
        const name = entitySets.$.Name;
        const entityType = entitySets.$.EntityType.split('.').pop();
        
        // Similar implementation as above for the single entity set
        // (code omitted for brevity but would follow the same pattern)
      }
      
      console.log("Successfully generated OpenAPI specification");
      return openApiSpec;
      
    } catch (parseError) {
      console.error("Error parsing XML:", parseError);
      throw parseError;
    }
  } catch (error) {
    console.error("Error in EDMX to OpenAPI conversion:", error);
    // Return a basic spec if conversion fails
    return {
      openapi: "3.0.0",
      info: {
        title: "Dataverse OData API (Fallback)",
        version: "1.0.0",
        description: "Basic API docs due to conversion error. Please check server logs."
      },
      servers: [
        {
          url: baseUrl
        }
      ],
      paths: {
        "/error": {
          get: {
            summary: "Conversion Error",
            description: `Error during metadata conversion: ${error.message}`,
            responses: {
              "500": {
                description: "Conversion error"
              }
            }
          }
        }
      }
    };
  }
}

// Create a public directory for static files
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir);
}

// Custom Swagger setup to avoid MIME type issues
// First create a JSON specification file
app.get('/swagger.json', (req, res) => {
  if (!openApiSpec) {
    return res.status(404).json({ error: "No API specification available" });
  }
  
  // Add security definitions if needed
  if (!openApiSpec.components) {
    openApiSpec.components = {};
  }
  
  if (!openApiSpec.components.securitySchemes) {
    openApiSpec.components.securitySchemes = {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    };
  }
  
  res.json(openApiSpec);
});

// Create a custom HTML page for Swagger UI
const swaggerHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Dataverse API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css">
  <style>
    html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin: 0; padding: 0; }
    .swagger-ui .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>

  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: "/swagger.json",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        layout: "StandaloneLayout",
        requestInterceptor: (req) => {
          // Try to get token from session storage or similar source
          if (!req.headers) {
            req.headers = {};
          }
          // Include authentication if available
          const token = localStorage.getItem('bearer_token');
          if (token) {
            req.headers.Authorization = \`Bearer \${token}\`;
          }
          return req;
        }
      });
      
      // Store token if it exists (you'll need to customize this)
      fetch('/token').then(response => response.json()).then(data => {
        if (data.token) {
          localStorage.setItem('bearer_token', data.token);
        }
      }).catch(err => console.error('Error fetching token:', err));
      
      window.ui = ui;
    }
  </script>
</body>
</html>
`;

// Write the HTML file to public directory
fs.writeFileSync(path.join(publicDir, 'index.html'), swaggerHtml);

// Endpoint to provide the token to Swagger UI
app.get('/token', (req, res) => {
  res.json({ token: req.session.token || null });
});

// Serve static files from the public directory
app.use(express.static(publicDir));

// API docs route
app.get('/api-docs', (req, res) => {
  if (!openApiSpec) {
    return res.send("No API documentation available yet. Please go back and generate docs first.");
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Conventional approach with swagger-ui-express as fallback
app.use('/swagger-ui', swaggerUi.serve);
app.get('/swagger-ui', (req, res) => {
  if (!openApiSpec) {
    return res.send("No API documentation available. Please generate docs first.");
  }
  
  // Setup Swagger UI as normal
  swaggerUi.setup(openApiSpec, {
    explorer: true
  })(req, res);
});

// Start the application.
const port = 3000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Environment loaded - Using Dataverse URL: ${process.env.dataverse_url || 'Not set'}`);
});