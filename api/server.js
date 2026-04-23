/**
 * TrainShop API Server
 * Express + PostgreSQL + Redis
 * Routes :
 *   GET /api/health           — État des services (api, db, cache)
 *   GET /api/products         — Liste tous les produits (avec cache)
 *   GET /api/products/:id     — Détail d'un produit
 *   POST /api/products        — Crée un produit (démo)
 *   GET /api/cache-stats      — Stats du cache (hits/misses)
 */

require('dotenv').config();

const express = require('express');
const morgan = require('morgan');
const db = require('./db');
const cache = require('./cache');

const app = express();
const PORT = process.env.PORT || 3000;
const startTime = Date.now();

// ============================================================================
// Middleware
// ============================================================================

// Logging HTTP
app.use(morgan('dev'));

// JSON parsing
app.use(express.json());

// CORS (optionnel, mais utile pour démo)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  next();
});

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/health
 * Retourne l'état de l'API, de la BD, et du cache
 */
app.get('/api/health', async (req, res) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  let dbStatus = 'OK';
  let cacheStatus = 'OK';

  // Test connexion DB
  try {
    await db.query('SELECT 1');
  } catch (err) {
    dbStatus = 'FAILED';
    console.error('DB healthcheck failed:', err.message);
  }

  // Test connexion Redis
  try {
    await cache.ping();
  } catch (err) {
    cacheStatus = 'FAILED';
    console.warn('Cache healthcheck failed:', err.message);
  }

  const allHealthy = dbStatus === 'OK' && cacheStatus === 'OK';

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    api: 'OK',
    db: dbStatus,
    cache: cacheStatus,
    uptime,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/products
 * Retourne la liste de tous les produits (avec cache 30s)
 */
app.get('/api/products', async (req, res) => {
  try {
    // Vérifie le cache
    const cacheKey = 'products:all';
    const cached = await cache.get(cacheKey);

    if (cached) {
      cache.recordHit();
      console.log('Cache HIT: products:all');
      return res.json(JSON.parse(cached));
    }

    cache.recordMiss();

    // Requête à la BD
    const result = await db.query(
      'SELECT id, name, price, stock FROM products ORDER BY id ASC'
    );

    const products = result.rows;

    // Mets en cache 30 secondes
    await cache.set(cacheKey, JSON.stringify(products), 30);

    console.log(`Cache MISS: products:all (${products.length} items)`);
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      error: 'Failed to fetch products',
      message: error.message
    });
  }
});

/**
 * GET /api/products/:id
 * Retourne un produit par ID (avec cache)
 */
app.get('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const cacheKey = `product:${id}`;

    // Vérifie le cache
    const cached = await cache.get(cacheKey);
    if (cached) {
      cache.recordHit();
      console.log(`Cache HIT: product:${id}`);
      return res.json(JSON.parse(cached));
    }

    cache.recordMiss();

    // Requête à la BD
    const result = await db.query(
      'SELECT id, name, price, stock FROM products WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = result.rows[0];

    // Mets en cache
    await cache.set(cacheKey, JSON.stringify(product), 30);

    console.log(`Cache MISS: product:${id}`);
    res.json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({
      error: 'Failed to fetch product',
      message: error.message
    });
  }
});

/**
 * POST /api/products
 * Crée un produit (démo pour montrer les écritures en BD)
 */
app.post('/api/products', async (req, res) => {
  try {
    const { name, price, stock } = req.body;

    if (!name || price === undefined || stock === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: name, price, stock'
      });
    }

    const result = await db.query(
      'INSERT INTO products (name, price, stock) VALUES ($1, $2, $3) RETURNING *',
      [name, parseFloat(price), parseInt(stock, 10)]
    );

    const product = result.rows[0];

    // Invalide le cache (pour que le prochain GET /api/products le recharge)
    await cache.del('products:all');
    console.log('Cache invalidated: products:all (new product added)');

    res.status(201).json(product);
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({
      error: 'Failed to create product',
      message: error.message
    });
  }
});

/**
 * GET /api/cache-stats
 * Retourne les statistiques du cache (hits, misses)
 */
app.get('/api/cache-stats', (req, res) => {
  const stats = cache.getStats();
  res.json({
    hits: stats.hits,
    misses: stats.misses,
    hitRate: stats.total > 0 ? (stats.hits / stats.total * 100).toFixed(2) : 0
  });
});

// ============================================================================
// 404 & Error handling
// ============================================================================

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path
  });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// ============================================================================
// Démarrage
// ============================================================================

async function start() {
  try {
    // Teste la connexion à la BD
    console.log('Waiting for database...');
    let dbReady = false;
    for (let attempt = 1; attempt <= 10; attempt++) {
      try {
        await db.query('SELECT 1');
        dbReady = true;
        console.log('Database connected !');
        break;
      } catch (err) {
        console.log(`DB attempt ${attempt}/10 failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (!dbReady) {
      console.warn('Database not available, starting anyway (degraded mode)');
    }

    // Teste la connexion à Redis
    console.log('Waiting for cache...');
    try {
      await cache.ping();
      console.log('Cache connected !');
    } catch (err) {
      console.warn('Cache not available, starting anyway (degraded mode)');
    }

    // Démarre le serveur
    app.listen(PORT, () => {
      console.log(`TrainShop API running on http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
      console.log(`Products: http://localhost:${PORT}/api/products`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Démarre
start();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await db.end();
  await cache.close();
  process.exit(0);
});
