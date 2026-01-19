// server.js - With publisher dropdown feature, dual authentication, and path filtering
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
// Set this to filter OpenAPI paths. Supports:
// - Simple string: 'digitalsignature' (case-insensitive contains)
// - Regex pattern: '(digitalsignature|document)' (multiple patterns)
// - Empty string or null: No filtering (show all paths)
const PATH_FILTER = process.env.PATH_FILTER || 'digitalsignature';

/**
 * Filter OpenAPI spec to include only paths matching a pattern
 * @param {Object} openApiSpec - The full OpenAPI specification object
 * @param {string|RegExp} pattern - Pattern to match (string for case-insensitive contains, or RegExp)
 * @param {Object} options - Additional options
 * @returns {Object} Filtered OpenAPI specification
 */
function filterOpenApiByPattern(openApiSpec, pattern, options = {}) {
  const { caseInsensitive = true, cleanupSchemas = true } = options;
  
  if (!pattern || !openApiSpec || !openApiSpec.paths) {
    console.log('No path filter applied (empty pattern or no paths)');
    return openApiSpec;
  }

  // Create a deep copy to avoid mutating the original
  const filteredSpec = JSON.parse(JSON.stringify(openApiSpec));
  
  // Build the regex pattern
  let regex;
  if (pattern instanceof RegExp) {
    regex = pattern;
  } else {
    // Escape special regex characters and create pattern
    const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    regex = new RegExp(escapedPattern, caseInsensitive ? 'i' : '');
  }

  // Count for logging
  const originalPathCount = Object.keys(filteredSpec.paths).length;
  const matchedPaths = [];
  const filteredOutPaths = [];

  // Filter paths
  const newPaths = {};
  for (const [pathKey, pathItem] of Object.entries(filteredSpec.paths)) {
    if (regex.test(pathKey)) {
      newPaths[pathKey] = pathItem;
      matchedPaths.push(pathKey);
    } else {
      filteredOutPaths.push(pathKey);
    }
  }

  filteredSpec.paths = newPaths;

  // Log filtering results
  console.log('\n' + '='.repeat(80));
  console.log(`PATH FILTER APPLIED: "${pattern}"`);
  console.log('='.repeat(80));
  console.log(`Original paths: ${originalPathCount}`);
  console.log(`Matched paths: ${matchedPaths.length}`);
  console.log(`Filtered out: ${filteredOutPaths.length}`);
  
  if (matchedPaths.length > 0 && matchedPaths.length <= 50) {
    console.log('\nMatched paths:');
    matchedPaths.forEach(p => console.log(`  ✓ ${p}`));
  } else if (matchedPaths.length > 50) {
    console.log(`\nFirst 20 matched paths:`);
    matchedPaths.slice(0, 20).forEach(p => console.log(`  ✓ ${p}`));
    console.log(`  ... and ${matchedPaths.length - 20} more`);
  } else if (matchedPaths.length === 0) {
    console.log('\n⚠️  WARNING: No paths matched the filter!');
    console.log('First 10 available paths:');
    filteredOutPaths.slice(0, 10).forEach(p => console.log(`  - ${p}`));
  }
  console.log('='.repeat(80) + '\n');

  // Optionally clean up unused schemas/components
  if (cleanupSchemas && filteredSpec.components?.schemas) {
    const usedSchemas = findUsedSchemas(filteredSpec);
    const originalSchemaCount = Object.keys(filteredSpec.components.schemas).length;
    
    for (const schemaName of Object.keys(filteredSpec.components.schemas)) {
      if (!usedSchemas.has(schemaName)) {
        delete filteredSpec.components.schemas[schemaName];
      }
    }
    
    const remainingSchemaCount = Object.keys(filteredSpec.components.schemas).length;
    console.log(`Schemas cleaned: ${originalSchemaCount} → ${remainingSchemaCount} (removed ${originalSchemaCount - remainingSchemaCount} unused)`);
  }

  // Update the description to indicate filtering
  if (filteredSpec.info) {
    filteredSpec.info.description = (filteredSpec.info.description || '') + 
      `\n\n**Path Filter Applied:** \`${pattern}\` (${matchedPaths.length} paths)`;
  }

  return filteredSpec;
}

/**
 * Find all schemas referenced in the OpenAPI spec
 * @param {Object} spec - OpenAPI specification
 * @returns {Set<string>} Set of schema names that are used
 */
function findUsedSchemas(spec) {
  const usedSchemas = new Set();
  const schemaRefPattern = /#\/components\/schemas\/([^"'}\s]+)/g;
  
  // Convert spec to string and find all $ref occurrences
  const specString = JSON.stringify(spec);
  let match;
  while ((match = schemaRefPattern.exec(specString)) !== null) {
    usedSchemas.add(match[1]);
  }
  
  // Recursively find schemas referenced by other schemas
  let prevSize = 0;
  while (usedSchemas.size > prevSize) {
    prevSize = usedSchemas.size;
    for (const schemaName of [...usedSchemas]) {
      const schema = spec.components?.schemas?.[schemaName];
      if (schema) {
        const schemaString = JSON.stringify(schema);
        let innerMatch;
        const innerPattern = /#\/components\/schemas\/([^"'}\s]+)/g;
        while ((innerMatch = innerPattern.exec(schemaString)) !== null) {
          usedSchemas.add(innerMatch[1]);
        }
      }
    }
  }
  
  return usedSchemas;
}

// =============================================================================
// END PATH FILTER CONFIGURATION
// =============================================================================

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
      logLevel: 3, // Error
    }
  }
};

let cca = new msal.ConfidentialClientApplication(msalConfig);

// Global variable to store OpenAPI spec
let openApiSpec = null;

// Authentication middleware to check token validity
function checkAuthentication(req, res, next) {
  // Skip authentication for public routes
  const publicPaths = ['/', '/auth/login', '/auth/callback', '/auth/logout', '/auth/app-login'];
  if (publicPaths.includes(req.path)) {
    return next();
  }
  
  // Check for token
  if (!req.session.token) {
    console.log('No token found, redirecting to login');
    // For API requests, return 401
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ 
        error: 'Authentication required',
        redirect: '/auth/login'
      });
    }
    // For regular routes, redirect to login
    return res.redirect('/auth/login');
  }
  
  // Check if token is expired
  if (req.session.tokenExpires && Date.now() > req.session.tokenExpires) {
    console.log('Token expired, clearing session and redirecting to login');
    // Clear the session
    req.session.token = null;
    req.session.tokenExpires = null;
    
    // For API requests, return 401
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ 
        error: 'Authentication expired',
        redirect: '/auth/login'
      });
    }
    // For regular routes, redirect to login
    return res.redirect('/auth/login');
  }
  
  // Token is valid, proceed
  next();
}

