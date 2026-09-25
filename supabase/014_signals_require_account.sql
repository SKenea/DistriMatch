-- ============================================
-- DistriMatch - Migration 014 : des signaux proteges contre l'abus
-- ============================================
-- BACKLOG EPIC-T6 (Stephane, 2026-09-25) : « des personnes mettent des signaux
-- juste pour s'amuser ». Depuis EPIC-T5, l'app reserve les boutons aux comptes
-- connectes, mais la base acceptait encore l'anonyme et limitait par appareil,
-- un identifiant que le telephone fabrique lui-meme (contournable a volonte).
--
--   1. Table signal_bans : comptes bloques (aucun acces par l'API)
--   2. RPC confirm_availability (reprise de 012) :
--        * compte obligatoire (28000 sinon), compte bloque refuse (42501)
--        * 20 signaux / heure / COMPTE (P0001), anti-doublon par compte et par etat
--        * source toujours 'user', poids 0.8
--   3. purge_user_signals(user_id, bloquer, raison) : efface tous les signaux
--      d'un compte et le bloque. Reservee a l'admin (SQL Editor ou
--      scripts/supabase-sql.mjs), jamais exposee a l'API.
--      unban_user(user_id) : debloque (reversible).
--
-- Inchange : les donnees de demo (inserees directement par seed_demo_signals,
-- device_hash 'demo-...'), les vues de lecture (anonymes), log_event.
--
-- Idempotente. Execution : node scripts/supabase-sql.mjs supabase/014_signals_require_account.sql

-- ============================================
-- 1. Comptes bloques
-- ============================================

CREATE TABLE IF NOT EXISTS signal_bans (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE signal_bans ENABLE ROW LEVEL SECURITY;   -- 0 policy : invisible par l'API
REVOKE ALL ON signal_bans FROM anon, authenticated;

-- ============================================
-- 2. RPC confirm_availability
-- ============================================

CREATE OR REPLACE FUNCTION confirm_availability(
  p_distributor_id  TEXT,
  p_device_hash     TEXT,
  p_product_signals JSONB DEFAULT '[]'::jsonb,
  p_machine_state   TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_source    TEXT;
  v_weight    NUMERIC(3,2);
  v_window    TIMESTAMPTZ := now() - INTERVAL '1 hour';
  v_recent    INTEGER;
  v_inserted  INTEGER := 0;
  v_skipped   INTEGER := 0;
  v_item      JSONB;
  v_product   BIGINT;
  v_state     TEXT;
BEGIN
  -- EPIC-T6 : un signal exige un compte (la barriere est ici, pas seulement
  -- dans l'app). 28000 : l'app propose de se reconnecter.
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Connexion requise pour signaler' USING ERRCODE = '28000';
  END IF;
  -- Compte bloque par l'admin (purge_user_signals) : refus definitif
  IF EXISTS (SELECT 1 FROM signal_bans WHERE user_id = v_user_id) THEN
    RAISE EXCEPTION 'Ce compte ne peut plus envoyer de signaux' USING ERRCODE = '42501';
  END IF;
  IF p_device_hash IS NULL OR length(p_device_hash) < 16 OR length(p_device_hash) > 128 THEN
    RAISE EXCEPTION 'device_hash invalide' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM distributors WHERE id = p_distributor_id) THEN
    RAISE EXCEPTION 'Distributeur inconnu' USING ERRCODE = 'P0002';
  END IF;
  IF p_machine_state IS NOT NULL AND p_machine_state NOT IN ('empty', 'broken', 'working') THEN
    RAISE EXCEPTION 'Etat machine invalide' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_product_signals) <> 'array' OR jsonb_array_length(p_product_signals) > 50 THEN
    RAISE EXCEPTION 'Signaux produits invalides' USING ERRCODE = '22023';
  END IF;

  -- Anti-spam par COMPTE (EPIC-T6) : 20 signaux par heure. L'identifiant
  -- d'appareil, fabrique par le telephone, ne sert plus qu'a titre indicatif.
  SELECT count(*) INTO v_recent
  FROM availability_signals
  WHERE user_id = v_user_id AND created_at > v_window;
  IF v_recent >= 20 THEN
    RAISE EXCEPTION 'Trop de signaux pour ce compte, reessaie plus tard' USING ERRCODE = 'P0001';
  END IF;

  -- Source et poids (docs/STRATEGIE.md) : toujours un compte depuis 014.
  -- owner (1.0) arrivera avec le chantier 7.
  v_source := 'user'; v_weight := 0.8;

  -- Signaux produit
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_product_signals) LOOP
    v_product := (v_item->>'product_id')::BIGINT;
    v_state   := v_item->>'state';
    IF v_state NOT IN ('available', 'absent') THEN
      RAISE EXCEPTION 'Etat produit invalide' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM products WHERE id = v_product AND distributor_id = p_distributor_id) THEN
      RAISE EXCEPTION 'Produit % inconnu pour ce distributeur', v_product USING ERRCODE = 'P0002';
    END IF;
    -- Doublon = meme etat, meme produit, meme appareil dans l'heure. Une
    -- correction (« Il y en a » puis « Plus rien ») est retenue (012).
    IF EXISTS (SELECT 1 FROM availability_signals
               WHERE user_id = v_user_id AND product_id = v_product
                 AND state = v_state AND created_at > v_window) THEN
      v_skipped := v_skipped + 1;
    ELSE
      INSERT INTO availability_signals (distributor_id, product_id, state, source, weight, device_hash, user_id)
      VALUES (p_distributor_id, v_product, v_state, v_source, v_weight, p_device_hash, v_user_id);
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  -- Signal machine
  IF p_machine_state IS NOT NULL THEN
    -- Doublon = meme etat par le meme appareil dans l'heure. Un changement
    -- d'etat (vide -> fonctionne, erreur corrigee) est retenu.
    IF EXISTS (SELECT 1 FROM availability_signals
               WHERE user_id = v_user_id AND distributor_id = p_distributor_id
                 AND product_id IS NULL AND state = p_machine_state
                 AND created_at > v_window) THEN
      v_skipped := v_skipped + 1;
    ELSE
      INSERT INTO availability_signals (distributor_id, product_id, state, source, weight, device_hash, user_id)
      VALUES (p_distributor_id, NULL, p_machine_state, v_source, v_weight, p_device_hash, v_user_id);
      v_inserted := v_inserted + 1;
    END IF;
  END IF;

  -- Le badge "Verifie il y a X" lit distributors.last_verified : tout signal
  -- retenu rafraichit la date (le trigger d'audit de 006 remplit updated_at).
  IF v_inserted > 0 THEN
    UPDATE distributors SET last_verified = now() WHERE id = p_distributor_id;
  END IF;

  RETURN jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped, 'source', v_source);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Appelable par l'anonyme (c'est le but) et par les connectes
