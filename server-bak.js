// server.js - With JSON schema-based OpenAPI generation
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const axios = require('axios');
const msal = require('@azure/msal-node');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ['.pdf', '.docx', '.xlsx', '.pptx'].includes(ext));
  }
});

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(session({ secret: process.env.session_secret || 'default', resave: false, saveUninitialized: false }));

// Configuration
const azureConfig = {
  clientId: process.env.client_id,
  tenantId: process.env.tenant_id,
  get authority() { return `https://login.microsoftonline.com/${this.tenantId}`; },
  clientSecret: process.env.client_secret,
  redirectUri: process.env.redirectUri,
  scopes: [process.env.scopes],
  appScopes: [process.env.app_scopes || process.env.scopes]
};

const SCHEMA_FILE_PATH = process.env.SCHEMA_FILE_PATH || '';
const PUBLISHER_PREFIX = process.env.PUBLISHER_PREFIX || '';
const AGENCY_NAME = process.env.AGENCY_NAME || 'Elections Canada';
const AGENCY_URL = process.env.AGENCY_URL || 'https://www.elections.ca';
const AGENCY_HEADER_BG = process.env.AGENCY_HEADER_BG || '#26374a';
const AGENCY_ACCENT_COLOR = process.env.AGENCY_ACCENT_COLOR || '#af3c43';

// JSON Schema to OpenAPI
function jsonSchemaTypeToOpenApi(attrType, format) {
  const typeMap = {
    'String': { type: 'string' }, 'Memo': { type: 'string' },
    'Integer': { type: 'integer', format: 'int32' }, 'Boolean': { type: 'boolean' },
    'Decimal': { type: 'number', format: 'double' }, 'DateTime': { type: 'string', format: 'date-time' }
  };
  let result = typeMap[attrType] || { type: 'string' };
  if (format === 'Email') result.format = 'email';
  if (format === 'Url') result.format = 'uri';
  return result;
}

function generateOpenApiFromJsonSchema(jsonFilePath, publisherPrefix, baseUrl) {
  console.log('\n=== GENERATING OPENAPI FROM JSON SCHEMA ===');
  console.log(`File: ${jsonFilePath}, Prefix: ${publisherPrefix}, URL: ${baseUrl}`);
  
  const schema = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
  if (!schema.tables) throw new Error('Invalid schema: missing tables array');
  
  const prefix = publisherPrefix ? `${publisherPrefix}_` : '';
  
  const spec = {
    openapi: '3.0.0',
    info: {
      title: `${AGENCY_NAME} - Digital Signature API`,
      version: '1.0.0',
      description: `Custom Dataverse tables. Prefix: ${prefix}, Tables: ${schema.tables.length}`
    },
    servers: [{ url: baseUrl }],
    tags: [],
    paths: {},
    components: {
      schemas: {},
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }
    },
    security: [{ bearerAuth: [] }]
  };

  schema.tables.forEach(table => {
    const schemaName = prefix + table.logicalName;
    const entitySetName = prefix + table.logicalName + 'es';
    const displayName = table.displayName;

    spec.tags.push({ name: displayName, description: table.description });

    const properties = {};
    properties[`${schemaName}id`] = { type: 'string', format: 'uuid', readOnly: true };
    
    if (table.primaryAttribute) {
      properties[prefix + table.primaryAttribute.schemaName.toLowerCase()] = {
        type: 'string', maxLength: table.primaryAttribute.maxLength || 200
      };
    }

    (table.attributes || []).forEach(attr => {
      const attrName = prefix + attr.logicalName;
      const typeInfo = jsonSchemaTypeToOpenApi(attr.type, attr.format);
      properties[attrName] = { ...typeInfo, description: attr.description };
      if (attr.maxLength) properties[attrName].maxLength = attr.maxLength;
    });

    properties['createdon'] = { type: 'string', format: 'date-time', readOnly: true };
    properties['modifiedon'] = { type: 'string', format: 'date-time', readOnly: true };
    properties['statecode'] = { type: 'integer', enum: [0, 1] };
    properties['statuscode'] = { type: 'integer' };

    spec.components.schemas[schemaName] = { type: 'object', description: table.description, properties };
    spec.components.schemas[`${schemaName}Collection`] = {
      type: 'object',
      properties: {
        '@odata.context': { type: 'string' },
        '@odata.count': { type: 'integer' },
        value: { type: 'array', items: { $ref: `#/components/schemas/${schemaName}` } }
      }
    };

    // Collection endpoints
    spec.paths[`/${entitySetName}`] = {
      get: {
        tags: [displayName], summary: `List ${table.displayNamePlural}`, operationId: `list${schemaName}`,
        parameters: [
          { name: '$select', in: 'query', schema: { type: 'string' } },
          { name: '$filter', in: 'query', schema: { type: 'string' } },
          { name: '$orderby', in: 'query', schema: { type: 'string' } },
          { name: '$top', in: 'query', schema: { type: 'integer' } },
          { name: '$expand', in: 'query', schema: { type: 'string' } }
        ],
        responses: { '200': { description: 'Success', content: { 'application/json': { schema: { $ref: `#/components/schemas/${schemaName}Collection` } } } } }
      },
      post: {
        tags: [displayName], summary: `Create ${displayName}`, operationId: `create${schemaName}`,
        requestBody: { content: { 'application/json': { schema: { $ref: `#/components/schemas/${schemaName}` } } } },
        responses: { '201': { description: 'Created' } }
      }
    };

    // Single record endpoints
    spec.paths[`/${entitySetName}({${schemaName}id})`] = {
      get: {
        tags: [displayName], summary: `Get ${displayName}`, operationId: `get${schemaName}`,
        parameters: [{ name: `${schemaName}id`, in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Success', content: { 'application/json': { schema: { $ref: `#/components/schemas/${schemaName}` } } } } }
      },
      patch: {
        tags: [displayName], summary: `Update ${displayName}`, operationId: `update${schemaName}`,
        parameters: [{ name: `${schemaName}id`, in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: `#/components/schemas/${schemaName}` } } } },
        responses: { '204': { description: 'Updated' } }
      },
      delete: {
        tags: [displayName], summary: `Delete ${displayName}`, operationId: `delete${schemaName}`,
        parameters: [{ name: `${schemaName}id`, in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '204': { description: 'Deleted' } }
      }
    };

    console.log(`  ✓ ${schemaName} (${displayName})`);
  });

  console.log(`=== Generated: ${spec.tags.length} tables, ${Object.keys(spec.paths).length} paths ===\n`);
  return spec;
}

