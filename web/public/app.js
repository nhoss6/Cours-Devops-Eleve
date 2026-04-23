// TrainShop Frontend App
// Récupère les produits via l'API, affiche le catalogue, monitore la santé des services

const API_BASE = '/api';
const REFRESH_INTERVAL = 5000; // Rafraîchir chaque 5s

// État global
let products = [];
let cacheStats = { hits: 0, misses: 0 };
let lastFetchTime = null;

// Éléments DOM
const productsContainer = document.getElementById('products');
const productCountEl = document.getElementById('product-count');
const cacheInfoEl = document.getElementById('cache-info');
const statusTextEl = document.getElementById('status-text');

// Services health status
const healthBadges = {
  'web': document.getElementById('status-web'),
  'api': document.getElementById('status-api'),
  'db': document.getElementById('status-db'),
  'cache': document.getElementById('status-cache')
};

// ============================================================================
// Gestion des produits
// ============================================================================

/**
 * Récupère les produits depuis l'API
 */
async function fetchProducts() {
  try {
    const response = await fetch(`${API_BASE}/products`);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    products = Array.isArray(data) ? data : [];
    lastFetchTime = new Date();

    // Affiche les produits
    renderProducts();

    // Récupère les stats du cache
    await fetchCacheStats();

    return true;
  } catch (error) {
    console.error('Erreur lors de la récupération des produits:', error);
    showError('Impossible de charger les produits. Vérifiez l\'API.');
    return false;
  }
}

/**
 * Récupère les stats du cache depuis l'API
 */
async function fetchCacheStats() {
  try {
    const response = await fetch(`${API_BASE}/cache-stats`);
    if (response.ok) {
      const data = await response.json();
      cacheStats = data;
      updateCacheInfo();
    }
  } catch (error) {
    console.warn('Impossible de récupérer les stats du cache:', error);
  }
}

/**
 * Affiche les produits dans la grille
 */
function renderProducts() {
  if (products.length === 0) {
    productsContainer.innerHTML = '<p class="error">Aucun produit disponible</p>';
    productCountEl.textContent = '0';
    return;
  }

  productsContainer.innerHTML = products
    .map(product => createProductCard(product))
    .join('');

  productCountEl.textContent = products.length;
}

/**
 * Crée une carte produit en HTML
 */
function createProductCard(product) {
  const stockClass = product.stock <= 5 ? 'low' : 'good';
  const stockText = product.stock === 0 ? 'Rupture' : `${product.stock} en stock`;

  return `
    <div class="product-card">
      <div class="product-name">${escapeHtml(product.name)}</div>
      <div class="product-price">${parseFloat(product.price).toFixed(2)}</div>
      <div class="product-stock ${stockClass}">${stockText}</div>
      <div class="product-id">#${product.id}</div>
    </div>
  `;
}

/**
 * Échappe les caractères HTML pour éviter les injections
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Affiche un message d'erreur
 */
function showError(message) {
  productsContainer.innerHTML = `<p class="error">${escapeHtml(message)}</p>`;
}

/**
 * Met à jour les infos du cache
 */
function updateCacheInfo() {
  const total = cacheStats.hits + cacheStats.misses;
  if (total === 0) {
    cacheInfoEl.textContent = 'Pas de requêtes';
  } else {
    const hitRate = ((cacheStats.hits / total) * 100).toFixed(1);
    cacheInfoEl.textContent = `${cacheStats.hits} hits, ${cacheStats.misses} misses (${hitRate}% hit rate)`;
  }
}

// ============================================================================
// Monitoring de la santé des services
// ============================================================================

/**
 * Vérifie la santé des services
 */
async function checkHealth() {
  try {
    const response = await fetch(`${API_BASE}/health`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    // Mets à jour les badges
    updateHealthBadge('api', data.status === 'ok' || data.status === 'healthy');
    updateHealthBadge('db', data.db === 'ok');
    updateHealthBadge('cache', data.cache === 'ok');
    updateHealthBadge('web', true); // Frontend tourne forcément si on arrive ici

    // Affiche le message global
    const allHealthy = data.status === 'ok' && data.db === 'ok' && data.cache === 'ok';
    statusTextEl.textContent = allHealthy
      ? '✓ Tous les services sont en bonne santé'
      : '⚠ Certains services ont des problèmes';
    statusTextEl.style.color = allHealthy ? '#52b788' : '#f4a261';

  } catch (error) {
    console.warn('Erreur lors de la vérification de santé:', error);

    // Tous les services sont rouges
    updateHealthBadge('api', false);
    updateHealthBadge('db', false);
    updateHealthBadge('cache', false);
    updateHealthBadge('web', true); // Frontend répond toujours

    statusTextEl.textContent = '✗ Connexion à l\'API perdue';
    statusTextEl.style.color = '#e76f51';
  }
}

/**
 * Met à jour le badge de santé d'un service
 */
function updateHealthBadge(service, isHealthy) {
  const badge = healthBadges[service];
  if (badge) {
    if (isHealthy) {
      badge.classList.add('healthy');
      badge.classList.remove('unhealthy');
    } else {
      badge.classList.add('unhealthy');
      badge.classList.remove('healthy');
    }
  }
}

// ============================================================================
// Initialisation et boucle de rafraîchissement
// ============================================================================

/**
 * Lance le cycle de rafraîchissement
 */
async function init() {
  console.log('Initialisation de TrainShop...');

  // Première charge
  await fetchProducts();
  await checkHealth();

  // Boucle de rafraîchissement
  setInterval(async () => {
    await fetchProducts();
    await checkHealth();
  }, REFRESH_INTERVAL);

  console.log('TrainShop prêt !');
}

// Lance l'app au chargement de la page
document.addEventListener('DOMContentLoaded', init);
