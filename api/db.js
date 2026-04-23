/**
 * Database module
 * Gère la connexion à PostgreSQL via pg
 */

const { Pool } = require('pg');

// Configuration du pool PostgreSQL
// Supporte DATABASE_URL ou les variables individuelles
const getPoolConfig = () => {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };
  }

  // Fallback aux variables individuelles
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'trainer',
    password: process.env.DB_PASSWORD || 'trainshop_dev',
    database: process.env.DB_NAME || 'trainshop',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
};

const pool = new Pool(getPoolConfig());

// Event listeners
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
});

pool.on('connect', () => {
  console.log('[DB] New client connected');
});

pool.on('remove', () => {
  console.log('[DB] Client removed from pool');
});

/**
 * Exécute une requête SQL
 * @param {string} text - Requête SQL avec placeholders ($1, $2, etc.)
 * @param {array} params - Paramètres pour éviter les injections SQL
 * @returns {Promise} Résultat de la requête
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('[DB] Query executed', { rows: res.rowCount, duration: `${duration}ms` });
    return res;
  } catch (error) {
    console.error('[DB] Query error', { error: error.message, text });
    throw error;
  }
}

/**
 * Obtient une seule ligne
 */
async function getOne(text, params) {
  const res = await query(text, params);
  return res.rows.length > 0 ? res.rows[0] : null;
}

/**
 * Obtient toutes les lignes
 */
async function getAll(text, params) {
  const res = await query(text, params);
  return res.rows;
}

/**
 * Exécute une requête sans résultat (INSERT, UPDATE, DELETE)
 */
async function run(text, params) {
  await query(text, params);
}

/**
 * Initialise la base de données (appel une seule fois au startup)
 */
async function initialize() {
  try {
    console.log('[DB] Checking connection...');
    const res = await pool.query('SELECT NOW()');
    console.log('[DB] Connection successful', res.rows[0]);
    return true;
  } catch (error) {
    console.error('[DB] Connection failed', error.message);
    return false;
  }
}

module.exports = {
  pool,
  query,
  getOne,
  getAll,
  run,
  initialize,
};
