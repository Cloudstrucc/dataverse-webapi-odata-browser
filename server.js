// server.js - With publisher dropdown feature, dual authentication, path filtering, and JSON schema support
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
const multer = require('multer');

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

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ];
    
    const allowedExtensions = ['.pdf', '.docx', '.xlsx', '.pptx'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed types: PDF, DOCX, XLSX, PPTX'));
    }
  }
});

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
  clientId: process.env.client_id,
  tenantId: process.env.tenant_id,
  get authority() {
    return `https://login.microsoftonline.com/${this.tenantId}`;
  },
  clientSecret: process.env.client_secret,
  redirectUri: process.env.redirectUri,
  scopes: [process.env.scopes],
  appScopes: [process.env.app_scopes || process.env.scopes]
};

// =============================================================================
// PATH FILTER CONFIGURATION
// =============================================================================
const PATH_FILTER = process.env.PATH_FILTER || '';

// =============================================================================
// JSON SCHEMA FILE CONFIGURATION (NEW)
// =============================================================================
const SCHEMA_FILE_PATH = process.env.SCHEMA_FILE_PATH || '';
const PUBLISHER_PREFIX = process.env.PUBLISHER_PREFIX || '';

// =============================================================================
// AGENCY BRANDING CONFIGURATION
// =============================================================================
const AGENCY_NAME = process.env.AGENCY_NAME || 'Elections Canada';
const AGENCY_URL = process.env.AGENCY_URL || 'https://www.elections.ca';
const AGENCY_HEADER_BG = process.env.AGENCY_HEADER_BG || '#26374a';
const AGENCY_ACCENT_COLOR = process.env.AGENCY_ACCENT_COLOR || '#af3c43';

// Agency Branding Configuration (uses environment variables)
const AGENCY_BRANDING = {
  name: AGENCY_NAME,
  url: AGENCY_URL,
  headerBgColor: AGENCY_HEADER_BG,
  accentColor: AGENCY_ACCENT_COLOR,
  headerHeight: '80px',
  footerText: `© ${AGENCY_NAME}`
};

// =============================================================================
// JSON SCHEMA TO OPENAPI SPEC GENERATOR (NEW METHOD)
// =============================================================================

/**
 * Load and parse the JSON schema file
 * @param {string} schemaPath - Path to the JSON schema file
 * @returns {Object|null} Parsed schema or null if not found/invalid
 */
function loadSchemaFile(schemaPath) {
  try {
    const resolvedPath = path.isAbsolute(schemaPath) 
      ? schemaPath 
      : path.join(__dirname, schemaPath);
    
    console.log(`Loading schema file from: ${resolvedPath}`);
    
    if (!fs.existsSync(resolvedPath)) {
      console.error(`Schema file not found: ${resolvedPath}`);
      return null;
    }
    
    const content = fs.readFileSync(resolvedPath, 'utf8');
    const schema = JSON.parse(content);
    
    if (!schema.tables || !Array.isArray(schema.tables)) {
      console.error('Invalid schema format: missing "tables" array');
      return null;
    }
    
    console.log(`Successfully loaded schema with ${schema.tables.length} tables`);
    return schema;
  } catch (error) {
    console.error(`Error loading schema file: ${error.message}`);
    return null;
  }
}

/**
 * Map schema attribute types to OpenAPI types
 * @param {Object} attr - Attribute object from schema
 * @returns {Object} OpenAPI type definition
 */
function schemaTypeToOpenApiType(attr) {
  const type = attr.type || 'String';
  
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
  
  const baseType = typeMap[type] || { type: 'string' };
  
  if (attr.description) {
    baseType.description = attr.description;
  }
  
  if (attr.format === 'Email') {
    baseType.format = 'email';
  } else if (attr.format === 'Url') {
    baseType.format = 'uri';
  } else if (attr.format === 'Phone') {
    baseType.pattern = '^[+]?[0-9\\-\\s()]+$';
  }
  
  if (baseType.type === 'string' && attr.maxLength) {
    baseType.maxLength = attr.maxLength;
  }
  
  if (baseType.type === 'integer') {
    if (attr.minValue !== undefined) baseType.minimum = attr.minValue;
    if (attr.maxValue !== undefined) baseType.maximum = attr.maxValue;
  }
  
  return baseType;
}

/**
 * Generate OpenAPI specification from a JSON schema file
 * This method reads the schema file and creates OpenAPI paths for each table.
 * 
 * @param {string} apiUrl - The Dataverse API base URL
 * @param {string} schemaPath - Path to the JSON schema file
 * @param {string} publisherPrefix - Publisher prefix to add to all entity names (e.g., "cs")
 * @returns {Object} OpenAPI specification object
 */
