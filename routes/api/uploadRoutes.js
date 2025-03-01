const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const UploadService = require('../../services/uploadService');
const Logger = require('../../utils/logger');

// Configure multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `data_${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({ storage });

// Upload endpoint
router.post('/csv', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        const result = await UploadService.processCSVFile(req.file.path);
        Logger.logInfo(`CSV Upload complete: ${result.processedCount} processed, ${result.insertedCount} inserted`);
        res.json({
            success: true,
            message: 'Upload complete',
            ...result
        });
    } catch (error) {
        Logger.logError(error, 'Upload Route');
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
