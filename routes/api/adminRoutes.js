const express = require('express');
const router = express.Router();
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const DatabaseService = require('../../services/databaseService');

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = './uploads';
        if (!fs.existsSync(uploadDir)){
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, 'data_' + Date.now() + '.csv');
    }
});

const upload = multer({ storage: storage });

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

// Upload endpoint
router.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const results = [];
    let insertedCount = 0;
    let newAuditors = new Set();

    try {
        // First, get existing auditors
        const existingUsers = await DatabaseService.query('SELECT username FROM users');
        const existingUsernames = new Set(existingUsers.map(u => u.username));

        fs.createReadStream(req.file.path)
            .pipe(csv({
                mapHeaders: ({ header }) => {
                    const normalizedHeader = header.trim().toLowerCase().replace(/[\s-]/g, '_');
                    return normalizedHeader;
                }
            }))
            .on('data', (data) => {
                // Check if record is already audited and has an auditor
                const isAudited = data.dtc_status || 
                                data.risk_status || 
                                data.brand_matches_website ||
                                data.comments;
                
                // If there's an auditor in the data that's not in our users list, note it
                if (data.auditor && !existingUsernames.has(data.auditor)) {
                    newAuditors.add(data.auditor);
                }

                // Normalize the data structure
                const normalizedData = {
                    website_name: data.website_name || data.website || data.url || data.domain || '',
                    brand_name: data.brand_name || data.brand || '',
                    sm_classification: data.sm_classification || data.classification || '',
                    brand_matches_website: data.brand_matches_website || '',
                    dtc_status: data.dtc_status || '',
                    risk_status: data.risk_status || '',
                    risk_reason: data.risk_reason || '',
                    redirects: data.redirects || '',
                    redirected_url: data.redirected_url || data.redirect_url || '',
                    model_suggestion: data.model_suggestion || '',
                    comments: data.comments || '',
                    // Add audit information if present
                    auditor: data.auditor || null,
                    audit_date: isAudited ? new Date().toISOString() : null
                };

                results.push(normalizedData);
            })
            .on('end', async () => {
                try {
                    await DatabaseService.run('BEGIN TRANSACTION');

                    // Add any new auditors found
                    for (const auditor of newAuditors) {
                        await DatabaseService.run(
                            'INSERT INTO users (username, role) VALUES (?, ?)',
                            [auditor, 'auditor']
                        );
                    }

                    // Insert records
                    for (const row of results) {
                        await DatabaseService.run(`
                            INSERT INTO audit_records (
                                website_name,
                                brand_name,
                                sm_classification,
                                brand_matches_website,
                                dtc_status,
                                risk_status,
                                risk_reason,
                                redirects,
                                redirected_url,
                                model_suggestion,
                                comments,
                                auditor,
                                audit_date
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                row.website_name,
                                row.brand_name,
                                row.sm_classification,
                                row.brand_matches_website,
                                row.dtc_status,
                                row.risk_status,
                                row.risk_reason,
                                row.redirects,
                                row.redirected_url,
                                row.model_suggestion,
                                row.comments,
                                row.auditor,
                                row.audit_date
                            ]
                        );
                        insertedCount++;
                    }

                    await DatabaseService.run('COMMIT');

                    // Clean up uploaded file
                    fs.unlinkSync(req.file.path);

                    res.json({
                        success: true,
                        recordsProcessed: results.length,
                        recordsInserted: insertedCount,
                        auditedCount: results.filter(r => r.audit_date).length,
                        unauditedCount: results.filter(r => !r.audit_date).length,
                        newAuditorsAdded: Array.from(newAuditors)
                    });
                } catch (error) {
                    await DatabaseService.run('ROLLBACK');
                    console.error('Insert error:', error);
                    res.status(500).json({ error: 'Database insertion failed' });
                }
            });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'File processing failed' });
    }
});

module.exports = router;
