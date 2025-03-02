const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class DatabaseService {
    constructor() {
        this.db = new sqlite3.Database(path.join(__dirname, '../audit.db'));
        this.initializeDatabase();
    }

    async initializeDatabase() {
        const queries = [
            `PRAGMA table_info(audit_records)`,
            `ALTER TABLE audit_records ADD COLUMN comments TEXT DEFAULT NULL`
        ];

        try {
            // Check if comments column exists
            const columns = await this.all(queries[0]);
            const hasComments = columns.some(col => col.name === 'comments');
            
            if (!hasComments) {
                // Add comments column if it doesn't exist
                await this.run(queries[1]);
                console.log('Added comments column to audit_records table');
            }
        } catch (error) {
            // Column might already exist, which is fine
            console.log('Database initialization completed');
        }
    }

    // Changed from static to instance methods
    async query(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    async run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, changes: this.changes });
            });
        });
    }

    // Add all method for PRAGMA queries
    async all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
}

// Export a single instance
const databaseService = new DatabaseService();
module.exports = databaseService;
