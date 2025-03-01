const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const fs = require('fs');
const csvParser = require('csv-parser');
const path = require('path');

const app = express();
const db = new sqlite3.Database('./audit.db');

// Update the multer configuration to specify storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = './uploads';
        if (!fs.existsSync(uploadDir)){
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, 'data_' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());  // This needs to be before routes
app.use(express.urlencoded({ extended: true }));  // Add this line
app.use(express.static('public'));

// Database initialization
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT UNIQUE,
        role TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS audit_records (
        id INTEGER PRIMARY KEY,
        website_name TEXT,
        brand_name TEXT,
        sm_classification TEXT,
        brand_matches_website TEXT,
        dtc_status TEXT,
        risk_status TEXT,
        risk_reason TEXT,
        redirects TEXT,
        redirected_url TEXT,
        auditor TEXT,
        audit_date TEXT,
        model_suggestion TEXT,
        reaudit INTEGER DEFAULT 0,
        assigned_date TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY,
        record_id INTEGER,
        auditor TEXT,
        action TEXT,
        timestamp TEXT,
        changes TEXT
    )`);
});

// User routes
app.post('/api/users/login', (req, res) => {
    const { username } = req.body;
    db.get('SELECT id, username, role FROM users WHERE username = ?', 
        [username], 
        (err, row) => {
            if (err) {
                res.status(500).json({ error: err.message });
            } else if (!row) {
                res.status(404).json({ error: 'User not found' });
            } else {
                res.json(row);
            }
        }
    );
});

// Add this route handler before other routes
app.post('/api/admin/users', (req, res) => {
    console.log('Received user creation request:', req.body); // Debug log
    const { username } = req.body;
    
    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }

    const role = username === 'admin' ? 'admin' : 'auditor';

    db.run('INSERT INTO users (username, role) VALUES (?, ?)', 
        [username, role], 
        function(err) {
            if (err) {
                // Check if error is due to duplicate username
                if (err.message.includes('UNIQUE constraint failed')) {
                    res.status(400).json({ error: 'Username already exists' });
                } else {
                    res.status(500).json({ error: err.message });
                }
                return;
            }
            
            res.json({
                id: this.lastID,
                username: username,
                role: role
            });
        }
    );
});

// Audit routes
app.get('/api/records', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const auditor = req.query.auditor;
    const limit = 10;
    const offset = (page - 1) * limit;
    
    console.log('Fetching records for:', { page, auditor, limit, offset }); // Debug log
    
    db.all(`
        SELECT * FROM audit_records 
        WHERE auditor = ? 
        AND audit_date IS NULL 
        ORDER BY assigned_date ASC 
        LIMIT ? OFFSET ?`,
        [auditor, limit, offset], 
        (err, rows) => {
            if (err) {
                console.error('Database error:', err); // Debug log
                res.status(500).json({ error: err.message });
            } else {
                console.log('Found records:', rows.length); // Debug log
                res.json(rows);
            }
    });
});

app.post('/api/records/audit', (req, res) => {
    const record = req.body;
    
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // Update the record
        db.run(`
            UPDATE audit_records 
            SET brand_matches_website = ?,
                dtc_status = ?,
                risk_status = ?,
                risk_reason = ?,
                audit_date = ?,
                auditor = ?
            WHERE id = ?`,
            [
                record.brand_matches_website,
                record.dtc_status,
                record.risk_status,
                record.risk_reason,
                record.audit_date,
                record.auditor,
                record.id
            ],
            (err) => {
                if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ error: err.message });
                }
                
                // Log the audit
                db.run(`
                    INSERT INTO audit_logs (record_id, auditor, action, timestamp, changes)
                    VALUES (?, ?, 'audit_complete', datetime('now'), ?)`,
                    [record.id, record.auditor, JSON.stringify(record)],
                    (err) => {
                        if (err) {
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: err.message });
                        }
                        
                        db.run('COMMIT');
                        res.json({ success: true });
                    }
                );
            }
        );
    });
});

app.get('/api/records/stats', (req, res) => {
    const { auditor } = req.query;
    
    db.serialize(() => {
        db.get(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN audit_date IS NOT NULL THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN audit_date IS NULL THEN 1 ELSE 0 END) as pending
            FROM audit_records 
            WHERE auditor = ?`,
            [auditor],
            (err, row) => {
                if (err) res.status(500).json({ error: err.message });
                else res.json({
                    total: row.total || 0,
                    completed: row.completed || 0,
                    pending: row.pending || 0
                });
            }
        );
    });
});