function generateOpenApiSpecFromSchemaFile(apiUrl, schemaPath, publisherPrefix = '') {
  console.log('\n' + '='.repeat(80));
  console.log('GENERATING OPENAPI SPEC FROM SCHEMA FILE');
  console.log('='.repeat(80));
  console.log(`Schema Path: ${schemaPath}`);
  console.log(`Publisher Prefix: ${publisherPrefix || '(none)'}`);
  console.log(`API URL: ${apiUrl}`);
  console.log('='.repeat(80));
  
  const schema = loadSchemaFile(schemaPath);
  
  if (!schema) {
    throw new Error(`Failed to load schema file: ${schemaPath}`);
  }
  
  // Normalize prefix (ensure it ends with underscore if provided)
  const prefix = publisherPrefix ? 
    (publisherPrefix.endsWith('_') ? publisherPrefix : `${publisherPrefix}_`) : '';
  
  // Build OpenAPI spec
  const openApiSpec = {
    openapi: '3.0.0',
    info: {
      title: `${AGENCY_NAME} Digital Signature API`,
      version: '1.0.0',
      description: `API documentation generated from schema file.\n\n` +
        `**Schema File:** \`${path.basename(schemaPath)}\`\n` +
        `**Publisher Prefix:** \`${prefix || 'None'}\`\n` +
        `**Tables:** ${schema.tables.length}`
    },
    servers: [{ url: apiUrl }],
    paths: {},
    components: {
      schemas: {},
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Azure AD Bearer Token'
        }
      }
    },
    security: [{ bearerAuth: [] }],
    tags: []
  };
  
  // Process each table from the schema
  schema.tables.forEach(table => {
    const logicalName = `${prefix}${table.logicalName}`;
    // Use the display name for the schema (cleaner in Swagger UI)
    const schemaName = table.displayName || table.logicalName.charAt(0).toUpperCase() + table.logicalName.slice(1);
    const pluralSuffix = table.logicalName.endsWith('s') ? 'es' : 's';
    const entitySetName = `${prefix}${table.logicalName}${pluralSuffix}`;
    
    const displayName = table.displayName || table.logicalName;
    const description = table.description || `${displayName} entity`;
    
    console.log(`Processing: ${displayName} -> ${entitySetName}`);
    
    openApiSpec.tags.push({
      name: displayName,
      description: description
    });
    
    // Build properties from attributes
    const properties = {};
    const requiredFields = [];
    
    // Add the primary key
    const primaryKeyName = `${logicalName}id`;
    properties[primaryKeyName] = {
      type: 'string',
      format: 'uuid',
      description: `Unique identifier for ${displayName}`,
      readOnly: true
    };
    
    // Add primary attribute (Name field)
    if (table.primaryAttribute) {
      const primaryAttr = table.primaryAttribute;
      const attrName = `${prefix}${primaryAttr.schemaName.toLowerCase()}`;
      properties[attrName] = {
        type: 'string',
        description: primaryAttr.description || `${primaryAttr.displayName}`,
        maxLength: primaryAttr.maxLength || 200
      };
      requiredFields.push(attrName);
    }
    
    // Add all other attributes
    if (table.attributes && Array.isArray(table.attributes)) {
      table.attributes.forEach(attr => {
        const attrName = `${prefix}${attr.logicalName}`;
        properties[attrName] = schemaTypeToOpenApiType(attr);
      });
    }
    
    // Add standard Dataverse system fields
    properties['createdon'] = { type: 'string', format: 'date-time', readOnly: true, description: 'Date and time when the record was created' };
    properties['modifiedon'] = { type: 'string', format: 'date-time', readOnly: true, description: 'Date and time when the record was last modified' };
    properties['statecode'] = { type: 'integer', description: 'Status of the record (0=Active, 1=Inactive)' };
    properties['statuscode'] = { type: 'integer', description: 'Reason for the status of the record' };
    properties['versionnumber'] = { type: 'integer', format: 'int64', readOnly: true, description: 'Version number of the record' };
    
    // Add schema
    openApiSpec.components.schemas[schemaName] = {
      type: 'object',
      description: description,
      properties: properties,
      required: requiredFields.length > 0 ? requiredFields : undefined
    };
    
    // Add collection path (GET all, POST new)
    openApiSpec.paths[`/${entitySetName}`] = {
      get: {
        tags: [displayName],
        summary: `Get all ${table.displayNamePlural || displayName + 's'}`,
        description: `Retrieve a list of ${table.displayNamePlural || displayName + 's'} records`,
        operationId: `get${schemaName}List`,
        parameters: [
          { name: '$select', in: 'query', description: 'Comma-separated list of properties to include', schema: { type: 'string' } },
          { name: '$filter', in: 'query', description: 'OData filter expression', schema: { type: 'string' } },
          { name: '$orderby', in: 'query', description: 'Order results by specified properties', schema: { type: 'string' } },
          { name: '$top', in: 'query', description: 'Maximum number of records to return', schema: { type: 'integer', default: 50, maximum: 5000 } },
          { name: '$skip', in: 'query', description: 'Number of records to skip', schema: { type: 'integer' } },
          { name: '$count', in: 'query', description: 'Include total count', schema: { type: 'boolean' } },
          { name: '$expand', in: 'query', description: 'Related entities to include', schema: { type: 'string' } }
        ],
        responses: {
          '200': {
            description: 'Successfully retrieved records',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    '@odata.context': { type: 'string' },
                    '@odata.count': { type: 'integer' },
                    value: { type: 'array', items: { $ref: `#/components/schemas/${schemaName}` } }
                  }
                }
              }
            }
          },
          '401': { description: 'Unauthorized' },
          '403': { description: 'Forbidden' }
        }
      },
      post: {
        tags: [displayName],
        summary: `Create a new ${displayName}`,
        operationId: `create${schemaName}`,
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: `#/components/schemas/${schemaName}` } } }
        },
        responses: {
          '201': { description: 'Successfully created' },
          '400': { description: 'Bad request' },
          '401': { description: 'Unauthorized' }
        }
      }
    };
    
    // Add single entity path
    openApiSpec.paths[`/${entitySetName}({${primaryKeyName}})`] = {
      get: {
        tags: [displayName],
        summary: `Get a ${displayName} by ID`,
        operationId: `get${schemaName}ById`,
        parameters: [
          { name: primaryKeyName, in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: '$select', in: 'query', description: 'Properties to include', schema: { type: 'string' } },
          { name: '$expand', in: 'query', description: 'Related entities', schema: { type: 'string' } }
        ],
        responses: {
          '200': { description: 'Success', content: { 'application/json': { schema: { $ref: `#/components/schemas/${schemaName}` } } } },
          '404': { description: 'Not found' }
        }
      },
      patch: {
        tags: [displayName],
        summary: `Update a ${displayName}`,
        operationId: `update${schemaName}`,
        parameters: [
          { name: primaryKeyName, in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: `#/components/schemas/${schemaName}` } } }
        },
        responses: {
          '204': { description: 'Successfully updated' },
          '400': { description: 'Bad request' },
          '404': { description: 'Not found' }
        }
      },
      delete: {
        tags: [displayName],
        summary: `Delete a ${displayName}`,
        operationId: `delete${schemaName}`,
        parameters: [
          { name: primaryKeyName, in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
        ],
        responses: {
          '204': { description: 'Successfully deleted' },
          '404': { description: 'Not found' }
        }
      }
    };
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('SCHEMA-BASED OPENAPI GENERATION COMPLETE');
  console.log(`Total Tables: ${schema.tables.length}`);
  console.log(`Total Paths: ${Object.keys(openApiSpec.paths).length}`);
  console.log('='.repeat(80) + '\n');
  
  return openApiSpec;
}

// =============================================================================
// END JSON SCHEMA CONFIGURATION
// =============================================================================

/**
 * Filter OpenAPI spec to include only paths matching a pattern
 */
function filterOpenApiByPattern(openApiSpec, pattern, options = {}) {
  const { caseInsensitive = true, cleanupSchemas = true } = options;
  
  if (!pattern || !openApiSpec || !openApiSpec.paths) {
    return openApiSpec;
  }

  const filteredSpec = JSON.parse(JSON.stringify(openApiSpec));
  
  let regex;
  if (pattern instanceof RegExp) {
    regex = pattern;
  } else {
    const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    regex = new RegExp(escapedPattern, caseInsensitive ? 'i' : '');
  }

  const originalPathCount = Object.keys(filteredSpec.paths).length;
  const matchedPaths = [];

  const newPaths = {};
  for (const [pathKey, pathItem] of Object.entries(filteredSpec.paths)) {
    if (regex.test(pathKey)) {
      newPaths[pathKey] = pathItem;
      matchedPaths.push(pathKey);
    }
  }

  filteredSpec.paths = newPaths;

  console.log(`PATH FILTER: "${pattern}" - ${matchedPaths.length}/${originalPathCount} paths matched`);

  if (filteredSpec.info) {
    filteredSpec.info.description = (filteredSpec.info.description || '') + 
      `\n\n**Path Filter Applied:** \`${pattern}\` (${matchedPaths.length} paths)`;
  }

  return filteredSpec;
}

// Initialize MSAL
let msalConfig = {
  auth: {
    clientId: azureConfig.clientId,
    authority: azureConfig.authority,
    clientSecret: azureConfig.clientSecret,
  },
  system: {
    loggerOptions: {
      loggerCallback(loglevel, message, containsPii) {
        console.log(message);
      },
      piiLoggingEnabled: false,
      logLevel: 3,
    }
  }
};

let cca = new msal.ConfidentialClientApplication(msalConfig);

// Global variable to store OpenAPI spec
let openApiSpec = null;

// Authentication middleware
function checkAuthentication(req, res, next) {
  const publicPaths = ['/', '/auth/login', '/auth/callback', '/auth/logout', '/auth/app-login', '/file-converter', '/api/public/file-to-base64'];
  if (publicPaths.includes(req.path)) {
    return next();
  }
  
  if (!req.session.token) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Authentication required', redirect: '/auth/login' });
    }
    return res.redirect('/auth/login');
  }
  
  if (req.session.tokenExpires && Date.now() > req.session.tokenExpires) {
    req.session.token = null;
    req.session.tokenExpires = null;
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Authentication expired', redirect: '/auth/login' });
    }
    return res.redirect('/auth/login');
  }
  
  next();
}

