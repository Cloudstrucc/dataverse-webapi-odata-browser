// Dataverse API interaction service
const axios = require('axios');

/**
 * Fetch metadata from Dataverse
 * @param {string} baseUrl - The Dataverse environment URL
 * @param {string} token - Access token
 * @returns {Promise<string>} - XML metadata string
 */
async function fetchMetadata(baseUrl, token) {
  try {
    // For $metadata endpoint, we need the base URL without the API path
    let baseDataverseUrl = baseUrl.trim();
    
    // Remove api/data/vX.X if present
    baseDataverseUrl = baseDataverseUrl.replace(/\/api\/data\/v[0-9.]+\/?$/, '/');
    
    // Ensure URL ends with a slash
    if (!baseDataverseUrl.endsWith('/')) {
      baseDataverseUrl += '/';
    }
    
    // Construct the metadata URL
    const metadataUrl = `${baseDataverseUrl}$metadata`;
    console.log(`Fetching metadata from: ${metadataUrl}`);
    
    // Fetch the metadata from Dataverse as XML
    const response = await axios.get(metadataUrl, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/xml', // Explicitly request XML format
        'Content-Type': 'application/xml',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0'
      },
      responseType: 'text' // Get as plain text
    });
    
    // Validate that we got XML back
    if (response.data && typeof response.data === 'string' && response.data.trim().startsWith('<?xml')) {
      console.log("Successfully fetched metadata in XML format, size:", response.data.length);
      return response.data;
    } else if (response.data && typeof response.data === 'string' && response.data.trim().startsWith('<')) {
      // If it starts with < but not <?xml, it might still be XML
      console.log("Fetched metadata appears to be XML but without XML declaration, size:", response.data.length);
      return response.data;
    } else {
      // Not XML - could be JSON or another format
      console.error("Fetched metadata is not in XML format");
      if (typeof response.data === 'string' && response.data.length < 1000) {
        console.error("Response preview:", response.data);
      } else if (typeof response.data === 'object') {
        console.error("Response is an object, not XML");
      }
      throw new Error("Metadata endpoint did not return XML format as expected");
    }
  } catch (error) {
    console.error('Error fetching metadata:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', typeof error.response.data === 'object' 
        ? JSON.stringify(error.response.data) 
        : error.response.data);
      
      // If we got JSON data instead of XML, try a different approach
      if (error.response.headers['content-type'] && 
          error.response.headers['content-type'].includes('application/json') &&
          error.response.data) {
        console.log("Server returned JSON instead of XML. Trying alternative approach...");
        
        // Try fetching metadata from Web API endpoint
        try {
          const webApiUrl = normalizeDataverseUrl(baseUrl);
          const alternativeUrl = `${webApiUrl}RetrieveEntityMetadata`;
          console.log(`Trying alternative metadata endpoint: ${alternativeUrl}`);
          
          // This is a fallback approach that might not work in all environments
          return await fetchAlternativeMetadata(baseUrl, token);
        } catch (altError) {
          console.error("Alternative metadata approach also failed:", altError.message);
          throw new Error("Could not fetch metadata in any supported format");
        }
      }
    }
    throw error;
  }
}

/**
 * Fetch alternative metadata if the $metadata endpoint doesn't work
 * This uses a different approach to construct XML manually
 * @param {string} baseUrl - The Dataverse environment URL
 * @param {string} token - Access token
 * @returns {Promise<string>} - XML metadata string
 */
