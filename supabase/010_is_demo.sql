-- ============================================
-- DistriMatch - Jeu de donnees factice identifiable : distributors.is_demo - 2026-09-18
-- A coller dans Supabase SQL Editor > New query > Run (requiert 009), PUIS :
--   SELECT seed_demo_signals();     -- regenere une demo propre (fiches is_demo seulement)
-- ============================================
--
-- CONVENTION (a respecter partout) :
--   * une FICHE est fictive si distributors.is_demo = true ; ses produits, photos et
--     signalements le sont par jointure (FK) ;
--   * un SIGNAL ou un EVENEMENT est fictif si device_hash LIKE 'demo-%', et il ne
--     porte que sur des fiches is_demo ;
--   * tout le reste est reel. Le front lit is_demo (tag « Démo »), ne l'ecrit jamais.
--
-- Marquage initial : les 25 fiches du seed (002) + 4 fiches de test ajoutees a la main
-- en avril-mai 2026. « Gaztainbidea » (user-1776102020333) reste reelle.
--
-- PURGE DU JOUR J (quand le vrai pilote demarre), dans cet ordre :
--   1. lister les photos des fiches demo pour les retirer dans Dashboard > Storage :
--      SELECT name FROM storage.objects
--      WHERE bucket_id = 'distributor-photos'
--        AND split_part(split_part(name, '/', 2), '_', 1) IN (SELECT id FROM distributors WHERE is_demo);
--   2. SELECT purge_demo_data();                  -- signaux + evenements demo (y compris globaux)
--   3. DELETE FROM distributors WHERE is_demo;    -- cascade : products, distributor_photos, reports, availability_signals, events
--   4. DELETE FROM demo_backup;

-- ============================================
-- 1. Colonne
-- ============================================

ALTER TABLE distributors ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN distributors.is_demo IS
  'true = fiche du jeu de donnees factice (maquette / demo), false = machine reelle. Jamais posee par l''API (trigger guard_is_demo). Purge : DELETE FROM distributors WHERE is_demo.';

-- ============================================
-- 2. Marquage initial
-- ============================================

UPDATE distributors SET is_demo = true
WHERE id LIKE 'dist-%'
   OR id IN ('user-1776099988510',   -- « Test Supabase Biarritz »
             'user-1776101171767',   -- « Boulangerie Test Photo »
             'user-1777220392357',   -- « Glacon » (adresse a completer)
             'user-1780130564104');  -- « Tic Tac » (adresse a completer)

-- ============================================
-- 3. Garde : l'API ne peut ni poser ni changer is_demo
-- ============================================
-- PostgREST execute chaque requete sous SET ROLE anon | authenticated (la RLS repose
-- sur le meme mecanisme). postgres (SQL Editor, pg_cron) et service_role sont de
-- confiance. Pas SECURITY DEFINER : current_user serait alors le proprietaire.

CREATE OR REPLACE FUNCTION guard_is_demo()
RETURNS trigger AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.is_demo := false;
    ELSE
      NEW.is_demo := OLD.is_demo;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS distributors_is_demo_guard ON distributors;
CREATE TRIGGER distributors_is_demo_guard
  BEFORE INSERT OR UPDATE OF is_demo ON distributors
  FOR EACH ROW EXECUTE FUNCTION guard_is_demo();
-- Coexiste avec distributors_audit_trigger (006, BEFORE UPDATE) : colonnes disjointes.

-- ============================================
-- 4. Reparation : 009 arrosait TOUTES les fiches, y compris les reelles
-- ============================================

DELETE FROM availability_signals s USING distributors d
  WHERE s.distributor_id = d.id AND NOT d.is_demo AND s.device_hash LIKE 'demo-%';
DELETE FROM events e USING distributors d
  WHERE e.distributor_id = d.id AND NOT d.is_demo AND e.device_hash LIKE 'demo-%';
-- last_verified des fiches reelles : dernier vrai signal, sinon la valeur sauvegardee
UPDATE distributors d
  SET last_verified = coalesce(
        (SELECT max(created_at) FROM availability_signals s WHERE s.distributor_id = d.id),
        b.last_verified)
  FROM demo_backup b
  WHERE b.distributor_id = d.id AND NOT d.is_demo;
DELETE FROM demo_backup b USING distributors d WHERE b.distributor_id = d.id AND NOT d.is_demo;

-- ============================================
-- 5. seed_demo_signals : fiches is_demo seulement
-- ============================================
-- Meme corps que 009, avec WHERE is_demo sur la sauvegarde, la boucle, la mise a jour
-- de last_verified et le tirage des evenements ; erreur explicite s'il n'y a aucune
-- fiche demo ; le retour compte les fiches touchees.

