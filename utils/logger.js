const fs = require('fs');
const path = require('path');

class Logger {
    static logError(error, context = '') {
        const timestamp = new Date().toISOString();
        const logEntry = `${timestamp} - ${context}: ${error.message}\n${error.stack}\n`;
        
        fs.appendFile(
            path.join(__dirname, '../logs/error.log'),
            logEntry,
            err => {
                if (err) console.error('Failed to write to log file:', err);
            }
        );
    }

    static logInfo(message, context = '') {
        const timestamp = new Date().toISOString();
        const logEntry = `${timestamp} - ${context}: ${message}\n`;
        
        fs.appendFile(
            path.join(__dirname, '../logs/info.log'),
            logEntry,
            err => {
                if (err) console.error('Failed to write to log file:', err);
            }
        );
    }
}

module.exports = Logger;