function loadSchemaOnStartup() {
  if (!SCHEMA_FILE_PATH) return null;
  try {
    const p = path.resolve(SCHEMA_FILE_PATH);
    if (!fs.existsSync(p)) { console.error(`Schema not found: ${p}`); return null; }
    const s = JSON.parse(fs.readFileSync(p, 'utf8'));
    console.log(`\n✓ Loaded schema: ${p} (${s.tables?.length || 0} tables)`);
    return s;
  } catch (e) { console.error(`Schema error: ${e.message}`); return null; }
}

const loadedSchema = loadSchemaOnStartup();

// MSAL
let cca = new msal.ConfidentialClientApplication({
  auth: { clientId: azureConfig.clientId, authority: azureConfig.authority, clientSecret: azureConfig.clientSecret }
});

let openApiSpec = null;

function normalizeDataverseUrl(url) {
  if (!url) return '';
  let u = url.trim();
  if (!u.endsWith('/')) u += '/';
  if (!u.includes('/api/data/v')) u += 'api/data/v9.2/';
  return u;
}

// Auth middleware
app.use((req, res, next) => {
  const publicPaths = ['/', '/auth/login', '/auth/callback', '/auth/logout', '/auth/app-login', '/file-converter', '/api/public/file-to-base64'];
  if (publicPaths.includes(req.path)) return next();
  if (!req.session.token) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Auth required', redirect: '/auth/login' });
    return res.redirect('/auth/login');
  }
  if (req.session.tokenExpires && Date.now() > req.session.tokenExpires) {
    req.session.token = null;
    return res.redirect('/auth/login');
  }
  next();
});

