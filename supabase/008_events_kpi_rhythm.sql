-- ============================================
-- DistriMatch - Mesure (events + KPI) et rythme infere - 2026-09-16
-- A coller dans Supabase SQL Editor > New query > Run
-- ============================================
--
-- docs/STRATEGIE.md : le KPI directeur du pilote est "% de machines avec un
-- signal de moins de 24 h" ; les seuils go/no-go (5 % des scans QR produisent
-- un signal, 30 % des machines avec un signal < 7 j a 3 mois) ne se verifient
-- qu'avec une mesure. Cette migration pose :
--   1. table events (append-only, AUCUNE lecture ni ecriture directe) + RPC
--      log_event ouverte a l'anonyme avec anti-spam ; aucune donnee personnelle
--      (device_hash = identifiant aleatoire local, comme pour les signaux)
--   2. vues KPI agregees, lisibles par tous (executees avec les droits du
--      proprietaire : on lit des comptes, jamais les lignes brutes)
--   3. vue product_rhythm (couche 2 de la strategie) : part de "vu dispo" par
--      tranche horaire locale, pour dire "habituellement plein le matin"
--
-- Pas de territoire en dur : le fuseau horaire est une DONNEE de chaque
-- distributeur (colonne tz), pas une constante du code. Le pilote est en
-- Europe/Paris ; un futur import ailleurs portera son propre tz.

-- ============================================
-- 1. Table events + RPC log_event
-- ============================================

