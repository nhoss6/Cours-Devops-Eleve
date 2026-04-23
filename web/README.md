# web — Frontend TrainShop

## Overview

Service nginx qui sert le frontend statique (HTML, CSS, JavaScript) et proxy les requêtes `/api/` vers le service API (Node.js).

## Fichiers

- `Dockerfile` — Multi-stage : builder (node) + final (nginx alpine)
- `nginx.conf` — Configuration nginx (serve statique, proxy, gzip, cache)
- `public/index.html` — Page principale
- `public/style.css` — Styles (palette MD Consulting teal)
- `public/app.js` — JavaScript client (fetch produits, health check)
- `package.json` — Métadonnées (aucune dépendance runtime)

## Build

```bash
docker build -t trainshop-web:1.0 .
```

## Run seul

```bash
# Ne fonctionne pas seul (dépend de l'API), mais tu peux essayer :
docker run -d -p 8080:80 trainshop-web:1.0
curl http://localhost:8080  # HTML répond, mais /api/ sera en erreur
```

## Avec Compose

```bash
cd ..
docker compose up -d web
```

## Architecture

```
Navigateur (localhost:8080)
    ↓
Nginx (port 80 dans le container, 8080 sur l'hôte)
    ├→ GET /           → Serve index.html (+ app.js, style.css)
    ├→ GET /api/*      → Proxy vers api:3000/api/*  (DNS interne du réseau)
    └→ static assets   → Cache 30 jours
```

## Multi-stage build

Le Dockerfile a 2 stages :

1. **Builder** (node:20-alpine) — optionnel ici (on a juste du statique)
2. **Final** (nginx:1.27-alpine) — copie du builder, sert avec nginx

Avantage : l'image finale ne contient que nginx + fichiers, pas node (économie ~100MB).

## Configuration nginx

Points clés dans `nginx.conf` :

- `root /usr/share/nginx/html` — fichiers statiques
- `location /api/ { proxy_pass http://api:3000/api/ }` — proxy vers l'API
- `gzip on` — compression des réponses
- `expires 30d` — cache des assets dans le navigateur
- `try_files` — fallback sur index.html pour SPA (ici pas une SPA mais c'est bon)

## Healthcheck

```dockerfile
HEALTHCHECK --interval=10s --timeout=3s --retries=3 --start-period=5s \
  CMD wget -q -O - http://localhost/ || exit 1
```

Ping http://localhost/ chaque 10s. Si 3 timeouts d'affilée → container marked unhealthy.

## Notes pédagogiques

1. **Multi-stage build** — montre comment réduire la taille d'une image (ici pas énorme, mais concept utile)
2. **Proxy nginx** — démontre la communication inter-services (web → api via DNS interne)
3. **Cache assets** — headers HTTP pour économiser la bande passante
4. **CORS** — si besoin, ajouter dans `location /api/` les headers CORS (Access-Control-*)

## Développement

Utiliser `docker-compose.dev.yml` pour ajouter un bind mount :
```yaml
volumes:
  - ./web/public:/usr/share/nginx/html
```
Édite index.html → les changements se reflètent immédiatement (pas de rebuild).

## Ressources

- [Nginx Documentation](https://nginx.org/en/docs/)
- [Docker multi-stage builds](https://docs.docker.com/build/building/multi-stage/)
- [Alpine Linux](https://alpinelinux.org/)
