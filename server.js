// server.js - A simplified approach that focuses on reliability
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const axios = require('axios');
const swaggerUi = require('swagger-ui-express');
const msal = require('@azure/msal-node');
const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');

const app = express();

// Create temp directory for processing files if it doesn't exist
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

// Create public directory for static files if it doesn't exist
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir);
}

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.session_secret || 'default_secret_should_be_changed',
  resave: false,
  saveUninitialized: false,
}));

// Azure AD configuration
const azureConfig = {
  clientId: '66323902-24bb-43fa-8912-a311e6d73f2f',
  tenantId: process.env.tenant_id || '24a46daa-7b87-4566-9eea-281326a1b75c',
  get authority() {
    return `https://login.microsoftonline.com/${this.tenantId}`;
  },
  clientSecret: process.env.client_secret,
  redirectUri: 'http://localhost:3000/auth/callback',
  scopes: ['https://vcs-website-csdev.crm3.dynamics.com/.default']
};

// Initialize MSAL
let msalConfig = {
  auth: {
    clientId: azureConfig.clientId,
    authority: azureConfig.authority,
    clientSecret: azureConfig.clientSecret,
  }
};

let cca = new msal.ConfidentialClientApplication(msalConfig);

// Global variable to store OpenAPI spec
let openApiSpec = null;

// Home route - Login or Dashboard
app.get('/', (req, res) => {
  if (!req.session.token) {
    // Login page
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Dataverse API Explorer</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>
          html, body { height: 100%; }
          body {
            display: flex;
            align-items: center;
            padding-top: 40px;
            padding-bottom: 40px;
            background-color: #f5f5f5;
          }
          .form-signin {
            width: 100%;
            max-width: 400px;
            padding: 15px;
            margin: auto;
          }
          .brand-logo {
            height: 60px;
            margin-bottom: 1.5rem;
          }
        </style>
      </head>
      <body class="text-center">
        <main class="form-signin">
          <h1 class="h3 mb-3 fw-normal">Dataverse API Explorer</h1>
          <p class="mb-3 text-muted">Access documentation for your Dataverse environment APIs</p>
          
          <div class="card p-3 bg-light">
            <form method="POST" action="/set-tenant" class="text-start mb-3">
              <div class="form-floating mb-3">
                <input type="text" class="form-control" id="tenantId" name="tenantId" 
                       placeholder="00000000-0000-0000-0000-000000000000" 
                       value="${azureConfig.tenantId}">
                <label for="tenantId">Azure AD Tenant ID (Optional)</label>
              </div>
              <button type="submit" class="w-100 btn btn-secondary">Set Tenant ID</button>
            </form>
            <a href="/auth/login" class="w-100 btn btn-lg btn-primary">Sign in with Microsoft</a>
          </div>
        </main>
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/js/bootstrap.bundle.min.js"></script>
      </body>
      </html>
    `);
  } else {
    // Dashboard page
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Dataverse API Explorer</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>
          html, body { height: 100%; }
          body {
            display: flex;
            align-items: center;
            padding-top: 40px;
            padding-bottom: 40px;
            background-color: #f5f5f5;
          }
          .container {
            width: 100%;
            max-width: 600px;
            padding: 15px;
            margin: auto;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 class="h3 mb-3 fw-normal text-center">Generate API Documentation</h1>
          
          <div class="card">
            <div class="card-body">
              <h5 class="card-title mb-3">Enter Your Dataverse Environment URL</h5>
              <form method="POST" action="/generate-docs" class="p-2">
                <div class="form-floating mb-3">
                  <input type="text" class="form-control" id="envUrl" name="envUrl" 
                         placeholder="https://your-org.crm.dynamics.com/" 
                         value="${process.env.dataverse_url || ''}" required>
                  <label for="envUrl">Dataverse Environment URL</label>
                </div>
                <div class="mb-3">
                  <div class="form-floating">
                    <input type="text" class="form-control" id="prefix" name="prefix" 
                           placeholder="e.g., goc_, contoso_" 
                           value="${process.env.prefix || ''}">
                    <label for="prefix">Entity Name Prefix (Optional)</label>
                    <div class="form-text">
                      Filter tables by entity name prefix (e.g., goc_, contoso_). Leave empty to include all entities.
                    </div>
                  </div>
                </div>
                <button class="w-100 btn btn-lg btn-primary" type="submit">Generate API Docs</button>
              </form>
            </div>
          </div>
          
          <div class="mt-3 text-center">
            <a href="/auth/logout" class="text-muted">Sign Out</a>
          </div>
        </div>
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/js/bootstrap.bundle.min.js"></script>
      </body>
      </html>
    `);
  }
});

// Set tenant ID
app.post('/set-tenant', (req, res) => {
  const tenantId = req.body.tenantId.trim();
  
  if (tenantId) {
    // Update the tenant ID in the config
    azureConfig.tenantId = tenantId;
    
    // Re-initialize MSAL with the new tenant
    msalConfig.auth.authority = azureConfig.authority;
    cca = new msal.ConfidentialClientApplication(msalConfig);
    
    console.log(`Tenant ID set to: ${tenantId}`);
  }
  
  res.redirect('/');
});

// Authentication routes
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

app.get('/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/');
  });
});

// Generate documentation
app.post('/generate-docs', async (req, res) => {
  if (!req.session.token) {
    return res.status(401).send('Authentication required');
  }

  const envUrl = req.body.envUrl;
  const prefix = req.body.prefix || '';
  
  try {
    // Show loading page
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Generating Documentation...</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>
          html, body { height: 100%; }
          body {
            display: flex;
            align-items: center;
            padding-top: 40px;
            padding-bottom: 40px;
            background-color: #f5f5f5;
          }
          .loading-container {
            width: 100%;
            max-width: 500px;
            padding: 15px;
            margin: auto;
            text-align: center;
          }
          .spinner-border {
            width: 5rem;
            height: 5rem;
            margin-bottom: 1.5rem;
          }
        </style>
      </head>
      <body>
        <main class="loading-container">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
          <h1 class="h3 mb-3 fw-normal">Generating API Documentation</h1>
          <p class="text-muted">Fetching metadata from Dataverse and processing...</p>
          ${prefix ? `<p class="badge bg-info">Filtering by prefix: ${prefix}</p>` : ''}
          <div class="progress mt-4">
            <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" style="width: 100%"></div>
          </div>
        </main>
        <script>
          // Direct API call approach instead of redirect
          fetch('/api/generate-openapi', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url: '${envUrl.replace(/'/g, "\\'")}',
              prefix: '${prefix.replace(/'/g, "\\'")}'
            })
          })
          .then(response => {
            if (!response.ok) {
              throw new Error('Network response was not ok');
            }
            window.location.href = '/api-docs';
          })
          .catch(error => {
            console.error('Error:', error);
            document.querySelector('.loading-container').innerHTML = \`
              <div class="alert alert-danger">
                <h4>Error Generating Documentation</h4>
                <p>\${error.message}</p>
                <a href="/" class="btn btn-primary mt-3">Back to Home</a>
              </div>
            \`;
          });
        </script>
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/js/bootstrap.bundle.min.js"></script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error rendering loading page:', error);
    res.status(500).send("Error starting documentation generation. Please try again.");
  }
});

// API endpoint for OpenAPI spec generation
app.post('/api/generate-openapi', async (req, res) => {
  if (!req.session.token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const envUrl = req.body.url;
  const prefix = req.body.prefix;
  
  try {
    // 1. First try to fetch entity data directly instead of XML metadata
    console.log(`Generating OpenAPI spec for ${envUrl} with prefix ${prefix || 'None'}`);
    
    // Basic validation
    if (!envUrl) {
      throw new Error('Dataverse URL is required');
    }
    
    // Normalize URL for API calls
    const apiUrl = normalizeDataverseUrl(envUrl);
    console.log(`Using normalized URL: ${apiUrl}`);
    
    // 2. Generate OpenAPI spec from entity data with better error handling
    try {
      openApiSpec = await generateSimpleOpenApiSpec(apiUrl, req.session.token, prefix);
      
      // Set flag in session
      req.session.openApiGenerated = true;
      req.session.prefix = prefix;
      
      // Save spec to file for debugging
      try {
        const specPath = path.join(tempDir, 'openapi-spec.json');
        fs.writeFileSync(specPath, JSON.stringify(openApiSpec, null, 2));
        console.log(`OpenAPI spec saved to ${specPath}`);
      } catch (fileError) {
        console.warn('Warning: Could not save spec file for debugging:', fileError.message);
        // Don't fail the operation for this
      }
      
      // Return success
      res.status(200).json({ success: true });
    } catch (specError) {
      console.error('Error generating OpenAPI spec:', specError);
      
      // Generate a minimal fallback spec
      console.log('Generating fallback OpenAPI spec');
      openApiSpec = createFallbackSpec(apiUrl, specError);
      
      // Set flags in session
      req.session.openApiGenerated = true;
      req.session.prefix = prefix;
      
      // Return success but with warning
      res.status(200).json({ 
        success: true, 
        warning: 'Using fallback specification due to error',
        error: specError.message
      });
    }
  } catch (error) {
    console.error('Error in API generation process:', error);
    res.status(500).json({ 
      error: 'Failed to generate OpenAPI spec', 
      message: error.message,
      details: error.response ? {
        status: error.response.status,
        data: error.response.data
      } : null
    });
  }
});

// Helper function to create a fallback OpenAPI spec
function createFallbackSpec(baseUrl, error) {
  return {
    openapi: '3.0.0',
    info: {
      title: 'Dataverse OData API (Fallback)',
      version: '1.0.0',
      description: `Error generating complete API documentation: ${error.message}. This is a fallback specification.`
    },
    servers: [{
      url: baseUrl
    }],
    paths: {
      '/EntityDefinitions': {
        get: {
          summary: 'List Entity Definitions',
          description: 'Get the list of entity definitions in this Dataverse environment',
          parameters: [
            {
              name: '$select',
              in: 'query',
              description: 'Select specific properties',
              schema: { type: 'string' }
            },
            {
              name: '$filter',
              in: 'query',
              description: 'Filter the results',
              schema: { type: 'string' }
            }
          ],
          responses: {
            '200': {
              description: 'OK'
            }
          }
        }
      }
    },
    components: {
      schemas: {
        EntityDefinition: {
          type: 'object',
          properties: {
            SchemaName: { type: 'string' },
            LogicalName: { type: 'string' },
            EntitySetName: { type: 'string' },
            DisplayName: { type: 'object' }
          }
        }
      },
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [{
      bearerAuth: []
    }]
  };
}

// API docs route
app.get('/api-docs', (req, res) => {
  if (!openApiSpec) {
    return res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>No Documentation - Dataverse API Explorer</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>
          html, body {
            height: 100%;
          }
          
          body {
            display: flex;
            align-items: center;
            padding-top: 40px;
            padding-bottom: 40px;
            background-color: #f5f5f5;
          }
          
          .container {
            width: 100%;
            max-width: 600px;
            padding: 15px;
            margin: auto;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <main class="container">
          <div class="card">
            <div class="card-body">
              <h5 class="card-title">No API Documentation Available</h5>
              <p class="card-text">Please generate documentation first.</p>
              <a href="/" class="btn btn-primary">Go Back</a>
            </div>
          </div>
        </main>
      </body>
      </html>
    `);
  }
  
  // Create custom HTML page using CDN resources for Swagger UI
  const prefix = req.session.prefix || '';
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
        
        /* Custom navbar */
        .api-navbar {
          background-color: #007bff;
          padding: 1rem;
          color: white;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .api-navbar a {
          color: white;
          text-decoration: none;
          padding: 0.5rem 1rem;
          border-radius: 4px;
        }
        .api-navbar a:hover {
          background-color: rgba(255, 255, 255, 0.1);
        }
        .prefix-filter {
          background-color: #e9f7ff;
          padding: 0.75rem;
          margin-top: 0;
          border-bottom: 1px solid #ccc;
          font-size: 0.9rem;
        }
      </style>
    </head>
    <body>
      <!-- Custom navbar above Swagger UI -->
      <div class="api-navbar">
        <div>
          <span>Dataverse API Documentation</span>
        </div>
        <div>
          <a href="/">Home</a>
          <a href="/auth/logout">Sign Out</a>
        </div>
      </div>

      ${prefix ? `
      <!-- Prefix filter info -->
      <div class="prefix-filter">
        <strong>Entity prefix filter applied:</strong> ${prefix}
      </div>
      ` : ''}

      <div id="swagger-ui"></div>

      <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
      <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-standalone-preset.js"></script>
      <script>
        window.onload = function() {
          // Function to get the bearer token
          async function getToken() {
            try {
              const response = await fetch('/swagger.json');
              // Just use this request to ensure our session cookie is sent
              return null;
            } catch (error) {
              console.error('Error fetching token:', error);
              return null;
            }
          }

          // Initialize Swagger UI
          getToken().then(token => {
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
                // Try to include auth header from session cookie
                if (!req.headers) {
                  req.headers = {};
                }
                // Our session cookie will be automatically included
                return req;
              }
            });
            
            window.ui = ui;
          });
        }
      </script>
    </body>
    </html>
  `;

  res.send(swaggerHtml);
});

// Swagger UI route
app.use('/swagger-ui', swaggerUi.serve);

// Provide OpenAPI spec as JSON
app.get('/swagger.json', (req, res) => {
  if (!openApiSpec) {
    return res.status(404).json({ error: "No API specification available" });
  }
  
  // Set proper content type
  res.setHeader('Content-Type', 'application/json');
  
  // Send the OpenAPI spec
  res.json(openApiSpec);
});

// Function to normalize Dataverse URL
function normalizeDataverseUrl(url) {
  let normalizedUrl = url.trim();
  
  // Ensure URL ends with a slash
  if (!normalizedUrl.endsWith('/')) {
    normalizedUrl += '/';
  }
  
  // Add api/data/v9.2/ if not present
  if (!normalizedUrl.includes('/api/data/v')) {
    if (normalizedUrl.endsWith('/web/')) {
      normalizedUrl = normalizedUrl.replace(/web\/$/, 'api/data/v9.2/');
    } else {
      normalizedUrl += 'api/data/v9.2/';
    }
  }
  
  return normalizedUrl;
}

// Function to generate a simple OpenAPI spec directly from entity data
async function generateSimpleOpenApiSpec(apiUrl, token, prefix) {
  try {
    // Fetch entity definitions
    const entitiesUrl = `${apiUrl}EntityDefinitions?$select=LogicalName,SchemaName,DisplayName,EntitySetName&$expand=Attributes($select=LogicalName,SchemaName,AttributeType,DisplayName)`;
    
    console.log(`Fetching entity definitions from: ${entitiesUrl}`);
    
    const response = await axios.get(entitiesUrl, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0'
      }
    });
    
    if (!response.data || !response.data.value) {
      throw new Error('Failed to fetch entity definitions');
    }
    
    console.log(`Fetched ${response.data.value.length} entity definitions`);
    
    // Filter entities by prefix if provided
    const entities = prefix 
      ? response.data.value.filter(entity => 
          entity.SchemaName && entity.SchemaName.toLowerCase().startsWith(prefix.toLowerCase()))
      : response.data.value;
    
    console.log(`Filtered to ${entities.length} entities with prefix: ${prefix || 'None'}`);
    
    // Build OpenAPI spec
    const openApiSpec = {
      openapi: '3.0.0',
      info: {
        title: 'Dataverse OData API',
        version: '1.0.0',
        description: prefix 
          ? `Automatically generated API docs from Dataverse metadata (Filtered by prefix: ${prefix})`
          : 'Automatically generated API docs from Dataverse metadata'
      },
      servers: [{
        url: apiUrl
      }],
      paths: {},
      components: {
        schemas: {},
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          }
        }
      },
      security: [{
        bearerAuth: []
      }]
    };
    
    // Process each entity
    entities.forEach(entity => {
      // Skip if missing required properties
      if (!entity.SchemaName || !entity.EntitySetName) return;
      
      // Create schema from attributes
      const properties = {};
      
      if (entity.Attributes && Array.isArray(entity.Attributes)) {
        entity.Attributes.forEach(attr => {
          if (!attr.SchemaName) return;
          
          properties[attr.SchemaName] = attributeTypeToOpenApiType(attr.AttributeType);
        });
      }
      
      // Add schema
      openApiSpec.components.schemas[entity.SchemaName] = {
        type: 'object',
        properties: properties
      };
      
      // Add paths for collection
      openApiSpec.paths[`/${entity.EntitySetName}`] = {
        get: {
          summary: `Get all ${entity.SchemaName} records`,
          parameters: [
            {
              name: '$select',
              in: 'query',
              description: 'Selects which properties to include in the response',
              schema: { type: 'string' }
            },
            {
              name: '$filter',
              in: 'query',
              description: 'Filter criteria for the records',
              schema: { type: 'string' }
            },
            {
              name: '$orderby',
              in: 'query',
              description: 'Order criteria for the records',
              schema: { type: 'string' }
            },
            {
              name: '$top',
              in: 'query',
              description: 'The maximum number of records to return',
              schema: { type: 'integer' }
            }
          ],
          responses: {
            '200': {
              description: 'Successfully retrieved records',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      value: {
                        type: 'array',
                        items: {
                          $ref: `#/components/schemas/${entity.SchemaName}`
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
          summary: `Create a new ${entity.SchemaName} record`,
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  $ref: `#/components/schemas/${entity.SchemaName}`
                }
              }
            }
          },
          responses: {
            '201': {
              description: 'Successfully created'
            }
          }
        }
      };
      
      // Add path for individual record
      openApiSpec.paths[`/${entity.EntitySetName}({id})`] = {
        get: {
          summary: `Get a ${entity.SchemaName} record by ID`,
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
              description: 'Successfully retrieved record',
              content: {
                'application/json': {
                  schema: {
                    $ref: `#/components/schemas/${entity.SchemaName}`
                  }
                }
              }
            }
          }
        },
        patch: {
          summary: `Update a ${entity.SchemaName} record`,
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string' }
            }
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  $ref: `#/components/schemas/${entity.SchemaName}`
                }
              }
            }
          },
          responses: {
            '204': {
              description: 'Successfully updated'
            }
          }
        },
        delete: {
          summary: `Delete a ${entity.SchemaName} record`,
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
              description: 'Successfully deleted'
            }
          }
        }
      };
    });
    
    return openApiSpec;
  } catch (error) {
    console.error('Error generating OpenAPI spec:', error);
    throw error;
  }
}

