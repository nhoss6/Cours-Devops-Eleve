# db — Database TrainShop

## Overview

Service PostgreSQL 16 alpine qui stocke le catalogue de produits de manière persistante.

**Table principale** :
- `products` — id, name, price, stock, created_at

**Données initiales** : 10 produits seed (casques, claviers, moniteurs, etc.)

**Persistence** : volume nommé `pgdata` sauvegarde les données entre redémarrages.

## Fichiers

- `init.sql` — Schéma + données initiales (executées au premier démarrage)
- `README.md` — Ce fichier

## Configuration (via docker-compose.yml)

```yaml
environment:
  - POSTGRES_USER=trainer
  - POSTGRES_PASSWORD=trainshop_dev_only
  - POSTGRES_DB=trainshop

volumes:
  - pgdata:/var/lib/postgresql/data           # Persistance
  - ./db/init.sql:/docker-entrypoint-initdb.d/init.sql  # Init SQL
```

**Clés variables** :
- `POSTGRES_USER` — utilisateur (défaut: postgres, ici: trainer)
- `POSTGRES_PASSWORD` — mot de passe (défaut: vide, ici: trainshop_dev_only)
- `POSTGRES_DB` — BD par défaut (défaut: postgres, ici: trainshop)

## Volume pgdata

**Montage** : `/var/lib/postgresql/data` dans le container

**Localisation sur l'hôte** :
```bash
docker volume inspect trainshop_pgdata
# Voir le Mountpoint (ex: /var/lib/docker/volumes/trainshop_pgdata/_data)
```

**Persistance** :
- `docker compose down` → arrête le container, volume reste
- `docker compose up -d` → redémarre, les données sont restaurées depuis le volume

**Reset complet** :
```bash
docker compose down -v
# -v supprime les volumes → perte des données
docker compose up -d
# Relance avec init.sql frais
```

## Schéma

```sql
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL CHECK (stock >= 0) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**Colonnes** :
- `id` — clé primaire auto-incrémentée
- `name` — nom du produit (obligatoire, max 255 caractères)
- `price` — prix en EUR (obligatoire, >= 0, 2 décimales)
- `stock` — quantité disponible (>= 0, défaut 0)
- `created_at` — timestamp UTC d'insertion (auto: now)

**Contraintes** :
- `CHECK (price >= 0)` — pas de prix négatif
- `CHECK (stock >= 0)` — pas de stock négatif

## Données initiales

10 produits seed (voir init.sql) :
1. Casque Bluetooth — 49.90€, 25 stock
2. Clavier Mécanique RGB — 129.00€, 10 stock
3. Souris Ergonomique — 39.99€, 18 stock
4. Écran 27 pouces 4K — 599.00€, 3 stock
5. Câble USB-C 2m — 9.99€, 150 stock
6. Hub USB-C 7-en-1 — 79.90€, 8 stock
7. Batterie Externe 30000mAh — 45.99€, 22 stock
8. Webcam 1080p Full HD — 89.00€, 12 stock
9. Microphone Studio Condenser — 199.99€, 5 stock
10. Support Moniteur Ajustable — 34.99€, 16 stock

## Requêtes courantes

### Via docker compose exec

```bash
# Accéder à psql
docker compose exec db psql -U trainer -d trainshop

# À l'intérieur de psql
\dt                    # Voir les tables
\d products            # Schéma de la table
SELECT * FROM products;
SELECT COUNT(*) FROM products;
SELECT * FROM products WHERE price > 100;
```

### Requêtes directes (sans psql interactif)

```bash
# Compter les produits
docker compose exec db psql -U trainer -d trainshop -c "SELECT COUNT(*) FROM products;"

# Lister les produits
docker compose exec db psql -U trainer -d trainshop -c "SELECT * FROM products;"

# Insérer un produit (démo)
docker compose exec db psql -U trainer -d trainshop -c \
  "INSERT INTO products (name, price, stock) VALUES ('Mon produit', 99.99, 10);"
```

## Healthcheck

```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
  interval: 10s
  timeout: 3s
  retries: 3
  start_period: 10s
```

- Teste si PostgreSQL accepte les connexions (pg_isready)
- Start period: 10s (temps pour que Postgres démarre)
- 3 échecs = container unhealthy

## Backup & Restore

### Backup (dump complet)

```bash
docker compose exec -T db pg_dump -U trainer trainshop > trainshop-backup.sql
```

**-T** : désactive le pseudo-TTY (utile en non-interactif)

Fichier SQL contient : CREATE TABLE, INSERT, permissions, etc.

### Restore

```bash
docker compose down -v  # Optionnel : part de zéro
docker compose up -d

docker compose exec -T db psql -U trainer -d trainshop < trainshop-backup.sql
```

## Performance

**Indices** (créés dans init.sql) :
- `idx_products_name` — accélère les recherches par nom
- `idx_products_created_at` — accélère les filtres par date

Pour ajouter un index :
```sql
CREATE INDEX idx_products_stock ON products(stock);
```

## Sécurité

1. **Mot de passe changeable** — via `POSTGRES_PASSWORD` (ne pas mettre en dur)
2. **Utilisateur dédié** — `trainer` (pas postgres directement)
3. **Contraintes BD** — CHECK sur price et stock (intégrité des données)

En production, utiliser un mot de passe fort et le passer via secrets Docker.

## Debugging

Voir les logs de Postgres :
```bash
docker compose logs -f db
```

Accéder au shell du container :
```bash
docker compose exec db sh
```

À l'intérieur :
```bash
psql -U trainer -d trainshop
SELECT version();  # Vérifie la version
```

## Ressources

- [PostgreSQL Official](https://www.postgresql.org/)
- [PostgreSQL in Docker](https://hub.docker.com/_/postgres)
- [Docker Volumes](https://docs.docker.com/storage/volumes/)