app.use(checkAuthentication);

// Common CSS for Agency branding
const AGENCY_COMMON_STYLES = `
  :root {
    --agency-header-bg: ${AGENCY_BRANDING.headerBgColor};
    --agency-accent: ${AGENCY_BRANDING.accentColor};
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; font-family: 'Noto Sans', Arial, sans-serif; background-color: #f8f9fa; }
  .gc-header {
    background-color: var(--agency-header-bg);
    padding: 0 20px;
    height: ${AGENCY_BRANDING.headerHeight};
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
  .gc-header-logo { display: flex; align-items: center; gap: 15px; }
  .gc-header-logo-name { color: white; font-size: 1.25rem; font-weight: 700; }
  .gc-header-logo-text { color: white; font-size: 1.1rem; font-weight: 600; border-left: 2px solid rgba(255,255,255,0.3); padding-left: 15px; margin-left: 5px; }
  .gc-header-nav { display: flex; align-items: center; gap: 15px; }
  .gc-header-nav a { color: white; text-decoration: none; padding: 8px 16px; border-radius: 4px; font-size: 0.9rem; transition: background-color 0.2s; }
  .gc-header-nav a:hover { background-color: rgba(255,255,255,0.1); }
  .gc-red-bar { height: 4px; background-color: var(--agency-accent); }
  .gc-footer { background-color: var(--agency-header-bg); color: white; padding: 20px; text-align: center; font-size: 0.85rem; margin-top: auto; }
  .badge-agency { background-color: var(--agency-accent); color: white; }
  .btn-agency-primary { background-color: var(--agency-header-bg); border-color: var(--agency-header-bg); color: white; }
  .btn-agency-primary:hover { background-color: #1c2a38; border-color: #1c2a38; color: white; }
  .btn-agency-secondary { background-color: var(--agency-accent); border-color: var(--agency-accent); color: white; }
  .filter-badge { background-color: var(--agency-accent); color: white; padding: 0.25rem 0.75rem; border-radius: 0.25rem; font-size: 0.8rem; margin: 0.25rem; display: inline-block; }
  .filter-badge.schema-mode { background-color: #28a745; }
  .filter-badge.prefix-mode { background-color: #17a2b8; }
`;

