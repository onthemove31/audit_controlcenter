# Zuma Auditor Application

## Setup Instructions

1. Install Node.js (v14+ recommended)
2. Install dependencies:
```bash
npm install
```

3. Initialize the database with sample user:
```bash
node init-db.js
```

4. Start the application:
```bash
npm start
```

5. Access the application:
- Open browser and go to http://localhost:3000
- Login with default admin user: "admin"

## Default Ports
- Frontend: http://localhost:3000
- Backend API: http://localhost:3000/api

## Backup Location
- Database backups are stored in ./backups
- Automatic backups run daily at midnight