// Add this middleware to your Express app
app.use(checkAuthentication);

// Elections Canada Branding Configuration
const EC_BRANDING = {
  headerBgColor: '#26374a',
  headerHeight: '80px',
  accentColor: '#af3c43',  // Elections Canada red
  logoAlt: 'Elections Canada',
  // SVG logo inline for Elections Canada (maple leaf with X)
  logoSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50" height="40">
    <style>.ec-text{fill:#fff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold}</style>
    <!-- Maple Leaf Outline -->
    <path fill="#fff" d="M15,45 L18,35 L12,32 L18,30 L15,25 L20,27 L22,20 L25,27 L30,22 L28,28 L35,30 L28,32 L32,35 L25,35 L25,45 Z"/>
    <!-- X Mark -->
    <g transform="translate(30,15)">
      <rect x="0" y="8" width="20" height="4" fill="#fff" transform="rotate(-45 10 10)"/>
      <rect x="0" y="8" width="20" height="4" fill="#fff" transform="rotate(45 10 10)"/>
    </g>
    <!-- Text -->
    <text x="55" y="32" class="ec-text">Elections Canada</text>
  </svg>`,
  footerText: '© Elections Canada'
};

// Common CSS for Elections Canada branding
const EC_COMMON_STYLES = `
  :root {
    --ec-header-bg: ${EC_BRANDING.headerBgColor};
    --ec-accent: ${EC_BRANDING.accentColor};
    --gc-blue: #26374a;
    --gc-red: #af3c43;
  }
  
  * {
    box-sizing: border-box;
  }
  
  body {
    margin: 0;
    padding: 0;
    font-family: 'Noto Sans', Arial, sans-serif;
    background-color: #f8f9fa;
  }
  
  .gc-header {
    background-color: var(--ec-header-bg);
    padding: 0 20px;
    height: ${EC_BRANDING.headerHeight};
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
  
  .gc-header-logo {
    display: flex;
    align-items: center;
    gap: 15px;
  }
  
  .gc-header-logo svg {
    height: 40px;
  }
  
  .gc-header-logo-text {
    color: white;
    font-size: 1.25rem;
    font-weight: 600;
    border-left: 2px solid rgba(255,255,255,0.3);
    padding-left: 15px;
    margin-left: 5px;
  }
  
  .gc-header-nav {
    display: flex;
    align-items: center;
    gap: 15px;
  }
  
  .gc-header-nav a {
    color: white;
    text-decoration: none;
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 0.9rem;
    transition: background-color 0.2s;
  }
  
  .gc-header-nav a:hover {
    background-color: rgba(255,255,255,0.1);
  }
  
  .gc-red-bar {
    height: 4px;
    background-color: var(--gc-red);
  }
  
  .gc-footer {
    background-color: var(--ec-header-bg);
    color: white;
    padding: 20px;
    text-align: center;
    font-size: 0.85rem;
    margin-top: auto;
  }
  
  .gc-footer a {
    color: white;
    text-decoration: underline;
  }
  
  .ec-logo-img {
    height: 45px;
    width: auto;
  }
  
  .badge-ec {
    background-color: var(--gc-red);
    color: white;
  }
`;

// Home route - Login or Dashboard
app.get('/', (req, res) => {
  if (!req.session.token) {
    // Login page with Elections Canada branding
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>API Explorer - Elections Canada</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" rel="stylesheet">
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
          ${EC_COMMON_STYLES}
          
          html, body {
            height: 100%;
          }
          
          .page-wrapper {
            min-height: 100%;
            display: flex;
            flex-direction: column;
          }
          
          .main-content {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 40px 20px;
          }
          
          .form-signin {
            width: 100%;
            max-width: 480px;
          }
          
          .auth-divider {
            display: flex;
            align-items: center;
            text-align: center;
            margin: 1.5rem 0;
          }
          
          .auth-divider::before,
          .auth-divider::after {
            content: '';
            flex: 1;
            border-bottom: 1px solid #dee2e6;
          }
          
          .auth-divider span {
            padding: 0 1rem;
            color: #6c757d;
            font-size: 0.875rem;
          }
          
          .auth-option {
            margin-bottom: 1rem;
          }
          
          .auth-option .btn {
            position: relative;
            padding-left: 2.5rem;
          }
          
          .auth-option .btn-icon {
            position: absolute;
            left: 1rem;
            top: 50%;
            transform: translateY(-50%);
          }
          
          .btn-ec-primary {
            background-color: var(--gc-blue);
            border-color: var(--gc-blue);
            color: white;
          }
          
          .btn-ec-primary:hover {
            background-color: #1c2a38;
            border-color: #1c2a38;
            color: white;
          }
          
          .btn-ec-secondary {
            background-color: var(--gc-red);
            border-color: var(--gc-red);
            color: white;
          }
          
          .btn-ec-secondary:hover {
            background-color: #8f3238;
            border-color: #8f3238;
            color: white;
          }
          
          .filter-badge {
            background-color: var(--gc-red);
            color: white;
            padding: 0.25rem 0.75rem;
            border-radius: 0.25rem;
            font-size: 0.8rem;
            margin-top: 0.5rem;
            display: inline-block;
          }
          
          .card {
            border: none;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }
          
          .page-title {
            color: var(--gc-blue);
            font-weight: 600;
          }
        </style>
      </head>
      <body>
        <div class="page-wrapper">
          <header class="gc-header">
            <div class="gc-header-logo">
              <span style="color: white; font-size: 1.25rem; font-weight: 600;">Elections Canada</span>
              <span class="gc-header-logo-text">API Explorer</span>
            </div>
            <nav class="gc-header-nav">
              <a href="https://www.elections.ca" target="_blank">Elections.ca</a>
            </nav>
          </header>
          <div class="gc-red-bar"></div>
          
          <main class="main-content">
            <div class="form-signin text-center">
              <h1 class="h3 mb-3 page-title">Dataverse API Explorer</h1>
              <p class="mb-3 text-muted">Access documentation for Elections Canada Dataverse APIs</p>
              
              ${PATH_FILTER ? `<div class="filter-badge">🔍 Path Filter: "${PATH_FILTER}"</div>` : ''}
              
              <div class="card p-4 mt-3">
                <form method="POST" action="/set-tenant" class="text-start mb-3">
                  <div class="form-floating mb-3">
                    <input type="text" class="form-control" id="tenantId" name="tenantId" 
                           placeholder="00000000-0000-0000-0000-000000000000" 
                           value="${azureConfig.tenantId}">
                    <label for="tenantId">Azure AD Tenant ID (Optional)</label>
                  </div>
                  <button type="submit" class="w-100 btn btn-outline-secondary">Set Tenant ID</button>
                </form>
                
                <div class="auth-divider">
                  <span>Choose Authentication Method</span>
                </div>
                
                <div class="auth-option">
                  <a href="/auth/login" class="w-100 btn btn-lg btn-ec-primary">
                    <span class="btn-icon">👤</span>
                    Sign in as User
                  </a>
                  <small class="text-muted d-block mt-1">Uses your user account and security roles</small>
                </div>
                
                <div class="auth-option">
                  <a href="/auth/app-login" class="w-100 btn btn-lg btn-ec-secondary">
                    <span class="btn-icon">🔑</span>
                    Sign in as Application
                  </a>
                  <small class="text-muted d-block mt-1">Uses app registration identity and permissions</small>
                </div>
              </div>
            </div>
          </main>
          
          <footer class="gc-footer">
            <div>${EC_BRANDING.footerText}</div>
          </footer>
        </div>
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/js/bootstrap.bundle.min.js"></script>
      </body>
      </html>
    `);
  } else {
    // Show auth type in dashboard
    const authType = req.session.authType || 'user';
    const authBadge = authType === 'application' 
      ? '<span class="badge badge-ec">Application Identity</span>' 
      : '<span class="badge bg-primary">User Identity</span>';
    
    // Dashboard page with Elections Canada branding
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>API Explorer - Elections Canada</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" rel="stylesheet">
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
          ${EC_COMMON_STYLES}
          
          html, body {
            height: 100%;
          }
          
          .page-wrapper {
            min-height: 100%;
            display: flex;
            flex-direction: column;
          }
          
          .main-content {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 40px 20px;
          }
          
          .container-form {
            width: 100%;
            max-width: 600px;
          }
          
          .publisher-loading {
            display: none;
            margin-left: 10px;
          }
          
          .alert {
            margin-bottom: 20px;
          }
          
          .auth-status {
            text-align: center;
            margin-bottom: 1rem;
          }
          
          .filter-info {
            background-color: #d4edda;
            border: 1px solid #c3e6cb;
            border-radius: 0.25rem;
            padding: 0.75rem;
            margin-bottom: 1rem;
            font-size: 0.875rem;
          }
          
          .filter-info code {
            background-color: #fff;
            padding: 0.125rem 0.25rem;
            border-radius: 0.125rem;
            color: var(--gc-red);
          }
          
          .card {
            border: none;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }
          
          .card-title {
            color: var(--gc-blue);
            font-weight: 600;
          }
          
          .btn-ec-primary {
            background-color: var(--gc-blue);
            border-color: var(--gc-blue);
            color: white;
          }
          
          .btn-ec-primary:hover {
            background-color: #1c2a38;
            border-color: #1c2a38;
            color: white;
          }
          
          .page-title {
            color: var(--gc-blue);
            font-weight: 600;
          }
          
          .badge-ec {
            background-color: var(--gc-red) !important;
            color: white;
          }
        </style>
      </head>
      <body>
        <div class="page-wrapper">
          <header class="gc-header">
            <div class="gc-header-logo">
              <span style="color: white; font-size: 1.25rem; font-weight: 600;">Elections Canada</span>
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
              <div class="auth-status">
                <small class="text-muted">Authenticated with: ${authBadge}</small>
              </div>
              
              <h1 class="h3 mb-3 page-title text-center">Generate API Documentation</h1>
              
              ${PATH_FILTER ? `
              <div class="filter-info">
                <strong>🔍 Path Filter Active:</strong> Only paths containing <code>${PATH_FILTER}</code> will be shown in the generated documentation.
              </div>
              ` : ''}
              
              <div id="statusMessages"></div>
              
              <div class="card">
                <div class="card-body">
                  <h5 class="card-title mb-3">Enter Your Dataverse Environment URL</h5>
                  <form method="POST" action="/generate-docs" class="p-2" id="apiForm">
                    <div class="form-floating mb-3">
                      <input type="text" class="form-control" id="envUrl" name="envUrl" 
                             placeholder="https://your-org.crm.dynamics.com/" 
                             value="${process.env.dataverse_url || ''}" required>
                      <label for="envUrl">Dataverse Environment URL</label>
                    </div>
                    <div class="mb-3">
                      <label for="publisherDropdown" class="form-label">Publisher (Optional)</label>
                      <div class="input-group">
                        <select class="form-select" id="publisherDropdown" name="publisherDropdown">
                          <option value="">All Publishers (No Filter)</option>
                        </select>
                        <button class="btn btn-outline-secondary" type="button" id="loadPublishers">
                          Load Publishers
                        </button>
                        <div class="spinner-border text-primary publisher-loading" role="status" id="publisherLoading">
                          <span class="visually-hidden">Loading...</span>
                        </div>
                      </div>
                      <div class="form-text">
                        Filter tables by publisher. The prefix will be automatically filled in.
                      </div>
                      <input type="hidden" id="prefix" name="prefix" value="">
                    </div>
                    <button class="w-100 btn btn-lg btn-ec-primary" type="submit">Generate API Docs</button>
                  </form>
                  
                  <!-- Debug Section -->
                  <div class="mt-3 pt-3 border-top">
                    <button class="btn btn-sm btn-outline-secondary" onclick="checkIdentity()">
                      🔍 Check Current Identity
                    </button>
                    <div id="identityInfo" class="mt-2" style="display: none;">
                      <pre class="bg-light p-2 small" style="max-height: 200px; overflow-y: auto;"></pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </main>
          
          <footer class="gc-footer">
            <div>${EC_BRANDING.footerText}</div>
          </footer>
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
            } catch (error) {
              console.error('Error checking identity:', error);
              alert('Error checking identity. See console for details.');
            }
          }
          
          document.addEventListener('DOMContentLoaded', function() {
            const publisherDropdown = document.getElementById('publisherDropdown');
            const loadPublishersBtn = document.getElementById('loadPublishers');
            const publisherLoading = document.getElementById('publisherLoading');
            const envUrlInput = document.getElementById('envUrl');
            const prefixInput = document.getElementById('prefix');
            const apiForm = document.getElementById('apiForm');
            const statusMessages = document.getElementById('statusMessages');
            
            // Function to show status message
            function showStatusMessage(message, type = 'info') {
              const alertDiv = document.createElement('div');
              alertDiv.className = \`alert alert-\${type} alert-dismissible fade show\`;
              alertDiv.innerHTML = \`
                \${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
              \`;
              statusMessages.appendChild(alertDiv);
              
              // Auto-dismiss after 5 seconds
              setTimeout(() => {
                const bsAlert = new bootstrap.Alert(alertDiv);
                bsAlert.close();
              }, 5000);
            }
            
            // Function to load publishers from the API
            loadPublishersBtn.addEventListener('click', function() {
              const envUrl = envUrlInput.value.trim();
              if (!envUrl) {
                showStatusMessage('Please enter a Dataverse Environment URL first', 'warning');
                return;
              }
              
              // Show loading spinner
              publisherLoading.style.display = 'inline-block';
              loadPublishersBtn.disabled = true;
              loadPublishersBtn.textContent = 'Loading...';
              
              // Fetch publishers
              fetch('/api/fetch-publishers?url=' + encodeURIComponent(envUrl))
                .then(response => {
                  if (!response.ok) {
                    return response.json().then(errorData => {
                      if (response.status === 401 && errorData.redirect) {
                        sessionStorage.setItem('returnUrl', window.location.href);
                        window.location.href = errorData.redirect;
                        throw new Error('Authentication required. Redirecting to login...');
                      }
                      throw new Error(errorData.error || 'Failed to load publishers. Status: ' + response.status);
                    });
                  }
                  return response.json();
                })
                .then(data => {
                  while (publisherDropdown.options.length > 1) {
                    publisherDropdown.remove(1);
                  }
                  
                  if (data.publishers && data.publishers.length > 0) {
                    data.publishers.forEach(publisher => {
                      const option = document.createElement('option');
                      option.value = publisher.customizationprefix || '';
                      let displayText = publisher.friendlyname || publisher.uniquename || '';
                      if (publisher.customizationprefix) {
                        displayText += ' (' + publisher.customizationprefix + '_)';
                      }
                      option.textContent = displayText;
                      publisherDropdown.appendChild(option);
                    });
                    showStatusMessage(\`Successfully loaded \${data.publishers.length} publishers\`, 'success');
                  } else {
                    showStatusMessage('No publishers found in this environment', 'warning');
                  }
                })
                .catch(error => {
                  console.error('Error:', error);
                  if (!error.message.includes('Redirecting to login')) {
                    showStatusMessage('Error loading publishers: ' + error.message, 'danger');
                  }
                })
                .finally(() => {
                  publisherLoading.style.display = 'none';
                  loadPublishersBtn.disabled = false;
                  loadPublishersBtn.textContent = 'Load Publishers';
                });
            });
            
            publisherDropdown.addEventListener('change', function() {
              const selectedPrefix = this.value;
              prefixInput.value = selectedPrefix ? (selectedPrefix + '_') : '';
              if (selectedPrefix) {
                showStatusMessage(\`Selected publisher prefix: \${selectedPrefix}_\`, 'info');
              }
            });
            
            if (sessionStorage.getItem('returnUrl')) {
              sessionStorage.removeItem('returnUrl');
              showStatusMessage('Authentication successful! You can now load publishers.', 'success');
            }
          });
        </script>
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
  // Log the login attempt
  console.log('Auth login route accessed');
  console.log('Using redirect URI:', azureConfig.redirectUri);
  
  const authCodeUrlParameters = {
    scopes: azureConfig.scopes,
    redirectUri: azureConfig.redirectUri,
  };

  console.log('Auth parameters:', JSON.stringify(authCodeUrlParameters, null, 2));

  cca.getAuthCodeUrl(authCodeUrlParameters)
    .then((response) => {
      console.log('Redirecting to Microsoft authentication:', response);
      res.redirect(response);
    })
    .catch((error) => {
      console.error('Auth Code URL Error:', error);
      res.status(500).send(`
        <html>
          <head>
            <title>Authentication Error</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" rel="stylesheet">
          </head>
          <body class="bg-light p-5">
            <div class="container">
              <div class="alert alert-danger">
                <h4>Authentication Error</h4>
                <p>${error.message || 'Error during authentication'}</p>
                <pre>${JSON.stringify(error, null, 2)}</pre>
                <a href="/" class="btn btn-primary">Return to Home</a>
              </div>
            </div>
          </body>
        </html>
      `);
    });
});

// Application-only authentication (uses app identity, not user identity)
app.get('/auth/app-login', async (req, res) => {
  console.log('App-only authentication initiated');
  
  try {
    const clientCredentialRequest = {
      scopes: azureConfig.appScopes,
    };

    const response = await cca.acquireTokenByClientCredential(clientCredentialRequest);
    
    if (response && response.accessToken) {
      console.log('='.repeat(80));
      console.log('APP-ONLY TOKEN ACQUIRED (Application Identity):');
      console.log('='.repeat(80));
      console.log(response.accessToken);
      console.log('='.repeat(80));
      
      req.session.token = response.accessToken;
      req.session.authType = 'application';
      openApiSpec = null; // Clear any cached spec
      req.session.openApiGenerated = false;
      
      // Store token expiration
      const expiresIn = response.expiresOn ? new Date(response.expiresOn).getTime() - Date.now() : 3600 * 1000;
      req.session.tokenExpires = Date.now() + expiresIn;
      
      console.log(`Token will expire in ${Math.floor(expiresIn / 1000 / 60)} minutes`);
      console.log(`Token expires at: ${new Date(req.session.tokenExpires).toISOString()}`);
      console.log('='.repeat(80));
      
      res.redirect('/');
    } else {
      throw new Error('No token received from authentication');
    }
  } catch (error) {
    console.error('App Authentication Error:', error);
    res.status(500).send(`
      <html>
        <head>
          <title>Authentication Error</title>
          <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" rel="stylesheet">
        </head>
        <body class="bg-light p-5">
          <div class="container">
            <div class="alert alert-danger">
              <h4>Application Authentication Error</h4>
              <p>${error.message || 'Error during application authentication'}</p>
              <pre>${JSON.stringify(error, null, 2)}</pre>
              <p class="mt-3"><strong>Note:</strong> Make sure your App Registration has the user_impersonation delegated permission for Dynamics CRM with admin consent granted, and that you've created an Application User in Power Platform Admin Center with the appropriate security roles.</p>
              <a href="/" class="btn btn-primary">Return to Home</a>
            </div>
          </div>
        </body>
      </html>
    `);
  }
});

app.get('/auth/callback', (req, res) => {
  console.log('Auth callback received');
  
  const tokenRequest = {
    code: req.query.code,
    scopes: azureConfig.scopes,
    redirectUri: azureConfig.redirectUri,
  };

  cca.acquireTokenByCode(tokenRequest)
    .then((response) => {
      console.log('Token acquired successfully');
      console.log('='.repeat(80));
      console.log('NEW BEARER TOKEN ACQUIRED:');
      console.log('='.repeat(80));
      console.log(response.accessToken);
      console.log('='.repeat(80));
      
      req.session.token = response.accessToken;
      req.session.authType = 'user';
      openApiSpec = null; // Clear any cached spec
      req.session.openApiGenerated = false;
      
      // Store token expiration
      const expiresIn = response.expiresOn ? new Date(response.expiresOn).getTime() - Date.now() : 3600 * 1000;
      req.session.tokenExpires = Date.now() + expiresIn;
      
      console.log(`Token will expire in ${Math.floor(expiresIn / 1000 / 60)} minutes`);
      console.log(`Token expires at: ${new Date(req.session.tokenExpires).toISOString()}`);
      console.log('='.repeat(80));
      
      // Redirect back to the dashboard
      res.redirect('/');
    })
    .catch((error) => {
      console.error('Token Acquisition Error:', error);
      res.status(500).send(`
        <html>
          <head>
            <title>Authentication Error</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" rel="stylesheet">
          </head>
          <body class="bg-light p-5">
            <div class="container">
              <div class="alert alert-danger">
                <h4>Token Acquisition Error</h4>
                <p>${error.message || 'Error acquiring token'}</p>
                <a href="/" class="btn btn-primary">Return to Home</a>
              </div>
            </div>
          </body>
        </html>
      `);
    });
});

app.get('/auth/logout', (req, res) => {
  // Clear all session data
  req.session.token = null;
  req.session.tokenExpires = null;
  req.session.authType = null;
  req.session.openApiGenerated = null;
  req.session.prefix = null;
  
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/');
  });
});

// Debug endpoint to check current authentication details
app.get('/api/whoami', async (req, res) => {
  if (!req.session.token) {
    return res.status(401).json({ error: 'No token available' });
  }

  try {
    // Decode JWT to see claims
    const tokenParts = req.session.token.split('.');
    const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
    
    // Call Dataverse WhoAmI function to see the actual user
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
      sessionAuthType: req.session.authType,
      pathFilter: PATH_FILTER || 'None',
      tokenClaims: {
        appid: payload.appid,
        oid: payload.oid,
        upn: payload.upn || 'N/A (Application)',
        unique_name: payload.unique_name || 'N/A',
        app_displayname: payload.app_displayname || 'N/A'
      },
      dataverseIdentity: {
        UserId: whoAmIResponse.data.UserId,
        BusinessUnitId: whoAmIResponse.data.BusinessUnitId,
        OrganizationId: whoAmIResponse.data.OrganizationId
      }
    });
  } catch (error) {
    console.error('WhoAmI error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to get identity info',
      details: error.response?.data || error.message 
    });
  }
});

// API endpoint to check security role privileges
app.get('/api/check-privileges', async (req, res) => {
  if (!req.session.token) {
    return res.status(401).json({ error: 'No token available' });
  }

  try {
    const apiUrl = normalizeDataverseUrl(process.env.dataverse_url);
    
    // Get current user info
    const whoAmI = await axios.get(`${apiUrl}WhoAmI`, {
      headers: { 
        'Authorization': `Bearer ${req.session.token}`,
        'Accept': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0'
      }
    });
    
    const userId = whoAmI.data.UserId;
    
    // Get user's security roles
    const rolesQuery = `${apiUrl}systemuserrolescollection?$filter=systemuserid eq ${userId}&$expand=roleid($select=name,roleid)`;
    
    const rolesResponse = await axios.get(rolesQuery, {
      headers: { 
        'Authorization': `Bearer ${req.session.token}`,
        'Accept': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0'
      }
    });
    
    res.json({
      userId: userId,
      authType: req.session.authType,
      securityRoles: rolesResponse.data.value.map(r => ({
        roleId: r.roleid?.roleid,
        roleName: r.roleid?.name
      }))
    });
  } catch (error) {
    console.error('Check privileges error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to check privileges',
      details: error.response?.data || error.message 
    });
  }
});

// API endpoint to fetch publishers
app.get('/api/fetch-publishers', async (req, res) => {
  // Check for token and redirect to login if not present
  if (!req.session.token) {
    console.log('No token found in session, sending auth required response');
    return res.status(401).json({ 
      error: 'Authentication required',
      redirect: '/auth/login'
    });
  }

  const envUrl = req.query.url;
  if (!envUrl) {
    return res.status(400).json({ error: 'Dataverse URL is required' });
  }
  
  try {
    // Normalize the URL for API calls
    const apiUrl = normalizeDataverseUrl(envUrl);
    
    // Construct the publishers endpoint URL
    const publishersUrl = `${apiUrl}publishers?$select=publisherid,friendlyname,uniquename,customizationprefix&$top=100`;
    
    console.log(`Fetching publishers from: ${publishersUrl}`);
    
    // Fetch the publishers from Dataverse
    const response = await axios.get(publishersUrl, {
      headers: { 
        'Authorization': `Bearer ${req.session.token}`,
        'Accept': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0'
      }
    });
    
    if (response.data && response.data.value) {
      // Process publishers to add display information
      const publishers = response.data.value.map(pub => ({
        ...pub,
        // Ensure customizationprefix is available (some publishers might not have it)
        customizationprefix: pub.customizationprefix || ''
      }));
      
      console.log(`Successfully fetched ${publishers.length} publishers`);
      res.json({ publishers });
    } else {
      console.warn('Publisher response did not contain expected data format:', response.data);
      res.json({ publishers: [] });
    }
  } catch (error) {
    console.error('Error fetching publishers:', error.message);
    
    // Check if the error is due to an authentication issue
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      // Token might be expired or invalid
      req.session.token = null;
      return res.status(401).json({ 
        error: 'Authentication failed or expired',
        redirect: '/auth/login'
      });
    }
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', typeof error.response.data === 'object' 
        ? JSON.stringify(error.response.data) 
        : error.response.data);
    }
    
    res.status(500).json({ 
      error: 'Failed to fetch publishers',
      message: error.message,
      details: error.response ? {
        status: error.response.status,
        data: error.response.data
      } : null
    });
  }
});

// Generate documentation
app.post('/generate-docs', async (req, res) => {
  if (!req.session.token) {
    return res.status(401).send('Authentication required');
  }

  const envUrl = req.body.envUrl;
  const prefix = req.body.prefix || '';
  
  try {
    // Show loading page with Elections Canada branding
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Generating Documentation - Elections Canada</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" rel="stylesheet">
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
          :root {
            --ec-header-bg: #26374a;
            --gc-blue: #26374a;
            --gc-red: #af3c43;
          }
          
          * { box-sizing: border-box; }
          body { margin: 0; padding: 0; font-family: 'Noto Sans', Arial, sans-serif; background-color: #f8f9fa; }
          
          .gc-header {
            background-color: var(--ec-header-bg);
            padding: 0 20px;
            height: 70px;
            display: flex;
            align-items: center;
          }
          
          .gc-header img { height: 40px; }
          
          .gc-header-logo-text {
            color: white;
            font-size: 1.1rem;
            font-weight: 600;
            border-left: 2px solid rgba(255,255,255,0.3);
            padding-left: 15px;
            margin-left: 15px;
          }
          
          .gc-red-bar {
            height: 4px;
            background-color: var(--gc-red);
          }
          
          html, body { height: 100%; }
          
          .page-wrapper {
            min-height: 100%;
            display: flex;
            flex-direction: column;
          }
          
          .main-content {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 40px 20px;
          }
          
          .loading-container {
            width: 100%;
            max-width: 500px;
            text-align: center;
          }
          
          .spinner-border {
            width: 5rem;
            height: 5rem;
            margin-bottom: 1.5rem;
            color: var(--gc-blue);
          }
          
          .page-title {
            color: var(--gc-blue);
            font-weight: 600;
          }
          
          .badge-ec {
            background-color: var(--gc-red);
          }
          
          .progress-bar {
            background-color: var(--gc-blue);
          }
          
          .gc-footer {
            background-color: var(--ec-header-bg);
            color: white;
            padding: 20px;
            text-align: center;
            font-size: 0.85rem;
          }
        </style>
      </head>
      <body>
        <div class="page-wrapper">
          <header class="gc-header">
            <span style="color: white; font-size: 1.25rem; font-weight: 700;">Elections Canada</span>
            <span class="gc-header-logo-text">API Explorer</span>
          </header>
          <div class="gc-red-bar"></div>
          
          <main class="main-content">
            <div class="loading-container">
              <div class="spinner-border" role="status">
                <span class="visually-hidden">Loading...</span>
              </div>
              <h1 class="h3 mb-3 page-title">Generating API Documentation</h1>
              <p class="text-muted">Fetching metadata from Dataverse and processing...</p>
              ${prefix ? `<p class="badge badge-ec text-white">Filtering by prefix: ${prefix}</p>` : ''}
              ${PATH_FILTER ? `<p class="badge bg-secondary ms-1">Path filter: ${PATH_FILTER}</p>` : ''}
              <div class="progress mt-4">
                <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" style="width: 100%"></div>
              </div>
            </div>
          </main>
          
          <footer class="gc-footer">
            <div>© Elections Canada</div>
          </footer>
        </div>
        <script>
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
              return response.json().then(errorData => {
                if (response.status === 401 && errorData.redirect) {
                  window.location.href = errorData.redirect;
                  throw new Error('Authentication required. Redirecting to login...');
                }
                throw new Error(errorData.error || errorData.message || 'Network response was not ok');
              });
            }
            return response.json();
          })
          .then(data => {
            if (data.warning) {
              console.warn(data.warning);
            }
            window.location.href = '/api-docs';
          })
          .catch(error => {
            console.error('Error:', error);
            if (!error.message.includes('Redirecting to login')) {
              document.querySelector('.loading-container').innerHTML = \`
                <div class="alert alert-danger">
                  <h4>Error Generating Documentation</h4>
                  <p>\${error.message}</p>
                  <a href="/" class="btn btn-primary mt-3">Back to Home</a>
                </div>
              \`;
            }
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
    return res.status(401).json({ 
      error: 'Authentication required',
      redirect: '/auth/login'
    });
  }

  const envUrl = req.body.url;
  const prefix = req.body.prefix;
  
  try {
    console.log(`Generating OpenAPI spec for ${envUrl} with prefix ${prefix || 'None'}`);
    console.log(`Using auth type: ${req.session.authType || 'user'}`);
    console.log(`Path filter: ${PATH_FILTER || 'None'}`);
    
    if (!envUrl) {
      throw new Error('Dataverse URL is required');
    }
    
    const apiUrl = normalizeDataverseUrl(envUrl);
    console.log(`Using normalized URL: ${apiUrl}`);
    
    try {
      // Generate the raw OpenAPI spec
      let rawSpec = await generateSimpleOpenApiSpec(apiUrl, req.session.token, prefix);
      
      // Apply path filter if configured
      if (PATH_FILTER) {
        console.log(`\nApplying path filter: "${PATH_FILTER}"`);
        openApiSpec = filterOpenApiByPattern(rawSpec, PATH_FILTER, {
          caseInsensitive: true,
          cleanupSchemas: true
        });
      } else {
        openApiSpec = rawSpec;
      }
      
      req.session.openApiGenerated = true;
      req.session.prefix = prefix;
      
      try {
        const specPath = path.join(tempDir, 'openapi-spec.json');
        fs.writeFileSync(specPath, JSON.stringify(openApiSpec, null, 2));
        console.log(`OpenAPI spec saved to ${specPath}`);
      } catch (fileError) {
        console.warn('Warning: Could not save spec file for debugging:', fileError.message);
      }
      
      res.status(200).json({ 
        success: true,
        totalPaths: Object.keys(rawSpec.paths || {}).length,
        filteredPaths: Object.keys(openApiSpec.paths || {}).length,
        pathFilter: PATH_FILTER || null
      });
    } catch (specError) {
      console.error('Error generating OpenAPI spec:', specError);
      
      if (specError.response && (specError.response.status === 401 || specError.response.status === 403)) {
        req.session.token = null;
        return res.status(401).json({ 
          error: 'Authentication failed or expired',
          redirect: '/auth/login'
        });
      }
      
      console.log('Generating fallback OpenAPI spec');
      openApiSpec = createFallbackSpec(apiUrl, specError);
      
      req.session.openApiGenerated = true;
      req.session.prefix = prefix;
      
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
  
  const prefix = req.session.prefix || '';
  const authType = req.session.authType || 'user';
  const authBadge = authType === 'application' 
    ? '<span class="badge bg-success">Application Identity</span>' 
    : '<span class="badge bg-primary">User Identity</span>';
  
  const pathCount = Object.keys(openApiSpec.paths || {}).length;
    
  const swaggerHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>API Documentation - Elections Canada</title>
      <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css">
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        :root {
          --ec-header-bg: #26374a;
          --gc-blue: #26374a;
          --gc-red: #af3c43;
        }
        
        html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
        *, *:before, *:after { box-sizing: inherit; }
        body { margin: 0; padding: 0; font-family: 'Noto Sans', Arial, sans-serif; }
        .swagger-ui .topbar { display: none; }
        
        .gc-header {
          background-color: var(--ec-header-bg);
          padding: 0 20px;
          height: 70px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .gc-header-logo {
          display: flex;
          align-items: center;
          gap: 15px;
        }
        
        .gc-header-logo img {
          height: 40px;
        }
        
        .gc-header-logo-text {
          color: white;
          font-size: 1.1rem;
          font-weight: 600;
          border-left: 2px solid rgba(255,255,255,0.3);
          padding-left: 15px;
          margin-left: 5px;
        }
        
        .gc-header-nav {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        
        .gc-header-nav a {
          color: white;
          text-decoration: none;
          padding: 8px 16px;
          border-radius: 4px;
          font-size: 0.9rem;
          transition: background-color 0.2s;
        }
        
        .gc-header-nav a:hover {
          background-color: rgba(255,255,255,0.1);
        }
        
        .gc-red-bar {
          height: 4px;
          background-color: var(--gc-red);
        }
        
        .auth-badge {
          background-color: var(--gc-red);
          color: white;
          padding: 4px 10px;
          border-radius: 4px;
          font-size: 0.8rem;
          margin-left: 10px;
        }
        
        .auth-badge.user {
          background-color: #0d6efd;
        }
        
        .info-bar {
          padding: 0.75rem 1rem;
          font-size: 0.9rem;
          border-bottom: 1px solid #ddd;
        }
        
        .prefix-filter {
          background-color: #e7f1ff;
        }
        
        .path-filter {
          background-color: #d4edda;
        }
        
        .token-helper {
          background-color: #fff3cd;
          border-bottom: 1px solid #ffc107;
          padding: 1rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .token-helper button {
          background-color: var(--gc-blue);
          color: white;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 4px;
          cursor: pointer;
          margin-left: 0.5rem;
          font-family: 'Noto Sans', Arial, sans-serif;
        }
        
        .token-helper button:hover {
          background-color: #1c2a38;
        }
        
        .token-helper button:disabled {
          background-color: #6c757d;
          cursor: not-allowed;
        }
        
        .token-display {
          font-family: monospace;
          font-size: 0.85rem;
          background-color: #f8f9fa;
          padding: 0.5rem;
          border-radius: 4px;
          margin-top: 0.5rem;
          word-break: break-all;
          max-height: 100px;
          overflow-y: auto;
        }
        
        .token-actions {
          display: flex;
          gap: 0.5rem;
        }
        
        .toast-notification {
          position: fixed;
          top: 20px;
          right: 20px;
          background-color: #28a745;
          color: white;
          padding: 1rem 1.5rem;
          border-radius: 4px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          z-index: 10000;
          display: none;
          font-family: 'Noto Sans', Arial, sans-serif;
        }
        
        /* Override some Swagger UI styles */
        .swagger-ui .info .title {
          color: var(--gc-blue);
        }
        
        .swagger-ui .btn.execute {
          background-color: var(--gc-blue);
          border-color: var(--gc-blue);
        }
        
        .swagger-ui .btn.execute:hover {
          background-color: #1c2a38;
        }
      </style>
    </head>
    <body>
      <div id="toast" class="toast-notification"></div>
      
      <header class="gc-header">
        <div class="gc-header-logo">
          <span style="color: white; font-size: 1.25rem; font-weight: 700;">Elections Canada</span>
          <span class="gc-header-logo-text">API Documentation</span>
          <span class="auth-badge ${authType === 'application' ? '' : 'user'}">${authType === 'application' ? 'Application' : 'User'}</span>
        </div>
        <nav class="gc-header-nav">
          <a href="/">Home</a>
          <a href="/auth/logout">Sign Out</a>
        </nav>
      </header>
      <div class="gc-red-bar"></div>

      ${prefix ? `
      <div class="info-bar prefix-filter">
        <strong>📦 Entity prefix filter:</strong> ${prefix}
      </div>
      ` : ''}
      
      ${PATH_FILTER ? `
      <div class="info-bar path-filter">
        <strong>🔍 Path filter:</strong> <code>${PATH_FILTER}</code> — Showing ${pathCount} matching paths
      </div>
      ` : ''}

      <div class="token-helper">
        <div style="flex: 1;">
          <strong>🔑 Bearer Token Helper:</strong> Click "Show Token" to copy your authentication token for the Authorize button below.
          <div id="tokenDisplay" class="token-display" style="display: none;"></div>
        </div>
        <div class="token-actions">
          <button id="showTokenBtn" onclick="showToken()">Show Token</button>
          <button id="copyTokenBtn" onclick="copyToken()" style="display: none;">Copy Token</button>
          <button id="hideTokenBtn" onclick="hideToken()" style="display: none;">Hide Token</button>
        </div>
      </div>

      <div id="swagger-ui"></div>

      <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
      <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-standalone-preset.js"></script>
      <script>
        let currentToken = null;
        
        function showToast(message) {
          const toast = document.getElementById('toast');
          toast.textContent = message;
          toast.style.display = 'block';
          setTimeout(() => {
            toast.style.display = 'none';
          }, 3000);
        }
        
        async function showToken() {
          const showBtn = document.getElementById('showTokenBtn');
          const copyBtn = document.getElementById('copyTokenBtn');
          const hideBtn = document.getElementById('hideTokenBtn');
          const tokenDisplay = document.getElementById('tokenDisplay');
          
          showBtn.disabled = true;
          showBtn.textContent = 'Loading...';
          
          try {
            const response = await fetch('/api/current-token');
            if (!response.ok) {
              throw new Error('Failed to fetch token');
            }
            
            const data = await response.json();
            currentToken = data.token;
            
            tokenDisplay.textContent = currentToken;
            tokenDisplay.style.display = 'block';
            showBtn.style.display = 'none';
            copyBtn.style.display = 'inline-block';
            hideBtn.style.display = 'inline-block';
            
            showToast('Token retrieved successfully!');
            console.log('='.repeat(80));
            console.log('BEARER TOKEN (for Swagger Authorize):');
            console.log('='.repeat(80));
            console.log(currentToken);
            console.log('='.repeat(80));
          } catch (error) {
            console.error('Error fetching token:', error);
            showToast('Error fetching token');
            showBtn.disabled = false;
            showBtn.textContent = 'Show Token';
          }
        }
        
        async function copyToken() {
          if (!currentToken) {
            showToast('No token available to copy');
            return;
          }
          
          try {
            await navigator.clipboard.writeText(currentToken);
            showToast('✓ Token copied to clipboard!');
          } catch (error) {
            console.error('Error copying token:', error);
            showToast('Failed to copy token');
          }
        }
        
        function hideToken() {
          const showBtn = document.getElementById('showTokenBtn');
          const copyBtn = document.getElementById('copyTokenBtn');
          const hideBtn = document.getElementById('hideTokenBtn');
          const tokenDisplay = document.getElementById('tokenDisplay');
          
          tokenDisplay.style.display = 'none';
          showBtn.style.display = 'inline-block';
          showBtn.disabled = false;
          showBtn.textContent = 'Show Token';
          copyBtn.style.display = 'none';
          hideBtn.style.display = 'none';
        }

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
              if (!req.headers) {
                req.headers = {};
              }
              return req;
            }
          });
          
          window.ui = ui;
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
  
  res.setHeader('Content-Type', 'application/json');
  res.json(openApiSpec);
});

// API endpoint to get current token
app.get('/api/current-token', (req, res) => {
  if (!req.session.token) {
    return res.status(401).json({ 
      error: 'No token available',
      message: 'Please authenticate first'
    });
  }
  
  console.log('='.repeat(80));
  console.log('BEARER TOKEN REQUESTED');
  console.log('='.repeat(80));
  console.log(req.session.token);
  console.log('='.repeat(80));
  
  res.json({ 
    token: req.session.token,
    expires: req.session.tokenExpires ? new Date(req.session.tokenExpires).toISOString() : 'Unknown'
  });
});

// Function to normalize Dataverse URL
function normalizeDataverseUrl(url) {
  let normalizedUrl = url.trim();
  
  if (!normalizedUrl.endsWith('/')) {
    normalizedUrl += '/';
  }
  
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
    let entities = prefix 
      ? response.data.value.filter(entity => 
          entity.SchemaName && entity.SchemaName.toLowerCase().startsWith(prefix.toLowerCase()))
      : response.data.value;
    
    console.log(`After prefix filter: ${entities.length} entities`);
    
    // **NEW: Filter entities by access permissions**
    console.log('Testing entity access permissions...');
    const accessibleEntities = [];
    
    // Test access to each entity in batches to avoid timeout
    const batchSize = 10;
    for (let i = 0; i < entities.length; i += batchSize) {
      const batch = entities.slice(i, i + batchSize);
      const batchPromises = batch.map(async (entity) => {
        if (!entity.EntitySetName) return null;
        
        try {
          // Try to query the entity with $top=0 to test read access
          const testUrl = `${apiUrl}${entity.EntitySetName}?$top=0`;
          await axios.get(testUrl, {
            headers: { 
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/json',
              'OData-MaxVersion': '4.0',
              'OData-Version': '4.0'
            },
            timeout: 5000 // 5 second timeout per entity
          });
          
          console.log(`✓ Access granted: ${entity.SchemaName}`);
          return entity;
        } catch (error) {
          // If we get 401/403, user doesn't have access
          if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            console.log(`✗ Access denied: ${entity.SchemaName}`);
            return null;
          }
          // For other errors (like entity not supporting query), include it
          console.log(`? Unknown access: ${entity.SchemaName} (${error.message})`);
          return entity;
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      accessibleEntities.push(...batchResults.filter(e => e !== null));
      
      console.log(`Processed batch ${Math.floor(i / batchSize) + 1}: ${accessibleEntities.length} accessible entities so far`);
    }
    
    entities = accessibleEntities;
    console.log(`Final accessible entities: ${entities.length}`);
    
    // Build OpenAPI spec
    const openApiSpec = {
      openapi: '3.0.0',
      info: {
        title: 'Dataverse OData API',
        version: '1.0.0',
        description: prefix 
          ? `Automatically generated API docs from Dataverse metadata (Filtered by prefix: ${prefix}, accessible entities only)`
          : 'Automatically generated API docs from Dataverse metadata (accessible entities only)'
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
      if (!entity.SchemaName || !entity.EntitySetName) return;
      
      const properties = {};
      
      if (entity.Attributes && Array.isArray(entity.Attributes)) {
        entity.Attributes.forEach(attr => {
          if (!attr.SchemaName) return;
          properties[attr.SchemaName] = attributeTypeToOpenApiType(attr.AttributeType);
        });
      }
      
      openApiSpec.components.schemas[entity.SchemaName] = {
        type: 'object',
        properties: properties
      };
      
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
╔════════════════════════════════════════════════════════════╗
║  Elections Canada - Dataverse API Explorer                 ║
║  Server running on http://localhost:${port}                     ║
║                                                            ║
║  Environment information:                                  ║
║  - Dataverse URL: ${process.env.dataverse_url ? 'Configured ✓' : 'Not set ✗'}                       ║
║  - Client Secret: ${process.env.client_secret ? 'Configured ✓' : 'Not set ✗'}                       ║
║  - Session Secret: ${process.env.session_secret ? 'Configured ✓' : 'Not set ✗'}                     ║
║  - Tenant ID: ${(process.env.tenant_id || 'Default').substring(0, 20).padEnd(20)}               ║
║  - Path Filter: ${(PATH_FILTER || 'None').substring(0, 18).padEnd(18)}                 ║
╚════════════════════════════════════════════════════════════╝
`);
});