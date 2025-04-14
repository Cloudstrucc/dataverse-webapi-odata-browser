// Authentication controller
const express = require('express');
const router = express.Router();
const msal = require('@azure/msal-node');
const azureConfig = require('../config/azureConfig');

// Initialize MSAL
let msalConfig = {
  auth: {
    clientId: azureConfig.clientId,
    authority: azureConfig.authority,
    clientSecret: azureConfig.clientSecret,
  }
};

let cca = new msal.ConfidentialClientApplication(msalConfig);

// Update tenant ID and reinitialize MSAL
router.post('/set-tenant', (req, res) => {
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

// Start sign-in process
router.get('/login', (req, res) => {
  const authCodeUrlParameters = {
    scopes: azureConfig.scopes,
    redirectUri: azureConfig.redirectUri,
  };

  cca.getAuthCodeUrl(authCodeUrlParameters)
    .then((response) => {
      res.redirect(response);
    })
    .catch((error) => {
      console.error('Auth Code URL Error:', error);
      res.status(500).render('error', {
        title: 'Authentication Error',
        message: 'Error during authentication.',
        details: error.message
      });
    });
});

// OAuth callback route
router.get('/callback', (req, res) => {
  const tokenRequest = {
    code: req.query.code,
    scopes: azureConfig.scopes,
    redirectUri: azureConfig.redirectUri,
  };

  cca.acquireTokenByCode(tokenRequest)
    .then((response) => {
      req.session.token = response.accessToken;
      res.redirect('/');
    })
    .catch((error) => {
      console.error('Token Acquisition Error:', error);
      res.status(500).render('error', {
        title: 'Authentication Error',
        message: 'Error acquiring token.',
        details: error.message
      });
    });
});

// Logout route
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/');
  });
});

module.exports = router;