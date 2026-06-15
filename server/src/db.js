const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => console.error('[db] pool error', err.message));

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
