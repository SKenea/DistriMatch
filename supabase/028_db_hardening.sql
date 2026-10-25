-- ============================================================================
-- 028 : petites failles de la base (SEC-06, revue du 2026-10-21)
-- ============================================================================
-- 1. Photos (inactives en V1, FEATURES.photos = false) : plus aucune voie
--    d'ecriture (stockage + table distributor_photos). Bucket borne : 2 Mo,
--    images jpeg / png / webp. A la reactivation des photos : nouvelle
--    migration (dossier = compte, comptes bloques refuses, limite par compte,
--    status force a 'pending').
-- 2. demo_backup : RLS sans regle + droits retires, invisible par l'API.
--    seed_demo_signals / purge_demo_data (SECURITY DEFINER, postgres) et le job
--    pg_cron continuent de l'utiliser.
-- 3. RPC heritees submit_report / cast_vote : plus appelables par l'API (seul
--    point d'entree : la modale Signaler du chat inactif, qui avale l'erreur).
--    search_path fixe sur ces deux fonctions et sur handle_new_user.
-- 4. confirm_availability (reprise MOT POUR MOT de 014, lignes ajoutees
--    marquees SEC-06) : les signaux de l'appel en cours comptent dans la
--    limite de 20 / heure / compte ; verrou par compte contre les appels
--    simultanes ; device_hash 'demo-...' refuse (reserve a seed_demo_signals).
-- 5. Vues KPI (reprise de 010) : seulement les fiches publiees (022). Elles
--    gardent les droits du proprietaire (lecture de events).
-- Une seule transaction (begin / commit) : tout passe ou rien. Les deux
-- operations sur le schema storage ne bloquent pas : faute de droits, elles
-- levent un avertissement (WARNING) qui dit quoi faire dans le tableau de bord.
-- Prerequis : 025 (SEC-03), 026, 027 appliquees.
-- Rejouable. Execution (Claude, apres relecture) :
--   node scripts/supabase-sql.mjs supabase/028_db_hardening.sql
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Photos : voie d'ecriture fermee, bucket borne
-- ----------------------------------------------------------------------------
do $$
begin
  drop policy if exists "Upload photos par users" on storage.objects;
exception when insufficient_privilege then
  raise warning 'SEC-06 : regle "Upload photos par users" non supprimee (droits). A faire dans le tableau de bord : Storage > Policies > distributor-photos > supprimer "Upload photos par users"';
end $$;
drop policy if exists "Ajout photos par users" on public.distributor_photos;

do $$
begin
  update storage.buckets
     set file_size_limit = 2097152,
         allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
   where id = 'distributor-photos';
exception when insufficient_privilege then
  raise warning 'SEC-06 : bucket distributor-photos non borne (droits). A faire dans le tableau de bord : Storage > distributor-photos > Edit bucket > taille max 2 MB, types image/jpeg, image/png, image/webp';
end $$;

-- ----------------------------------------------------------------------------
-- 2. demo_backup : invisible par l'API
-- ----------------------------------------------------------------------------
alter table public.demo_backup enable row level security;   -- aucune regle : rien de lisible
revoke all on public.demo_backup from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. RPC heritees fermees, search_path fixe
-- ----------------------------------------------------------------------------
revoke execute on function public.submit_report(text, text, text, integer) from public, anon, authenticated;
revoke execute on function public.cast_vote(bigint, text) from public, anon, authenticated;

alter function public.submit_report(text, text, text, integer) set search_path = public;
alter function public.cast_vote(bigint, text) set search_path = public;
alter function public.handle_new_user() set search_path = public;

-- ----------------------------------------------------------------------------
-- 4. RPC confirm_availability (reprise de 014)
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
      -- SEC-06 : idem pour le signal du distributeur
      IF v_recent + v_inserted >= 20 THEN
        RAISE EXCEPTION 'Trop de signaux pour ce compte, reessaie plus tard' USING ERRCODE = 'P0001';
      END IF;
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

-- ----------------------------------------------------------------------------
-- 5. Vues KPI : seulement les fiches publiees (reprise de 010, memes colonnes,
--    meme ordre : contrainte de CREATE OR REPLACE VIEW)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE VIEW kpi_coverage AS
SELECT
  (SELECT count(*) FROM distributors WHERE review_status = 'published')                                            AS machines,   -- SEC-06
  (SELECT count(DISTINCT distributor_id) FROM availability_signals WHERE created_at > now() - INTERVAL '24 hours') AS machines_signal_24h,
  (SELECT count(DISTINCT distributor_id) FROM availability_signals WHERE created_at > now() - INTERVAL '7 days')   AS machines_signal_7j,
  (SELECT count(*) FROM distributors WHERE review_status = 'published' AND last_verified > now() - INTERVAL '24 hours') AS machines_verifiees_24h,   -- SEC-06
  (SELECT count(*) FROM availability_signals WHERE created_at > now() - INTERVAL '7 days')                         AS signaux_7j,
  (SELECT count(*) FROM availability_signals WHERE created_at > now() - INTERVAL '30 days')                        AS signaux_30j,
  (SELECT count(*) FROM distributors WHERE is_demo AND review_status = 'published')                                AS machines_demo;   -- SEC-06

CREATE OR REPLACE VIEW kpi_top_distributors AS
SELECT d.id, d.name, d.type,
  count(e.id) AS fiches_ouvertes_30j,
  (SELECT count(*) FROM availability_signals s WHERE s.distributor_id = d.id AND s.created_at > now() - INTERVAL '30 days') AS signaux_30j,
  d.last_verified,
  d.is_demo
FROM distributors d
LEFT JOIN events e ON e.distributor_id = d.id AND e.type = 'fiche_ouverte' AND e.created_at > now() - INTERVAL '30 days'
WHERE d.review_status = 'published'   -- SEC-06 : ni en attente ni refusee
GROUP BY d.id, d.name, d.type, d.last_verified, d.is_demo
ORDER BY fiches_ouvertes_30j DESC, d.name;

GRANT SELECT ON kpi_coverage, kpi_top_distributors TO anon, authenticated;
NOTIFY pgrst, 'reload schema';   -- envoye au commit

commit;

-- ============================================================================
-- VERIFICATION POST-APPLICATION (Claude)
-- ============================================================================
-- node --test tests/integration/db.test.js        -- tout vert, dont « petites failles fermees (028) »
-- select id, file_size_limit, allowed_mime_types from storage.buckets where id = 'distributor-photos';
-- select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects';
--   -- attendu : plus aucune regle INSERT sur le bucket distributor-photos
-- select count(*) from demo_backup;                 -- postgres : lisible (les fonctions de demo marchent)