// Admin routes

// Add upload progress tracking variable
let uploadProgress = {
    total: 0,
    processed: 0,
    percent: 0
};

// Add SSE endpoint for upload progress
app.get('/api/admin/upload-progress', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });
    
    const sendProgress = () => {
        res.write(`data: ${JSON.stringify(uploadProgress)}\n\n`);
    };

    const progressInterval = setInterval(sendProgress, 1000);
    
    req.on('close', () => {
        clearInterval(progressInterval);
    });
});

// Modify the upload endpoint
app.post('/api/admin/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const results = [];
    let insertedCount = 0;
    let headers = null;
    
    // Reset progress
    uploadProgress = {
        total: 0,
        processed: 0,
        percent: 0
    };

    // First pass to count total rows
    fs.createReadStream(req.file.path)
        .pipe(csvParser())
        .on('data', () => {
            uploadProgress.total++;
        })
        .on('end', () => {
            // Start actual processing
            fs.createReadStream(req.file.path)
                .pipe(csvParser({
                    mapHeaders: ({ header }) => {
                        return header.trim().toLowerCase().replace(/\s+/g, '_');
                    }
                }))
                .on('data', (data) => {
                    const normalizedData = {
                        website_name: data.website_name || data.website || data.url || '',
                        brand_name: data.brand_name || data.brand || '',
                        sm_classification: data.sm_classification || data.classification || '',
                        brand_matches_website: data.brand_matches_website || '',
                        dtc_status: data.dtc_status || '',
                        risk_status: data.risk_status || '',
                        risk_reason: data.risk_reason || '',
                        redirects: data.redirects || '',
                        redirected_url: data.redirected_url || data.redirect_url || '',
                        model_suggestion: data.model_suggestion || ''
                    };

                    results.push(normalizedData);
                    uploadProgress.processed++;
                    uploadProgress.percent = Math.round((uploadProgress.processed / uploadProgress.total) * 100);
                })
                .on('end', () => {
                    // Database insertion code remains the same
                    db.serialize(() => {
                        const stmt = db.prepare(`
                            INSERT INTO audit_records (
                                website_name, brand_name, sm_classification,
                                brand_matches_website, dtc_status, risk_status,
                                risk_reason, redirects, redirected_url, model_suggestion
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `);

                        db.run('BEGIN TRANSACTION');

                        results.forEach((row) => {
                            stmt.run([
                                row.website_name,
                                row.brand_name,
                                row.sm_classification,
                                row.brand_matches_website,
                                row.dtc_status,
                                row.risk_status,
                                row.risk_reason,
                                row.redirects,
                                row.redirected_url,
                                row.model_suggestion
                            ], function(err) {
                                if (!err) insertedCount++;
                            });
                        });

                        stmt.finalize();

                        db.run('COMMIT', (err) => {
                            fs.unlinkSync(req.file.path);
                            if (err) {
                                return res.status(500).json({ error: err.message });
                            }
                            res.json({ 
                                message: 'Upload complete', 
                                recordsProcessed: results.length,
                                recordsInserted: insertedCount 
                            });
                        });
                    });
                });
        });
});

app.get('/api/admin/upload-status', (req, res) => {
    db.get('SELECT COUNT(*) as total FROM audit_records', (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ totalRecords: row.total });
        }
    });
});

