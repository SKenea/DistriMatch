-- ============================================
-- DistriMatch - Migration 012 : anti-doublon produit par etat
-- ============================================
-- BACKLOG EPIC-T2, T2-US2 (2026-09-25) : on signale desormais depuis la ligne
-- de l'aliment, en un tap. Il faut pouvoir se corriger juste apres : avant 012,
-- tout 2e signal du meme appareil sur le meme produit dans l'heure etait ignore,
-- meme s'il disait le contraire. Meme regle que 011 pour la machine.
--
-- Seul changement : dans confirm_availability (reprise de 011), le doublon
-- produit tient compte de l'etat. Inchange : rate limit global 60 / appareil /
-- heure, poids, anonyme permis (UC11), etats acceptes.
--
-- Idempotente. Execution : node scripts/supabase-sql.mjs supabase/012_product_dedup_by_state.sql

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
    -- Doublon = meme etat, meme produit, meme appareil dans l'heure. Une
    -- correction (« Il y en a » puis « Plus rien ») est retenue (012).
    IF EXISTS (SELECT 1 FROM availability_signals
               WHERE device_hash = p_device_hash AND product_id = v_product
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
-- select position('AND state = v_state' in pg_get_functiondef('public.confirm_availability'::regproc)) > 0;
-- -> true