const STYLES = `
  :root{--hdr:${AGENCY_HEADER_BG};--acc:${AGENCY_ACCENT_COLOR}}
  *{box-sizing:border-box}body{margin:0;font-family:'Segoe UI',sans-serif;background:#f5f5f5}
  .hdr{background:var(--hdr);color:#fff;padding:0 20px;height:70px;display:flex;align-items:center;justify-content:space-between}
  .hdr-logo{font-size:1.2rem;font-weight:700}.hdr-sub{opacity:.8;margin-left:15px;padding-left:15px;border-left:2px solid rgba(255,255,255,.3)}
  .hdr a{color:#fff;text-decoration:none;padding:8px 16px;border-radius:4px}.hdr a:hover{background:rgba(255,255,255,.1)}
  .bar{height:4px;background:var(--acc)}
  .card{background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.1);padding:2rem;max-width:500px;margin:2rem auto}
  .btn{background:var(--hdr);color:#fff;border:none;padding:12px 24px;border-radius:4px;cursor:pointer;font-size:1rem;width:100%;margin-top:1rem}
  .btn:hover{opacity:.9}.btn-alt{background:var(--acc)}
  .badge{background:var(--acc);color:#fff;padding:4px 12px;border-radius:4px;font-size:.8rem}
  .ftr{background:var(--hdr);color:#fff;padding:20px;text-align:center;margin-top:auto}
  .wrap{min-height:100vh;display:flex;flex-direction:column}
  .main{flex:1;display:flex;align-items:center;justify-content:center;padding:20px}
  .info{background:#d4edda;border:1px solid #c3e6cb;border-radius:4px;padding:12px;margin-bottom:1rem}
  .tbl-list{background:#f8f9fa;border-radius:4px;padding:10px;max-height:200px;overflow-y:auto;margin:1rem 0}
  .tbl-item{padding:8px;border-bottom:1px solid #eee}.tbl-item:last-child{border:none}
`;

// Routes
app.get('/', (req, res) => {
  const schemaInfo = loadedSchema 
    ? `<div class="info">✓ Schema loaded: ${loadedSchema.tables.length} tables from <code>${SCHEMA_FILE_PATH}</code></div>`
    : '<div class="info">Mode: Dataverse Live Query</div>';
  
  if (!req.session.token) {
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>API Explorer - ${AGENCY_NAME}</title><style>${STYLES}</style></head><body>
      <div class="wrap"><header class="hdr"><div><span class="hdr-logo">${AGENCY_NAME}</span><span class="hdr-sub">API Explorer</span></div>
      <nav><a href="${AGENCY_URL}" target="_blank">Website</a></nav></header><div class="bar"></div>
      <main class="main"><div class="card" style="text-align:center">
        <h2>Digital Signature API Explorer</h2>
        <p>Access documentation for ${AGENCY_NAME} Dataverse APIs</p>
        ${PUBLISHER_PREFIX ? `<span class="badge">Prefix: ${PUBLISHER_PREFIX}_</span>` : ''}
        ${schemaInfo}
        <a href="/auth/login"><button class="btn">👤 Sign in as User</button></a>
        <a href="/auth/app-login"><button class="btn btn-alt">🔑 Sign in as Application</button></a>
      </div></main><footer class="ftr">© ${AGENCY_NAME}</footer></div></body></html>`);
  } else {
    const authBadge = req.session.authType === 'application' ? 'Application' : 'User';
    const tableList = loadedSchema ? loadedSchema.tables.map(t => 
      `<div class="tbl-item"><strong>${PUBLISHER_PREFIX}_${t.logicalName}</strong><br><small>${t.description}</small></div>`
    ).join('') : '';
    
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>API Explorer - ${AGENCY_NAME}</title><style>${STYLES}</style></head><body>
      <div class="wrap"><header class="hdr"><div><span class="hdr-logo">${AGENCY_NAME}</span><span class="hdr-sub">API Explorer</span></div>
      <nav><a href="/">Home</a><a href="/auth/logout">Sign Out</a></nav></header><div class="bar"></div>
      <main class="main"><div class="card">
        <div style="text-align:center;margin-bottom:1rem"><span class="badge">${authBadge} Identity</span></div>
        <h2 style="text-align:center">Generate API Documentation</h2>
        ${schemaInfo}
        ${tableList ? `<div class="tbl-list">${tableList}</div>` : ''}
        <form method="POST" action="/generate-docs">
          <input type="hidden" name="envUrl" value="${process.env.dataverse_url || ''}">
          <button type="submit" class="btn">📄 Generate API Docs</button>
        </form>
      </div></main><footer class="ftr">© ${AGENCY_NAME}</footer></div></body></html>`);
  }
});