// Fix the stats endpoint
app.get('/api/admin/stats', (req, res) => {
    db.serialize(() => {
        const stats = {};
        
        // Get total records
        db.get('SELECT COUNT(*) as total FROM audit_records', (err, row) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            stats.total = row ? row.total : 0;
            
            // Get audited records count
            db.get('SELECT COUNT(*) as audited FROM audit_records WHERE auditor IS NOT NULL AND audit_date IS NOT NULL', (err, row) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                stats.audited = row ? row.audited : 0;
                
                // Get active auditors count
                db.get('SELECT COUNT(DISTINCT auditor) as active FROM audit_records WHERE auditor IS NOT NULL', (err, row) => {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }
                    stats.activeAuditors = row ? row.active : 0;
                    
                    // Get metrics
                    stats.metrics = {
                        precision: 0,
                        recall: 0,
                        avgTime: 0,
                        throughput: stats.audited
                    };
                    res.json(stats);
                });
            });
        });
    });
});

// Fix random allocation endpoint
app.post('/api/admin/assign-random', (req, res) => {
    console.log('Starting random allocation...');
    
    // Reset stats
    auditorStats = {};
    
    db.serialize(() => {
        // Get batch size based on available memory
        const BATCH_SIZE = 1000;
        
        // First, get count of unallocated records
        db.get('SELECT COUNT(*) as count FROM audit_records WHERE auditor IS NULL', 
            [], (err, countRow) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }

                if (countRow.count === 0) {
                    return res.status(400).json({ error: 'No records available for allocation' });
                }

                // Get available auditors
                db.all('SELECT username FROM users WHERE role = "auditor"', [], 
                    (err, auditors) => {
                        if (err) {
                            return res.status(500).json({ error: err.message });
                        }

                        if (auditors.length === 0) {
                            return res.status(400).json({ error: 'No auditors available' });
                        }

                        // Initialize stats for each auditor
                        auditors.forEach(auditor => {
                            auditorStats[auditor.username] = {
                                allocated: 0,
                                pending: 0,
                                completed: 0
                            };
                        });

                        // Initialize progress tracking
                        allocationProgress = {
                            percent: 0,
                            current: 0,
                            total: countRow.count
                        };

                        // Process in batches
                        let processed = 0;
                        const timestamp = new Date().toISOString();

                        function processBatch() {
                            db.all(`SELECT id FROM audit_records 
                                   WHERE auditor IS NULL 
                                   LIMIT ?`, [BATCH_SIZE], (err, records) => {
                                if (err) {
                                    return res.status(500).json({ error: err.message });
                                }

                                if (records.length === 0) {
                                    // All done
                                    return res.json({
                                        message: 'Records assigned successfully',
                                        assignedCount: processed,
                                        auditorCount: auditors.length
                                    });
                                }

                                db.run('BEGIN TRANSACTION');

                                records.forEach((record, index) => {
                                    const auditor = auditors[processed % auditors.length];
                                    db.run(`UPDATE audit_records 
                                          SET auditor = ?, assigned_date = ?
                                          WHERE id = ?`,
                                        [auditor.username, timestamp, record.id]);
                                    
                                    processed++;
                                    allocationProgress.current = processed;
                                    allocationProgress.percent = Math.round((processed / countRow.count) * 100);
                                    
                                    // Update stats in memory
                                    const auditorStat = auditorStats[auditor.username] || { allocated: 0 };
                                    auditorStat.allocated++;
                                    auditorStats[auditor.username] = auditorStat;
                                });

                                db.run('COMMIT', (err) => {
                                    if (err) {
                                        return res.status(500).json({ error: err.message });
                                    }
                                    // Process next batch
                                    processBatch();
                                });
                            });
                        }

                        // Start processing
                        processBatch();
                    });
            });
    });
});

// Add progress tracking
let allocationProgress = {
    percent: 0,
    current: 0,
    total: 0
};

let auditorStats = {};

// Add SSE endpoint for progress updates
app.get('/api/admin/allocation-progress', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });
    
    const sendProgress = () => {
        res.write(`data: ${JSON.stringify(allocationProgress)}\n\n`);
    };

    const progressInterval = setInterval(sendProgress, 1000);
    
    req.on('close', () => {
        clearInterval(progressInterval);
    });
});

