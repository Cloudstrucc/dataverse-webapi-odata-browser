// Dataverse API interaction service
const axios = require('axios');

/**
 * Fetch metadata from Dataverse
 * @param {string} baseUrl - The Dataverse environment URL
 * @param {string} token - Access token
 * @returns {Promise<string>} - XML metadata string
 */
async function fetchMetadata(baseUrl, token) {
  // Construct the metadata URL
  let metadataUrl = baseUrl;
  if (!metadataUrl.endsWith('$metadata')) {
    if (!metadataUrl.endsWith('/')) {
      metadataUrl += '/';
    }
    metadataUrl += '$metadata';
  }
  
  try {
    // Fetch the metadata from Dataverse as XML
    const response = await axios.get(metadataUrl, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/xml' // Explicitly request XML format
      },
      responseType: 'text' // Get as plain text
    });
    
    console.log("Successfully fetched metadata in XML format");
    return response.data;
  } catch (error) {
    console.error('Error fetching metadata:', error.message);
    throw error;
  }
}

/**
 * Fetch publishers from Dataverse
 * @param {string} baseUrl - The Dataverse environment URL
 * @param {string} token - Access token
 * @returns {Promise<Array>} - Array of publishers
 */
async function fetchPublishers(baseUrl, token) {
  try {
    // Construct the publishers endpoint URL
    let publishersUrl = baseUrl;
    if (!publishersUrl.endsWith('/')) {
      publishersUrl += '/';
    }
    publishersUrl += 'publishers?$select=publisherid,friendlyname,uniquename&$top=100';
    
    // Fetch the publishers from Dataverse
    const response = await axios.get(publishersUrl, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });
    
    return response.data.value || [];
  } catch (error) {
    console.error('Error fetching publishers:', error.message);
    throw error;
  }
}

/**
 * Build a map of entity names to their publisher unique names
 * @param {string} baseUrl - The Dataverse environment URL
 * @param {string} token - Access token
 * @param {string} selectedPublisher - Publisher unique name to filter by (optional)
 * @returns {Promise<Map>} - Map of entity names to publisher unique names
 */
async function fetchEntityPublisherMap(baseUrl, token, selectedPublisher) {
  const entityPublisherMap = new Map();
  
  try {
    // Construct the entity definitions URL
    let entitiesUrl = baseUrl;
    if (!entitiesUrl.endsWith('/')) {
      entitiesUrl += '/';
    }
    entitiesUrl += 'EntityDefinitions?$select=LogicalName,SchemaName,EntitySetName,MetadataId&$expand=Publisher($select=PublisherId,UniqueName)&$top=999';
    
    // Add filter if a specific publisher is selected
    if (selectedPublisher) {
      entitiesUrl += `&$filter=Publisher/UniqueName eq '${selectedPublisher}'`;
    }
    
    // Fetch the entity definitions
    const response = await axios.get(entitiesUrl, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json' 
      }
    });
    
    const entities = response.data.value || [];
    console.log(`Fetched ${entities.length} entity definitions for publisher mapping`);
    
    // Create a map of entity names to their publishers
    entities.forEach(entity => {
      if (entity.Publisher && entity.Publisher.UniqueName) {
        entityPublisherMap.set(entity.SchemaName, entity.Publisher.UniqueName);
      }
    });
    
    console.log(`Built entity-publisher map with ${entityPublisherMap.size} entries`);
    return entityPublisherMap;
  } catch (error) {
    console.error('Error fetching entity publisher mapping:', error.message);
    throw error;
  }
}

module.exports = {
  fetchMetadata,
  fetchPublishers,
  fetchEntityPublisherMap
};