app.post('/generate-docs', (req, res) => {
  if (!req.session.token) return res.redirect('/auth/login');
  const envUrl = req.body.envUrl || process.env.dataverse_url;
  
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Generating...</title><style>${STYLES}</style></head><body>
    <div class="wrap"><header class="hdr"><span class="hdr-logo">${AGENCY_NAME}</span></header><div class="bar"></div>
    <main class="main"><div class="card" style="text-align:center">
      <div style="font-size:3rem;margin-bottom:1rem">⏳</div>
      <h2>Generating API Documentation</h2>
      <p>${loadedSchema ? 'Processing JSON schema...' : 'Querying Dataverse...'}</p>
    </div></main></div>
    <script>
      fetch('/api/generate-openapi',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:'${envUrl}'})})
      .then(r=>r.ok?r.json():Promise.reject(r)).then(()=>window.location='/api-docs')
      .catch(e=>document.querySelector('.card').innerHTML='<h3>Error</h3><p>'+e.message+'</p><a href="/"><button class="btn">Back</button></a>');
    </script></body></html>`);
});

app.post('/api/generate-openapi', async (req, res) => {
  if (!req.session.token) return res.status(401).json({ error: 'Auth required' });
  
  try {
    const apiUrl = normalizeDataverseUrl(req.body.url || process.env.dataverse_url);
    
    if (SCHEMA_FILE_PATH && loadedSchema) {
      openApiSpec = generateOpenApiFromJsonSchema(path.resolve(SCHEMA_FILE_PATH), PUBLISHER_PREFIX, apiUrl);
    } else {
      // Fallback to basic spec
      openApiSpec = { openapi: '3.0.0', info: { title: 'Dataverse API', version: '1.0.0' }, paths: {}, components: { schemas: {} } };
    }
    
    fs.writeFileSync(path.join(tempDir, 'openapi-spec.json'), JSON.stringify(openApiSpec, null, 2));
    res.json({ success: true, paths: Object.keys(openApiSpec.paths).length });
  } catch (e) {
    console.error('Generate error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api-docs', (req, res) => {
  if (!openApiSpec) return res.redirect('/');
  
  const pathCount = Object.keys(openApiSpec.paths).length;
  const schemaCount = Object.keys(openApiSpec.components?.schemas || {}).length;
  
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>API Docs - ${AGENCY_NAME}</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css">
    <style>
      :root{--hdr:${AGENCY_HEADER_BG};--acc:${AGENCY_ACCENT_COLOR}}
      body{margin:0;font-family:'Segoe UI',sans-serif}.swagger-ui .topbar{display:none}
      .hdr{background:var(--hdr);color:#fff;padding:0 20px;height:60px;display:flex;align-items:center;justify-content:space-between}
      .hdr-logo{font-size:1.1rem;font-weight:700}.hdr a{color:#fff;text-decoration:none;padding:6px 12px}
      .bar{height:4px;background:var(--acc)}
      .info-bar{padding:10px 20px;background:#e7f1ff;border-bottom:1px solid #ddd;font-size:.9rem}
      .token-bar{padding:10px 20px;background:#fff3cd;border-bottom:1px solid #ffc107}
      .token-bar button{background:var(--hdr);color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;margin-left:10px}
      .token-display{font-family:monospace;font-size:.75rem;background:#f8f9fa;padding:8px;border-radius:4px;margin-top:8px;max-height:80px;overflow-y:auto;word-break:break-all;display:none}
      .toast{position:fixed;top:20px;right:20px;background:#28a745;color:#fff;padding:12px 20px;border-radius:4px;display:none;z-index:9999}
    </style></head><body>
    <div id="toast" class="toast"></div>
    <header class="hdr">
      <div><span class="hdr-logo">${AGENCY_NAME} API Documentation</span></div>
      <nav><a href="/">Home</a><a href="/auth/logout">Sign Out</a></nav>
    </header>
    <div class="bar"></div>
    <div class="info-bar"><strong>📊</strong> ${pathCount} endpoints • ${schemaCount} schemas ${PUBLISHER_PREFIX ? `• Prefix: <code>${PUBLISHER_PREFIX}_</code>` : ''}</div>
    <div class="token-bar">
      <strong>🔑 Bearer Token:</strong>
      <button onclick="showToken()">Show Token</button>
      <button onclick="copyToken()" style="display:none" id="copyBtn">Copy</button>
      <div class="token-display" id="tokenDisplay"></div>
    </div>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
    <script>
      let token='';
      function showToast(m){const t=document.getElementById('toast');t.textContent=m;t.style.display='block';setTimeout(()=>t.style.display='none',3000)}
      async function showToken(){
        const r=await fetch('/api/current-token');const d=await r.json();token=d.token;
        document.getElementById('tokenDisplay').textContent=token;
        document.getElementById('tokenDisplay').style.display='block';
        document.getElementById('copyBtn').style.display='inline';
        showToast('Token loaded');
      }
      function copyToken(){navigator.clipboard.writeText(token);showToast('Copied!')}
      SwaggerUIBundle({url:'/swagger.json',dom_id:'#swagger-ui',presets:[SwaggerUIBundle.presets.apis]});
    </script></body></html>`);
});