// Home route - Login or Dashboard
app.get('/', (req, res) => {
  const schemaBadge = SCHEMA_FILE_PATH ? `<span class="filter-badge schema-mode">📄 Schema: ${path.basename(SCHEMA_FILE_PATH)}</span>` : '';
  const prefixBadge = PUBLISHER_PREFIX ? `<span class="filter-badge prefix-mode">🏷️ Prefix: ${PUBLISHER_PREFIX}_</span>` : '';
  const pathFilterBadge = PATH_FILTER ? `<span class="filter-badge">🔍 Filter: ${PATH_FILTER}</span>` : '';
  
  if (!req.session.token) {
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>API Explorer - ${AGENCY_NAME}</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    ${AGENCY_COMMON_STYLES}
    html, body { height: 100%; }
    .page-wrapper { min-height: 100%; display: flex; flex-direction: column; }
    .main-content { flex: 1; display: flex; align-items: center; justify-content: center; padding: 40px 20px; }
    .form-signin { width: 100%; max-width: 480px; }
    .card { border: none; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .page-title { color: var(--agency-header-bg); font-weight: 600; }
    .auth-divider { display: flex; align-items: center; margin: 1.5rem 0; }
    .auth-divider::before, .auth-divider::after { content: ''; flex: 1; border-bottom: 1px solid #dee2e6; }
    .auth-divider span { padding: 0 1rem; color: #6c757d; font-size: 0.875rem; }
    .auth-option { margin-bottom: 1rem; }
    .auth-option .btn { position: relative; padding-left: 2.5rem; }
    .auth-option .btn-icon { position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); }
    .mode-badges { text-align: center; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="page-wrapper">
    <header class="gc-header">
      <div class="gc-header-logo">
        <span class="gc-header-logo-name">${AGENCY_NAME}</span>
        <span class="gc-header-logo-text">API Explorer</span>
      </div>
      <nav class="gc-header-nav">
        <a href="${AGENCY_URL}" target="_blank">${AGENCY_NAME}</a>
      </nav>
    </header>
    <div class="gc-red-bar"></div>
    <main class="main-content">
      <div class="form-signin text-center">
        <h1 class="h3 mb-3 page-title">Dataverse API Explorer</h1>
        <p class="mb-3 text-muted">Access documentation for ${AGENCY_NAME} Dataverse APIs</p>
        <div class="mode-badges">${schemaBadge}${prefixBadge}${pathFilterBadge}</div>
        <div class="card p-4 mt-3">
          <form method="POST" action="/set-tenant" class="text-start mb-3">
            <div class="form-floating mb-3">
              <input type="text" class="form-control" id="tenantId" name="tenantId" placeholder="Tenant ID" value="${azureConfig.tenantId}">
              <label for="tenantId">Azure AD Tenant ID (Optional)</label>
            </div>
            <button type="submit" class="w-100 btn btn-outline-secondary">Set Tenant ID</button>
          </form>
          <div class="auth-divider"><span>Choose Authentication Method</span></div>
          <div class="auth-option">
            <a href="/auth/login" class="w-100 btn btn-lg btn-agency-primary">
              <span class="btn-icon">👤</span>Sign in as User
            </a>
            <small class="text-muted d-block mt-1">Uses your user account and security roles</small>
          </div>
          <div class="auth-option">
            <a href="/auth/app-login" class="w-100 btn btn-lg btn-agency-secondary">
              <span class="btn-icon">🔑</span>Sign in as Application
            </a>
            <small class="text-muted d-block mt-1">Uses app registration identity and permissions</small>
          </div>
        </div>
      </div>
    </main>
    <footer class="gc-footer"><div>${AGENCY_BRANDING.footerText}</div></footer>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>`);
  } else {
    const authType = req.session.authType || 'user';
    const authBadge = authType === 'application' ? '<span class="badge badge-agency">Application</span>' : '<span class="badge bg-primary">User</span>';
    
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>API Explorer - ${AGENCY_NAME}</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    ${AGENCY_COMMON_STYLES}
    html, body { height: 100%; }
    .page-wrapper { min-height: 100%; display: flex; flex-direction: column; }
    .main-content { flex: 1; display: flex; align-items: center; justify-content: center; padding: 40px 20px; }
    .container-form { width: 100%; max-width: 600px; }
    .card { border: none; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .card-title { color: var(--agency-header-bg); font-weight: 600; }
    .page-title { color: var(--agency-header-bg); font-weight: 600; }
    .auth-status { text-align: center; margin-bottom: 1rem; }
    .schema-mode-notice { background-color: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; padding: 1rem; border-radius: 0.25rem; margin-bottom: 1rem; }
    .publisher-loading { display: none; margin-left: 10px; }
  </style>
</head>
<body>
  <div class="page-wrapper">
    <header class="gc-header">
      <div class="gc-header-logo">
        <span class="gc-header-logo-name">${AGENCY_NAME}</span>
        <span class="gc-header-logo-text">API Explorer</span>
      </div>
      <nav class="gc-header-nav">
        <a href="/">Home</a>
        <a href="/auth/logout">Sign Out</a>
      </nav>
    </header>
    <div class="gc-red-bar"></div>
    <main class="main-content">
      <div class="container-form">
        <div class="auth-status"><small class="text-muted">Authenticated: ${authBadge}</small></div>
        <h1 class="h3 mb-3 page-title text-center">Generate API Documentation</h1>
        ${SCHEMA_FILE_PATH ? `<div class="schema-mode-notice">
          <h6>📄 Schema File Mode Active</h6>
          <p class="mb-1">Documentation will be generated from: <code>${path.basename(SCHEMA_FILE_PATH)}</code></p>
          ${PUBLISHER_PREFIX ? `<p class="mb-0">Publisher prefix: <code>${PUBLISHER_PREFIX}_</code></p>` : ''}
        </div>` : ''}
        <div id="statusMessages"></div>
        <div class="card">
          <div class="card-body">
            <h5 class="card-title mb-3">Enter Your Dataverse Environment URL</h5>
            <form method="POST" action="/generate-docs" id="apiForm">
              <div class="form-floating mb-3">
                <input type="text" class="form-control" id="envUrl" name="envUrl" placeholder="URL" value="${process.env.dataverse_url || ''}" required>
                <label for="envUrl">Dataverse Environment URL</label>
              </div>
              ${!SCHEMA_FILE_PATH ? `
              <div class="mb-3">
                <label for="publisherDropdown" class="form-label">Publisher (Optional)</label>
                <div class="input-group">
                  <select class="form-select" id="publisherDropdown" name="publisherDropdown">
                    <option value="">All Publishers (No Filter)</option>
                  </select>
                  <button class="btn btn-outline-secondary" type="button" id="loadPublishers">Load Publishers</button>
                  <div class="spinner-border text-primary publisher-loading" role="status" id="publisherLoading"></div>
                </div>
                <input type="hidden" id="prefix" name="prefix" value="">
              </div>` : `<input type="hidden" name="prefix" value="${PUBLISHER_PREFIX}"><input type="hidden" name="useSchemaFile" value="true">`}
              <button class="w-100 btn btn-lg btn-agency-primary" type="submit">Generate API Docs</button>
            </form>
            <div class="mt-3 pt-3 border-top">
              <button class="btn btn-sm btn-outline-secondary" onclick="checkIdentity()">🔍 Check Identity</button>
              <div id="identityInfo" class="mt-2" style="display: none;"><pre class="bg-light p-2 small" style="max-height: 200px; overflow-y: auto;"></pre></div>
            </div>
          </div>
        </div>
      </div>
    </main>
    <footer class="gc-footer"><div>${AGENCY_BRANDING.footerText}</div></footer>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/js/bootstrap.bundle.min.js"></script>
  <script>
    async function checkIdentity() {
      try {
        const response = await fetch('/api/whoami');
        const data = await response.json();
        const identityDiv = document.getElementById('identityInfo');
        identityDiv.style.display = 'block';
        identityDiv.querySelector('pre').textContent = JSON.stringify(data, null, 2);
      } catch (error) { console.error('Error:', error); }
    }
    document.addEventListener('DOMContentLoaded', function() {
      const loadBtn = document.getElementById('loadPublishers');
      const dropdown = document.getElementById('publisherDropdown');
      const prefixInput = document.getElementById('prefix');
      if (loadBtn) {
        loadBtn.addEventListener('click', function() {
          const envUrl = document.getElementById('envUrl').value.trim();
          if (!envUrl) { alert('Enter URL first'); return; }
          loadBtn.disabled = true;
          document.getElementById('publisherLoading').style.display = 'inline-block';
          fetch('/api/fetch-publishers?url=' + encodeURIComponent(envUrl))
            .then(r => r.json())
            .then(data => {
              while (dropdown.options.length > 1) dropdown.remove(1);
              if (data.publishers) {
                data.publishers.forEach(p => {
                  const opt = document.createElement('option');
                  opt.value = p.customizationprefix || '';
                  opt.textContent = (p.friendlyname || p.uniquename) + (p.customizationprefix ? ' (' + p.customizationprefix + '_)' : '');
                  dropdown.appendChild(opt);
                });
              }
            })
            .finally(() => { loadBtn.disabled = false; document.getElementById('publisherLoading').style.display = 'none'; });
        });
        dropdown.addEventListener('change', function() {
          prefixInput.value = this.value ? this.value + '_' : '';
        });
      }
    });
  </script>
</body>
</html>`);
  }
});

// Set tenant ID
app.post('/set-tenant', (req, res) => {
  const tenantId = req.body.tenantId.trim();
  if (tenantId) {
    azureConfig.tenantId = tenantId;
    msalConfig.auth.authority = azureConfig.authority;
    cca = new msal.ConfidentialClientApplication(msalConfig);
    console.log(`Tenant ID set to: ${tenantId}`);
  }
  res.redirect('/');
});

// Auth login route
app.get('/auth/login', (req, res) => {
  console.log('Auth login route accessed');
  const authCodeUrlParameters = { 
    scopes: azureConfig.scopes, 
    redirectUri: azureConfig.redirectUri 
  };
  cca.getAuthCodeUrl(authCodeUrlParameters)
    .then((response) => {
      console.log('Redirecting to Microsoft auth');
      res.redirect(response);
    })
    .catch((error) => {
      console.error('Auth error:', error);
      res.status(500).send(`<html><body><h4>Authentication Error</h4><pre>${error.message}</pre><a href="/">Back</a></body></html>`);
    });
});

// App-only authentication route
app.get('/auth/app-login', async (req, res) => {
  console.log('App-only authentication initiated');
  try {
    const response = await cca.acquireTokenByClientCredential({ 
      scopes: azureConfig.appScopes 
    });
    if (response && response.accessToken) {
      console.log('App token acquired successfully');
      req.session.token = response.accessToken;
      req.session.authType = 'application';
      openApiSpec = null;
      const expiresIn = response.expiresOn ? new Date(response.expiresOn).getTime() - Date.now() : 3600 * 1000;
      req.session.tokenExpires = Date.now() + expiresIn;
      console.log(`Token expires in ${Math.floor(expiresIn / 1000 / 60)} minutes`);
      res.redirect('/');
    } else {
      throw new Error('No token received');
    }
  } catch (error) {
    console.error('App auth error:', error);
    res.status(500).send(`<html><body><h4>Application Authentication Error</h4><pre>${error.message}</pre><p>Make sure your App Registration has the correct permissions and an Application User exists in Power Platform.</p><a href="/">Back</a></body></html>`);
  }
});

// Auth callback route
app.get('/auth/callback', (req, res) => {
  console.log('Auth callback received');
  const tokenRequest = { 
    code: req.query.code, 
    scopes: azureConfig.scopes, 
    redirectUri: azureConfig.redirectUri 
  };
  cca.acquireTokenByCode(tokenRequest)
    .then((response) => {
      console.log('User token acquired successfully');
      req.session.token = response.accessToken;
      req.session.authType = 'user';
      openApiSpec = null;
      const expiresIn = response.expiresOn ? new Date(response.expiresOn).getTime() - Date.now() : 3600 * 1000;
      req.session.tokenExpires = Date.now() + expiresIn;
      res.redirect('/');
    })
    .catch((error) => {
      console.error('Token error:', error);
      res.status(500).send(`<html><body><h4>Token Acquisition Error</h4><pre>${error.message}</pre><a href="/">Back</a></body></html>`);
    });
});

// Logout route
app.get('/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Session destroy error:', err);
    res.redirect('/');
  });
});

