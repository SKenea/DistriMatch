# SEC-06 — Petites failles de la base, en une migration

- **Lot** : 1. Sécurité · **Gravité** : moyen (un constat moyen, les autres faibles) · **Niveau conseillé** : medium, relecture par un modèle plus fort avant fusion
- **Branche** : `fix/base-petites-failles` · **Taille** : 1 migration SQL neuve + 1 fichier de tests. Aucun fichier `js/`, aucun `?v=` à monter.
- **Prérequis** : SEC-06 s'exécute **après** la fusion de SEC-03, SEC-04 et SEC-05 dans `master` (migrations 025, 026, 027). `supabase/025_*.sql` doit exister et `products.removed_at` aussi (le test « 20e et 21e signal » s'en sert). Sinon : s'arrêter.
- **Constats couverts** (rapport du 2026-10-21) :
  - Stockage des photos : tout compte peut téléverser n'importe quel fichier, n'importe où, sans limite (alors que la fonction est désactivée) — `supabase/003_photos.sql:35`
  - Table demo_backup sans RLS : lecture et écriture libres pour les visiteurs anonymes — `supabase/009_demo_data.sql:24`
  - RPC héritées submit_report et cast_vote : SECURITY DEFINER sans search_path, points fixés par l'appelant, aucune limite — `supabase/004_rls_hardening.sql:45`
  - handle_new_user : fonction SECURITY DEFINER sans SET search_path — `supabase/001_schema.sql:149`
  - Limite de 20 signaux par heure dépassable : un seul appel peut en insérer 51 — `supabase/014_signals_require_account.sql:86`
  - Un membre peut faire passer ses signaux pour des signaux de démo (device_hash 'demo-…') — `supabase/014_signals_require_account.sql:68`
  - Tableau de bord public : les fiches en attente ou refusées y apparaissent, car les vues KPI ignorent la RLS — `supabase/010_is_demo.sql:292`
  - (doublon du précédent) La vue kpi_top_distributors (page Statistiques) expose à tout visiteur les fiches en attente et refusées — `supabase/010_is_demo.sql:292`

## But
Plus aucune de ces petites portes ne reste ouverte par l'API : on ne peut plus remplir le
stockage de photos ni la table `demo_backup`, ni appeler les vieilles RPC de signalement, ni
dépasser 20 signaux par heure, ni maquiller un signal en « démo », et le tableau de bord public
ne montre plus que des fiches publiées.

## User story
En tant que membre de DistriMatch, je veux que la base refuse d'elle-même les abus qui
contournent l'app (envois de fichiers, rafales de signaux, faux signaux de démo, lecture des
fiches non publiées), afin que l'app reste disponible et que ce que je lis soit fiable.

**Critères d'acceptation**
- [ ] Aucune règle ne permet plus d'envoyer un fichier dans le bucket `distributor-photos` ni d'insérer dans `distributor_photos` ; le bucket est limité à 2 Mo et aux images jpeg / png / webp.
- [ ] `demo_backup` : un visiteur et un compte connecté reçoivent un refus (42501) en lecture.
- [ ] `submit_report` et `cast_vote` ne sont plus exécutables par `anon` ni `authenticated` ; ces deux fonctions et `handle_new_user` ont `search_path=public`.
- [ ] Un compte qui a 19 signaux dans l'heure et en envoie 2 dans le même appel est refusé (P0001), et rien de cet appel n'est enregistré.
- [ ] `confirm_availability` prend un verrou par compte (`pg_advisory_xact_lock`) avant de compter.
- [ ] `confirm_availability` refuse un `device_hash` commençant par `demo-` (22023).
- [ ] `kpi_top_distributors` ne contient aucune fiche en attente ou refusée ; `kpi_coverage.machines` = nombre de fiches publiées.
- [ ] Les tests `db.test.js` existants restent verts.

## Décisions déjà prises (ne pas rediscuter)
- **Migration n° 028** : SEC-03, SEC-04 et SEC-05 prennent 025, 026 et 027, déjà fusionnées
  quand cette fiche s'exécute (voir « Prérequis »). SEC-03 (025) ajoute un déclencheur qui
  refuse un signal sur un produit retiré (P0002) : on ne touche pas à confirm_availability pour ça. Nom : `supabase/028_db_hardening.sql`.
- **submit_report / cast_vote : on révoque.** Aucun code actif ne les appelle :
  - `cast_vote` : aucun appel dans `js/` (les votes ont été retirés).
  - `submit_report` : seul appel `js/activity.js:74` (`submitReport`), dans la modale
    « Signaler ». Cette modale ne s'ouvre que par `openReportFromChat` (`js/chat.js:403`),
    branché sur le bouton `#chat-report` du chat, inactif (`FEATURES.chat = false` ;
    `openConversation` sort tout de suite, `js/chat.js:50`). Personne n'y arrive.
  - Si on y arrivait quand même : `submitReport` attrape l'erreur (`console.warn`) et affiche
    son toast « Merci pour ton signalement ! » comme avant. **Aucune erreur visible**, rien à
    changer côté front. Réactiver le chat demandera de réécrire `submit_report` (story à part).
- **confirm_availability** : on reprend **mot pour mot** sa dernière définition (014, lignes
  40-144 ; aucune migration de 015 à 024 ne la redéfinit) et on **ajoute** seulement des lignes,
  marquées `-- SEC-06`. On ne retire ni ne modifie aucune ligne existante (le plafond de 50
  éléments par appel reste).
- **Comptage** : refus dès qu'une insertion ferait passer le compte au-delà de 20 dans l'heure
  (`v_recent + v_inserted >= 20` juste avant chaque INSERT). Les doublons ignorés ne comptent
  pas. L'exception annule tout l'appel (aucune insertion partielle).
- **Le front n'envoie jamais `demo-`** (vérifié) : `getDeviceId` (`js/utils.js:182`) crée
  `crypto.randomUUID()` (hexadécimal) ou `dev-…` ; `buildAvailabilityPayload` (`js/utils.js:231`)
  le transmet tel quel ; l'E2E utilise `e2e-visiteur-…`, `db.test.js` `itest-device-…`. Les
  données de démo passent par des INSERT directs de `seed_demo_signals` (010), jamais par la
  RPC : la garde ne les touche pas.
- **Vues KPI** : on garde les droits du propriétaire (nécessaires pour lire `events`), on ajoute
  le filtre `review_status = 'published'`. Concernées : `kpi_coverage` et `kpi_top_distributors`
  (dernières définitions : 010, lignes 282-301). Les autres vues KPI de 008 (`kpi_signals_daily`,
  `kpi_events_daily`, `kpi_contribution`) ne lisent pas `distributors` : on n'y touche pas.
- **Application** : l'exécutant **n'applique pas** la migration. Claude (modèle principal) la
  relit puis l'applique. Avant cela, les nouveaux tests échouent : c'est attendu.

## Avant de coder
**Lire en entier** : `supabase/014_signals_require_account.sql` ; `supabase/010_is_demo.sql`
lignes 270-305 ; `supabase/003_photos.sql` ; `supabase/009_demo_data.sql` lignes 20-60 ;
`supabase/004_rls_hardening.sql` lignes 20-85 ; `supabase/001_schema.sql` lignes 140-153 ;
`tests/integration/db.test.js` lignes 1-140 et 495-669.

**Réutiliser** : `probe`, `query`, `AS_USER`, `AS_ANON`, `USER`, `DEMO`, `DEVICE`, `SKIP`
(`tests/integration/db.test.js`, en tête de fichier).

