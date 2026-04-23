-- Initialisation TrainShop Database
-- Exécuté au démarrage du container PostgreSQL

-- Crée la table products si elle n'existe pas
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL CHECK (stock >= 0) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Données seed : 10 produits réalistes
INSERT INTO products (name, price, stock) VALUES
  ('Casque Bluetooth', 49.90, 25),
  ('Clavier Mécanique RGB', 129.00, 10),
  ('Souris Ergonomique', 39.99, 18),
  ('Écran 27 pouces 4K', 599.00, 3),
  ('Câble USB-C 2m', 9.99, 150),
  ('Hub USB-C 7-en-1', 79.90, 8),
  ('Batterie Externe 30000mAh', 45.99, 22),
  ('Webcam 1080p Full HD', 89.00, 12),
  ('Microphone Studio Condenser', 199.99, 5),
  ('Support Moniteur Ajustable', 34.99, 16);

-- Index pour les requêtes courantes
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at);

-- Affiche un message de confirmation
SELECT 'TrainShop database initialized successfully' as message;