// WhoAmI API endpoint
app.get('/api/whoami', async (req, res) => {
  if (!req.session.token) return res.status(401).json({ error: 'No token available' });
  try {
    const tokenParts = req.session.token.split('.');
    const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
    const whoAmIUrl = `${normalizeDataverseUrl(process.env.dataverse_url)}WhoAmI`;
    const whoAmIResponse = await axios.get(whoAmIUrl, {
      headers: { 
        'Authorization': `Bearer ${req.session.token}`, 
        'Accept': 'application/json', 
        'OData-MaxVersion': '4.0', 
        'OData-Version': '4.0' 
      }
    });
    res.json({
      authType: req.session.authType,
      schemaFile: SCHEMA_FILE_PATH || 'None (Dataverse query)',
      publisherPrefix: PUBLISHER_PREFIX || 'None',
      pathFilter: PATH_FILTER || 'None',
      tokenClaims: { 
        appid: payload.appid, 
        upn: payload.upn || 'N/A (Application)',
        oid: payload.oid
      },
      dataverseIdentity: whoAmIResponse.data
    });
  } catch (error) {
    console.error('WhoAmI error:', error.message);
    res.status(500).json({ error: 'Failed to get identity', details: error.message });
  }
});

// Fetch publishers API endpoint
app.get('/api/fetch-publishers', async (req, res) => {
  if (!req.session.token) {
    return res.status(401).json({ error: 'Authentication required', redirect: '/auth/login' });
  }
  const envUrl = req.query.url;
  if (!envUrl) return res.status(400).json({ error: 'Dataverse URL required' });
  
  try {
    const apiUrl = normalizeDataverseUrl(envUrl);
    const response = await axios.get(`${apiUrl}publishers?$select=publisherid,friendlyname,uniquename,customizationprefix&$top=100`, {
      headers: { 
        'Authorization': `Bearer ${req.session.token}`, 
        'Accept': 'application/json', 
        'OData-MaxVersion': '4.0', 
        'OData-Version': '4.0' 
      }
    });
    res.json({ publishers: response.data.value || [] });
  } catch (error) {
    console.error('Fetch publishers error:', error.message);
    if (error.response?.status === 401 || error.response?.status === 403) {
      req.session.token = null;
      return res.status(401).json({ error: 'Authentication failed', redirect: '/auth/login' });
    }
    res.status(500).json({ error: 'Failed to fetch publishers', message: error.message });
  }
});

// Generate docs POST
app.post('/generate-docs', async (req, res) => {
  if (!req.session.token) return res.status(401).send('Auth required');
  const envUrl = req.body.envUrl;
  const prefix = req.body.prefix || PUBLISHER_PREFIX;
  const useSchemaFile = req.body.useSchemaFile === 'true' || !!SCHEMA_FILE_PATH;
  
  res.send(`<!DOCTYPE html>
<html><head>
  <meta charset="utf-8">
  <title>Generating... - ${AGENCY_NAME}</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    body { font-family: 'Noto Sans', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f8f9fa; }
    .loading { text-align: center; }
    .spinner-border { width: 4rem; height: 4rem; color: ${AGENCY_HEADER_BG}; }
  </style>
</head>
<body>
  <div class="loading">
    <div class="spinner-border mb-3"></div>
    <h4>Generating API Documentation</h4>
    <p class="text-muted">${useSchemaFile ? 'Reading schema file...' : 'Fetching from Dataverse...'}</p>
    ${useSchemaFile ? '<span class="badge bg-success">Schema Mode</span>' : ''}
    ${prefix ? '<span class="badge bg-info ms-1">Prefix: ' + prefix + '</span>' : ''}
  </div>
  <script>
    fetch('/api/generate-openapi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: '${envUrl}', prefix: '${prefix}', useSchemaFile: ${useSchemaFile} })
    })
    .then(r => r.ok ? r.json() : r.json().then(e => { throw new Error(e.error || 'Failed'); }))
    .then(() => window.location.href = '/api-docs')
    .catch(e => document.body.innerHTML = '<div class="alert alert-danger m-5"><h4>Error</h4><p>' + e.message + '</p><a href="/" class="btn btn-primary">Back</a></div>');
  </script>
</body></html>`);
});

// Generate OpenAPI API endpoint
app.post('/api/generate-openapi', async (req, res) => {
  if (!req.session.token) return res.status(401).json({ error: 'Auth required', redirect: '/auth/login' });
  
  const envUrl = req.body.url;
  const prefix = req.body.prefix || PUBLISHER_PREFIX;
  const useSchemaFile = req.body.useSchemaFile || !!SCHEMA_FILE_PATH;
  
  try {
    if (!envUrl) throw new Error('Dataverse URL required');
    const apiUrl = normalizeDataverseUrl(envUrl);
    
    console.log(`Generating OpenAPI spec - URL: ${apiUrl}, Schema: ${useSchemaFile}, Prefix: ${prefix}`);
    
    let rawSpec;
    if (useSchemaFile && SCHEMA_FILE_PATH) {
      console.log('Using schema file method');
      rawSpec = generateOpenApiSpecFromSchemaFile(apiUrl, SCHEMA_FILE_PATH, prefix);
    } else {
      console.log('Using Dataverse query method');
      rawSpec = await generateSimpleOpenApiSpec(apiUrl, req.session.token, prefix);
    }
    
    // Apply path filter if not using schema file
    if (PATH_FILTER && !useSchemaFile) {
      openApiSpec = filterOpenApiByPattern(rawSpec, PATH_FILTER, { caseInsensitive: true });
    } else {
      openApiSpec = rawSpec;
    }
    
    req.session.openApiGenerated = true;
    req.session.prefix = prefix;
    
    // Save spec for debugging
    try {
      fs.writeFileSync(path.join(tempDir, 'openapi-spec.json'), JSON.stringify(openApiSpec, null, 2));
    } catch (e) { console.warn('Could not save spec:', e.message); }
    
    res.json({
      success: true,
      mode: useSchemaFile ? 'schema-file' : 'dataverse-query',
      paths: Object.keys(openApiSpec.paths || {}).length,
      schemas: Object.keys(openApiSpec.components?.schemas || {}).length
    });
  } catch (error) {
    console.error('OpenAPI generation error:', error);
    if (error.response?.status === 401 || error.response?.status === 403) {
      req.session.token = null;
      return res.status(401).json({ error: 'Auth failed', redirect: '/auth/login' });
    }
    res.status(500).json({ error: error.message });
  }
});

