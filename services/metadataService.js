// Metadata conversion service
const xml2js = require('xml2js');
const parser = new xml2js.Parser({ explicitArray: false });

/**
 * Convert EDMX metadata to OpenAPI specification
 * @param {string} edmxMetadata - EDMX XML string
 * @param {string} baseUrl - Base URL for the API
 * @param {string} selectedPublisher - Selected publisher to filter by (optional)
 * @param {Map} entityPublisherMap - Map of entity names to publisher names
 * @returns {Promise<Object>} - OpenAPI specification object
 */
async function convertEdmxToOpenApi(edmxMetadata, baseUrl, selectedPublisher, entityPublisherMap) {
  console.log("Starting EDMX to OpenAPI conversion");
  
  try {
    // Parse the EDMX XML
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
        description: selectedPublisher ? 
          `Automatically generated API docs from Dataverse metadata (Filtered by publisher: ${selectedPublisher})` :
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
    
    // Process entity types and entity sets
    processEntityTypes(entityTypes, openApiSpec, selectedPublisher, entityPublisherMap);
    processEntitySets(entitySets, openApiSpec, selectedPublisher, entityPublisherMap);
    
    // Add info about filtering in the API description
    if (selectedPublisher) {
      openApiSpec.info.description += `\n\nThis documentation only includes entities from the publisher: ${selectedPublisher}`;
    }
    
    console.log("Successfully generated OpenAPI specification");
    return openApiSpec;
    
  } catch (error) {
    console.error("Error in EDMX to OpenAPI conversion:", error);
    // Return a basic spec if conversion fails
    return createFallbackSpec(baseUrl, error);
  }
}

/**
 * Process entity types into OpenAPI schema components
 * @param {Array|Object} entityTypes - Entity types from EDMX
 * @param {Object} openApiSpec - OpenAPI specification object
 * @param {string} selectedPublisher - Selected publisher to filter by (optional)
 * @param {Map} entityPublisherMap - Map of entity names to publisher names
 */
function processEntityTypes(entityTypes, openApiSpec, selectedPublisher, entityPublisherMap) {
  if (Array.isArray(entityTypes)) {
    entityTypes.forEach(entityType => {
      const entityName = entityType.$.Name;
      
      // Skip if filtered by publisher
      if (!shouldIncludeEntity(entityName, selectedPublisher, entityPublisherMap)) {
        return;
      }
      
      const properties = {};
      
      if (entityType.Property && Array.isArray(entityType.Property)) {
        entityType.Property.forEach(prop => {
          properties[prop.$.Name] = edmTypeToOpenApiType(prop.$.Type);
        });
      } else if (entityType.Property) {
        properties[entityType.Property.$.Name] = edmTypeToOpenApiType(entityType.Property.$.Type);
      }
      
      openApiSpec.components.schemas[entityName] = {
        type: 'object',
        properties: properties
      };
    });
  } else if (entityTypes) {
    // Handle single entity type case
    const entityName = entityTypes.$.Name;
    
    // Skip if filtered by publisher
    if (shouldIncludeEntity(entityName, selectedPublisher, entityPublisherMap)) {
      const properties = {};
      
      if (entityTypes.Property && Array.isArray(entityTypes.Property)) {
        entityTypes.Property.forEach(prop => {
          properties[prop.$.Name] = edmTypeToOpenApiType(prop.$.Type);
        });
      } else if (entityTypes.Property) {
        properties[entityTypes.Property.$.Name] = edmTypeToOpenApiType(entityTypes.Property.$.Type);
      }
      
    // This is the missing portion of metadataService.js
// This should continue after openApiSpec.components.schemas[entityName]

openApiSpec.components.schemas[entityName] = {
    type: 'object',
    properties: properties
  };
}
}
}

/**
* Process entity sets into OpenAPI paths
* @param {Array|Object} entitySets - Entity sets from EDMX
* @param {Object} openApiSpec - OpenAPI specification object
* @param {string} selectedPublisher - Selected publisher to filter by (optional)
* @param {Map} entityPublisherMap - Map of entity names to publisher names
*/
function processEntitySets(entitySets, openApiSpec, selectedPublisher, entityPublisherMap) {
if (Array.isArray(entitySets)) {
entitySets.forEach(entitySet => {
  const name = entitySet.$.Name;
  const entityType = entitySet.$.EntityType.split('.').pop();
  
  // Skip if filtered by publisher
  if (!shouldIncludeEntity(entityType, selectedPublisher, entityPublisherMap)) {
    return;
  }
  
  createEntitySetPaths(name, entityType, openApiSpec);
});
} else if (entitySets) {
// Handle single entity set case
const name = entitySets.$.Name;
const entityType = entitySets.$.EntityType.split('.').pop();

// Skip if filtered by publisher
if (shouldIncludeEntity(entityType, selectedPublisher, entityPublisherMap)) {
  createEntitySetPaths(name, entityType, openApiSpec);
}
}
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
* Check if an entity should be included based on publisher filter
* @param {string} entityName - Entity name to check
* @param {string} selectedPublisher - Selected publisher to filter by (optional)
* @param {Map} entityPublisherMap - Map of entity names to publisher names
* @returns {boolean} - Whether to include the entity
*/
function shouldIncludeEntity(entityName, selectedPublisher, entityPublisherMap) {
if (!selectedPublisher) {
return true; // No filter, include all
}

// Check if we have publisher information for this entity
const entityPublisher = entityPublisherMap.get(entityName);
if (!entityPublisher) {
console.log(`No publisher information found for entity ${entityName}`);
return true; // Include by default if we don't know
}

const include = entityPublisher === selectedPublisher;
if (!include) {
console.log(`Filtering out entity ${entityName} from publisher ${entityPublisher}`);
}
return include;
}

/**
* Convert EDM type to OpenAPI type
* @param {string} edmType - EDM type from metadata
* @returns {Object} - OpenAPI type definition
*/
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

module.exports = {
convertEdmxToOpenApi
};