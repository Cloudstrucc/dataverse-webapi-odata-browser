// Metadata conversion service
const xml2js = require('xml2js');
const parser = new xml2js.Parser({ 
  explicitArray: false,
  normalizeTags: true, // Normalize tag names to lowercase
  trim: true // Trim whitespace
});

/**
 * Convert EDMX metadata to OpenAPI specification
 * @param {string} edmxMetadata - EDMX XML string
 * @param {string} baseUrl - Base URL for the API
 * @param {string} prefix - Entity name prefix for filtering (optional)
 * @returns {Promise<Object>} - OpenAPI specification object
 */
async function convertEdmxToOpenApi(edmxMetadata, baseUrl, prefix) {
  console.log("Starting EDMX to OpenAPI conversion");
  
  try {
    // Ensure edmxMetadata is a string
    if (!edmxMetadata || typeof edmxMetadata !== 'string') {
      throw new Error("Invalid metadata format: Expected a string");
    }
    
    // Check if it's valid XML
    if (!edmxMetadata.trim().startsWith('<')) {
      // If it doesn't start with <, it's probably not XML
      console.error("Metadata doesn't appear to be XML. First 100 chars:", edmxMetadata.substring(0, 100));
      throw new Error("Metadata is not in XML format");
    }
    
    // Build the OpenAPI spec
    const openApiSpec = {
      openapi: "3.0.0",
      info: {
        title: "Dataverse OData API",
        version: "1.0.0",
        description: prefix ? 
          `Automatically generated API docs from Dataverse metadata (Filtered by prefix: ${prefix})` :
          "Automatically generated API docs from Dataverse metadata."
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
    
    try {
      // Parse the EDMX XML
      console.log("Parsing XML metadata...");
      const result = await parser.parseStringPromise(edmxMetadata);
      
      // Check for valid structure (with case insensitive keys due to normalizeTags)
      if (!result) {
        throw new Error("XML parsing resulted in null/undefined");
      }
      
      // Find the edmx key (could be normalized to lowercase)
      const edmxKey = Object.keys(result).find(key => 
        key.toLowerCase() === 'edmx:edmx' || key.toLowerCase() === 'edmx');
      
      if (!edmxKey) {
        throw new Error("Invalid EDMX format: Missing edmx:Edmx element");
      }
      
      const edmx = result[edmxKey];
      
      // Find dataservices key
      const dataServicesKey = Object.keys(edmx).find(key => 
        key.toLowerCase() === 'edmx:dataservices' || key.toLowerCase() === 'dataservices');
      
      if (!dataServicesKey || !edmx[dataServicesKey]) {
        throw new Error("Invalid EDMX format: Missing edmx:DataServices element");
      }
      
      const dataServices = edmx[dataServicesKey];
      
      // Find schema key
      const schemaKey = Object.keys(dataServices).find(key => 
        key.toLowerCase() === 'schema');
      
      if (!schemaKey || !dataServices[schemaKey]) {
        throw new Error("Invalid EDMX format: Missing Schema element");
      }
      
      const schema = dataServices[schemaKey];
      
      // Extract entity types (check different possible keys)
      let entityTypes = [];
      const entityTypeKey = Object.keys(schema).find(key =>
        key.toLowerCase() === 'entitytype');
      
      if (entityTypeKey && schema[entityTypeKey]) {
        entityTypes = Array.isArray(schema[entityTypeKey]) ? 
          schema[entityTypeKey] : [schema[entityTypeKey]];
      }
      
      // Extract entity container
      const entityContainerKey = Object.keys(schema).find(key =>
        key.toLowerCase() === 'entitycontainer');
      
      let entityContainer = {};
      if (entityContainerKey && schema[entityContainerKey]) {
        entityContainer = schema[entityContainerKey];
      }
      
      // Extract entity sets
      let entitySets = [];
      if (entityContainer) {
        const entitySetKey = Object.keys(entityContainer).find(key =>
          key.toLowerCase() === 'entityset');
        
        if (entitySetKey && entityContainer[entitySetKey]) {
          entitySets = Array.isArray(entityContainer[entitySetKey]) ?
            entityContainer[entitySetKey] : [entityContainer[entitySetKey]];
        }
      }
      
      console.log(`Found ${entityTypes.length} entity types`);
      console.log(`Found ${entitySets.length} entity sets`);
      
      // Filter entity types by prefix
      const filteredEntityTypes = entityTypes.filter(et => 
        et && et.$ && et.$.name && shouldIncludeEntityByPrefix(et.$.name, prefix));
      
      // Track included entity types for filtering entity sets
      const includedEntityNames = new Set();
      filteredEntityTypes.forEach(et => {
        if (et && et.$) {
          includedEntityNames.add(et.$.name);
        }
      });
      
      // Filter entity sets to only include those with entity types that match the prefix
      const filteredEntitySets = entitySets.filter(es => {
        if (!es || !es.$ || !es.$.entitytype) return false;
        
        // Extract entity type name from the full type reference
        const entityTypeRef = es.$.entitytype;
        const entityType = entityTypeRef.includes('.') ? 
          entityTypeRef.split('.').pop() : entityTypeRef;
          
        return includedEntityNames.has(entityType);
      });
      
      console.log(`Filtered to ${filteredEntityTypes.length} entity types with prefix: ${prefix || 'None'}`);
      console.log(`Filtered to ${filteredEntitySets.length} entity sets`);
      
      // Process filtered entity types
      processEntityTypes(filteredEntityTypes, openApiSpec);
      
      // Process filtered entity sets
      processEntitySets(filteredEntitySets, openApiSpec);
      
      // Add info about filtering in the API description
      if (prefix) {
        openApiSpec.info.description += `\n\nThis documentation only includes entities with the prefix: ${prefix}`;
      }
      
      console.log("Successfully generated OpenAPI specification");
      return openApiSpec;
    } catch (parseError) {
      console.error("Error parsing EDMX XML:", parseError);
      return createFallbackSpec(baseUrl, parseError);
    }
  } catch (error) {
    console.error("Error in EDMX to OpenAPI conversion:", error);
    return createFallbackSpec(baseUrl, error);
  }
}

/**
 * Process entity types into OpenAPI schema components
 * @param {Array|Object} entityTypes - Entity types from EDMX
 * @param {Object} openApiSpec - OpenAPI specification object
 */
function processEntityTypes(entityTypes, openApiSpec) {
  if (!entityTypes || entityTypes.length === 0) {
    console.log("No entity types found in EDMX");
    return;
  }
  
  entityTypes.forEach(entityType => {
    if (!entityType || !entityType.$) {
      console.log("Skipping invalid entity type (missing attributes)");
      return;
    }
    
    // Get entity name (could be Name or name due to normalization)
    const entityName = entityType.$.name || entityType.$.Name;
    if (!entityName) {
      console.log("Skipping entity type with missing name");
      return;
    }
    
    const properties = {};
    
    // Find property key (could be normalized)
    const propertyKey = Object.keys(entityType).find(key =>
      key.toLowerCase() === 'property');
    
    if (propertyKey && entityType[propertyKey]) {
      const properties = {};
      
      // Handle array of properties
      if (Array.isArray(entityType[propertyKey])) {
        entityType[propertyKey].forEach(prop => {
          if (prop && prop.$ && (prop.$.name || prop.$.Name) && (prop.$.type || prop.$.Type)) {
            const propName = prop.$.name || prop.$.Name;
            const propType = prop.$.type || prop.$.Type;
            properties[propName] = edmTypeToOpenApiType(propType);
          }
        });
      } 
      // Handle single property
      else if (entityType[propertyKey].$ && 
               (entityType[propertyKey].$.name || entityType[propertyKey].$.Name) && 
               (entityType[propertyKey].$.type || entityType[propertyKey].$.Type)) {
        const prop = entityType[propertyKey];
        const propName = prop.$.name || prop.$.Name;
        const propType = prop.$.type || prop.$.Type;
        properties[propName] = edmTypeToOpenApiType(propType);
      }
      
      openApiSpec.components.schemas[entityName] = {
        type: 'object',
        properties: properties
      };
    } else {
      // If no properties found, still create a schema with empty properties
      openApiSpec.components.schemas[entityName] = {
        type: 'object',
        properties: {}
      };
    }
  });
}

/**
 * Process entity sets into OpenAPI paths
 * @param {Array|Object} entitySets - Entity sets from EDMX
 * @param {Object} openApiSpec - OpenAPI specification object
 */
function processEntitySets(entitySets, openApiSpec) {
  if (!entitySets || entitySets.length === 0) {
    console.log("No entity sets found in EDMX");
    return;
  }
  
  entitySets.forEach(entitySet => {
    if (!entitySet || !entitySet.$) {
      console.log("Skipping invalid entity set (missing attributes)");
      return;
    }
    
    // Get entity set name (could be Name or name due to normalization)
    const name = entitySet.$.name || entitySet.$.Name;
    if (!name) {
      console.log("Skipping entity set with missing name");
      return;
    }
    
    // Get entity type (could be EntityType or entitytype due to normalization)
    const entityTypeRef = entitySet.$.entitytype || entitySet.$.EntityType;
    if (!entityTypeRef) {
      console.log(`Skipping entity set ${name} with missing entity type reference`);
      return;
    }
    
    // Extract entity type name from the full type reference
    const entityType = entityTypeRef.includes('.') ? 
      entityTypeRef.split('.').pop() : entityTypeRef;
    
    createEntitySetPaths(name, entityType, openApiSpec);
  });
}

/**
 * Create paths for an entity set
 * @param {string} name - Entity set name
 * @param {string} entityType - Entity type name
 * @param {Object} openApiSpec - OpenAPI specification object
 */
function createEntitySetPaths(name, entityType, openApiSpec) {
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
}

/**
 * Check if an entity should be included based on prefix filter
 * @param {string} entityName - Entity name to check
 * @param {string} prefix - Prefix to filter by (optional)
 * @returns {boolean} - Whether to include the entity
 */
function shouldIncludeEntityByPrefix(entityName, prefix) {
  if (!prefix) {
    return true; // No filter, include all
  }
  
  // Normalize both strings to lowercase for case-insensitive comparison
  const normalizedEntityName = entityName.toLowerCase();
  const normalizedPrefix = prefix.toLowerCase();
  
  // Check if entity name starts with the given prefix
  return normalizedEntityName.startsWith(normalizedPrefix);
}

/**
 * Convert EDM type to OpenAPI type
 * @param {string} edmType - EDM type from metadata
 * @returns {Object} - OpenAPI type definition
 */
function edmTypeToOpenApiType(edmType) {
  // Handle case sensitivity by converting to lowercase
  const normalizedType = edmType.toLowerCase();
  
  const typeMap = {
    'edm.string': { type: 'string' },
    'edm.int32': { type: 'integer', format: 'int32' },
    'edm.int64': { type: 'integer', format: 'int64' },
    'edm.boolean': { type: 'boolean' },
    'edm.double': { type: 'number', format: 'double' },
    'edm.decimal': { type: 'number', format: 'double' },
    'edm.datetimeoffset': { type: 'string', format: 'date-time' },
    'edm.date': { type: 'string', format: 'date' },
    'edm.time': { type: 'string', format: 'time' },
    'edm.guid': { type: 'string', format: 'uuid' },
    'edm.binary': { type: 'string', format: 'binary' }
  };
  
  return typeMap[normalizedType] || { type: 'string' };
}

/**
 * Create a fallback OpenAPI spec if conversion fails
 * @param {string} baseUrl - Base URL for the API
 * @param {Error} error - Error that occurred during conversion
 * @returns {Object} - Basic fallback OpenAPI spec
 */
function createFallbackSpec(baseUrl, error) {
  return {
    openapi: "3.0.0",
    info: {
      title: "Dataverse OData API (Fallback)",
      version: "1.0.0",
      description: "API documentation generation encountered an error. Please check server logs."
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
    },
    components: {
      schemas: {
        Error: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "Error message"
            },
            details: {
              type: "string",
              description: "Error details"
            }
          }
        }
      }
    }
  };
}

module.exports = {
  convertEdmxToOpenApi
};