// API Docs route
app.get('/api-docs', (req, res) => {
  if (!openApiSpec) {
    return res.send(`<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;">
      <div class="text-center"><h4>No Documentation Available</h4><p>Please generate documentation first.</p><a href="/" class="btn btn-primary">Back</a></div>
    </body></html>`);
  }
  
  const authType = req.session.authType || 'user';
  const pathCount = Object.keys(openApiSpec.paths || {}).length;
  const schemaCount = Object.keys(openApiSpec.components?.schemas || {}).length;
  const isSchemaMode = SCHEMA_FILE_PATH && openApiSpec.info?.description?.includes('Schema File');
  
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>API Documentation - ${AGENCY_NAME}</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    :root { --agency-header-bg: ${AGENCY_HEADER_BG}; --agency-accent: ${AGENCY_ACCENT_COLOR}; }
    html { box-sizing: border-box; }
    body { margin: 0; padding: 0; font-family: 'Noto Sans', sans-serif; }
    .swagger-ui .topbar { display: none; }
    .gc-header { background: var(--agency-header-bg); padding: 0 20px; height: 70px; display: flex; align-items: center; justify-content: space-between; }
    .gc-header-logo { display: flex; align-items: center; gap: 15px; }
    .gc-header-logo-name { color: white; font-size: 1.25rem; font-weight: 700; }
    .gc-header-logo-text { color: white; font-size: 1.1rem; border-left: 2px solid rgba(255,255,255,0.3); padding-left: 15px; }
    .gc-header-nav a { color: white; text-decoration: none; padding: 8px 16px; border-radius: 4px; }
    .gc-header-nav a:hover { background: rgba(255,255,255,0.1); }
    .gc-red-bar { height: 4px; background: var(--agency-accent); }
    .info-bar { padding: 0.75rem 1rem; font-size: 0.9rem; border-bottom: 1px solid #ddd; }
    .info-bar.schema-mode { background: #cce5ff; }
    .info-bar.path-filter { background: #d4edda; }
    .token-helper { background: #fff3cd; border-bottom: 1px solid #ffc107; padding: 1rem; display: flex; justify-content: space-between; align-items: center; }
    .token-helper button { background: var(--agency-header-bg); color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; margin-left: 0.5rem; }
    .token-display { font-family: monospace; font-size: 0.85rem; background: #f8f9fa; padding: 0.5rem; border-radius: 4px; margin-top: 0.5rem; word-break: break-all; max-height: 100px; overflow-y: auto; display: none; }
    .toast { position: fixed; top: 20px; right: 20px; background: #28a745; color: white; padding: 1rem 1.5rem; border-radius: 4px; z-index: 10000; display: none; }
    .auth-badge { background: ${authType === 'application' ? AGENCY_ACCENT_COLOR : '#0d6efd'}; color: white; padding: 4px 10px; border-radius: 4px; font-size: 0.8rem; margin-left: 10px; }
  </style>
</head>
<body>
  <div id="toast" class="toast"></div>
  <header class="gc-header">
    <div class="gc-header-logo">
      <span class="gc-header-logo-name">${AGENCY_NAME}</span>
      <span class="gc-header-logo-text">API Documentation</span>
      <span class="auth-badge">${authType === 'application' ? 'Application' : 'User'}</span>
    </div>
    <nav class="gc-header-nav">
      <a href="/">Home</a>
      <a href="/auth/logout">Sign Out</a>
    </nav>
  </header>
  <div class="gc-red-bar"></div>
  
  ${isSchemaMode ? `<div class="info-bar schema-mode"><strong>📄 Schema Mode:</strong> <code>${path.basename(SCHEMA_FILE_PATH)}</code> — ${schemaCount} tables, ${pathCount} paths${PUBLISHER_PREFIX ? ` — Prefix: <code>${PUBLISHER_PREFIX}_</code>` : ''}</div>` : ''}
  ${PATH_FILTER && !isSchemaMode ? `<div class="info-bar path-filter"><strong>🔍 Path Filter:</strong> <code>${PATH_FILTER}</code> — ${pathCount} paths</div>` : ''}
  
  <div class="token-helper">
    <div style="flex:1;">
      <strong>🔑 Bearer Token:</strong> Click to copy your token for the Authorize button.
      <div id="tokenDisplay" class="token-display"></div>
    </div>
    <div>
      <button id="showTokenBtn" onclick="showToken()">Show Token</button>
      <button id="copyTokenBtn" onclick="copyToken()" style="display:none;">Copy</button>
      <button id="hideTokenBtn" onclick="hideToken()" style="display:none;">Hide</button>
    </div>
  </div>
  
  <div id="swagger-ui"></div>
  
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-standalone-preset.js"></script>
  <script>
    let currentToken = null;
    function showToast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 3000); }
    async function showToken() {
      document.getElementById('showTokenBtn').disabled = true;
      try {
        const r = await fetch('/api/current-token');
        const d = await r.json();
        currentToken = d.token;
        document.getElementById('tokenDisplay').textContent = currentToken;
        document.getElementById('tokenDisplay').style.display = 'block';
        document.getElementById('showTokenBtn').style.display = 'none';
        document.getElementById('copyTokenBtn').style.display = 'inline-block';
        document.getElementById('hideTokenBtn').style.display = 'inline-block';
        showToast('Token retrieved!');
      } catch (e) { showToast('Error: ' + e.message); document.getElementById('showTokenBtn').disabled = false; }
    }
    async function copyToken() {
      if (!currentToken) return;
      await navigator.clipboard.writeText(currentToken);
      showToast('Token copied!');
    }
    function hideToken() {
      document.getElementById('tokenDisplay').style.display = 'none';
      document.getElementById('showTokenBtn').style.display = 'inline-block';
      document.getElementById('showTokenBtn').disabled = false;
      document.getElementById('copyTokenBtn').style.display = 'none';
      document.getElementById('hideTokenBtn').style.display = 'none';
    }
    window.onload = function() {
      SwaggerUIBundle({
        url: "/swagger.json",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: "StandaloneLayout"
      });
    }
  </script>
</body>
</html>`);
});

// Swagger JSON endpoint
app.get('/swagger.json', (req, res) => {
  if (!openApiSpec) return res.status(404).json({ error: "No spec available" });
  res.json(openApiSpec);
});

// Current token API
app.get('/api/current-token', (req, res) => {
  if (!req.session.token) return res.status(401).json({ error: 'No token' });
  res.json({ token: req.session.token, expires: req.session.tokenExpires ? new Date(req.session.tokenExpires).toISOString() : 'Unknown' });
});

// Normalize Dataverse URL
function normalizeDataverseUrl(url) {
  let normalizedUrl = url.trim();
  if (!normalizedUrl.endsWith('/')) normalizedUrl += '/';
  if (!normalizedUrl.includes('/api/data/v')) {
    if (normalizedUrl.endsWith('/web/')) {
      normalizedUrl = normalizedUrl.replace(/web\/$/, 'api/data/v9.2/');
    } else {
      normalizedUrl += 'api/data/v9.2/';
    }
  }
  return normalizedUrl;
}

// Generate OpenAPI spec from Dataverse (original method)
async function generateSimpleOpenApiSpec(apiUrl, token, prefix) {
  try {
    const entitiesUrl = `${apiUrl}EntityDefinitions?$select=LogicalName,SchemaName,DisplayName,EntitySetName&$expand=Attributes($select=LogicalName,SchemaName,AttributeType,DisplayName)`;
    console.log(`Fetching entities from: ${entitiesUrl}`);
    
    const response = await axios.get(entitiesUrl, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' }
    });
    
    if (!response.data?.value) throw new Error('Failed to fetch entities');
    
    console.log(`Fetched ${response.data.value.length} entities`);
    
    // Filter by prefix
    let entities = prefix 
      ? response.data.value.filter(e => e.SchemaName?.toLowerCase().startsWith(prefix.toLowerCase()))
      : response.data.value;
    
    console.log(`After prefix filter: ${entities.length} entities`);
    
    // Test access permissions
    console.log('Testing entity access...');
    const accessibleEntities = [];
    const batchSize = 10;
    
    for (let i = 0; i < entities.length; i += batchSize) {
      const batch = entities.slice(i, i + batchSize);
      const results = await Promise.all(batch.map(async (entity) => {
        if (!entity.EntitySetName) return null;
        try {
          await axios.get(`${apiUrl}${entity.EntitySetName}?$top=0`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' },
            timeout: 5000
          });
          console.log(`✓ ${entity.SchemaName}`);
          return entity;
        } catch (error) {
          if (error.response?.status === 401 || error.response?.status === 403) {
            console.log(`✗ ${entity.SchemaName}`);
            return null;
          }
          return entity;
        }
      }));
      accessibleEntities.push(...results.filter(e => e !== null));
    }
    
    entities = accessibleEntities;
    console.log(`Accessible entities: ${entities.length}`);
    
    // Build spec
    const openApiSpec = {
      openapi: '3.0.0',
      info: {
        title: 'Dataverse OData API',
        version: '1.0.0',
        description: prefix ? `Filtered by prefix: ${prefix}` : 'Generated from Dataverse metadata'
      },
      servers: [{ url: apiUrl }],
      paths: {},
      components: {
        schemas: {},
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }
      },
      security: [{ bearerAuth: [] }]
    };
    
    entities.forEach(entity => {
      if (!entity.SchemaName || !entity.EntitySetName) return;
      
      const properties = {};
      if (entity.Attributes) {
        entity.Attributes.forEach(attr => {
          if (attr.SchemaName) properties[attr.SchemaName] = attributeTypeToOpenApiType(attr.AttributeType);
        });
      }
      
      openApiSpec.components.schemas[entity.SchemaName] = { type: 'object', properties };
      
      openApiSpec.paths[`/${entity.EntitySetName}`] = {
        get: {
          summary: `Get all ${entity.SchemaName}`,
          parameters: [
            { name: '$select', in: 'query', schema: { type: 'string' } },
            { name: '$filter', in: 'query', schema: { type: 'string' } },
            { name: '$orderby', in: 'query', schema: { type: 'string' } },
            { name: '$top', in: 'query', schema: { type: 'integer' } }
          ],
          responses: { '200': { description: 'Success', content: { 'application/json': { schema: { type: 'object', properties: { value: { type: 'array', items: { $ref: `#/components/schemas/${entity.SchemaName}` } } } } } } } }
        },
        post: {
          summary: `Create ${entity.SchemaName}`,
          requestBody: { content: { 'application/json': { schema: { $ref: `#/components/schemas/${entity.SchemaName}` } } } },
          responses: { '201': { description: 'Created' } }
        }
      };
      
      openApiSpec.paths[`/${entity.EntitySetName}({id})`] = {
        get: {
          summary: `Get ${entity.SchemaName} by ID`,
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Success', content: { 'application/json': { schema: { $ref: `#/components/schemas/${entity.SchemaName}` } } } } }
        },
        patch: {
          summary: `Update ${entity.SchemaName}`,
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { content: { 'application/json': { schema: { $ref: `#/components/schemas/${entity.SchemaName}` } } } },
          responses: { '204': { description: 'Updated' } }
        },
        delete: {
          summary: `Delete ${entity.SchemaName}`,
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '204': { description: 'Deleted' } }
        }
      };
    });
    
    return openApiSpec;
  } catch (error) {
    console.error('Error generating spec:', error);
    throw error;
  }
}

