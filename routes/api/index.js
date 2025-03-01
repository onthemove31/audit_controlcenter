const express = require('express');
const router = express.Router();

// Import route modules
const adminRoutes = require('./adminRoutes');
const auditRoutes = require('./auditRoutes');
const userRoutes = require('./userRoutes');
const uploadRoutes = require('./uploadRoutes');

// Mount routes
router.use('/admin', adminRoutes);
router.use('/records', auditRoutes);
router.use('/users', userRoutes);
router.use('/upload', uploadRoutes);

module.exports = router;
