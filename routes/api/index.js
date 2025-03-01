const express = require('express');
const router = express.Router();

// Import route modules
const adminRoutes = require('./adminRoutes');
const auditRoutes = require('./auditRoutes');

// Mount routes
router.use('/audit', auditRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
