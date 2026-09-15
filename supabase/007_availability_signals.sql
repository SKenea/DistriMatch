-- ============================================
-- DistriMatch - Signaux de disponibilite en un tap (UC11) - 2026-09-15
-- A coller dans Supabase SQL Editor > New query > Run
-- ============================================
--
-- Chantier 2 de docs/STRATEGIE.md : la confiance = l'horodatage. Un client
-- devant la machine dit en un tap ce qu'il reste ("il reste quoi ?", produit
-- par produit) ou que la machine est vide / en panne. Ce signal est ANONYME
-- (deroge au mur d'auth, cf. CLAUDE.md UC11) parce que ce n'est pas du
-- contenu editable : un horodatage a poids reduit, qui perime tout seul,
-- limite par appareil et par heure.
--
-- Poids par source (STRATEGIE.md) : owner 1.0 (chantier 7, plus tard),
-- user connecte 0.8, anonyme 0.5.
--
-- Ce que cette migration fait :
--   1. table availability_signals (append-only, lecture publique, AUCUNE
--      ecriture directe : tout passe par la RPC)
--   2. vues product_availability (dernier signal par produit) et
--      distributor_status (dernier signal machine)
--   3. RPC confirm_availability(...) ouverte a l'anonyme, avec rate limit,
--      qui rafraichit distributors.last_verified (= le badge "Verifie il y a")
--
-- Vie privee : device_hash est un identifiant aleatoire genere cote client
-- et stocke en localStorage (pas d'empreinte navigateur, pas d'IP, aucune
-- donnee personnelle). Il ne sert qu'au rate limit.
--
-- Donnees importees (futur import OSM, licence ODbL) : cette table n'en
-- contient aucune, elle reste une base "collective" separee.

-- ============================================
-- 1. Table
-- ============================================

CREATE TABLE IF NOT EXISTS availability_signals (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  distributor_id  TEXT NOT NULL REFERENCES distributors(id) ON DELETE CASCADE,
  product_id      BIGINT REFERENCES products(id) ON DELETE CASCADE,  -- NULL = signal machine
  state           TEXT NOT NULL,
  source          TEXT NOT NULL CHECK (source IN ('anon', 'user', 'owner')),
  weight          NUMERIC(3,2) NOT NULL CHECK (weight > 0 AND weight <= 1),
  device_hash     TEXT NOT NULL,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Produit : vu dispo / vu absent. Machine (product_id NULL) : vide / en panne.
  CONSTRAINT availability_signals_scope CHECK (
    (product_id IS NOT NULL AND state IN ('available', 'absent'))
    OR (product_id IS NULL AND state IN ('empty', 'broken'))
  )
);

CREATE INDEX IF NOT EXISTS idx_signals_distributor_recent
  ON availability_signals (distributor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_device_recent
  ON availability_signals (device_hash, created_at DESC);

ALTER TABLE availability_signals ENABLE ROW LEVEL SECURITY;

-- Lecture publique (comme distributors / products). Aucune policy d'ecriture :
-- RLS active + 0 policy = tout INSERT/UPDATE/DELETE direct refuse, meme pour
-- un user connecte. Seule la RPC (SECURITY DEFINER) ecrit.
DROP POLICY IF EXISTS "Lecture publique signaux" ON availability_signals;
CREATE POLICY "Lecture publique signaux" ON availability_signals FOR SELECT USING (true);

-- ============================================
-- 2. Vues "etat courant"
-- ============================================
-- Regle simple pour demarrer : le DERNIER signal fait foi ; son poids et son
-- age sont exposes pour l'affichage (vert < 2 h, neutre au-dela). Le rythme
-- infere (chantier 6) viendra par-dessus sans changer ces vues.

CREATE OR REPLACE VIEW product_availability
WITH (security_invoker = true) AS
SELECT DISTINCT ON (distributor_id, product_id)
  distributor_id, product_id, state, source, weight, created_at,
  EXTRACT(EPOCH FROM (now() - created_at))::BIGINT AS age_seconds
FROM availability_signals
WHERE product_id IS NOT NULL
ORDER BY distributor_id, product_id, created_at DESC;

CREATE OR REPLACE VIEW distributor_status
WITH (security_invoker = true) AS
SELECT DISTINCT ON (distributor_id)
  distributor_id, state, source, weight, created_at,
  EXTRACT(EPOCH FROM (now() - created_at))::BIGINT AS age_seconds
FROM availability_signals
WHERE product_id IS NULL
ORDER BY distributor_id, created_at DESC;

GRANT SELECT ON product_availability, distributor_status TO anon, authenticated;

-- ============================================
-- 3. RPC confirm_availability
-- ============================================
-- p_product_signals : JSON [{ "product_id": 12, "state": "available" | "absent" }, ...]
--                     (les produits "pas regarde" ne sont simplement pas envoyes)
-- p_machine_state   : 'empty' | 'broken' | NULL
-- Retour            : { "inserted": n, "skipped": m, "source": "anon" | "user" }
--
-- Rate limit :
--   * 1 signal par appareil, par produit (ou par machine), par heure : un
--     doublon dans l'heure est ignore (compte dans "skipped"), pas une erreur
--   * 60 signaux max par appareil et par heure, toutes machines confondues :
--     au-dela, erreur P0001 (anti-spam)

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
  IF p_machine_state IS NOT NULL AND p_machine_state NOT IN ('empty', 'broken') THEN
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
    IF EXISTS (SELECT 1 FROM availability_signals
               WHERE device_hash = p_device_hash AND distributor_id = p_distributor_id
                 AND product_id IS NULL AND created_at > v_window) THEN
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
-- VERIFICATION POST-APPLICATION (a executer pour valider)
-- ============================================
--
-- 1. SQL Editor :
--    SELECT count(*) FROM availability_signals;                              -- attendu : 0
--    SELECT id, name FROM products WHERE distributor_id = 'dist-001' LIMIT 3; -- noter un id
--
-- 2. Console JS sur https://skenea.github.io/DistriMatch/ (anonyme), remplacer <ID> :
--
--    const cfg = await import('./js/config.js');
--    const supa = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
--    const params = { p_distributor_id: 'dist-001', p_device_hash: 'test-device-0123456789abcdef',
--                     p_product_signals: [{ product_id: <ID>, state: 'available' }], p_machine_state: null };
--    console.log(await supa.rpc('confirm_availability', params));
--    // attendu : data { inserted: 1, skipped: 0, source: 'anon' }
--    console.log(await supa.rpc('confirm_availability', params));
--    // attendu : data { inserted: 0, skipped: 1, source: 'anon' }  (rate limit 1 h)
--    const direct = await supa.from('availability_signals').insert({ distributor_id: 'dist-001', state: 'empty', source: 'anon', weight: 0.5, device_hash: 'x' });
--    console.log(direct.error?.code);
--    // attendu : 42501 (aucune ecriture directe, seule la RPC ecrit)
--    console.log((await supa.from('product_availability').select('*').eq('distributor_id', 'dist-001')).data);
--    // attendu : 1 ligne, state 'available', age_seconds petit
--
-- 3. Recharger l'app : la fiche dist-001 affiche "Vérifié il y a X min" en vert.
--
-- 4. Nettoyer le signal de test :
--    DELETE FROM availability_signals WHERE device_hash = 'test-device-0123456789abcdef';
--    UPDATE distributors SET last_verified = '2025-12-05' WHERE id = 'dist-001';   -- valeur du seed
