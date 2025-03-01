const fs = require('fs');
const csvParser = require('csv-parser');
const DatabaseService = require('./databaseService');
const Logger = require('../utils/logger');

class UploadService {
    static async processCSVFile(filePath) {
        const results = [];
        let processedCount = 0;

        return new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csvParser({
                    mapHeaders: ({ header }) => header.trim().toLowerCase().replace(/\s+/g, '_')
                }))
                .on('data', (data) => {
                    results.push(this.normalizeData(data));
                    processedCount++;
                })
                .on('end', async () => {
                    try {
                        const insertedCount = await this.saveToDatabase(results);
                        fs.unlinkSync(filePath); // Clean up file
                        resolve({ processedCount, insertedCount });
                    } catch (error) {
                        Logger.logError(error, 'CSV Processing');
                        reject(error);
                    }
                })
                .on('error', (error) => {
                    Logger.logError(error, 'CSV Reading');
                    reject(error);
                });
        });
    }

    static normalizeData(data) {
        return {
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
    }

    static async saveToDatabase(records) {
        let insertedCount = 0;
        
        const sql = `
            INSERT INTO audit_records (
                website_name, brand_name, sm_classification,
                brand_matches_website, dtc_status, risk_status,
                risk_reason, redirects, redirected_url, model_suggestion
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        for (const record of records) {
            try {
                await DatabaseService.run(sql, [
                    record.website_name,
                    record.brand_name,
                    record.sm_classification,
                    record.brand_matches_website,
                    record.dtc_status,
                    record.risk_status,
                    record.risk_reason,
                    record.redirects,
                    record.redirected_url,
                    record.model_suggestion
                ]);
                insertedCount++;
            } catch (error) {
                Logger.logError(error, `Record Insert: ${record.website_name}`);
            }
        }

        return insertedCount;
    }
}

module.exports = UploadService;