CREATE OR REPLACE FUNCTION seed_demo_signals(p_days INTEGER DEFAULT 14)
RETURNS JSONB AS $$
DECLARE
  d           RECORD;
  p           RECORD;
  v_i         INTEGER := 0;
  v_profile   TEXT;
  v_tz        TEXT;
  v_day       INTEGER;
  v_hour      INTEGER;
  v_k         INTEGER;
  v_n         INTEGER;
  v_ts        TIMESTAMPTZ;
  v_state     TEXT;
  v_source    TEXT;
  v_weight    NUMERIC(3,2);
  v_signals   INTEGER := 0;
  v_events    INTEGER := 0;
  v_dist_ids  TEXT[];
BEGIN
  IF p_days < 1 OR p_days > 60 THEN
    RAISE EXCEPTION 'p_days doit etre entre 1 et 60';
  END IF;

  SELECT array_agg(id ORDER BY id) INTO v_dist_ids FROM distributors WHERE is_demo;
  IF v_dist_ids IS NULL THEN
    RAISE EXCEPTION 'Aucune fiche is_demo : rien a generer (marquer des fiches avant)';
  END IF;

  -- Sauvegarde des last_verified d'origine (une seule fois) pour purge_demo_data()
  INSERT INTO demo_backup (distributor_id, last_verified)
  SELECT id, last_verified FROM distributors WHERE is_demo
  ON CONFLICT (distributor_id) DO NOTHING;

  DELETE FROM availability_signals WHERE device_hash LIKE 'demo-%';
  DELETE FROM events WHERE device_hash LIKE 'demo-%';

  FOR d IN SELECT id, type, coalesce(tz, 'UTC') AS tz FROM distributors WHERE is_demo ORDER BY id LOOP
    v_i := v_i + 1;
    v_tz := d.tz;
    v_profile := CASE
      WHEN d.type = 'bakery' THEN 'matinal'
      WHEN d.type = 'pizza'  THEN 'soir'
      WHEN v_i % 5 = 0       THEN 'dormant'
      WHEN v_i % 7 = 0       THEN 'vide'
      WHEN v_i % 11 = 0      THEN 'panne'
      ELSE 'frais'
    END;

    IF v_profile = 'dormant' THEN
      -- Un seul signal ancien : la fiche affichera "Verifie il y a 9 j" en neutre
      FOR p IN SELECT id FROM products WHERE distributor_id = d.id ORDER BY id LIMIT 1 LOOP
        INSERT INTO availability_signals (distributor_id, product_id, state, source, weight, device_hash, created_at)
        VALUES (d.id, p.id, 'available', 'anon', 0.5, 'demo-' || md5(random()::text), now() - INTERVAL '9 days');
        v_signals := v_signals + 1;
      END LOOP;
      CONTINUE;
    END IF;

    -- Historique : 3 passages par jour (8 h, 12 h, 19 h heure locale : la tranche "soir" commence a 19 h) sur p_days jours
    FOR v_day IN REVERSE (p_days - 1)..0 LOOP
      FOREACH v_hour IN ARRAY ARRAY[8, 12, 19] LOOP
        v_ts := (((now() AT TIME ZONE v_tz)::date - v_day) + make_time(v_hour, (random() * 50)::integer, 0)) AT TIME ZONE v_tz;
        CONTINUE WHEN v_ts > now();
        IF random() < 0.3 THEN v_source := 'user'; v_weight := 0.8; ELSE v_source := 'anon'; v_weight := 0.5; END IF;
        FOR p IN SELECT id FROM products WHERE distributor_id = d.id ORDER BY id LOOP
          v_state := CASE v_profile
            WHEN 'matinal' THEN CASE WHEN v_hour < 11 THEN 'available' ELSE 'absent' END
            WHEN 'soir'    THEN CASE WHEN v_hour >= 17 THEN 'available' ELSE 'absent' END
            ELSE 'available'
          END;
          -- 15 % de bruit : la vraie vie n'est pas un horaire
          IF random() < 0.15 THEN
            v_state := CASE v_state WHEN 'available' THEN 'absent' ELSE 'available' END;
          END IF;
          INSERT INTO availability_signals (distributor_id, product_id, state, source, weight, device_hash, created_at)
          VALUES (d.id, p.id, v_state, v_source, v_weight, 'demo-' || md5(random()::text), v_ts);
          v_signals := v_signals + 1;
        END LOOP;
      END LOOP;
    END LOOP;

    -- Dernier etat, propre a chaque profil
    IF v_profile = 'vide' THEN
      INSERT INTO availability_signals (distributor_id, product_id, state, source, weight, device_hash, created_at)
      VALUES (d.id, NULL, 'empty', 'anon', 0.5, 'demo-' || md5(random()::text), now() - INTERVAL '40 minutes');
      -- Colonnes qualifiees (pr.) : d.id et products.id s'appelleraient tous deux "id"
      INSERT INTO availability_signals (distributor_id, product_id, state, source, weight, device_hash, created_at)
      SELECT d.id, pr.id, 'absent', 'anon', 0.5, 'demo-' || md5(random()::text), now() - INTERVAL '40 minutes'
      FROM products pr WHERE pr.distributor_id = d.id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_signals := v_signals + 1 + v_n;
    ELSIF v_profile = 'panne' THEN
      INSERT INTO availability_signals (distributor_id, product_id, state, source, weight, device_hash, created_at)
      VALUES (d.id, NULL, 'broken', 'user', 0.8, 'demo-' || md5(random()::text), now() - INTERVAL '2 hours');
      v_signals := v_signals + 1;
    ELSIF v_profile = 'frais' THEN
      -- Un passage tout recent sur 1 ou 2 produits : badge vert "il y a X min"
      INSERT INTO availability_signals (distributor_id, product_id, state, source, weight, device_hash, created_at)
      SELECT d.id, pr.id, 'available', 'anon', 0.5, 'demo-' || md5(random()::text), now() - make_interval(mins => 5 + (random() * 25)::integer)
      FROM products pr WHERE pr.distributor_id = d.id ORDER BY pr.id LIMIT 2;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_signals := v_signals + v_n;
    END IF;
  END LOOP;

  -- Le badge "Verifie il y a" suit le dernier signal, comme le ferait la RPC (fiches demo seulement)
  UPDATE distributors dist SET last_verified = s.last_ts
  FROM (SELECT distributor_id, max(created_at) AS last_ts
        FROM availability_signals WHERE device_hash LIKE 'demo-%' GROUP BY distributor_id) s
  WHERE s.distributor_id = dist.id AND dist.is_demo;

  -- Evenements de mesure : 30 jours de consultations, scans QR, signaux, itineraires
  FOR v_day IN REVERSE 29..0 LOOP
    -- 6 a 20 ouvertures d'app par jour, 1 sur 4 via un QR
    FOR v_k IN 1..(6 + (random() * 14)::integer) LOOP
      INSERT INTO events (type, device_hash, source, created_at)
      VALUES ('app_ouverte', 'demo-' || md5(random()::text),
              CASE WHEN random() < 0.25 THEN 'qr' ELSE 'organic' END,
              now() - make_interval(days => v_day, hours => (random() * 14)::integer + 7, mins => (random() * 59)::integer));
      v_events := v_events + 1;
    END LOOP;
    -- 4 a 14 fiches ouvertes par jour, 1 sur 4 via QR ; 40 % des scans donnent un signal (seuil pilote : 5 %)
    FOR v_k IN 1..(4 + (random() * 10)::integer) LOOP
      v_source := CASE WHEN random() < 0.25 THEN 'qr' ELSE 'organic' END;
      v_ts := now() - make_interval(days => v_day, hours => (random() * 14)::integer + 7, mins => (random() * 59)::integer);
      INSERT INTO events (type, distributor_id, device_hash, source, created_at)
      VALUES ('fiche_ouverte', v_dist_ids[1 + (random() * (array_length(v_dist_ids, 1) - 1))::integer],
              'demo-' || md5(random()::text), v_source, v_ts);
      v_events := v_events + 1;
      IF v_source = 'qr' THEN
        INSERT INTO events (type, device_hash, source, created_at)
        VALUES ('qr_scan', 'demo-' || md5(random()::text), 'qr', v_ts);
        v_events := v_events + 1;
        IF random() < 0.4 THEN
          INSERT INTO events (type, device_hash, source, created_at)
          VALUES ('signal_envoye', 'demo-' || md5(random()::text), 'qr', v_ts + INTERVAL '2 minutes');
          v_events := v_events + 1;
        END IF;
      ELSIF random() < 0.1 THEN
        INSERT INTO events (type, device_hash, source, created_at)
        VALUES ('signal_envoye', 'demo-' || md5(random()::text), 'organic', v_ts + INTERVAL '3 minutes');
        v_events := v_events + 1;
      END IF;
      IF random() < 0.3 THEN
        INSERT INTO events (type, device_hash, source, created_at)
        VALUES ('itineraire', 'demo-' || md5(random()::text), v_source, v_ts + INTERVAL '1 minute');
        v_events := v_events + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('signaux', v_signals, 'evenements', v_events, 'jours', p_days,
                            'fiches_demo', array_length(v_dist_ids, 1));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- 6. purge_demo_data : ne restaure que les fiches demo