CREATE TABLE IF NOT EXISTS events (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type            TEXT NOT NULL CHECK (type IN (
                    'app_ouverte',     -- ouverture de l'app (source : qr | organic)
                    'fiche_ouverte',   -- ouverture d'une fiche distributeur
                    'qr_scan',         -- arrivee par ?id=&src=qr (sticker sur la machine)
                    'signal_envoye',   -- signal de dispo retenu par la RPC (inserted > 0)
                    'itineraire',      -- clic "Itineraire" (intention de deplacement)
                    'alerte_abonnee'   -- futur chantier 5
                  )),
  distributor_id  TEXT REFERENCES distributors(id) ON DELETE CASCADE,
  source          TEXT,                 -- 'qr' | 'organic' | NULL
  device_hash     TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_type_recent ON events (type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_distributor_recent ON events (distributor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_device_recent ON events (device_hash, created_at DESC);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
-- Aucune policy : ni lecture ni ecriture directe, meme connecte. On ecrit par
-- la RPC, on lit par les vues KPI (agregats).

CREATE OR REPLACE FUNCTION log_event(
  p_type           TEXT,
  p_device_hash    TEXT,
  p_distributor_id TEXT DEFAULT NULL,
  p_source         TEXT DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_recent INTEGER;
BEGIN
  IF p_type IS NULL OR p_type NOT IN ('app_ouverte', 'fiche_ouverte', 'qr_scan', 'signal_envoye', 'itineraire', 'alerte_abonnee') THEN
    RAISE EXCEPTION 'Type d''evenement invalide' USING ERRCODE = '22023';
  END IF;
  IF p_device_hash IS NULL OR length(p_device_hash) < 16 OR length(p_device_hash) > 128 THEN
    RAISE EXCEPTION 'device_hash invalide' USING ERRCODE = '22023';
  END IF;
  -- Distributeur inconnu : on ignore sans erreur (la mesure ne doit jamais casser l'app)
  IF p_distributor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM distributors WHERE id = p_distributor_id) THEN
    RETURN;
  END IF;
  -- Anti-spam silencieux : 300 evenements max par appareil et par heure
  SELECT count(*) INTO v_recent FROM events
  WHERE device_hash = p_device_hash AND created_at > now() - INTERVAL '1 hour';
  IF v_recent >= 300 THEN RETURN; END IF;

  INSERT INTO events (type, distributor_id, source, device_hash)
  VALUES (p_type, p_distributor_id, left(p_source, 32), p_device_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION log_event(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- ============================================
-- 2. Fuseau horaire par distributeur (donnee, pas constante du code)
-- ============================================

ALTER TABLE distributors ADD COLUMN IF NOT EXISTS tz TEXT;
-- Pilote Cote Basque : une donnee de seed, pas une regle
UPDATE distributors SET tz = 'Europe/Paris' WHERE tz IS NULL;

-- ============================================
-- 3. Vues KPI (agregats ; security_invoker = false VOLONTAIRE : les vues
--    lisent events et availability_signals avec les droits du proprietaire,
--    l'anonyme ne voit que des comptes)
-- ============================================

-- KPI directeur : couverture fraicheur
CREATE OR REPLACE VIEW kpi_coverage AS
SELECT
  (SELECT count(*) FROM distributors)                                                                               AS machines,
  (SELECT count(DISTINCT distributor_id) FROM availability_signals WHERE created_at > now() - INTERVAL '24 hours') AS machines_signal_24h,
  (SELECT count(DISTINCT distributor_id) FROM availability_signals WHERE created_at > now() - INTERVAL '7 days')   AS machines_signal_7j,
  (SELECT count(*) FROM distributors WHERE last_verified > now() - INTERVAL '24 hours')                            AS machines_verifiees_24h,
  (SELECT count(*) FROM availability_signals WHERE created_at > now() - INTERVAL '7 days')                         AS signaux_7j,
  (SELECT count(*) FROM availability_signals WHERE created_at > now() - INTERVAL '30 days')                        AS signaux_30j;

-- Signaux par jour et par source (30 j)
CREATE OR REPLACE VIEW kpi_signals_daily AS
SELECT (created_at AT TIME ZONE 'UTC')::date AS jour, source, count(*) AS signaux
FROM availability_signals
WHERE created_at > now() - INTERVAL '30 days'
GROUP BY 1, 2
ORDER BY 1 DESC, 2;

-- Evenements par jour, type et source (30 j) : ouvertures QR vs organique, etc.
CREATE OR REPLACE VIEW kpi_events_daily AS
SELECT (created_at AT TIME ZONE 'UTC')::date AS jour, type, coalesce(source, 'organic') AS source, count(*) AS n
FROM events
WHERE created_at > now() - INTERVAL '30 days'
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 2, 3;

-- Taux de contribution (30 j) : l'inconnue principale du pilote
CREATE OR REPLACE VIEW kpi_contribution AS
SELECT
  (SELECT count(*) FROM availability_signals WHERE created_at > now() - INTERVAL '30 days')                                 AS signaux_30j,
  (SELECT count(*) FROM events WHERE type = 'fiche_ouverte' AND created_at > now() - INTERVAL '30 days')                   AS fiches_ouvertes_30j,
  (SELECT count(*) FROM events WHERE type = 'fiche_ouverte' AND source = 'qr' AND created_at > now() - INTERVAL '30 days') AS fiches_via_qr_30j,
  (SELECT count(*) FROM events WHERE type = 'qr_scan' AND created_at > now() - INTERVAL '30 days')                         AS scans_qr_30j,
  (SELECT count(*) FROM events WHERE type = 'signal_envoye' AND created_at > now() - INTERVAL '30 days')                   AS signaux_envoyes_30j,
  (SELECT count(*) FROM events WHERE type = 'signal_envoye' AND source = 'qr' AND created_at > now() - INTERVAL '30 days') AS signaux_via_qr_30j,
  (SELECT count(*) FROM events WHERE type = 'itineraire' AND created_at > now() - INTERVAL '30 days')                      AS itineraires_30j;

-- Fiches les plus consultees (30 j), avec leurs signaux et leur fraicheur
CREATE OR REPLACE VIEW kpi_top_distributors AS
SELECT d.id, d.name, d.type,
  count(e.id) AS fiches_ouvertes_30j,
  (SELECT count(*) FROM availability_signals s WHERE s.distributor_id = d.id AND s.created_at > now() - INTERVAL '30 days') AS signaux_30j,
  d.last_verified
FROM distributors d
LEFT JOIN events e ON e.distributor_id = d.id AND e.type = 'fiche_ouverte' AND e.created_at > now() - INTERVAL '30 days'
GROUP BY d.id, d.name, d.type, d.last_verified
ORDER BY fiches_ouvertes_30j DESC, d.name;

-- ============================================
-- 4. Rythme infere (couche 2) : part de "vu dispo" par tranche horaire LOCALE
-- ============================================
-- Une machine est "habituellement pleine" sur une tranche si >= 70 % des
-- signaux produit y sont "available" (>= 3 signaux), "souvent vide" si <= 30 %.
-- Le front compose la phrase ; la vue ne fait que compter.

CREATE OR REPLACE VIEW product_rhythm AS
SELECT
  s.distributor_id,
  CASE
    WHEN EXTRACT(HOUR FROM s.created_at AT TIME ZONE coalesce(d.tz, 'UTC')) < 11 THEN 'matin'
    WHEN EXTRACT(HOUR FROM s.created_at AT TIME ZONE coalesce(d.tz, 'UTC')) < 15 THEN 'midi'
    WHEN EXTRACT(HOUR FROM s.created_at AT TIME ZONE coalesce(d.tz, 'UTC')) < 19 THEN 'apres-midi'
    ELSE 'soir'
  END AS tranche,
  count(*) FILTER (WHERE s.state IN ('available', 'absent'))                                    AS signaux_produit,
  round(100.0 * count(*) FILTER (WHERE s.state = 'available')
        / NULLIF(count(*) FILTER (WHERE s.state IN ('available', 'absent')), 0))                 AS pct_dispo,
  count(*) FILTER (WHERE s.state IN ('empty', 'broken'))                                        AS signaux_machine_ko
FROM availability_signals s
JOIN distributors d ON d.id = s.distributor_id
WHERE s.created_at > now() - INTERVAL '30 days'
GROUP BY 1, 2;

GRANT SELECT ON kpi_coverage, kpi_signals_daily, kpi_events_daily, kpi_contribution, kpi_top_distributors, product_rhythm TO anon, authenticated;

-- ============================================
-- VERIFICATION POST-APPLICATION
-- ============================================
--
-- 1. SQL Editor :
--    SELECT * FROM kpi_coverage;           -- 1 ligne, machines = nombre de distributeurs
--    SELECT * FROM product_rhythm LIMIT 5;  -- vide tant qu'il n'y a pas de signaux (cf. 009)
--
-- 2. Console JS sur https://skenea.github.io/DistriMatch/ (anonyme) :
--    const cfg = await import('./js/config.js');
--    const supa = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
--    console.log(await supa.rpc('log_event', { p_type: 'app_ouverte', p_device_hash: 'test-device-0123456789abcdef', p_source: 'organic' }));
--    // attendu : error null
--    console.log((await supa.from('events').select('*')));
--    // attendu : data [] (aucune lecture brute, RLS sans policy)
--    console.log((await supa.from('kpi_events_daily').select('*')).data);
--    // attendu : 1 ligne app_ouverte / organic / n = 1
--
-- 3. Nettoyer : DELETE FROM events WHERE device_hash = 'test-device-0123456789abcdef';