app.get('/swagger.json', (req, res) => {
  if (!openApiSpec) return res.status(404).json({ error: 'No spec' });
  res.json(openApiSpec);
});

app.get('/api/current-token', (req, res) => {
  if (!req.session.token) return res.status(401).json({ error: 'No token' });
  res.json({ token: req.session.token, expires: req.session.tokenExpires });
});

// Auth routes
app.get('/auth/login', (req, res) => {
  cca.getAuthCodeUrl({ scopes: azureConfig.scopes, redirectUri: azureConfig.redirectUri })
    .then(url => res.redirect(url))
    .catch(e => res.status(500).send('Auth error: ' + e.message));
});

app.get('/auth/app-login', async (req, res) => {
  try {
    const r = await cca.acquireTokenByClientCredential({ scopes: azureConfig.appScopes });
    req.session.token = r.accessToken;
    req.session.authType = 'application';
    req.session.tokenExpires = Date.now() + 3600000;
    res.redirect('/');
  } catch (e) { res.status(500).send('App auth error: ' + e.message); }
});

app.get('/auth/callback', (req, res) => {
  cca.acquireTokenByCode({ code: req.query.code, scopes: azureConfig.scopes, redirectUri: azureConfig.redirectUri })
    .then(r => {
      req.session.token = r.accessToken;
      req.session.authType = 'user';
      req.session.tokenExpires = Date.now() + 3600000;
      res.redirect('/');
    })
    .catch(e => res.status(500).send('Token error: ' + e.message));
});

app.get('/auth/logout', (req, res) => { req.session.destroy(() => res.redirect('/')); });

// File converter
app.get('/file-converter', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>File Converter</title><style>${STYLES}</style></head><body>
    <div class="wrap"><header class="hdr"><span class="hdr-logo">${AGENCY_NAME} File Converter</span><nav><a href="/">API Explorer</a></nav></header><div class="bar"></div>
    <main class="main"><div class="card">
      <h2>Convert File to Base64</h2>
      <input type="file" id="file" accept=".pdf,.docx,.xlsx,.pptx" style="margin:1rem 0">
      <button class="btn" onclick="convert()">Convert</button>
      <div id="result" style="margin-top:1rem;display:none">
        <textarea id="output" style="width:100%;height:150px;font-family:monospace;font-size:.7rem"></textarea>
        <button class="btn" onclick="navigator.clipboard.writeText(document.getElementById('output').value)">Copy</button>
      </div>
    </div></main></div>
    <script>
      function convert(){
        const f=document.getElementById('file').files[0];if(!f)return;
        const r=new FileReader();
        r.onload=e=>{document.getElementById('output').value=e.target.result.split(',')[1];document.getElementById('result').style.display='block'};
        r.readAsDataURL(f);
      }
    </script></body></html>`);
});

app.post('/api/public/file-to-base64', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ success: true, filename: req.file.originalname, base64: req.file.buffer.toString('base64') });
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  ${AGENCY_NAME} - Digital Signature API Explorer
║  Server: http://localhost:${port}
║  
║  Schema File: ${SCHEMA_FILE_PATH || 'Not configured (Dataverse mode)'}
║  Publisher Prefix: ${PUBLISHER_PREFIX || 'None'}
║  Tables: ${loadedSchema ? loadedSchema.tables.length : 'N/A'}
╚══════════════════════════════════════════════════════════════════╝
`);
});