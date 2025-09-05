const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('connect', () => {
  console.log('OM76.MCSS connected to Railway PostgreSQL');
});

pool.on('error', (err) => {
  console.error('Railway PostgreSQL connection error:', err);
  process.exit(-1);
});

async function initializeOM76Database() {
  try {
    await pool.query('SELECT NOW()');
    console.log('OM76.MCSS: Database connection verified');
  } catch (error) {
    console.error('OM76.MCSS: Database initialization failed:', error);
    throw error;
  }
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool,
  initializeOM76Database
};