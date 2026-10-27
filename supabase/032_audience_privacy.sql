-- ============================================================================
-- 032 : la mesure d'audience ne se relie plus a un compte (PRIV-05, revue du 2026-10-21)
-- ============================================================================
-- Avant : le meme identifiant d'appareil persistant (localStorage
-- snackmatch_device) partait dans events (log_event : app ouverte, fiche
-- ouverte, scan QR, itineraire) ET dans availability_signals, a cote de
-- user_id : une jointure reliait toute la navigation a un compte (et a son
-- e-mail). Depuis 014, la limite des signaux est par compte : cet identifiant
-- ne servait plus a rien cote signaux.
-- 1. confirm_availability (reprise MOT POUR MOT de 028 ; seules les deux lignes
--    VALUES changent, marquees PRIV-05) : la base enregistre la constante
--    'account' au lieu du p_device_hash recu. Les controles sur p_device_hash
--    restent (16 a 128 caracteres, 'demo-...' refuse, 028) : l'ancien front
--    continue de marcher.
-- 2. Rattrapage : les signaux deja enregistres prennent 'account' (sauf les
--    signaux de demo 'demo-...'). Commentaires de colonnes a jour.
-- 3. Index idx_signals_device_recent (007) supprime : plus aucune fonction ne
--    cherche un signal par device_hash (014 et 028 comptent par user_id).
--    idx_events_device_recent reste (anti-spam de log_event, par session).
-- 4. pg_cron : les evenements de plus de 13 mois sont effaces chaque nuit
--    (03:45 UTC, job distrimatch-events-purge).
-- Front (meme PR) : les signaux envoient la valeur fixe 'distrimatch-account',
-- la mesure un identifiant limite a la session (sessionStorage).
-- Les commentaires de 007 (« Il ne sert qu'au rate limit ») et de 008
-- (« identifiant aleatoire local, comme pour les signaux ») ne sont plus
-- exacts : une migration appliquee ne se modifie pas, ce fichier fait foi.
-- Une seule transaction (begin / commit) : tout passe ou rien.
-- Prerequis : 028 appliquee (et 029 a 031, ordre du lot 2).
-- Rejouable. Execution (Claude, apres relecture) :
--   node scripts/supabase-sql.mjs supabase/032_audience_privacy.sql
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. RPC confirm_availability (reprise de 028)
-- ----------------------------------------------------------------------------

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
  -- SEC-06 : 'demo-...' est reserve aux donnees de demo (inserees directement
  -- par seed_demo_signals) : un vrai signal ne peut pas s'y faire passer.
  IF p_device_hash ILIKE 'demo-%' THEN
    RAISE EXCEPTION 'device_hash invalide (reserve a la demo)' USING ERRCODE = '22023';
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

  -- SEC-06 : un seul appel a la fois par compte, sinon deux appels simultanes
  -- lisent le meme compteur. Verrou libere a la fin de la transaction.
  PERFORM pg_advisory_xact_lock(hashtextextended('confirm_availability:' || v_user_id::text, 0));

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
      -- SEC-06 : les signaux deja retenus dans CET appel comptent aussi
      -- (l'exception annule tout l'appel, aucune insertion partielle).
      IF v_recent + v_inserted >= 20 THEN
        RAISE EXCEPTION 'Trop de signaux pour ce compte, reessaie plus tard' USING ERRCODE = 'P0001';
      END IF;
      INSERT INTO availability_signals (distributor_id, product_id, state, source, weight, device_hash, user_id)
      VALUES (p_distributor_id, v_product, v_state, v_source, v_weight, 'account', v_user_id);   -- PRIV-05
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
      -- SEC-06 : idem pour le signal du distributeur
      IF v_recent + v_inserted >= 20 THEN
        RAISE EXCEPTION 'Trop de signaux pour ce compte, reessaie plus tard' USING ERRCODE = 'P0001';
      END IF;
      INSERT INTO availability_signals (distributor_id, product_id, state, source, weight, device_hash, user_id)
      VALUES (p_distributor_id, NULL, p_machine_state, v_source, v_weight, 'account', v_user_id);   -- PRIV-05
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

-- ----------------------------------------------------------------------------
-- 2. Rattrapage des signaux deja enregistres
-- ----------------------------------------------------------------------------
update availability_signals
   set device_hash = 'account'
 where device_hash not like 'demo-%'
   and device_hash <> 'account';

comment on column availability_signals.device_hash is
  'account = signal envoye par un compte (PRIV-05, 032) ; demo-... = donnees de demo. Aucun identifiant d''appareil.';
comment on column events.device_hash is
  'Identifiant aleatoire limite a une session d''onglet depuis PRIV-05 (032) ; demo-... = donnees de demo. Evenements effaces apres 13 mois (job distrimatch-events-purge).';

-- ----------------------------------------------------------------------------
-- 3. Index devenu inutile
-- ----------------------------------------------------------------------------
drop index if exists idx_signals_device_recent;

-- ----------------------------------------------------------------------------
-- 4. Purge nocturne des evenements de plus de 13 mois (03:45 UTC).
-- Idempotent : rejouer cette migration remplace le job.
-- ----------------------------------------------------------------------------
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'distrimatch-events-purge';

select cron.schedule(
  'distrimatch-events-purge',
  '45 3 * * *',
  $$delete from public.events where created_at < now() - interval '13 months'$$
);

commit;

-- ============================================================================
-- VERIFICATION POST-APPLICATION (Claude)
-- ============================================================================
-- node --test --test-name-pattern="032" tests/integration/db.test.js   -- tout vert
-- select device_hash, count(*) from availability_signals group by 1 order by 2 desc limit 5;
--   -- attendu : 'account' et des 'demo-...' seulement
-- select jobname, schedule, active from cron.job order by jobname;
--   -- attendu : distrimatch-events-purge | 45 3 * * * | true (en plus des jobs existants)