-- ============================================

CREATE OR REPLACE FUNCTION purge_demo_data()
RETURNS JSONB AS $$
DECLARE
  v_s INTEGER;
  v_e INTEGER;
BEGIN
  DELETE FROM availability_signals WHERE device_hash LIKE 'demo-%';
  GET DIAGNOSTICS v_s = ROW_COUNT;
  DELETE FROM events WHERE device_hash LIKE 'demo-%';
  GET DIAGNOSTICS v_e = ROW_COUNT;
  UPDATE distributors dist SET last_verified = b.last_verified
  FROM demo_backup b WHERE b.distributor_id = dist.id AND dist.is_demo;
  RETURN jsonb_build_object('signaux_supprimes', v_s, 'evenements_supprimes', v_e);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Reservees au SQL Editor (postgres) : jamais appelables depuis l'app
REVOKE EXECUTE ON FUNCTION seed_demo_signals(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION purge_demo_data() FROM PUBLIC, anon, authenticated;

-- ============================================
-- 7. Vues KPI : la part de demo est visible (colonnes AJOUTEES EN FIN, contrainte
--    de CREATE OR REPLACE VIEW ; les grants survivent, re-joues par securite)
-- ============================================

CREATE OR REPLACE VIEW kpi_coverage AS
SELECT
  (SELECT count(*) FROM distributors)                                                                               AS machines,
  (SELECT count(DISTINCT distributor_id) FROM availability_signals WHERE created_at > now() - INTERVAL '24 hours') AS machines_signal_24h,
  (SELECT count(DISTINCT distributor_id) FROM availability_signals WHERE created_at > now() - INTERVAL '7 days')   AS machines_signal_7j,
  (SELECT count(*) FROM distributors WHERE last_verified > now() - INTERVAL '24 hours')                            AS machines_verifiees_24h,
  (SELECT count(*) FROM availability_signals WHERE created_at > now() - INTERVAL '7 days')                         AS signaux_7j,
  (SELECT count(*) FROM availability_signals WHERE created_at > now() - INTERVAL '30 days')                        AS signaux_30j,
  (SELECT count(*) FROM distributors WHERE is_demo)                                                                 AS machines_demo;

CREATE OR REPLACE VIEW kpi_top_distributors AS
SELECT d.id, d.name, d.type,
  count(e.id) AS fiches_ouvertes_30j,
  (SELECT count(*) FROM availability_signals s WHERE s.distributor_id = d.id AND s.created_at > now() - INTERVAL '30 days') AS signaux_30j,
  d.last_verified,
  d.is_demo
FROM distributors d
LEFT JOIN events e ON e.distributor_id = d.id AND e.type = 'fiche_ouverte' AND e.created_at > now() - INTERVAL '30 days'
GROUP BY d.id, d.name, d.type, d.last_verified, d.is_demo
ORDER BY fiches_ouvertes_30j DESC, d.name;

GRANT SELECT ON kpi_coverage, kpi_top_distributors TO anon, authenticated;

-- ============================================
-- VERIFICATION POST-APPLICATION
-- ============================================
--
-- 1. SQL Editor :
--    SELECT count(*) FILTER (WHERE is_demo) AS demo, count(*) FILTER (WHERE NOT is_demo) AS reelles FROM distributors;
--      -- attendu : 29 / 1 (Gaztainbidea)
--    SELECT machines, machines_demo FROM kpi_coverage;                -- 30 / 29
--    SELECT seed_demo_signals();                                        -- { ..., "fiches_demo": 29 }
--    SELECT count(*) FROM availability_signals s JOIN distributors d ON d.id = s.distributor_id
--    WHERE NOT d.is_demo AND s.device_hash LIKE 'demo-%';               -- 0
--
-- 2. Console JS sur https://skenea.github.io/DistriMatch/ (connecte avec un compte) :
--    const cfg = await import('./js/config.js');
--    const supa = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
--    console.log((await supa.from('distributors').update({ is_demo: false }).eq('id', 'dist-001').select('id,is_demo')).data);
--      -- attendu : is_demo reste true (le trigger ignore la valeur envoyee par l'API)
--
-- 3. Si machines_demo n'apparait pas dans l'API : NOTIFY pgrst, 'reload schema';
