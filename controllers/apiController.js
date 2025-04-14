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
  
  // Get the entity name prefix for filtering (if provided)
  const prefix = req.body.prefix || process.env.prefix || '';
  
  // Store the values in the session for later use
  req.session.baseApiUrl = envUrl;
  req.session.prefix = prefix;
  
  // Render loading page
  res.render('loading', {
    title: 'Generating Documentation',
    dataverseUrl: envUrl,
    prefix: prefix,
    redirectUrl: `/api/process-metadata?url=${encodeURIComponent(envUrl)}&prefix=${encodeURIComponent(prefix || '')}`
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
  const prefix = req.query.prefix;
  
  // Store these values in session for later use
  req.session.baseApiUrl = envUrl;
  req.session.prefix = prefix;
  
  try {
    // Normalize the Dataverse URL to ensure it's in a consistent format
    const normalizedUrl = dataverseService.normalizeDataverseUrl(envUrl);
    console.log(`Processing metadata for URL: ${normalizedUrl}, Prefix Filter: ${prefix || 'None'}`);
    
    // Fetch metadata (with error handling)
    let metadata;
    try {
      metadata = await dataverseService.fetchMetadata(envUrl, req.session.token);
      console.log("Successfully fetched metadata, size:", metadata.length);
    } catch (metadataError) {
      console.error("Error fetching metadata:", metadataError.message);
      throw new Error(`Failed to fetch metadata: ${metadataError.message}`);
    }

    // Convert the EDMX metadata to an OpenAPI specification
    try {
      console.log("Converting EDMX to OpenAPI with prefix filter:", prefix);
      openApiSpec = await metadataService.convertEdmxToOpenApi(
        metadata, 
        normalizedUrl,
        prefix
      );
      
      // Validate the generated spec
      if (!openApiSpec || !openApiSpec.paths) {
        throw new Error("Generated OpenAPI specification is invalid or empty");
      }
      
      console.log(`Generated OpenAPI spec with ${Object.keys(openApiSpec.paths).length} paths`);
    } catch (conversionError) {
      console.error("Error converting metadata to OpenAPI:", conversionError.message);
      throw new Error(`Failed to convert metadata: ${conversionError.message}`);
    }

    // Create a file with the OpenAPI spec for debugging
    try {
      const tempDir = path.join(__dirname, '../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const specPath = path.join(tempDir, 'openapi-spec.json');
      fs.writeFileSync(specPath, JSON.stringify(openApiSpec, null, 2));
      console.log(`OpenAPI spec saved to ${specPath}`);
    } catch (fileError) {
      console.error("Error saving OpenAPI spec file:", fileError.message);
      // Don't fail the whole operation for this, just log it
    }

    // Set a flag in the session to indicate that OpenAPI spec has been generated
    req.session.openApiGenerated = true;

    // Redirect to the documentation page
    res.redirect('/api-docs');
  } catch (error) {
    console.error('Error processing metadata:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', typeof error.response.data === 'object' 
        ? JSON.stringify(error.response.data) 
        : error.response.data);
    }
    
    res.status(500).render('error', {
      title: 'Processing Error',
      message: 'Error generating API documentation',
      details: error.message,
      responseData: error.response ? 
        (typeof error.response.data === 'object' ? JSON.stringify(error.response.data) : error.response.data) 
        : null,
      redirectUrl: '/',
      redirectText: 'Back to Home'
    });
  }
});

// Provide the OpenAPI specification as JSON
router.get('/swagger.json', (req, res) => {
  if (!openApiSpec) {
    return res.status(404).json({ error: "No API specification available" });
  }
  
  try {
    // Handle the "Components object is deprecated" warning by restructuring the spec
    const transformedSpec = transformSpecForSwaggerUI(openApiSpec);
    res.json(transformedSpec);
  } catch (error) {
    console.error("Error transforming OpenAPI spec:", error);
    res.status(500).json({ 
      error: "Error processing OpenAPI specification",
      details: error.message
    });
  }
});

/**
 * Transform the OpenAPI spec to handle schemas correctly for Swagger UI
 * @param {Object} spec - Original OpenAPI specification
 * @returns {Object} - Transformed specification
 */
function transformSpecForSwaggerUI(spec) {
  try {
    // Create a deep copy to avoid modifying the original
    const transformedSpec = JSON.parse(JSON.stringify(spec));
    
    // If there are schemas at the root level, move them to components.schemas
    if (transformedSpec.schemas && !transformedSpec.components) {
      transformedSpec.components = { schemas: transformedSpec.schemas };
      delete transformedSpec.schemas;
    } else if (transformedSpec.schemas && transformedSpec.components) {
      transformedSpec.components.schemas = transformedSpec.schemas;
      delete transformedSpec.schemas;
    }
    
    // Add security schemes if needed
    if (!transformedSpec.components) {
      transformedSpec.components = {};
    }
    
    if (!transformedSpec.components.securitySchemes) {
      transformedSpec.components.securitySchemes = {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      };
    }
    
    // Fix any $ref paths that point to #/schemas instead of #/components/schemas
    const fixRefs = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      
      Object.keys(obj).forEach(key => {
        if (key === '$ref' && typeof obj[key] === 'string') {
          // Replace #/schemas/ with #/components/schemas/
          obj[key] = obj[key].replace('#/schemas/', '#/components/schemas/');
        } else if (typeof obj[key] === 'object') {
          fixRefs(obj[key]);
        }
      });
    };
    
    fixRefs(transformedSpec);
    return transformedSpec;
  } catch (error) {
    console.error('Error transforming spec:', error);
    return spec; // Return original if transformation fails
  }
}

// Provide token to frontend
router.get('/token', (req, res) => {
  res.json({ 
    token: req.session.token || null,
    prefix: req.session.prefix || null
  });
});

module.exports = router;