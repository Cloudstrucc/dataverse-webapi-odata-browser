// server.js - Main application entry point
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const { engine } = require('express-handlebars');
const path = require('path');
const fs = require('fs');

// Import controllers
const authController = require('./controllers/authController');
const apiController = require('./controllers/apiController');
const uiController = require('./controllers/uiController');

// Create Express application
const app = express();

// Create necessary directories if they don't exist
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

// Setup view engine
app.engine('hbs', engine({
  extname: '.hbs',
  defaultLayout: 'main',
  layoutsDir: path.join(__dirname, 'views/layouts'),
  partialsDir: path.join(__dirname, 'views/partials')
}));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(session({
  secret: process.env.session_secret || 'default_secret_change_me',
  resave: false,
  saveUninitialized: false,
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Mount routes
app.use('/', uiController);
app.use('/auth', authController);
app.use('/api', apiController);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  const statusCode = err.statusCode || 500;
  
  res.status(statusCode).render('error', {
    title: 'Error',
    message: err.message || 'An unexpected error occurred',
    details: process.env.NODE_ENV === 'development' ? err.stack : null,
    error: {
      status: statusCode,
      stack: process.env.NODE_ENV === 'development' ? err.stack : ''
    }
  });
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`
╔════════════════════════════════════════════╗
║  Dataverse API Explorer                    ║
║  Server running on http://localhost:${port}     ║
║                                            ║
║  Environment:                              ║
║  - Dataverse URL: ${process.env.dataverse_url ? 'Configured ✓' : 'Not set ✗'}           ║
║  - Client Secret: ${process.env.client_secret ? 'Configured ✓' : 'Not set ✗'}           ║
║  - Session Secret: ${process.env.session_secret ? 'Configured ✓' : 'Not set ✗'}         ║
║  - Tenant ID: ${process.env.tenant_id ? process.env.tenant_id : 'Default'}    ║
║  - Publisher Filter: ${process.env.publisher ? process.env.publisher : 'None'}         ║
╚════════════════════════════════════════════╝
  `);
});