// Function to map Dataverse attribute types to OpenAPI types
function attributeTypeToOpenApiType(attributeType) {
  if (!attributeType) return { type: 'string' };
  
  const typeMap = {
    'String': { type: 'string' },
    'Memo': { type: 'string' },
    'Integer': { type: 'integer', format: 'int32' },
    'BigInt': { type: 'integer', format: 'int64' },
    'Boolean': { type: 'boolean' },
    'Double': { type: 'number', format: 'double' },
    'Decimal': { type: 'number', format: 'double' },
    'Money': { type: 'number', format: 'double' },
    'DateTime': { type: 'string', format: 'date-time' },
    'Date': { type: 'string', format: 'date' },
    'Lookup': { type: 'string', format: 'uuid' },
    'Owner': { type: 'string', format: 'uuid' },
    'Customer': { type: 'string', format: 'uuid' },
    'Uniqueidentifier': { type: 'string', format: 'uuid' },
    'Virtual': { type: 'string' },
    'State': { type: 'integer' },
    'Status': { type: 'integer' },
    'Picklist': { type: 'integer' },
    'MultiSelectPicklist': { type: 'string' }
  };
  
  return typeMap[attributeType] || { type: 'string' };
}

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`
╔════════════════════════════════════════════╗
║  Dataverse API Explorer                    ║
║  Server running on http://localhost:${port}     ║
║                                            ║
║  Environment:                              ║
║  - Dataverse URL: ${process.env.dataverse_url ? 'Configured ✓' : 'Not set ✗'}           ║
║  - Client Secret: ${process.env.client_secret ? 'Configured ✓' : 'Not set ✗'}           ║
║  - Session Secret: ${process.env.session_secret ? 'Configured ✓' : 'Not set ✗'}         ║
║  - Tenant ID: ${process.env.tenant_id || 'Default'}    ║
╚════════════════════════════════════════════╝
`);
});