async function fetchAlternativeMetadata(baseUrl, token) {
  // We'll manually build a simplified EDMX document from entity definitions
  const apiUrl = normalizeDataverseUrl(baseUrl);
  
  // Fetch all entity definitions
  const entitiesUrl = `${apiUrl}EntityDefinitions?$select=LogicalName,SchemaName,DisplayName,EntitySetName&$expand=Attributes($select=LogicalName,SchemaName,AttributeType,DisplayName)`;
  
  const response = await axios.get(entitiesUrl, {
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0'
    }
  });
  
  if (!response.data || !response.data.value) {
    throw new Error("Failed to fetch entity definitions");
  }
  
  // Start building simplified EDMX XML
  let edmx = `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="4.0" xmlns:edmx="http://docs.oasis-open.org/odata/ns/edmx">
  <edmx:DataServices>
    <Schema Namespace="Microsoft.Dynamics.CRM" xmlns="http://docs.oasis-open.org/odata/ns/edm">`;
  
  // Add entity types
  response.data.value.forEach(entity => {
    edmx += `
      <EntityType Name="${entity.SchemaName}">`;
    
    // Add properties (attributes)
    if (entity.Attributes && Array.isArray(entity.Attributes)) {
      entity.Attributes.forEach(attr => {
        const edmType = mapCrmTypeToEdmType(attr.AttributeType);
        if (edmType) {
          edmx += `
        <Property Name="${attr.SchemaName}" Type="${edmType}" />`;
        }
      });
    }
    
    edmx += `
      </EntityType>`;
  });
  
  // Add entity container with entity sets
  edmx += `
      <EntityContainer Name="DefaultContainer">`;
  
  response.data.value.forEach(entity => {
    if (entity.EntitySetName) {
      edmx += `
        <EntitySet Name="${entity.EntitySetName}" EntityType="Microsoft.Dynamics.CRM.${entity.SchemaName}" />`;
    }
  });
  
  edmx += `
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;

  console.log("Generated alternative EDMX metadata, size:", edmx.length);
  return edmx;
}

/**
 * Map CRM attribute types to EDM types
 * @param {string} crmType - CRM attribute type
 * @returns {string} - EDM type
 */
function mapCrmTypeToEdmType(crmType) {
  const typeMap = {
    'String': 'Edm.String',
    'Memo': 'Edm.String',
    'Integer': 'Edm.Int32',
    'BigInt': 'Edm.Int64',
    'Boolean': 'Edm.Boolean',
    'Double': 'Edm.Double',
    'Decimal': 'Edm.Decimal',
    'Money': 'Edm.Decimal',
    'DateTime': 'Edm.DateTimeOffset',
    'Date': 'Edm.Date',
    'Lookup': 'Edm.Guid',
    'Owner': 'Edm.Guid',
    'Customer': 'Edm.Guid',
    'Uniqueidentifier': 'Edm.Guid',
    'Virtual': 'Edm.String',
    'State': 'Edm.Int32',
    'Status': 'Edm.Int32',
    'Picklist': 'Edm.Int32',
    'MultiSelectPicklist': 'Edm.String'
  };
  
  return typeMap[crmType] || 'Edm.String';
}

/**
 * Fetch publishers from Dataverse
 * @param {string} baseUrl - The Dataverse environment URL
 * @param {string} token - Access token
 * @returns {Promise<Array>} - Array of publishers
 */
async function fetchPublishers(baseUrl, token) {
  try {
    // Ensure the URL is properly formatted for API requests
    let apiUrl = normalizeDataverseUrl(baseUrl);
    
    // Construct the publishers endpoint URL
    let publishersUrl = `${apiUrl}publishers?$select=publisherid,friendlyname,uniquename,customizationprefix&$top=100`;
    
    console.log(`Fetching publishers from: ${publishersUrl}`);
    
    // Fetch the publishers from Dataverse
    const response = await axios.get(publishersUrl, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0'
      }
    });
    
    if (response.data && response.data.value) {
      const publishers = response.data.value.map(pub => ({
        ...pub,
        // Add display text combining friendly name and prefix for easier selection
        displayText: pub.customizationprefix ? 
          `${pub.friendlyname || pub.uniquename} (${pub.customizationprefix}_)` : 
          (pub.friendlyname || pub.uniquename)
      }));
      
      console.log(`Successfully fetched ${publishers.length} publishers`);
      return publishers;
    } else {
      console.warn('Publisher response did not contain expected data format:', response.data);
      return [];
    }
  } catch (error) {
    console.error('Error fetching publishers:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    throw error;
  }
}

/**
 * Normalize Dataverse URL to ensure it's properly formatted for API calls
 * @param {string} url - The input Dataverse URL
 * @returns {string} - Normalized URL for API calls
 */
function normalizeDataverseUrl(url) {
  // Remove trailing whitespace
  let normalizedUrl = url.trim();
  
  // Ensure URL ends with a slash
  if (!normalizedUrl.endsWith('/')) {
    normalizedUrl += '/';
  }
  
  // Check if URL has api/data/vX.X segment
  if (!normalizedUrl.includes('/api/data/v')) {
    // Check if it ends with web segment
    if (normalizedUrl.endsWith('/web/')) {
      // Remove 'web/' and add proper API path
      normalizedUrl = normalizedUrl.replace(/web\/$/, 'api/data/v9.2/');
    } else {
      // Add the API path
      normalizedUrl += 'api/data/v9.2/';
    }
  }
  
  console.log(`Normalized URL: ${normalizedUrl}`);
  return normalizedUrl;
}

module.exports = {
  fetchMetadata,
  fetchPublishers,
  normalizeDataverseUrl
};