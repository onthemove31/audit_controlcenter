const express = require('express');
const router = express.Router();
const DatabaseService = require('../../services/databaseService');

router.get('/', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const auditor = req.query.auditor;
    const offset = (page - 1) * limit;

    try {
        // Get total count
        const totalCount = await DatabaseService.get(`
            SELECT COUNT(*) as count 
            FROM audit_records 
            WHERE auditor = ? 
            AND audit_date IS NULL`,
            [auditor]
        );

        // Get records
        const records = await DatabaseService.query(`
            SELECT * FROM audit_records 
            WHERE auditor = ? 
            AND audit_date IS NULL 
            ORDER BY assigned_date ASC 
            LIMIT ? OFFSET ?`,
            [auditor, limit, offset]
        );

        res.json({
            records: records,
            total: totalCount.count,
            currentPage: page,
            totalPages: Math.ceil(totalCount.count / limit)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/stats', async (req, res) => {
    const { auditor } = req.query;
    if (!auditor) {
        return res.status(400).json({ error: 'Auditor parameter required' });
    }
    
    try {
        // Set deadline - March 7, 2025, 7 PM IST
        const deadline = new Date('2025-03-07T13:30:00.000Z'); // 7 PM IST in UTC
        const now = new Date();
        
        // Calculate time remaining
        const remainingMs = deadline - now;
        const remainingDays = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
        const remainingHours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

        // Get today's first login time
        const loginTime = await DatabaseService.get(`
            SELECT MIN(timestamp) as first_login
            FROM audit_logs 
            WHERE auditor = ? 
            AND action = 'login'
            AND DATE(timestamp) = DATE('now')`,
            [auditor]
        );

        const stats = await DatabaseService.get(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN audit_date IS NOT NULL THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN audit_date IS NULL THEN 1 ELSE 0 END) as pending,
                MIN(assigned_date) as oldest_assignment
            FROM audit_records 
            WHERE auditor = ?`,
            [auditor]
        );
        
        // Calculate time metrics
        const oldestDate = stats.oldest_assignment ? new Date(stats.oldest_assignment) : null;
        const timeMetrics = {
            elapsedDays: 0,
            recordsPerDay: 0,
            estimatedDaysRemaining: 0
        };

        if (oldestDate) {
            const elapsedMs = now - oldestDate;
            timeMetrics.elapsedDays = Math.ceil(elapsedMs / (1000 * 60 * 60 * 24));
            
            if (stats.completed > 0 && timeMetrics.elapsedDays > 0) {
                timeMetrics.recordsPerDay = stats.completed / timeMetrics.elapsedDays;
                timeMetrics.estimatedDaysRemaining = Math.ceil(stats.pending / timeMetrics.recordsPerDay);
            }
        }
        
        // Calculate elapsed time since login
        const firstLogin = loginTime?.first_login ? new Date(loginTime.first_login) : now;
        const sessionMs = now - firstLogin;
        const elapsedHours = Math.floor(sessionMs / (1000 * 60 * 60));
        const elapsedMinutes = Math.floor((sessionMs % (1000 * 60 * 60)) / (1000 * 60));
        
        res.json({
            total: stats.total || 0,
            completed: stats.completed || 0,
            pending: stats.pending || 0,
            ...timeMetrics,
            elapsedTime: `${elapsedHours}h ${elapsedMinutes}m`,
            loginTime: firstLogin.toISOString(),
            deadline: deadline.toISOString(),
            timeRemaining: `${remainingDays}d ${remainingHours}h ${remainingMinutes}m`,
            remainingDays,
            remainingHours,
            remainingMinutes,
            isPastDeadline: now > deadline
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update save endpoint to return save status
router.post('/save', async (req, res) => {
    const record = req.body;
    
    try {
        await DatabaseService.run('BEGIN TRANSACTION');
        
        // Update the record
        const result = await DatabaseService.run(`
            UPDATE audit_records 
            SET brand_matches_website = ?,
                dtc_status = ?,
                risk_status = ?,
                risk_reason = ?,
                audit_date = datetime('now'),
                model_suggestion = ?
            WHERE id = ? AND auditor = ?`,
            [
                record.brand_matches_website || null,
                record.dtc_status || null,
                record.risk_status || null,
                record.risk_reason || null,
                record.model_suggestion || null,
                record.id,
                record.auditor
            ]
        );

        if (result.changes === 0) {
            await DatabaseService.run('ROLLBACK');
            return res.status(404).json({ error: 'Record not found or not authorized' });
        }
        
        // Log the change
        await DatabaseService.run(`
            INSERT INTO audit_logs (record_id, auditor, action, timestamp, changes)
            VALUES (?, ?, 'update', datetime('now'), ?)`,
            [record.id, record.auditor, JSON.stringify(record)]
        );
        
        await DatabaseService.run('COMMIT');
        
        res.json({ 
            success: true, 
            savedAt: new Date().toISOString(),
            message: 'Record saved successfully'
        });
    } catch (error) {
        await DatabaseService.run('ROLLBACK');
        console.error('Save error:', error);
        res.status(500).json({ error: 'Failed to save record' });
    }
});

module.exports = router;
