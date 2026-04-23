# Architecture — Vue d'ensemble TrainShop

Cette documentation decrit l'architecture applicative et la communication entre les services.

## Vue logique (4 services)

```
Navigateur web
    │
    ├─ Requetes HTTP
    │
    ▼
Frontend (Nginx)
    ├─ Sert HTML, CSS, JS
    ├─ Proxy /api/* vers l'API
    │
    ▼
API (Node.js + Express)
    ├─ Routes REST
    ├─ Healthchecks
    ├─ Cache Redis
    ├─ Requetes DB PostgreSQL
    │
    ├─ Cache (Redis)
    │   └─ Stocke produits (TTL 30s)
    │
    └─ Base (PostgreSQL)
        └─ Table produits + metadata
```

## Services

### 1. web (Frontend / Nginx)

**Role** : Sert l'interface web statique + proxy inverse

**Fichiers** :
- `web/public/index.html` — Page principale
- `web/public/app.js` — Logique client (fetch, DOM updates)
- `web/public/style.css` — Styles
- `web/nginx.conf` — Configuration Nginx (a creer au TP)

**Endpoints publics** :
- `GET /` → Retourne index.html
- `GET /api/*` → Proxy vers l'API (a configurer dans nginx.conf)

**Ports** :
- Interne : 80 (standard HTTP)
- Externe (host) : 8080 (expose par docker-compose)

### 2. api (Backend / Node.js)

**Role** : Expose les routes REST, gere la logique metier

**Fichiers** :
- `api/server.js` — Express, routes, middlewares
- `api/db.js` — Pool PostgreSQL
- `api/cache.js` — Client Redis + logique de cache
- `api/package.json` — Dependencies (express, pg, redis, morgan, dotenv)

**Routes principales** :
```
GET /api/health
  ├─ Status API, DB, Cache
  └─ Contenu : { status: "healthy", api: "ok", db: "ok", cache: "ok" }

GET /api/products
  ├─ Liste tous les produits
  ├─ Cache : 30s TTL
  └─ Contenu : Array de 10 produits

GET /api/products/:id
  ├─ Detai d'un produit
  └─ Contenu : Objet produit

POST /api/products
  ├─ Cree un produit (demo)
  └─ Body : { name, price, description }

GET /api/cache-stats
  ├─ Statistiques du cache
  └─ Contenu : { hits: N, misses: M }
```

**Environment variables** (cf. .env.example) :
```
DATABASE_URL ou (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME)
REDIS_URL
API_PORT (default 3000)
```

**Ports** :
- Interne : 3000
- Externe (host, dev only) : 3000 (optionnel)

### 3. db (PostgreSQL)

**Role** : Stocke les donnees produits de facon persistante

**Fichiers** :
- `db/init.sql` — Script d'initialisation
  - CREATE TABLE products
  - INSERT 10 produits de seed

**Base de donnees** :
- Nom : trainshop
- User : trainer (default)
- Password : trainshop_dev (default)

**Port interne** : 5432 (standard PostgreSQL)

**Persistance** :
- Volume Docker nomme : trainshop_pgdata → /var/lib/postgresql/data
- Survit aux redemarrages

**Table produits** :
```sql
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  price DECIMAL(10, 2),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 4. cache (Redis)

**Role** : Cache in-memory des produits

**Logique** :
- GET /api/products verifie d'abord Redis
- Cache HIT → retourne JSON rapide (~5ms)
- Cache MISS → query DB → store en Redis (TTL 30s)

**Port interne** : 6379 (standard Redis)

**Persistance** : Non persistant par defaut (snapshots possibles)

## Communication inter-services

### Flux d'une requete produit (complet)

```
1. Utilisateur ouvre http://localhost:8080
   → Navigateur demande GET /

2. Nginx (web) reçoit GET /
   → Sert index.html
   → Charge app.js dans le navigateur

3. app.js (navigateur) execute toutes les 5s
   → fetch('/api/products')

4. Nginx (web) reçoit GET /api/products
   → Proxy vers http://api:3000/api/products
   (resout "api" via DNS interne Docker)

5. Express (api) reçoit GET /api/products
   → Appelle cache.get('products:all')
   
   Cas A (HIT) :
   └─ Redis retourne JSON en cache
      └─ Retourne au navigateur (~5ms)
   
   Cas B (MISS) :
   └─ Redis retourne null
   └─ Appelle db.query('SELECT * FROM products')
   └─ PostgreSQL retourne 10 lignes
   └─ Cache le resultat en Redis (TTL 30s)
   └─ Retourne au navigateur (~50ms)

6. app.js (navigateur) reçoit JSON
   → Parse et update le DOM
   → Affiche la grille de produits
