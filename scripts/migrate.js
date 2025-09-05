const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { pool } = require('../config/database');

async function runMigrations() {
  try {
    console.log('OM76.MCSS: Starting database migrations...');
    
    const migrationFile = path.join(__dirname, '../migrations/001_initial_schema.sql');
    const migrationSQL = fs.readFileSync(migrationFile, 'utf8');
    
    await pool.query(migrationSQL);
    
    console.log('OM76.MCSS: Database migrations completed successfully');
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('OM76.MCSS: Migration failed:', error);
    await pool.end();
    process.exit(1);
  }
}

if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };