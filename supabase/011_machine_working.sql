-- ============================================
-- DistriMatch - Migration 011 : signal machine « Ça fonctionne »
-- ============================================
-- Retour terrain 2026-09-25 (BACKLOG EPIC-T1, T1-US2) : devant une machine,
-- on doit pouvoir dire qu'elle fonctionne, pas seulement qu'elle est vide ou
-- en panne. Un « working » plus recent efface le bandeau vide / panne (la vue
-- distributor_status renvoie deja le dernier etat machine, rien a changer).
--
--   1. Contrainte availability_signals_scope : etat machine 'working' accepte
--   2. RPC confirm_availability (reprise de 007) :
--        * p_machine_state accepte 'working'
--        * anti-doublon machine par ETAT : le meme appareil peut corriger
--          « vide » en « fonctionne » dans l'heure (avant : ignore)
--   Inchange : rate limit global 60 / appareil / heure, poids, anonyme permis
--   (UC11). kpi_distributor_signals.signaux_machine_ko ne compte que empty /
--   broken : 'working' n'y entre pas.
--
-- Idempotente. Execution : node scripts/supabase-sql.mjs supabase/011_machine_working.sql

-- ============================================
-- 1. Contrainte
-- ============================================

ALTER TABLE availability_signals DROP CONSTRAINT IF EXISTS availability_signals_scope;
ALTER TABLE availability_signals ADD CONSTRAINT availability_signals_scope CHECK (
  (product_id IS NOT NULL AND state IN ('available', 'absent'))
  OR (product_id IS NULL AND state IN ('empty', 'broken', 'working'))
);

-- ============================================
-- 2. RPC confirm_availability
-- ============================================
-- p_machine_state : 'empty' | 'broken' | 'working' | NULL

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

  -- Anti-spam global par appareil
  SELECT count(*) INTO v_recent
  FROM availability_signals
  WHERE device_hash = p_device_hash AND created_at > v_window;
  IF v_recent >= 60 THEN
    RAISE EXCEPTION 'Trop de signaux pour cet appareil, reessaie plus tard' USING ERRCODE = 'P0001';
  END IF;

  -- Source et poids (docs/STRATEGIE.md). owner (1.0) arrivera avec le chantier 7.
  IF v_user_id IS NOT NULL THEN
    v_source := 'user'; v_weight := 0.8;
  ELSE
    v_source := 'anon'; v_weight := 0.5;
  END IF;

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
    IF EXISTS (SELECT 1 FROM availability_signals
               WHERE device_hash = p_device_hash AND product_id = v_product AND created_at > v_window) THEN
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
               WHERE device_hash = p_device_hash AND distributor_id = p_distributor_id
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

-- ============================================
-- VERIFICATION
-- ============================================
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'availability_signals_scope';
-- -> ... state = ANY (ARRAY['empty', 'broken', 'working']) ...
