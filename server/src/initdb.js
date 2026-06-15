// One-off: create the tables. Run with `npm run initdb`.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

(async () => {
  try {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('✓ Schema applied.');
  } catch (e) {
    console.error('initdb failed:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
