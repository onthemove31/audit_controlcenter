const express = require('express');
const router = express.Router();
const DatabaseService = require('../../services/databaseService');

router.post('/login', async (req, res) => {
    const { username } = req.body;
    try {
        const user = await DatabaseService.get(
            'SELECT id, username, role FROM users WHERE username = ?', 
            [username]
        );
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