// Attribute type mapping
function attributeTypeToOpenApiType(attributeType) {
  if (!attributeType) return { type: 'string' };
  const typeMap = {
    'String': { type: 'string' }, 'Memo': { type: 'string' },
    'Integer': { type: 'integer', format: 'int32' }, 'BigInt': { type: 'integer', format: 'int64' },
    'Boolean': { type: 'boolean' },
    'Double': { type: 'number', format: 'double' }, 'Decimal': { type: 'number', format: 'double' }, 'Money': { type: 'number', format: 'double' },
    'DateTime': { type: 'string', format: 'date-time' }, 'Date': { type: 'string', format: 'date' },
    'Lookup': { type: 'string', format: 'uuid' }, 'Owner': { type: 'string', format: 'uuid' }, 'Customer': { type: 'string', format: 'uuid' }, 'Uniqueidentifier': { type: 'string', format: 'uuid' },
    'State': { type: 'integer' }, 'Status': { type: 'integer' }, 'Picklist': { type: 'integer' }
  };
  return typeMap[attributeType] || { type: 'string' };
}

// Helper for file size formatting
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

// =============================================================================
// PUBLIC FILE TO BASE64 CONVERTER
// =============================================================================

app.get('/file-converter', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>File to Base64 - ${AGENCY_NAME}</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>
    :root { --agency-header-bg: ${AGENCY_HEADER_BG}; --agency-accent: ${AGENCY_ACCENT_COLOR}; }
    body { font-family: 'Noto Sans', sans-serif; background: #f8f9fa; min-height: 100vh; display: flex; flex-direction: column; margin: 0; }
    .gc-header { background: var(--agency-header-bg); padding: 0 20px; height: 70px; display: flex; align-items: center; justify-content: space-between; }
    .gc-header-logo-name { color: white; font-size: 1.25rem; font-weight: 700; }
    .gc-header-logo-text { color: white; font-size: 1.1rem; border-left: 2px solid rgba(255,255,255,0.3); padding-left: 15px; margin-left: 15px; }
    .gc-header-nav a { color: white; text-decoration: none; padding: 8px 16px; }
    .gc-red-bar { height: 4px; background: var(--agency-accent); }
    .main-content { flex: 1; padding: 40px 20px; }
    .converter-container { max-width: 800px; margin: 0 auto; }
    .card { border: none; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .card-header { background: var(--agency-header-bg); color: white; font-weight: 600; }
    .upload-zone { border: 3px dashed #dee2e6; border-radius: 8px; padding: 40px; text-align: center; cursor: pointer; background: #fafafa; transition: all 0.3s; }
    .upload-zone:hover { border-color: var(--agency-header-bg); background: #f0f4f8; }
    .upload-zone.has-file { border-color: #28a745; background: #f0fff4; }
    .file-info { display: none; margin-top: 1rem; padding: 1rem; background: #e7f1ff; border-radius: 8px; }
    .file-info.show { display: block; }
    .btn-convert { background: var(--agency-header-bg); border-color: var(--agency-header-bg); color: white; padding: 12px 30px; }
    .result-section { display: none; margin-top: 2rem; }
    .result-section.show { display: block; }
    .base64-output { font-family: monospace; font-size: 0.75rem; background: #1e1e1e; color: #d4d4d4; padding: 1rem; border-radius: 8px; max-height: 300px; overflow-y: auto; word-break: break-all; }
    .copy-btn { background: var(--agency-accent); border-color: var(--agency-accent); color: white; }
    .gc-footer { background: var(--agency-header-bg); color: white; padding: 20px; text-align: center; margin-top: auto; }
    .toast { position: fixed; top: 90px; right: 20px; padding: 1rem 1.5rem; border-radius: 4px; z-index: 10000; display: none; }
    .toast.success { background: #28a745; color: white; }
    .toast.error { background: #dc3545; color: white; }
    .loading-spinner { display: none; }
    .loading-spinner.show { display: inline-block; }
  </style>
</head>
<body>
  <div id="toast" class="toast"></div>
  <header class="gc-header">
    <div style="display:flex;align-items:center;">
      <span class="gc-header-logo-name">${AGENCY_NAME}</span>
      <span class="gc-header-logo-text">File to Base64</span>
    </div>
    <nav class="gc-header-nav"><a href="/">API Explorer</a></nav>
  </header>
  <div class="gc-red-bar"></div>
  <main class="main-content">
    <div class="converter-container">
      <div class="card">
        <div class="card-header py-3"><h5 class="mb-0">📄 Convert File to Base64</h5></div>
        <div class="card-body p-4">
          <div class="upload-zone" id="uploadZone" onclick="document.getElementById('fileInput').click()">
            <div style="font-size:3rem;">📁</div>
            <h5>Drag & Drop your file here</h5>
            <p class="text-muted">or click to browse</p>
            <p class="text-muted"><strong>Allowed:</strong> PDF, DOCX, XLSX, PPTX (Max 50MB)</p>
            <input type="file" id="fileInput" style="display:none" accept=".pdf,.docx,.xlsx,.pptx">
          </div>
          <div class="file-info" id="fileInfo">
            <div class="d-flex justify-content-between align-items-center">
              <div><strong id="fileName">-</strong><br><small class="text-muted"><span id="fileSize">-</span> • <span id="fileType">-</span></small></div>
              <button class="btn btn-sm btn-outline-danger" onclick="clearFile()">✕ Clear</button>
            </div>
          </div>
          <div class="text-center mt-4">
            <button class="btn btn-convert btn-lg" id="convertBtn" disabled onclick="convertFile()">
              <span class="loading-spinner spinner-border spinner-border-sm me-2"></span>Convert to Base64
            </button>
          </div>
        </div>
      </div>
      <div class="result-section" id="resultSection">
        <div class="card">
          <div class="card-header py-3"><h5 class="mb-0">✅ Result</h5></div>
          <div class="card-body p-4">
            <div class="base64-output" id="base64Output"></div>
            <button class="btn copy-btn mt-3" onclick="copyResult()">📋 Copy Base64</button>
          </div>
        </div>
      </div>
    </div>
  </main>
  <footer class="gc-footer"><div>${AGENCY_BRANDING.footerText}</div></footer>
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/js/bootstrap.bundle.min.js"></script>
  <script>
    let selectedFile = null, conversionResult = null;
    function showToast(msg, type) { const t = document.getElementById('toast'); t.textContent = msg; t.className = 'toast ' + type; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 3000); }
    function formatSize(b) { if (!b) return '0 B'; const k = 1024, s = ['B', 'KB', 'MB', 'GB']; const i = Math.floor(Math.log(b) / Math.log(k)); return (b / Math.pow(k, i)).toFixed(2) + ' ' + s[i]; }
    function validateFile(f) {
      const ext = '.' + f.name.split('.').pop().toLowerCase();
      if (!['.pdf', '.docx', '.xlsx', '.pptx'].includes(ext)) { showToast('Invalid type', 'error'); return false; }
      if (f.size > 50 * 1024 * 1024) { showToast('Too large', 'error'); return false; }
      return true;
    }
    function handleFile(f) {
      if (!validateFile(f)) return;
      selectedFile = f;
      document.getElementById('fileName').textContent = f.name;
      document.getElementById('fileSize').textContent = formatSize(f.size);
      document.getElementById('fileType').textContent = f.name.split('.').pop().toUpperCase();
      document.getElementById('fileInfo').classList.add('show');
      document.getElementById('uploadZone').classList.add('has-file');
      document.getElementById('convertBtn').disabled = false;
      document.getElementById('resultSection').classList.remove('show');
    }
    function clearFile() {
      selectedFile = null; conversionResult = null;
      document.getElementById('fileInput').value = '';
      document.getElementById('fileInfo').classList.remove('show');
      document.getElementById('uploadZone').classList.remove('has-file');
      document.getElementById('convertBtn').disabled = true;
      document.getElementById('resultSection').classList.remove('show');
    }
    document.getElementById('fileInput').addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });
    document.getElementById('uploadZone').addEventListener('dragover', e => { e.preventDefault(); e.currentTarget.style.borderColor = '${AGENCY_ACCENT_COLOR}'; });
    document.getElementById('uploadZone').addEventListener('dragleave', e => { e.preventDefault(); e.currentTarget.style.borderColor = '#dee2e6'; });
    document.getElementById('uploadZone').addEventListener('drop', e => { e.preventDefault(); e.currentTarget.style.borderColor = '#dee2e6'; if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });
    async function convertFile() {
      if (!selectedFile) return;
      const spinner = document.querySelector('.loading-spinner');
      spinner.classList.add('show');
      document.getElementById('convertBtn').disabled = true;
      const fd = new FormData(); fd.append('file', selectedFile);
      try {
        const r = await fetch('/api/public/file-to-base64', { method: 'POST', body: fd });
        const d = await r.json();
        if (!r.ok) throw new Error(d.message || 'Failed');
        conversionResult = d;
        document.getElementById('base64Output').textContent = d.base64;
        document.getElementById('resultSection').classList.add('show');
        document.getElementById('resultSection').scrollIntoView({ behavior: 'smooth' });
        showToast('Converted!', 'success');
      } catch (e) { showToast(e.message, 'error'); }
      finally { spinner.classList.remove('show'); document.getElementById('convertBtn').disabled = false; }
    }
    async function copyResult() {
      if (!conversionResult) return;
      await navigator.clipboard.writeText(conversionResult.base64);
      showToast('Copied!', 'success');
    }
  </script>
</body>
</html>`);
});

// Public file conversion API
app.post('/api/public/file-to-base64', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file', message: 'Upload PDF, DOCX, XLSX, or PPTX' });
    const base64String = req.file.buffer.toString('base64');
    const ext = path.extname(req.file.originalname).toLowerCase();
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    };
    const mimeType = mimeTypes[ext] || req.file.mimetype;
    console.log(`File converted: ${req.file.originalname} (${req.file.size} bytes)`);
    res.json({
      success: true,
      filename: req.file.originalname,
      mimeType: mimeType,
      size: req.file.size,
      sizeFormatted: formatBytes(req.file.size),
      base64: base64String,
      dataUri: `data:${mimeType};base64,${base64String}`
    });
  } catch (error) {
    console.error('Conversion error:', error);
    res.status(500).json({ error: 'Conversion failed', message: error.message });
  }
});

// Error handler for multer
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large', message: 'Max 50MB' });
    return res.status(400).json({ error: 'Upload error', message: error.message });
  }
  if (error.message?.includes('Invalid file type')) return res.status(400).json({ error: 'Invalid type', message: error.message });
  next(error);
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  ${AGENCY_NAME} - Dataverse API Explorer
║  Server running on http://localhost:${port}
║                                                            
║  Configuration:                                  
║  - Dataverse URL: ${process.env.dataverse_url ? '✓' : '✗'}
║  - Client Secret: ${process.env.client_secret ? '✓' : '✗'}
║  - Path Filter: ${PATH_FILTER || 'None'}
║  - Schema File: ${SCHEMA_FILE_PATH || 'None (Dataverse query)'}
║  - Publisher Prefix: ${PUBLISHER_PREFIX || 'None'}
╚════════════════════════════════════════════════════════════╝
`);
});