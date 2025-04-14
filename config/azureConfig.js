// Azure AD configuration

const azureConfig = {
    clientId: '66323902-24bb-43fa-8912-a311e6d73f2f',
    tenantId: process.env.tenant_id || '24a46daa-7b87-4566-9eea-281326a1b75c', // Default can be overridden
    get authority() {
      return `https://login.microsoftonline.com/${this.tenantId}`;
    },
    clientSecret: process.env.client_secret, // Use from .env file
    redirectUri: process.env.REDIRECT_URI || 'http://localhost:3000/auth/callback',
    scopes: ['https://vcs-website-csdev.crm3.dynamics.com/.default']
  };
  
  module.exports = azureConfig;