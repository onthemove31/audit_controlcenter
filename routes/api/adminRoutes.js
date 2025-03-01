const express = require('express');
const router = express.Router();
const DatabaseService = require('../../services/databaseService');

router.get('/users', async (req, res) => {
    try {
        const users = await DatabaseService.query(`
            SELECT 
                id,
                username,
                role,
                (SELECT COUNT(*) FROM audit_records WHERE auditor = users.username) as record_count
            FROM users
            ORDER BY username
        `);
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/stats', async (req, res) => {
    try {
        const stats = {
            total: 0,
            audited: 0,
            activeAuditors: 0
        };

        const totalRecords = await DatabaseService.get('SELECT COUNT(*) as count FROM audit_records');
        stats.total = totalRecords.count;

        const auditedRecords = await DatabaseService.get(
            'SELECT COUNT(*) as count FROM audit_records WHERE auditor IS NOT NULL AND audit_date IS NOT NULL'
        );
        stats.audited = auditedRecords.count;

        const activeAuditors = await DatabaseService.get(
            'SELECT COUNT(DISTINCT auditor) as count FROM audit_records WHERE auditor IS NOT NULL'
        );
        stats.activeAuditors = activeAuditors.count;

        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/auditor-stats', async (req, res) => {
    try {
        const stats = await DatabaseService.query(`
            WITH AuditorStats AS (
                SELECT 
                    ar.auditor,
                    COUNT(*) as allocated,
                    SUM(CASE WHEN ar.audit_date IS NULL THEN 1 ELSE 0 END) as pending,
                    SUM(CASE WHEN ar.audit_date IS NOT NULL THEN 1 ELSE 0 END) as completed
                FROM audit_records ar
                WHERE ar.auditor IS NOT NULL
                GROUP BY ar.auditor
            )
            SELECT 
                u.username,
                COALESCE(s.allocated, 0) as allocated,
                COALESCE(s.pending, 0) as pending,
                COALESCE(s.completed, 0) as completed
            FROM users u
            LEFT JOIN AuditorStats s ON u.username = s.auditor
            WHERE u.role = 'auditor'
            ORDER BY u.username
        `);
        
        // Ensure we're sending an array
        const response = Array.isArray(stats) ? stats : [];
        console.log('Auditor stats response:', response); // Debug log
        
        // Set proper content type and send JSON response
        res.setHeader('Content-Type', 'application/json');
        res.json(response);
    } catch (error) {
        console.error('Error fetching auditor stats:', error);
        res.status(500).json({ error: error.message });
    }
});

router.post('/assign-random', async (req, res) => {
    try {
        // Get unallocated records count
        const unallocatedCount = await DatabaseService.get(
            'SELECT COUNT(*) as count FROM audit_records WHERE auditor IS NULL'
        );

        if (unallocatedCount.count === 0) {
            return res.status(400).json({ error: 'No records available for allocation' });
        }

        // Get available auditors
        const auditors = await DatabaseService.query(
            'SELECT username FROM users WHERE role = "auditor"'
        );

        if (auditors.length === 0) {
            return res.status(400).json({ error: 'No auditors available' });
        }

        // Start allocation process
        const timestamp = new Date().toISOString();
        let processed = 0;
        const BATCH_SIZE = 1000;

        while (processed < unallocatedCount.count) {
            // Get batch of unallocated records
            const records = await DatabaseService.query(
                'SELECT id FROM audit_records WHERE auditor IS NULL LIMIT ?',
                [BATCH_SIZE]
            );

            if (records.length === 0) break;

            // Assign records to auditors
            const assignments = records.map((record, index) => {
                const auditor = auditors[processed % auditors.length];
                processed++;
                return {
                    id: record.id,
                    auditor: auditor.username,
                    timestamp
                };
            });

            // Update records in batches
            await DatabaseService.run('BEGIN TRANSACTION');
            for (const assignment of assignments) {
                await DatabaseService.run(
                    'UPDATE audit_records SET auditor = ?, assigned_date = ? WHERE id = ?',
                    [assignment.auditor, assignment.timestamp, assignment.id]
                );
            }
            await DatabaseService.run('COMMIT');
        }

        res.json({
            success: true,
            assignedCount: processed,
            auditorCount: auditors.length
        });
    } catch (error) {
        console.error('Allocation error:', error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/unallocated-count', async (req, res) => {
    try {
        const result = await DatabaseService.get(
            'SELECT COUNT(*) as count FROM audit_records WHERE auditor IS NULL'
        );
        res.json({ count: result.count });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/reaudit-selection', async (req, res) => {
    try {
        const reAuditPercentage = 10;
        
        // Get completed records grouped by auditor
        const completedRecords = await DatabaseService.query(`
            SELECT id, auditor 
            FROM audit_records 
            WHERE auditor IS NOT NULL 
            AND audit_date IS NOT NULL
            ORDER BY auditor, RANDOM()
        `);

        // Group records by auditor
        const recordsByAuditor = {};
        completedRecords.forEach(record => {
            if (!recordsByAuditor[record.auditor]) {
                recordsByAuditor[record.auditor] = [];
            }
            recordsByAuditor[record.auditor].push(record);
        });

        const selectedRecords = [];
        // Select 10% of each auditor's records
        Object.entries(recordsByAuditor).forEach(([auditor, records]) => {
            const count = Math.ceil(records.length * (reAuditPercentage / 100));
            selectedRecords.push(...records.slice(0, count));
        });

        await DatabaseService.run('BEGIN TRANSACTION');
        
        for (const record of selectedRecords) {
            await DatabaseService.run(`
                INSERT INTO audit_logs (record_id, auditor, action, timestamp)
                VALUES (?, ?, 'selected_for_reaudit', datetime('now'))
            `, [record.id, record.auditor]);

            await DatabaseService.run(`
                UPDATE audit_records 
                SET audit_date = NULL, reaudit = 1
                WHERE id = ?
            `, [record.id]); // Note: Not clearing the auditor field
        }

        await DatabaseService.run('COMMIT');

        res.json({
            success: true,
            recordsSelected: selectedRecords.length
        });
    } catch (error) {
        await DatabaseService.run('ROLLBACK');
        res.status(500).json({ error: error.message });
    }
});

router.get('/export-records', async (req, res) => {
    try {
        const records = await DatabaseService.query(`
            SELECT * FROM audit_records
            WHERE auditor IS NOT NULL
            ORDER BY auditor, id
        `);

        if (!records || !records.length) {
            return res.status(404).json({ error: 'No records found' });
        }

        // Set headers for CSV download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=audit_records_' + new Date().toISOString().split('T')[0] + '.csv');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Pragma', 'no-cache');

        // Write CSV header
        const headers = Object.keys(records[0]).join(',') + '\n';
        res.write(headers);

        // Write records
        records.forEach(record => {
            const values = Object.values(record).map(value => {
                if (value === null || value === undefined) return '';
                if (typeof value === 'string') {
                    // Escape quotes and wrap in quotes if contains special chars
                    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                        return `"${value.replace(/"/g, '""')}"`;
                    }
                }
                return value;
            });
            res.write(values.join(',') + '\n');
        });

        res.end();
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: 'Failed to export records' });
    }
});

module.exports = router;
