-- ============================================
-- DistriMatch - Journal des modifications (audit trail) - 2026-06-02
-- A coller dans Supabase SQL Editor > New query > Run
-- ============================================
--
-- Motivation : il est aujourd'hui impossible de savoir QUI a modifie un
-- distributeur, un produit ou une photo, et QUAND. Si vandalisme ou
-- erreur, aucune tracabilite -> aucune reaction possible.
--
-- Cette migration ajoute un "journal invisible" sur les tables editables :
--   - updated_at TIMESTAMPTZ : date/heure de la derniere modification
--   - modified_by UUID       : identifiant Supabase de l'utilisateur qui
--                              a fait la modification
--
-- Un trigger AVANT UPDATE remplit automatiquement ces deux colonnes.
-- Cote utilisateur de l'app : 0 changement visible. C'est purement un
-- journal cote serveur, consultable dans Supabase Dashboard.
--
-- Pre-requis pour : evolution 3 (corbeille), futur dashboard admin, futurs
-- alertes email proprietaire.

-- ============================================
-- 1. Colonnes audit sur les 3 tables editables
-- ============================================

ALTER TABLE distributors
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS modified_by UUID REFERENCES auth.users(id);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS modified_by UUID REFERENCES auth.users(id);

ALTER TABLE distributor_photos
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS modified_by UUID REFERENCES auth.users(id);

-- ============================================
-- 2. Fonction trigger generique (reutilisable)
-- ============================================
--
-- A chaque UPDATE sur ces tables, on met a jour updated_at + modified_by
-- automatiquement. Cote code client : aucune modification, on continue
-- d'appeler .update({champ: valeur}) -- le trigger remplit le reste.

CREATE OR REPLACE FUNCTION set_audit_columns()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  NEW.modified_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. Triggers sur chaque table
-- ============================================
--
-- DROP IF EXISTS pour permettre la re-execution (idempotence).

DROP TRIGGER IF EXISTS distributors_audit_trigger ON distributors;
CREATE TRIGGER distributors_audit_trigger
  BEFORE UPDATE ON distributors
  FOR EACH ROW EXECUTE FUNCTION set_audit_columns();

DROP TRIGGER IF EXISTS products_audit_trigger ON products;
CREATE TRIGGER products_audit_trigger
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_audit_columns();

DROP TRIGGER IF EXISTS distributor_photos_audit_trigger ON distributor_photos;
CREATE TRIGGER distributor_photos_audit_trigger
  BEFORE UPDATE ON distributor_photos
  FOR EACH ROW EXECUTE FUNCTION set_audit_columns();

-- ============================================
-- 4. Index pour future page admin (consultation rapide)
-- ============================================
--
-- Permet de lister "les 50 dernieres modifications" rapidement par table.

CREATE INDEX IF NOT EXISTS idx_distributors_updated_at
  ON distributors (updated_at DESC) WHERE modified_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_updated_at
  ON products (updated_at DESC) WHERE modified_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_distributor_photos_updated_at
  ON distributor_photos (updated_at DESC) WHERE modified_by IS NOT NULL;

-- ============================================
-- VERIFICATION POST-APPLICATION
-- ============================================
--
-- 1. Verifier que les colonnes existent :
--
--    SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'distributors' AND column_name IN ('updated_at', 'modified_by');
--    -- attendu : 2 lignes
--
-- 2. Verifier qu'un UPDATE remplit bien les colonnes (necessite session auth).
--    Apres avoir applique PR #74 et etre connecte, modifier le prix d'un
--    distributeur via l'app, puis :
--
--    SELECT id, name, price_range, updated_at, modified_by
--    FROM distributors WHERE id = 'dist-001';
--    -- attendu : updated_at recent + modified_by = ton UUID auth
--
-- 3. Note : les lignes existantes auront updated_at = NULL initialement
--    (car DEFAULT now() s'applique aux NOUVELLES insertions, pas
--    retroactivement). Les UPDATE futurs le rempliront.
--
--    Si tu veux populer les anciennes lignes avec une valeur de depart :
--      UPDATE distributors SET updated_at = created_at WHERE updated_at IS NULL;
--      UPDATE products SET updated_at = created_at WHERE updated_at IS NULL;
--      UPDATE distributor_photos SET updated_at = created_at WHERE updated_at IS NULL;
--    (a executer une seule fois apres application du schema)
