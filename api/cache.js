/**
 * Cache module
 * Gère la connexion à Redis et le caching des produits
 */

const redis = require('redis');

// Client Redis
let client = null;
let connected = false;

// Statistiques
let stats = {
  hits: 0,
  misses: 0
};

/**
 * Initialise la connexion Redis
 */
async function init() {
  try {
    client = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });

    // Event listeners
    client.on('error', (err) => {
      console.error('[Cache] Redis error:', err.message);
      connected = false;
    });

    client.on('connect', () => {
      console.log('[Cache] Connected to Redis');
      connected = true;
    });

    // Connexion
    await client.connect();
    console.log('[Cache] Redis client initialized');
  } catch (error) {
    console.warn('[Cache] Failed to initialize Redis:', error.message);
    connected = false;
  }
}

/**
 * Récupère une valeur du cache
 * @param {string} key - Clé
 * @returns {Promise<string|null>}
 */
async function get(key) {
  if (!client || !connected) {
    return null;
  }

  try {
    const value = await client.get(key);
    return value;
  } catch (error) {
    console.warn('[Cache] GET error:', error.message);
    return null;
  }
}

/**
 * Définit une valeur dans le cache
 * @param {string} key - Clé
 * @param {string} value - Valeur
 * @param {number} ttl - TTL en secondes (optionnel)
 */
async function set(key, value, ttl) {
  if (!client || !connected) {
    return false;
  }

  try {
    if (ttl) {
      await client.setEx(key, ttl, value);
    } else {
      await client.set(key, value);
    }
    return true;
  } catch (error) {
    console.warn('[Cache] SET error:', error.message);
    return false;
  }
}

/**
 * Supprime une clé du cache
 * @param {string} key - Clé
 */
async function del(key) {
  if (!client || !connected) {
    return false;
  }

  try {
    await client.del(key);
    return true;
  } catch (error) {
    console.warn('[Cache] DEL error:', error.message);
    return false;
  }
}

/**
 * Vide tout le cache
 */
async function flush() {
  if (!client || !connected) {
    return false;
  }

  try {
    await client.flushDb();
    return true;
  } catch (error) {
    console.warn('[Cache] FLUSH error:', error.message);
    return false;
  }
}

/**
 * Teste la connexion Redis (PING)
 */
async function ping() {
  if (!client) {
    throw new Error('Redis client not initialized');
  }

  const result = await client.ping();
  return result === 'PONG';
}

/**
 * Ferme la connexion Redis
 */
async function close() {
  if (client) {
    await client.quit();
    console.log('[Cache] Redis connection closed');
  }
}

/**
 * Enregistre un HIT dans les statistiques
 */
function recordHit() {
  stats.hits++;
}

/**
 * Enregistre un MISS dans les statistiques
 */
function recordMiss() {
  stats.misses++;
}

/**
 * Retourne les statistiques du cache
 */
function getStats() {
  return {
    hits: stats.hits,
    misses: stats.misses,
    total: stats.hits + stats.misses
  };
}

/**
 * Réinitialise les statistiques
 */
function resetStats() {
  stats = { hits: 0, misses: 0 };
}

// Initialise au chargement du module
init().catch(err => {
  console.warn('[Cache] Initialization failed:', err.message);
});

module.exports = {
  get,
  set,
  del,
  flush,
  ping,
  close,
  recordHit,
  recordMiss,
  getStats,
  resetStats
};