```

## Reseau Docker (networking)

Lors de docker-compose up, un reseau bridge custom est cree :

```
Reseau "trainshop_net"
├─ web   → DNS : "web" (resout automatiquement)
├─ api   → DNS : "api"
├─ db    → DNS : "db"
└─ cache → DNS : "cache"
```

### Pour communiquer entre services

```
Depuis le container api, pour acceder a PostgreSQL :
  ✓ Fonctionne : pg.connect('postgresql://trainer:pwd@db:5432/trainshop')
  ✓ Fonctionne : pg.connect('postgresql://trainer:pwd@localhost:5432/trainshop')
                 (si remapped au host)

Depuis le container api, pour acceder a Redis :
  ✓ Fonctionne : redis.createClient({ url: 'redis://cache:6379' })
  ✓ PAS de localhost (localhost = le container lui-meme)
```

### Ports exposes

```
Host (localhost)           Container (reseau Docker)
═══════════════════════════ ════════════════════════

localhost:8080 ──────────► web:80          (Nginx frontend)
localhost:3000 ──────────► api:3000        (Dev only, optionnel)

db:5432 — NON expose en prod (accessible uniquement via api)
cache:6379 — NON expose
```

## Healthchecks

Chaque service inclut un healthcheck pour verifier qu'il est pret :

```
PostgreSQL :
  SELECT 1; — Verifie que la BD repond

API (Node.js) :
  GET /api/health — Verifie que Express et les connexions fonctionnent

Nginx :
  GET / — Verifie que le serveur web repond

Redis :
  PING — Verifie que le cache repond
```

Au startup, docker-compose attend que les services dependent soient "healthy" avant de demarrer les suivants.

## Dependances de demarrage

Ordre recommande (dans docker-compose.yml avec depends_on + condition: service_healthy) :

```
1. db (PostgreSQL) — dépend de rien
   └─ Healthcheck : pg_isready
   └─ Après ~5-10s : "healthy"

2. cache (Redis) — dépend de rien
   └─ Healthcheck : PING
   └─ Après ~2-3s : "healthy"

3. api (Node.js) — dépend de db et cache healthy
   └─ Healthcheck : GET /api/health
   └─ Après ~15-20s : "healthy"

4. web (Nginx) — dépend de api healthy
   └─ Healthcheck : GET /
   └─ Après ~5s : "healthy"
```

Tous "healthy" = application prête en ~30s.

## Volumes et persistance

```
Machine host                    Container
═════════════════════════════   ══════════════════════════

Volume Docker "trainshop_pgdata" ──► /var/lib/postgresql/data
(persistant entre redemarrages,     (Fichiers BD PostgreSQL)
  supprime uniquement par -v)

./db/init.sql ─────────────────► /docker-entrypoint-initdb.d/01-init.sql
(bind mount, exec au 1er start)    (CREATE TABLE, INSERT produits)

./web/public (dev only) ────────► /usr/share/nginx/html
(bind mount pour hot reload)       (Fichiers HTML, CSS, JS)

./api (dev only) ───────────────► /app
(bind mount pour hot reload)       (Code Node.js)
```

## Variables d'environnement

Toutes les connexions utilisent des env vars (support locale et Docker) :

```
# PostgreSQL
DATABASE_URL=postgresql://trainer:trainshop_dev@db:5432/trainshop
# OU
DB_HOST=db
DB_PORT=5432
DB_USER=trainer
DB_PASSWORD=trainshop_dev
DB_NAME=trainshop

# Redis
REDIS_URL=redis://cache:6379

# API
API_PORT=3000
NODE_ENV=production (ou development)
```

A partir du fichier `.env` au root, ou directement dans docker-compose.yml :

```yaml
services:
  api:
    environment:
      - DB_HOST=db
      - REDIS_URL=redis://cache:6379
      - API_PORT=3000
```

## Multi-stage build (web)

Pour optimiser la taille de l'image Nginx (cf. TP Etape 2) :

```
Stage 1 (Builder) :
  FROM node:20-alpine (~150MB)
  COPY public/
  (Prepare assets si necessaire)

Stage 2 (Final) :
  FROM nginx:1.27-alpine (~30MB)
  COPY --from=builder /app/public /usr/share/nginx/html
  COPY nginx.conf /etc/nginx/nginx.conf
  (Image finale : ~50MB, pas de Node inclus)
```

## Logs et debugging

```bash
# Voir les logs de tous les services
docker compose logs -f

# Logs d'un seul service
docker compose logs -f api

# Logs des 50 dernieres lignes
docker compose logs --tail=50

# Entrer dans un container
docker compose exec api sh
docker compose exec db psql -U trainer -d trainshop

# Verifier le reseau
docker network ls
docker network inspect trainshop_net
```

## Ressources recommandees

- https://docs.docker.com/compose/compose-file/
- https://docs.docker.com/develop/dev-best-practices/
- PostgreSQL docs : https://www.postgresql.org/docs/
- Express.js docs : https://expressjs.com/
- Redis docs : https://redis.io/