GRANT EXECUTE ON FUNCTION confirm_availability(TEXT, TEXT, JSONB, TEXT) TO anon, authenticated;
-- (anon garde le droit d'APPELER la fonction pour recevoir un refus clair, 28000,
--  plutot qu'une erreur de permission opaque.)

-- ============================================
-- 3. Admin : effacer un tricheur, le bloquer / debloquer
-- ============================================

CREATE OR REPLACE FUNCTION purge_user_signals(p_user_id UUID, p_ban BOOLEAN DEFAULT true, p_reason TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM availability_signals WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF p_ban THEN
    INSERT INTO signal_bans (user_id, reason) VALUES (p_user_id, p_reason)
    ON CONFLICT (user_id) DO UPDATE SET reason = EXCLUDED.reason;
  END IF;
  RETURN jsonb_build_object('signaux_supprimes', v_deleted, 'bloque', p_ban);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION unban_user(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  DELETE FROM signal_bans WHERE user_id = p_user_id;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Reservees a l'admin : jamais appelables par l'API
REVOKE ALL ON FUNCTION purge_user_signals(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION unban_user(UUID) FROM PUBLIC, anon, authenticated;

-- ============================================
-- MODE D'EMPLOI (admin)
-- ============================================
-- Reperer les comptes les plus actifs sur 24 h :
--   select s.user_id, u.email, count(*) as signaux_24h, count(distinct s.distributor_id) as machines
--   from availability_signals s join auth.users u on u.id = s.user_id
--   where s.created_at > now() - interval '24 hours'
--   group by 1, 2 order by 3 desc limit 20;
-- Effacer et bloquer :   select purge_user_signals('<uuid>', true, 'signaux fantaisistes');
-- Debloquer :            select unban_user('<uuid>');
