/**
 * Authentication middleware for Dataverse API Explorer
 */

/**
 * Middleware to ensure user is authenticated
 */
function isAuthenticated(req, res, next) {
    if (!req.session.token) {
      return res.status(401).render('error', {
        title: 'Authentication Required',
        message: 'You need to sign in to access this resource',
        redirectUrl: '/',
        redirectText: 'Back to Login'
      });
    }
    next();
  }
  
  module.exports = {
    isAuthenticated
  };