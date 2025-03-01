module.exports = {
    database: {
        filename: process.env.DB_PATH || './audit.db',
        options: {
            verbose: true
        }
    },
    pool: {
        min: 0,
        max: 7
    },
    queryTimeout: 30000
};
