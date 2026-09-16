-- ============================================
-- DistriMatch - Jeu de donnees DEMO regenerable (signaux + evenements) - 2026-09-16
-- A coller dans Supabase SQL Editor > New query > Run, PUIS :
--   SELECT seed_demo_signals();     -- (re)genere la demo, relative a maintenant
--   SELECT purge_demo_data();       -- retire tout, restaure last_verified
-- ============================================
--
-- Pourquoi : le seed (25 fiches) est une maquette. Pour APPREHENDER les couches
-- de la strategie (fraicheur verte, "vu dispo il y a X", machine vide / en
-- panne, rythme "plein le matin", tableau de bord KPI), il faut des signaux et
-- des evenements plausibles, repartis dans le temps. Cette fonction en cree
-- pour chaque distributeur selon un PROFIL tire de son type :
--   bakery   -> "matinal" : dispo le matin, absent l'apres-midi (chaque jour)
--   pizza    -> "soir"    : dispo le soir, absent le matin
--   1 sur 5  -> "dormant" : un seul signal il y a 9 jours (fraicheur perimee, neutre)
--   1 sur 7  -> "vide"    : machine signalee vide il y a 40 min (bandeau)
--   1 sur 11 -> "panne"   : machine signalee en panne il y a 2 h (bandeau)
--   autres   -> "frais"   : signaux reguliers, le dernier il y a 5 a 30 min (badge vert)
-- Toutes les lignes demo portent un device_hash 'demo-...' : elles se purgent
-- d'un coup, les vraies contributions ne sont jamais touchees.
-- Requiert 007 (availability_signals) et 008 (events, colonne tz).
-- A PURGER avant le vrai pilote : les KPI ne distinguent pas demo et reel.

CREATE TABLE IF NOT EXISTS demo_backup (
  distributor_id TEXT PRIMARY KEY,
  last_verified  TIMESTAMPTZ
);

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

  -- Sauvegarde des last_verified d'origine (une seule fois) pour purge_demo_data()
  INSERT INTO demo_backup (distributor_id, last_verified)
  SELECT id, last_verified FROM distributors
  ON CONFLICT (distributor_id) DO NOTHING;

  DELETE FROM availability_signals WHERE device_hash LIKE 'demo-%';
  DELETE FROM events WHERE device_hash LIKE 'demo-%';

  FOR d IN SELECT id, type, coalesce(tz, 'UTC') AS tz FROM distributors ORDER BY id LOOP
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

    -- Historique : 3 passages par jour (8 h, 12 h, 18 h heure locale) sur p_days jours
    FOR v_day IN REVERSE (p_days - 1)..0 LOOP
      FOREACH v_hour IN ARRAY ARRAY[8, 12, 18] LOOP
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
      INSERT INTO availability_signals (distributor_id, product_id, state, source, weight, device_hash, created_at)
      SELECT d.id, id, 'absent', 'anon', 0.5, 'demo-' || md5(random()::text), now() - INTERVAL '40 minutes'
      FROM products WHERE distributor_id = d.id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_signals := v_signals + 1 + v_n;
    ELSIF v_profile = 'panne' THEN
      INSERT INTO availability_signals (distributor_id, product_id, state, source, weight, device_hash, created_at)
      VALUES (d.id, NULL, 'broken', 'user', 0.8, 'demo-' || md5(random()::text), now() - INTERVAL '2 hours');
      v_signals := v_signals + 1;
    ELSIF v_profile = 'frais' THEN
      -- Un passage tout recent sur 1 ou 2 produits : badge vert "il y a X min"
      INSERT INTO availability_signals (distributor_id, product_id, state, source, weight, device_hash, created_at)
      SELECT d.id, id, 'available', 'anon', 0.5, 'demo-' || md5(random()::text), now() - make_interval(mins => 5 + (random() * 25)::integer)
      FROM products WHERE distributor_id = d.id ORDER BY id LIMIT 2;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_signals := v_signals + v_n;
    END IF;
  END LOOP;

  -- Le badge "Verifie il y a" suit le dernier signal, comme le ferait la RPC
  UPDATE distributors d SET last_verified = s.last_ts
  FROM (SELECT distributor_id, max(created_at) AS last_ts
        FROM availability_signals WHERE device_hash LIKE 'demo-%' GROUP BY distributor_id) s
  WHERE s.distributor_id = d.id;

  -- Evenements de mesure : 30 jours de consultations, scans QR, signaux, itineraires
  SELECT array_agg(id) INTO v_dist_ids FROM distributors;
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

  RETURN jsonb_build_object('signaux', v_signals, 'evenements', v_events, 'jours', p_days);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
  UPDATE distributors d SET last_verified = b.last_verified
  FROM demo_backup b WHERE b.distributor_id = d.id;
  RETURN jsonb_build_object('signaux_supprimes', v_s, 'evenements_supprimes', v_e);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Reservees au SQL Editor (postgres) : jamais appelables depuis l'app
REVOKE EXECUTE ON FUNCTION seed_demo_signals(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION purge_demo_data() FROM PUBLIC, anon, authenticated;

-- ============================================
-- UTILISATION
-- ============================================
--   SELECT seed_demo_signals();        -- { signaux: ~1500, evenements: ~700, jours: 14 }
--   SELECT * FROM kpi_coverage;        -- machines_signal_24h proche du total
--   SELECT * FROM kpi_contribution;    -- signaux_via_qr_30j / scans_qr_30j ~ 40 %
--   SELECT * FROM product_rhythm WHERE distributor_id = 'dist-002' ORDER BY tranche;
--     -- boulangerie : matin ~85 % dispo, apres-midi / soir ~15 %
-- Puis recharger l'app : badges verts, "vu dispo il y a X", bandeaux "Signalée vide".
-- A relancer avant chaque demo (les ages se recalculent) ; SELECT purge_demo_data(); pour tout retirer.
