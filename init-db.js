const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

// Create backups directory if it doesn't exist
if (!fs.existsSync('./backups')) {
    fs.mkdirSync('./backups');
}

// Backup existing database if it exists
if (fs.existsSync('./audit.db')) {
    const backupName = `./backups/audit_${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
    fs.copyFileSync('./audit.db', backupName);
    console.log(`Created backup: ${backupName}`);
    // Delete the existing database to start fresh
    fs.unlinkSync('./audit.db');
    console.log('Removed existing database');
}

const db = new sqlite3.Database('./audit.db');

db.serialize(() => {
    // Create tables with ALL required columns
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

    // Create initial admin user
    db.run(`INSERT OR IGNORE INTO users (username, role) VALUES (?, ?)`, 
        ['admin', 'admin'], 
        (err) => {
            if (err) {
                console.error('Error creating admin user:', err);
            } else {
                console.log('Admin user created successfully');
            }
        }
    );

    // Verify schema
    db.all("PRAGMA table_info(audit_records);", [], (err, columns) => {
        if (err) {
            console.error('Error verifying schema:', err);
        } else {
            console.log('Current audit_records columns:', columns.map(c => c.name).join(', '));
        }
    });
});

db.close((err) => {
    if (err) {
        console.error('Error closing database:', err);
    } else {
        console.log('Database initialized successfully');
    }
});
