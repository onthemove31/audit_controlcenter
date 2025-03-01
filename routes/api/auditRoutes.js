const express = require('express');
const router = express.Router();
const DatabaseService = require('../../services/databaseService');

router.get('/', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const auditor = req.query.auditor;
    const limit = 10;
    const offset = (page - 1) * limit;

    try {
        const records = await DatabaseService.query(`
            SELECT * FROM audit_records 
            WHERE auditor = ? 
            AND audit_date IS NULL 
            ORDER BY assigned_date ASC 
            LIMIT ? OFFSET ?`,
            [auditor, limit, offset]
        );
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/stats', async (req, res) => {
    const { auditor } = req.query;
    
    try {
        const stats = await DatabaseService.get(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN audit_date IS NOT NULL THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN audit_date IS NULL THEN 1 ELSE 0 END) as pending
            FROM audit_records 
            WHERE auditor = ?`,
            [auditor]
        );
        
        res.json({
            total: stats.total || 0,
            completed: stats.completed || 0,
            pending: stats.pending || 0
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
