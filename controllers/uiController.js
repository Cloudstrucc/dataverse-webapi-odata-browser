// Main UI controller
const express = require('express');
const router = express.Router();
const azureConfig = require('../config/azureConfig');

// Home route
router.get('/', (req, res) => {
  if (!req.session.token) {
    // If not signed in, show login page
    res.render('index', {
      title: 'Dataverse API Explorer - Login',
      tenantId: azureConfig.tenantId
    });
  } else {
    // If signed in, show dashboard
    res.render('dashboard', {
      title: 'Dataverse API Explorer - Dashboard',
      dataverseUrl: process.env.dataverse_url || '',
      prefix: process.env.prefix || '',
      isAuthenticated: !!req.session.token
    });
  }
});

// Redirect to API docs page
router.get('/api-docs', (req, res) => {
  if (!req.session.openApiGenerated) {
    return res.render('error', {
      title: 'Documentation Not Available',
      message: 'Please generate API documentation first',
      redirectUrl: '/',
      redirectText: 'Back to Home'
    });
  }
  
  res.render('api-docs', {
    title: 'Dataverse API Documentation',
    isAuthenticated: !!req.session.token,
    prefix: req.session.prefix || 'None'
  });
});

module.exports = router;