// Add endpoint to get unallocated count
app.get('/api/admin/unallocated-count', (req, res) => {
    db.get('SELECT COUNT(*) as count FROM audit_records WHERE auditor IS NULL', 
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ count: row.count });
        });
});

// Fix re-audit selection endpoint
app.post('/api/admin/reaudit-selection', (req, res) => {
    const reAuditPercentage = 10; // 10% of audited records
    
    db.serialize(() => {
        db.all(`
            SELECT id, auditor 
            FROM audit_records 
            WHERE auditor IS NOT NULL 
            AND audit_date IS NOT NULL
        `, [], (err, records) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            const recordsToReAudit = Math.ceil(records.length * (reAuditPercentage / 100));
            const selectedRecords = [];

            while (selectedRecords.length < recordsToReAudit && records.length > 0) {
                const randomIndex = Math.floor(Math.random() * records.length);
                selectedRecords.push(records.splice(randomIndex, 1)[0]);
            }

            db.run('BEGIN TRANSACTION');

            let processedCount = 0;
            selectedRecords.forEach(record => {
                db.run(`
                    INSERT INTO audit_logs (record_id, auditor, action, timestamp)
                    VALUES (?, ?, 'selected_for_reaudit', datetime('now'))
                `, [record.id, record.auditor]);

                db.run(`
                    UPDATE audit_records 
                    SET auditor = NULL, audit_date = NULL, reaudit = 1
                    WHERE id = ?
                `, [record.id], function(err) {
                    if (!err) processedCount++;
                });
            });

            db.run('COMMIT', (err) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
                res.json({
                    message: 'Re-audit selection complete',
                    recordsSelected: processedCount
                });
            });
        });
    });
});

// Notification routes
app.post('/api/notifications', (req, res) => {
    const { type, message, userId } = req.body;
    // Store notification in database and send email if needed
    const notification = {
        type,
        message,
        userId,
        timestamp: new Date().toISOString()
    };
    
    // Send email for important notifications
    if (type === 'important') {
        sendEmail(notification);
    }
    res.json({ success: true });
});

function sendEmail(notification) {
    // Email sending logic using nodemailer
    // ...
}

// Backup scheduling
cron.schedule('0 0 * * *', () => {
    // Daily backup logic
    // ...
});

// User management routes
app.get('/api/admin/users', (req, res) => {
    db.all('SELECT * FROM users', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

app.delete('/api/admin/users/:id', (req, res) => {
    const id = req.params.id;
    // Don't allow deleting the admin user
    db.get('SELECT role FROM users WHERE id = ?', [id], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (row && row.role === 'admin') {
            return res.status(400).json({ error: 'Cannot delete admin user' });
        }
        db.run('DELETE FROM users WHERE id = ?', id, (err) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json({ message: 'User deleted successfully' });
        });
    });
});

// Add new endpoint for auditor statistics
app.get('/api/admin/auditor-stats', (req, res) => {
    console.log('Fetching auditor stats...'); // Debug log
    db.all(`
        WITH UserStats AS (
            SELECT 
                u.username,
                COUNT(ar.id) as allocated,
                COUNT(CASE WHEN ar.audit_date IS NULL THEN 1 END) as pending,
                COUNT(CASE WHEN ar.audit_date IS NOT NULL THEN 1 END) as completed
            FROM users u
            LEFT JOIN audit_records ar ON u.username = ar.auditor
            WHERE u.role = 'auditor'
            GROUP BY u.username
        )
        SELECT 
            username,
            allocated,
            pending,
            completed
        FROM UserStats
        WHERE allocated > 0
        ORDER BY allocated DESC
    `, [], (err, rows) => {
        if (err) {
            console.error('Error fetching auditor stats:', err);
            return res.status(500).json({ error: err.message });
        }
        console.log('Auditor stats results:', rows); // Debug log
        res.json(rows);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});