**Contrôles** (Git Bash, depuis la racine du dépôt ; chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
ls supabase/028_* 2>/dev/null                                                   # attendu : rien (sinon s'arrêter)
grep -n "CREATE OR REPLACE FUNCTION confirm_availability\|create or replace function confirm_availability" supabase/*.sql
#   attendu : 007:106, 011:35, 012:15, 014:40 et aucune ligne dans 025-027 (SEC-03 ajoute un
#   declencheur sur les produits retires, il ne redefinit pas la RPC). Si 025, 026 ou 027 redefinit
#   confirm_availability : s'arrêter (la recopie de 014 ne serait plus la derniere version).
ls supabase/025_*.sql                                                           # attendu : 1 fichier (SEC-03 fusionnee)
grep -n "removed_at" supabase/025_*.sql | head -3                               # attendu : au moins 1 ligne (colonne products.removed_at)
grep -in "view kpi_coverage\|view kpi_top_distributors" supabase/*.sql
#   attendu : 008:97, 008:134, 010:282, 010:292 et rien d'autre (sinon s'arrêter).
#   Note : 025 redefinit product_availability, qui n'est PAS une vue KPI : ce n'est pas un motif d'arrêt.
grep -n "IF v_recent >= 20 THEN" supabase/014_signals_require_account.sql      # attendu : 86
grep -n "length(p_device_hash) < 16" supabase/014_signals_require_account.sql  # attendu : 68
grep -n 'CREATE POLICY "Upload photos par users"' supabase/003_photos.sql       # attendu : 35
grep -n 'CREATE POLICY "Ajout photos par users"' supabase/003_photos.sql        # attendu : 20
grep -n "CREATE TABLE IF NOT EXISTS demo_backup" supabase/009_demo_data.sql     # attendu : 24
grep -rn "demo_backup" supabase/*.sql | grep -i "row level\|revoke"             # attendu : rien
grep -rn "advisory" supabase/                                                   # attendu : rien
grep -rn "submit_report\|cast_vote" js/                                         # attendu : seulement js/activity.js:74
grep -n "^describe('base : rien n" tests/integration/db.test.js                 # attendu : 641 (ou proche)
```

## Étapes

1. **supabase/028_db_hardening.sql** — créer le fichier avec **exactement** ce contenu
   (Write ; fin de ligne LF ; aucune autre ligne) :

```sql
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
```

2. **tests/integration/db.test.js** — ajouter le bloc de tests de la section « Tests »
   juste **avant** la ligne
   `describe('base : rien n’a ete ecrit par ces tests', { skip: SKIP }, () => {`
   (vers la ligne 641 ; l'apostrophe de cette ligne est typographique `’`). Laisser une ligne
   vide entre le nouveau bloc et ce `describe`. Ne modifier aucun test existant.

3. **Pas d'`index.html`** : aucun module JS ni CSS ne change. (Si un module de `js/` devait
   changer, ce qui n'est pas prévu : s'arrêter et demander ; le cas échéant, partir de la valeur
   `?v=` courante de l'import map sur `master` à jour, +1 sur toutes les entrées.)

## Tests

- **Fichier** : `tests/integration/db.test.js` · **Bloc** : `base : petites failles fermees (028)`
- **Code** (à coller tel quel) :
  ```js
  // SEC-06 (028) : petites failles de la base fermees
  describe('base : petites failles fermees (028)', { skip: SKIP }, () => {
      it('demo_backup : ni un visiteur ni un compte ne la lisent (42501)', async () => {
          for (const role of [AS_ANON, AS_USER]) {
              const p = await probe(`${role} perform count(*) from demo_backup`);
              assert.equal(p.reachedEnd, false, p.message);
              assert.equal(p.code, '42501');
          }
      });

      it('20e et 21e signal de l’heure dans le meme appel : refuse (P0001), rien d’enregistre', async () => {
          const p = await probe(`
              insert into availability_signals (distributor_id, product_id, state, source, weight, device_hash, user_id)
              select '${DEMO}', null, 'working', 'user', 0.8, '${DEVICE}', ${USER} from generate_series(1, 19);
              select id into v_product from products where distributor_id = '${DEMO}' and removed_at is null order by id limit 1;
              ${AS_USER} perform confirm_availability('${DEMO}', '${DEVICE}', jsonb_build_array(
                  jsonb_build_object('product_id', v_product, 'state', 'available'),
                  jsonb_build_object('product_id', v_product, 'state', 'absent')), null)`, 'v_product bigint;');
          assert.equal(p.reachedEnd, false, p.message);
          assert.equal(p.code, 'P0001');
          assert.match(p.message, /ce compte/);
      });

      it('device_hash « demo-… » envoye par l’API : refuse (22023)', async () => {
          const p = await probe(`${AS_USER} perform confirm_availability('${DEMO}', 'demo-itest-000000001', '[]'::jsonb, 'working')`);
          assert.equal(p.reachedEnd, false, p.message);
          assert.equal(p.code, '22023');
          assert.match(p.message, /device_hash/);
      });

      it('vues KPI : une fiche en attente n’apparait pas et ne compte pas', async () => {
          const p = await probe(`${AS_USER}
              insert into distributors (id, name, type, lat, lng, is_user_added, added_by)
              values ('itest-kpi', 'Fiche itest', 'pizza', 43.49, -1.47, true, ${USER});
              ${AS_ANON} r := json_build_object(
                  'top', (select count(*) from kpi_top_distributors where id = 'itest-kpi'),
                  'machines', (select machines from kpi_coverage),
                  'publiees', (select count(*) from distributors)
              )::text`);
          assert.ok(p.reachedEnd, p.message);
          const res = JSON.parse(p.result);
          assert.equal(res.top, 0);
          assert.equal(res.machines, res.publiees);
      });

      it('garde-fous : verrou par compte, RPC heritees fermees, search_path fixe, envoi de photos ferme', async () => {
          const [r] = await query(`select
              position('pg_advisory_xact_lock' in pg_get_functiondef('public.confirm_availability'::regproc)) > 0 as verrou,
              has_function_privilege('anon', 'public.submit_report(text,text,text,integer)', 'execute') as anon_report,
              has_function_privilege('authenticated', 'public.submit_report(text,text,text,integer)', 'execute') as auth_report,
              has_function_privilege('authenticated', 'public.cast_vote(bigint,text)', 'execute') as auth_vote,
              (select count(*)::int from pg_proc where pronamespace = 'public'::regnamespace
                  and proname in ('submit_report', 'cast_vote', 'handle_new_user')
                  and 'search_path=public' = any(coalesce(proconfig, '{}'::text[]))) as search_path_fixe,
              (select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Upload photos par users') as envoi_photos,
              (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'distributor_photos' and cmd = 'INSERT') as ajout_photos,
              (select file_size_limit::int from storage.buckets where id = 'distributor-photos') as taille_max`);
          assert.deepEqual(r, { verrou: true, anon_report: false, auth_report: false, auth_vote: false, search_path_fixe: 3, envoi_photos: 0, ajout_photos: 0, taille_max: 2097152 });
      });
  });
  ```
- **Ce qu'ils font** : chaque cas tourne dans un bloc PL/pgSQL annulé (`probe`), ou lit le
  catalogue (`query`, lecture seule). Rien n'est écrit en base.
- **Doivent échouer avant l'application de 028** (base actuelle) :
  - `demo_backup` : la lecture réussit (`reachedEnd` vaut `true`).
  - 20e et 21e signal : 19 < 20 passe le contrôle unique, les 2 signaux sont insérés (`reachedEnd` vaut `true`).
  - `demo-` : la RPC n'en vérifie que la longueur, le signal est accepté.
  - KPI : `top` vaut 1 et `machines` dépasse `publiees` d'au moins 1.
  - Garde-fous : `verrou` false, `anon_report` / `auth_report` / `auth_vote` true, `search_path_fixe` 0, `envoi_photos` 1, `ajout_photos` 1, `taille_max` null.
- **Ils passeront seulement après l'application de la migration par Claude** : l'exécutant ne
  les verra pas passer. C'est normal, ne rien « corriger » pour les faire passer.

## Vérification (dans l'ordre)

Par l'exécutant :
```bash
node --test tests/integration/db.test.js
#   attendu : les 5 tests du bloc « petites failles fermees (028) » ECHOUENT pour les raisons
#   ci-dessus, tous les autres passent. Sans jeton (.env.local), le lot est saute : le dire dans la PR.
diff --strip-trailing-cr <(sed -n '/^CREATE OR REPLACE FUNCTION confirm_availability/,/^GRANT EXECUTE ON FUNCTION confirm_availability/p' supabase/014_signals_require_account.sql) \
     <(sed -n '/^CREATE OR REPLACE FUNCTION confirm_availability/,/^GRANT EXECUTE ON FUNCTION confirm_availability/p' supabase/028_db_hardening.sql)
#   014 est en CRLF, 028 en LF : --strip-trailing-cr est obligatoire (sans lui, toutes les lignes different).
#   attendu EXACTEMENT (4 blocs, uniquement des « > », aucune ligne « < ») :
#   31a32,36
#   >   -- SEC-06 : 'demo-...' est reserve aux donnees de demo (inserees directement
#   >   -- par seed_demo_signals) : un vrai signal ne peut pas s'y faire passer.
#   >   IF p_device_hash ILIKE 'demo-%' THEN
#   >     RAISE EXCEPTION 'device_hash invalide (reserve a la demo)' USING ERRCODE = '22023';
#   >   END IF;
#   41a47,50
#   >   -- SEC-06 : un seul appel a la fois par compte, sinon deux appels simultanes
#   >   -- lisent le meme compteur. Verrou libere a la fin de la transaction.
#   >   PERFORM pg_advisory_xact_lock(hashtextextended('confirm_availability:' || v_user_id::text, 0));
#   > (ligne vide)
#   71a81,85
#   >       -- SEC-06 : les signaux deja retenus dans CET appel comptent aussi
#   >       -- (l'exception annule tout l'appel, aucune insertion partielle).
#   >       IF v_recent + v_inserted >= 20 THEN
#   >         RAISE EXCEPTION 'Trop de signaux pour ce compte, reessaie plus tard' USING ERRCODE = 'P0001';
#   >       END IF;
#   87a102,105
#   >       -- SEC-06 : idem pour le signal du distributeur
#   >       IF v_recent + v_inserted >= 20 THEN
#   >         RAISE EXCEPTION 'Trop de signaux pour ce compte, reessaie plus tard' USING ERRCODE = 'P0001';
#   >       END IF;
grep -c "SEC-06" supabase/028_db_hardening.sql        # attendu : 10 ou plus
npm test                                              # tout vert (aucun JS change)
git diff --stat                                       # seulement tests/integration/db.test.js (+ fichier 028 non suivi)
```

Par Claude (modèle principal), après relecture et **avant fusion** :
```bash
node scripts/supabase-sql.mjs supabase/028_db_hardening.sql     # HTTP 201 ou 200 ; si « WARNING SEC-06 » : voir Pièges
node --test tests/integration/db.test.js                         # tout vert
node scripts/supabase-sql.mjs -e "select policyname, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects';"
npm run test:e2e                                                 # signal connecte (dist-007) toujours accepte
```
Puis consulter le Security Advisor Supabase : plus d'alerte `rls_disabled_in_public` pour
`demo_backup`, ni `function_search_path_mutable` pour les trois fonctions.

## Hors périmètre
- `log_event` (008) : garde `demo-` et refus des fiches non publiées. Story à part.
- Insertion directe dans `reports` / `votes` (règles « Creation signalements » / « Creation
  votes »), mise à jour libre de `profiles.points`, lecture publique de `reports.user_id` : story à part.
- `distributor_photos` : lecture filtrée par publication, `status` forcé : à faire à la
  réactivation des photos. Nettoyage des fichiers déjà présents dans le bucket : par l'API
  Storage, jamais par SQL, story à part.
- Insertion de produits sur la fiche en attente d'un autre membre (005) ; plafond de 50
  éléments par appel ; portée des DELETE `demo-%` de `seed_demo_signals` / `purge_demo_data` ;
  déclencheur `notify_push_on_signal` ; limite de `push_subscribe`.
- `js/activity.js`, `js/chat.js`, `js/utils.js` : aucun changement (voir « Décisions »).
- Les autres fonctions sans `search_path` (`set_audit_columns`, `guard_distributor_source`,
  `guard_distributor_hours`, `siret_is_valid`) : non signalées par ces constats, ne pas y toucher.

## Pièges connus
- **Ne jamais exécuter la migration** (ni `node scripts/supabase-sql.mjs`, ni un `begin … rollback`
  à la main) : c'est Claude qui l'applique. Seul `node --test tests/integration/db.test.js` est permis.
- **Copier confirm_availability caractère pour caractère** depuis la fiche (ou depuis 014 en
  ajoutant les lignes `SEC-06`). Le `diff` de la vérification doit n'afficher que des `>`.
  Une seule ligne `<` = s'arrêter et corriger la copie.
- `CREATE OR REPLACE VIEW` exige les **mêmes colonnes dans le même ordre** : ne pas renommer,
  ne pas en ajouter, ne pas réordonner.
- `revoke ... from public` compte : sans lui, `anon` et `authenticated` gardent le droit
  d'exécuter via `PUBLIC`.
- Test « 20e et 21e » : il suppose que le plus ancien compte n'a aucun signal réel dans l'heure
  (même hypothèse que les tests 014 existants). S'il passe avant la migration avec le code
  P0001, c'est que ce compte a déjà des signaux récents : le noter dans la PR, ne rien changer.
- Test KPI : le compte de test est limité à 5 ajouts par jour (022). Si le cas échoue en
  P0001 avant même la vue, le noter dans la PR.
- Appliqué par Claude, `drop policy ... on storage.objects` ou `update storage.buckets` peut
  être refusé selon les droits du rôle `postgres` sur le schéma `storage`. La migration ne
  s'arrête pas pour autant : chacune de ces deux opérations est dans un bloc `do` qui attrape
  `insufficient_privilege` et lève un `WARNING` « SEC-06 : … A faire dans le tableau de bord … ».
  Le reste de la migration est appliqué normalement (une seule transaction). Claude lit la
  sortie de `supabase-sql.mjs` : s'il y a un `WARNING SEC-06`, faire l'action indiquée dans le
  tableau de bord (Storage), relancer `db.test.js` (le test « garde-fous » vérifie la règle et
  la taille du bucket) et noter l'écart dans la PR.
- La migration est entre `begin;` et `commit;` : ne pas les retirer, ne rien écrire après
  `commit;` hormis les commentaires de vérification.

## Terminé quand
- [ ] Contrôles passés, migration écrite, tests écrits (échouent avant l'application)
- [ ] `diff` de confirm_availability : uniquement des lignes ajoutées
- [ ] `npm test` vert
- [ ] Captures iPhone : non (aucun écran ne change)
- [ ] PR ouverte (non fusionnée), avec la mention « migration 028 à appliquer par Claude avant fusion »
- [ ] Story cochée dans BACKLOG.md si elle y figure (sinon : le noter dans la PR, ne pas l'ajouter)

## Modèle de PR
**Titre** : `fix(base): petites failles de la base fermees (migration 028)`

**Corps** : constats corrigés (liste ci-dessus) ; décision sur `submit_report` / `cast_vote`
(révoquées : aucun appel actif, la modale du chat inactif avale l'erreur) ; ce qui change pour
l'utilisateur (rien de visible, la base refuse les abus) ; tests ajoutés (5, bloc « petites
failles fermees (028) ») avec la sortie montrant qu'ils échouent avant l'application ; sortie du
`diff` de confirm_availability ; sortie de `npm test` ; ligne en gras « **Migration 028 à
appliquer par Claude après relecture, avant fusion** » ; éléments non faits (hors périmètre).
