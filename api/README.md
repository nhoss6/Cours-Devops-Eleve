# api — API TrainShop

## Overview

Service Node.js + Express qui expose l'API REST pour le catalogue de produits.

**Routes principales** :
- `GET /api/health` — État de l'API, DB, cache
- `GET /api/products` — Liste tous les produits (avec cache Redis)
- `GET /api/products/:id` — Détail d'un produit
- `POST /api/products` — Crée un produit
- `GET /api/cache-stats` — Stats du cache (hits/misses)

## Fichiers

- `Dockerfile` — Node.js 20 alpine, non-root, healthcheck
- `server.js` — Express app, routes, gestion santé
- `db.js` — Pool PostgreSQL avec pg
- `cache.js` — Client Redis avec stats
- `package.json` — Dépendances (express, pg, redis, morgan)

## Build

```bash
docker build -t trainshop-api:1.0 .
```

## Run seul

```bash
# Nécessite PostgreSQL et Redis en local
DATABASE_URL=postgresql://user:pass@localhost/db \
REDIS_URL=redis://localhost:6379 \
node server.js
```

## Avec Compose

```bash
cd ..
docker compose up -d api
# ou tout
docker compose up -d
```

## Architecture

```
Navigateur/nginx (http://web/)
    ↓
Nginx (proxy /api → api:3000)
    ↓
Express API (Port 3000)
    ├→ GET /api/health       → Test DB/Cache
    ├→ GET /api/products     → Query DB (if cache miss) + Redis cache (30s)
    ├→ GET /api/products/:id → Query DB (if cache miss) + Redis cache
    ├→ POST /api/products    → INSERT DB + invalidate cache
    └→ GET /api/cache-stats  → Hit/miss stats
    ↓                          ↓
PostgreSQL (db:5432)    Redis (cache:6379)
```

## Dépendances

### Runtime
- **express** 4.19 — framework HTTP
- **pg** 8.11 — driver PostgreSQL
- **redis** 4.6 — client Redis
- **morgan** 1.10 — HTTP logging
- **dotenv** 16.4 — .env loading

### Dev (omitted en prod)
- **nodemon** 3.1 — hot reload pour développement

## Environnement

Variables d'env (via .env ou Compose) :
- `NODE_ENV` — "production" ou "development" (détermine logging, etc.)
- `PORT` — Port du serveur (défaut 3000)
- `DATABASE_URL` — Connection string PostgreSQL (ex: `postgresql://trainer:pwd@db:5432/trainshop`)
- `REDIS_URL` — Connection string Redis (ex: `redis://cache:6379`)

## Healthcheck

```dockerfile
HEALTHCHECK --interval=10s --timeout=3s --retries=3 --start-period=15s \
  CMD wget -q -O - http://localhost:3000/api/health || exit 1
```

- Teste `/api/health` chaque 10s
- Start period : 15s (laisse le temps à Express de démarrer)
- 3 timeouts = container marqué unhealthy

Endpoint `/api/health` retourne :
```json
{
  "status": "healthy|degraded",
  "api": "OK",
  "db": "OK|FAILED",
  "cache": "OK|FAILED",
  "uptime": 123,
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## Cache Redis

**TTL** : 30 secondes pour les produits

**Stats** : chaque `GET /api/products` ou `GET /api/products/:id` enregistre un hit (cache) ou miss (BD).

Récupérer les stats :
```bash
curl http://localhost:3000/api/cache-stats
# Retourne : { "hits": 5, "misses": 2, "hitRate": "71.43" }
```

**Invalidation** : `POST /api/products` invalide le cache `products:all` (pour forcer le reload du next GET).

## Sécurité

1. **Non-root** — le processus Node tourne en tant que `node` (USER dans le Dockerfile), pas root
2. **Parameterized queries** — utilise `$1, $2` pour les requêtes SQL (anti-injection)
3. **CORS** — actif pour permettre au frontend (nginx) de faire des requêtes
4. **Error handling** — ne révèle pas les détails internes, logging côté serveur

## Développement

Avec `docker-compose.dev.yml` + bind mount :
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
# Modifie server.js
# Changes appliqués via nodemon (auto-restart)
```

## Scaling

Avec Compose, tu peux scaler l'API :
```bash
docker compose up -d --scale api=3
# 3 instances d'API (api-1, api-2, api-3)
# nginx load-balance automatiquement
```

## Ressources

- [Express Documentation](https://expressjs.com/)
- [node-postgres (pg)](https://node-postgres.com/)
- [Redis Node.js client](https://github.com/redis/node-redis)
- [Morgan HTTP logger](https://github.com/expressjs/morgan)
