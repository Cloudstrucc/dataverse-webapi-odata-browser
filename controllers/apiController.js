// API controller
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const dataverseService = require('../services/dataverseService');
const metadataService = require('../services/metadataService');

// Global variable to store the generated OpenAPI specification
let openApiSpec = null;

// Generate API docs
router.post('/generate-docs', async (req, res) => {
  if (!req.session.token) {
    return res.status(401).render('error', {
      title: 'Authentication Required',
      message: 'You must be authenticated to access this feature',
      redirectUrl: '/',
      redirectText: 'Back to Login'
    });
  }

  // Use the form-submitted URL or fall back to .env value
  const envUrl = req.body.envUrl || process.env.dataverse_url;
  
  // Get the selected publisher for filtering
  const selectedPublisher = req.body.publisher || process.env.publisher;
  
  // Store the values in the session for later use
  req.session.baseApiUrl = envUrl;
  req.session.selectedPublisher = selectedPublisher;
  
  // Render loading page
  res.render('loading', {
    title: 'Generating Documentation',
    dataverseUrl: envUrl,
    selectedPublisher: selectedPublisher,
    redirectUrl: `/api/process-metadata?url=${encodeURIComponent(envUrl)}&publisher=${encodeURIComponent(selectedPublisher || '')}`
  });
});

// Process metadata and generate OpenAPI spec
router.get('/process-metadata', async (req, res) => {
  if (!req.session.token) {
    return res.status(401).render('error', {
      title: 'Authentication Required',
      message: 'You must be authenticated to access this feature',
      redirectUrl: '/',
      redirectText: 'Back to Login'
    });
  }

  const envUrl = req.query.url;
  const selectedPublisher = req.query.publisher;
  
  // Store these values in session for later use
  req.session.baseApiUrl = envUrl;
  req.session.selectedPublisher = selectedPublisher;
  
  try {
    // Fetch metadata
    const metadata = await dataverseService.fetchMetadata(envUrl, req.session.token);
    
    // If publisher filter is selected, fetch entity information
    let entityPublisherMap = new Map();
    
    if (selectedPublisher) {
      try {
        entityPublisherMap = await dataverseService.fetchEntityPublisherMap(
          envUrl, 
          req.session.token, 
          selectedPublisher
        );
      } catch (error) {
        console.error('Error fetching entity publisher information:', error.message);
        // Continue without publisher filtering if this fails
      }
    }

    // Convert the EDMX metadata to an OpenAPI specification
    openApiSpec = await metadataService.convertEdmxToOpenApi(
      metadata, 
      envUrl, 
      selectedPublisher, 
      entityPublisherMap
    );

    // Create a file with the OpenAPI spec for debugging
    const tempDir = path.join(__dirname, '../temp');
    const specPath = path.join(tempDir, 'openapi-spec.json');
    fs.writeFileSync(specPath, JSON.stringify(openApiSpec, null, 2));
    console.log(`OpenAPI spec saved to ${specPath}`);

    // Set a flag in the session to indicate that OpenAPI spec has been generated
    req.session.openApiGenerated = true;

    // Redirect to the documentation page
    res.redirect('/api-docs');
  } catch (error) {
    console.error('Error processing metadata:', error.message);
    
    res.status(500).render('error', {
      title: 'Processing Error',
      message: 'Error generating API documentation',
      details: error.message,
      responseData: error.response ? JSON.stringify(error.response.data, null, 2) : null,
      redirectUrl: '/',
      redirectText: 'Back to Home'
    });
  }
});

// Fetch publishers from Dataverse
router.get('/fetch-publishers', async (req, res) => {
  if (!req.session.token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const envUrl = req.query.url;
  if (!envUrl) {
    return res.status(400).json({ error: 'Dataverse URL is required' });
  }
  
  try {
    const publishers = await dataverseService.fetchPublishers(envUrl, req.session.token);
    res.json({ publishers });
  } catch (error) {
    console.error('Error fetching publishers:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch publishers',
      details: error.message,
      response: error.response ? {
        status: error.response.status,
        data: error.response.data
      } : null
    });
  }
});

// Provide the OpenAPI specification as JSON
router.get('/swagger.json', (req, res) => {
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

// Provide token to frontend
router.get('/token', (req, res) => {
  res.json({ 
    token: req.session.token || null,
    publisher: req.session.selectedPublisher || null
  });
});

module.exports = router;