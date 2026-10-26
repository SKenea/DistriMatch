# PRIV-05 — L'identifiant d'appareil ne relie plus la mesure d'audience au compte

- **Lot** : 2. Vie privée · **Gravité** : moyen · **Niveau conseillé** : medium, relecture par un modèle plus fort avant fusion (SQL + données personnelles)
- **Prérequis** : PRIV-03 fusionnée (ordre du lot 2 : PRIV-01 → PRIV-02 → PRIV-03 → **PRIV-05** → PRIV-06 → PRIV-07 → PRIV-04).
  Les migrations 029, 030 et 031 (PRIV-01 à PRIV-03) existent dans `master` ; la tienne est la **032**.
  Branche créée à partir de `master` **à jour** (`git switch master && git pull` d'abord).
- **Branche** : `fix/audience-sans-compte` · **Taille** : 1 migration SQL neuve + 4 fichiers `js/` (`utils.js`, `events.js`, `availability.js`, `app.js`) + `index.html` (`?v=`) + 3 fichiers de tests + `CLAUDE.md`.
  Au-dessus de la limite de 3, **exception acceptée** : la base et le front changent ensemble
  (même identifiant, des deux côtés), à garder dans une seule PR.
- **Constats couverts** (rapport du 2026-10-21) :
  - Mesure d'audience reliable au compte et à l'e-mail : le même identifiant d'appareil persistant est enregistré avec user_id dans les signaux — `js/events.js:43`

> **Application sur la vraie base** : c'est **Claude (modèle principal)** qui applique la migration
> 032, **après relecture**, puis fusionne. L'exécutant n'exécute **jamais** de SQL sur la base
> (ni `node scripts/supabase-sql.mjs`, ni SQL Editor, ni `begin … rollback` à la main).
> Voir la section « Avant la fusion (Claude) ».

## But
Plus personne, même avec les droits de la base, ne peut relier la navigation d'un visiteur
(app ouverte, fiches ouvertes, scan QR, itinéraire) à son compte ni à son e-mail : les signaux
n'enregistrent plus d'identifiant d'appareil et la mesure d'audience n'utilise qu'un identifiant
limité à la session, effacé avec les événements au bout de 13 mois.

## User story
En tant que visiteur ou membre de DistriMatch, je veux que la mesure d'audience ne puisse pas
être rattachée à mon compte, afin que ma navigation dans l'app reste anonyme pour tout le monde,
y compris pour qui administre la base.

**Critères d'acceptation**
- [ ] Un signal envoyé par la RPC `confirm_availability` est enregistré avec `device_hash = 'account'`, quel que soit le `p_device_hash` reçu.
- [ ] Un `p_device_hash` commençant par `demo-` reste refusé (22023, garde de 028).
- [ ] En base, plus aucun signal n'a un `device_hash` autre que `'account'` ou `demo-…` ; l'index `idx_signals_device_recent` n'existe plus.
- [ ] Un job pg_cron `distrimatch-events-purge` (03:45 UTC, actif) efface les événements de plus de 13 mois.
- [ ] La mesure d'audience (`logEvent`) envoie un identifiant tiré pour la session (`sessionStorage`, clé `distrimatch_session`), stable dans la session, nouveau à la session suivante, jamais écrit en `localStorage`.
- [ ] L'événement `signal_envoye` porte un identifiant à usage unique, jamais celui de la session (sinon distributeur + heure le rapprochent du signal, enregistré avec le compte, et relient toute la session au compte).
- [ ] Les signaux envoient la valeur fixe `'distrimatch-account'` (même valeur pour tout le monde).
- [ ] L'ancienne clé `snackmatch_device` est effacée à l'ouverture de l'app (et toujours par « Effacer mes données »).
- [ ] Plus aucun commentaire faux « aucune donnée personnelle » dans `js/events.js` ni `js/utils.js`.
- [ ] `npm test` vert ; les tests `db.test.js` existants restent verts.

## Décisions déjà prises (ne pas rediscuter)
- **Migration n° 032**, nom `supabase/032_audience_privacy.sql`. PRIV-01 à PRIV-03 prennent 029
  à 031 et ne redéfinissent pas `confirm_availability` (contrôlé dans « Avant de coder »).
- **confirm_availability** : recopie **intégrale** de sa dernière définition (028, lignes 72-194,
  du `CREATE OR REPLACE FUNCTION` au `GRANT EXECUTE`). **Seul changement** : dans les deux
  `VALUES (...)` des `INSERT`, `p_device_hash` devient `'account'` (+ commentaire `-- PRIV-05`
  en fin de ligne). Tous les contrôles sur `p_device_hash` restent (longueur 16 à 128, refus de
  `demo-`) : l'ancien front, encore en ligne pendant quelques minutes, continue de marcher. Les
  commentaires recopiés (« L'identifiant d'appareil … ne sert plus qu'a titre indicatif ») ne
  sont pas retouchés : le contrôle `diff` doit ne montrer que les deux lignes `VALUES`.
- **Pourquoi la constante `'account'`** : la colonne `device_hash` est `NOT NULL` (007) et sert
  à reconnaître la démo (`LIKE 'demo-%'` : 009, 010, 016, déclencheurs 024 et 025, fonction
  `push-notify`). `'account'` ne commence pas par `demo-` : ces filtres continuent de marcher.
- **Rattrapage** : `update availability_signals set device_hash = 'account' where device_hash
  not like 'demo-%' and device_hash <> 'account'`. Aucun déclencheur `UPDATE` sur cette table
  (déclencheurs de 020, 022, 024, 025 : tous sur `INSERT`).
- **Index `idx_signals_device_recent` (007:54) supprimé** : plus aucune fonction ne cherche un
  signal par `device_hash = p_device_hash` (seules 007, 011, 012 le faisaient, remplacées par 014
  puis 028 qui comptent par `user_id`). Les `LIKE 'demo-%'` des fonctions de démo ne s'en servent
  pas. L'index `idx_events_device_recent` (008:44) **reste** : `log_event` compte encore par
  `device_hash` dans `events` (anti-spam, 300 / heure, désormais par session).
- **Purge des événements** : job pg_cron `distrimatch-events-purge`, `'45 3 * * *'` (après
  `distrimatch-push-purge` à 03:30), commande
  `delete from public.events where created_at < now() - interval '13 months'`, même style que
  017 et 026 (`cron.unschedule` du même nom puis `cron.schedule`, rejouable).
- **Front, mesure d'audience** : `getSessionId()` dans `js/events.js` (seul utilisateur), clé
  `sessionStorage` `distrimatch_session`, tirage `crypto.randomUUID()` (repli `ses-…` de 25
  caractères), distinct de tout autre identifiant. Le paramètre de la RPC garde son nom
  `p_device_hash` (on ne touche pas à `log_event`).
- **`signal_envoye` (relecture)** : `availability.js` (ligne 471) envoie `signal_envoye` juste après le signal, même distributeur, même seconde. Avec l'identifiant de session, une jointure distributeur + heure relierait la session au compte (le signal porte `user_id`), puis toute sa navigation. Cet événement porte donc un identifiant **à usage unique** (`newSessionId()`, jamais enregistré). Aucune vue KPI ne compte les `device_hash` distincts : sans effet sur les tableaux de bord.
- **Front, signaux** : `snackmatch_device` ne sert plus à rien (la base ignore la valeur, la
  limite est par compte). `getDeviceId()` disparaît ; `js/availability.js` envoie la constante
  `SIGNAL_DEVICE_HASH = 'distrimatch-account'` (19 caractères, acceptée par la RPC, ancienne
  comme nouvelle). `resetDeviceId()` reste (« Effacer mes données », BUG-14) et sert aussi à
  **effacer l'ancienne clé au démarrage** (`js/app.js`, à côté de `removeLegacyActivityFeed()`).
- **Push** : ni `js/push.js` ni `sw.js` ne lisent l'identifiant d'appareil (vérifié) ; la
  fonction `push-notify` lit `device_hash` seulement pour ignorer `demo-…` : rien à changer.
- **Commentaires faux** : corrigés dans `js/events.js` (en-tête) et `js/utils.js` (au-dessus de
  l'identifiant). Ceux des migrations 007 (lignes 24-26, « Il ne sert qu'au rate limit ») et 008
  (ligne 12, « identifiant aleatoire local, comme pour les signaux ») restent : **une migration
  appliquée ne se modifie pas**, 032 le dit dans son en-tête et pose un `comment on column`.
  Celui de `js/gmaps-ui.js:423` (« Aucune donnee personnelle », à propos de `&src=qr`) est exact :
  on n'y touche pas.
- **Pas d'interrupteur « mesure d'audience »** dans les réglages : hors périmètre, décision à
  prendre par Stéphane (le noter dans la PR).

## Avant de coder
**Lire en entier** : `supabase/028_db_hardening.sql` (surtout lignes 72-194) ;
`supabase/026_push_subscriptions_limits.sql` lignes 114-126 (style du job pg_cron) ;
`supabase/008_events_kpi_rhythm.sql` lignes 30-80 ; `js/events.js` ; `js/utils.js` lignes
170-205 ; `js/availability.js` lignes 14-22 et 430-445 ; `js/app.js` lignes 270-280 et 590-600 ;
`tests/unit/unit.test.js` lignes 14-45, 107-140, 160-225 ; `tests/functional/donnees.spec.js`
lignes 205-235 ; `tests/integration/db.test.js` lignes 1-60 et le bloc `base : rien n’a ete
ecrit par ces tests`.

**Réutiliser** (ne pas réécrire) : `probe`, `query`, `AS_USER`, `AS_ANON`, `USER`, `DEMO`,
`DEVICE`, `signal`, `SKIP` (`tests/integration/db.test.js`, en tête de fichier) ;
`resetDeviceId` (`js/utils.js`) ; `captureEvents`, `setupApp` (`tests/functional/helpers.js`).

**Contrôles** (Git Bash, depuis la racine du dépôt ; chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
ls supabase/031_*.sql                                                  # attendu : 1 fichier (PRIV-03 fusionnee)
ls supabase/032_* 2>/dev/null                                          # attendu : rien
grep -ln "FUNCTION confirm_availability" supabase/*.sql
#   attendu EXACTEMENT : 007, 011, 012, 014, 028. Si 029, 030 ou 031 apparait : s'arreter
#   (la recopie de 028 ne serait plus la derniere version).
grep -n "p_device_hash, v_user_id);" supabase/028_db_hardening.sql    # attendu : 158 et 178 (2 lignes)
grep -rn "idx_signals_device_recent" supabase/                         # attendu : seulement 007:54
grep -rn "device_hash = p_device_hash" supabase/*.sql | grep -v "^supabase/0\(07\|11\|12\)_"
#   attendu : seulement 008:72 (log_event, table events). Toute autre ligne : s'arreter.
grep -rn "distrimatch-events-purge" supabase/                          # attendu : rien
grep -rn "getDeviceId" js/
#   attendu : 7 lignes : events.js (9, 18, 39), availability.js (18, 442), utils.js (182, 197)
grep -rn "getDeviceId\|snackmatch_device" js/push.js sw.js supabase/functions/   # attendu : rien
grep -n "^export const DEVICE_ID_KEY = 'snackmatch_device';" js/utils.js        # attendu : 179
grep -n "removeLegacyActivityFeed();   // ancien fil local (retire)" js/app.js  # attendu : 597
grep -n "resetDeviceId" js/app.js                                      # attendu : 15 (import) et 278
grep -c "). AVANT d'appliquer une migration :" CLAUDE.md               # attendu : 1
grep -n "getDeviceId" tests/unit/unit.test.js                          # attendu : 20, 111, 114, 115, 116, 186, 188
grep -n "localStorage.getItem('snackmatch_device')" tests/functional/donnees.spec.js   # attendu : 222
grep -n "^describe('base : rien n" tests/integration/db.test.js        # attendu : 1 ligne (vers 1008 ou plus loin)
```
Les numéros de ligne peuvent avoir bougé (PRIV-01 à PRIV-03) : seul compte que le motif soit
trouvé le nombre de fois annoncé.

## Étapes

1. **supabase/032_audience_privacy.sql** — créer le fichier avec **exactement** ce contenu
   (Write ; fin de ligne LF ; aucune autre ligne). La fonction est la recopie de 028 : la copier
   d'ici caractère pour caractère, le `diff` de la vérification le contrôle.

```sql
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
```

2. **js/utils.js** — l'identifiant d'appareil persistant disparaît ; une valeur fixe pour les
   signaux ; `resetDeviceId` ne sert plus qu'à effacer l'ancienne clé.
   Avant (lignes 176-201) :
   ```js
   // Identifiant d'appareil pour le rate limit des signaux : aleatoire, genere
   // une fois, garde en localStorage. Pas d'empreinte navigateur, pas d'IP,
   // aucune donnee personnelle. Memoise pour rester stable meme sans localStorage.
   export const DEVICE_ID_KEY = 'snackmatch_device';
   let memoDeviceId = null;

   export function getDeviceId() {
       if (memoDeviceId) return memoDeviceId;
       let id = null;
       try { id = localStorage.getItem(DEVICE_ID_KEY); } catch (e) { /* localStorage indisponible */ }
       if (!id || id.length < 16) {
           id = (typeof crypto !== 'undefined' && crypto.randomUUID)
               ? crypto.randomUUID()
               : `dev-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
           try { localStorage.setItem(DEVICE_ID_KEY, id); } catch (e) { /* on garde l'id en memoire */ }
       }
       memoDeviceId = id;
       return id;
   }

   // « Effacer mes données » (BUG-14) : l'identifiant d'appareil repart de zero,
   // un nouveau est tire au prochain besoin (getDeviceId)
   export function resetDeviceId() {
       memoDeviceId = null;
       try { localStorage.removeItem(DEVICE_ID_KEY); } catch (e) { /* localStorage indisponible */ }
   }
   ```
   Après :
   ```js
   // Signal de dispo (UC11) : la RPC confirm_availability attend encore un
   // p_device_hash de 16 a 128 caracteres, mais la base ne le garde plus
   // (PRIV-05, migration 032 : elle enregistre 'account') et la limite est par
   // compte (014). On envoie la meme valeur fixe pour tout le monde : elle ne
   // permet de reconnaitre ni un appareil ni une personne.
   export const SIGNAL_DEVICE_HASH = 'distrimatch-account';

   // Ancien identifiant d'appareil persistant (localStorage), envoye nulle part
   // depuis PRIV-05 : efface au demarrage (app.js) et par « Effacer mes
   // données » (BUG-14).
   export const DEVICE_ID_KEY = 'snackmatch_device';

   export function resetDeviceId() {
       try { localStorage.removeItem(DEVICE_ID_KEY); } catch (e) { /* localStorage indisponible */ }
   }
   ```

3. **js/events.js** — en-tête exact, identifiant de session, plus d'import de `utils.js`.
   a. Avant (lignes 9-14) :
   ```js
    * Aucune donnee personnelle : l'appareil est identifie par getDeviceId()
    * (aleatoire local, comme pour les signaux), la source vaut 'qr' (sticker sur
    * la machine) ou 'organic'. La table events n'a ni lecture ni ecriture
    * directe : tout passe par la RPC, qui ignore les distributeurs inconnus et
    * coupe le spam cote serveur. La mesure ne doit JAMAIS casser l'app : pas
    * d'await bloquant, pas d'erreur visible, no-op sans client Supabase.
   ```
   Après :
   ```js
    * Identifiant (PRIV-05) : un tirage aleatoire limite a la session de l'onglet
    * (sessionStorage, getSessionId), distinct de tout autre identifiant et jamais
    * envoye avec un signal : la mesure ne se relie pas a un compte. C'est une
    * donnee de mesure d'audience (pseudonyme) : la base efface les evenements
    * de plus de 13 mois (032). La source vaut 'qr' (sticker sur la machine) ou
    * 'organic'. La table events n'a ni lecture ni ecriture directe : tout passe
    * par la RPC, qui ignore les distributeurs inconnus et coupe le spam cote
    * serveur. La mesure ne doit JAMAIS casser l'app : pas d'await bloquant, pas
    * d'erreur visible, no-op sans client Supabase.
   ```
   b. Avant (lignes 17-18) :
   ```js
   import { supabaseClient } from './state.js';
   import { getDeviceId } from './utils.js';
   ```
   Après :
   ```js
   import { supabaseClient } from './state.js';
   ```
   c. Avant (lignes 37-47) :
   ```js
   // Arguments de la RPC log_event, ou null si le type est inconnu : on n'envoie
   // jamais un evenement que le serveur refuserait.
   export function buildEventArgs(type, { distributorId = null, source = null } = {}, deviceId = getDeviceId()) {
       if (!EVENT_TYPES.includes(type)) return null;
       return {
           p_type: type,
           p_device_hash: deviceId,
           p_distributor_id: distributorId || null,
           p_source: source || getEntrySource()
       };
   }
   ```
   Après :
   ```js
   // Identifiant de la mesure (PRIV-05) : aleatoire, limite a la session de
   // l'onglet (sessionStorage), jamais en localStorage ni avec un signal. Une
   // nouvelle session (onglet ou app rouverts) en tire un nouveau. sessionStorage
   // bloque : un identifiant en memoire, le temps de la page.
   export const SESSION_ID_KEY = 'distrimatch_session';
   let memoSessionId = null;

   function newSessionId() {
       return (typeof crypto !== 'undefined' && crypto.randomUUID)
           ? crypto.randomUUID()
           : `ses-${Date.now().toString(36)}-${Math.random().toString(36).slice(2).padEnd(12, '0')}`;
   }

   export function getSessionId() {
       try {
           const stored = sessionStorage.getItem(SESSION_ID_KEY);
           if (stored && stored.length >= 16) return stored;
           const id = newSessionId();
           sessionStorage.setItem(SESSION_ID_KEY, id);
           return id;
       } catch (e) {
           if (!memoSessionId) memoSessionId = newSessionId();
           return memoSessionId;
       }
   }

   // Arguments de la RPC log_event, ou null si le type est inconnu : on n'envoie
   // jamais un evenement que le serveur refuserait. p_device_hash est le nom du
   // parametre de la RPC (008) : il porte l'identifiant de session.
   // signal_envoye : identifiant a usage unique (newSessionId, jamais enregistre).
   // L'heure et le distributeur le rapprochent du signal, enregistre avec le
   // compte : il ne doit pas porter l'identifiant de la session.
   export function buildEventArgs(type, { distributorId = null, source = null } = {}, sessionId = type === 'signal_envoye' ? newSessionId() : getSessionId()) {
       if (!EVENT_TYPES.includes(type)) return null;
       return {
           p_type: type,
           p_device_hash: sessionId,
           p_distributor_id: distributorId || null,
           p_source: source || getEntrySource()
       };
   }
   ```

4. **js/availability.js** — les signaux envoient la valeur fixe.
   a. Avant (ligne 18) :
   ```js
       showToast, getDeviceId, buildAvailabilityPayload, describeRhythm, getFreshness,
   ```
   Après :
   ```js
       showToast, SIGNAL_DEVICE_HASH, buildAvailabilityPayload, describeRhythm, getFreshness,
   ```
   b. Avant (ligne 442) :
   ```js
       const payload = buildAvailabilityPayload(distributor.id, getDeviceId(), choices, machine);
   ```
   Après :
   ```js
       const payload = buildAvailabilityPayload(distributor.id, SIGNAL_DEVICE_HASH, choices, machine);
   ```

5. **js/app.js** — effacer l'ancienne clé au démarrage (`resetDeviceId` est déjà importé, ligne 15).
   Avant (ligne 597) :
   ```js
       removeLegacyActivityFeed();   // ancien fil local (retire)
   ```
   Après :
   ```js
       removeLegacyActivityFeed();   // ancien fil local (retire)
       resetDeviceId();              // PRIV-05 : ancien identifiant d'appareil persistant (plus utilise)
   ```

6. **tests/** — les tests de la section « Tests » (déjà écrits à l'étape 4 du déroulé du README).

7. **CLAUDE.md** — documenter 032 dans la liste des migrations. Remplacer l'unique occurrence de
   ```
   ). AVANT d'appliquer une migration :
   ```
   par
   ```
   ), `032_audience_privacy` (PRIV-05 : `confirm_availability` enregistre `device_hash = 'account'` au lieu de l'identifiant recu, anciens signaux rattrapes, index `idx_signals_device_recent` supprime : la mesure d'audience ne se relie plus a un compte ; job pg_cron `distrimatch-events-purge` 03:45 UTC : evenements de plus de 13 mois effaces ; front : signaux avec la valeur fixe `SIGNAL_DEVICE_HASH`, mesure avec `getSessionId()` (events.js, sessionStorage `distrimatch_session`), `snackmatch_device` efface au demarrage). AVANT d'appliquer une migration :
   ```
   (une seule ligne, sans retour à la ligne ; vérifier avec `git diff --stat CLAUDE.md` : 1 ligne modifiée).

8. **index.html** — import map : monter le `?v=` de **toutes** les entrées à la même valeur
   (valeur courante sur `master` à jour, +1 ; ex. `?v=108` → `?v=109` si PRIV-01 à PRIV-03 ne
   l'ont pas changée). Aucun CSS ne change.

## Tests

### Test 1 — base (intégration, vraie base, transactions annulées)
- **Fichier** : `tests/integration/db.test.js` · **Bloc** : `base : identifiant d’appareil plus enregistre avec les signaux (032)`
- **Où** : juste **avant** la ligne
  `describe('base : rien n’a ete ecrit par ces tests', { skip: SKIP }, () => {`
  (l'apostrophe est typographique `’`). Une ligne vide entre le nouveau bloc et ce `describe`.
  Ne modifier aucun test existant (ils restent valables : la limite est par compte, 023 cache
  toujours `device_hash`, le contrôle « itest » reste juste).
- **Code** (à coller tel quel) :
  ```js
  // PRIV-05 (032) : la mesure d'audience ne se relie plus a un compte
  describe('base : identifiant d’appareil plus enregistre avec les signaux (032)', { skip: SKIP }, () => {
      it('un signal enregistre device_hash = « account », pas l’identifiant envoye', async () => {
          const p = await probe(`${AS_USER} perform ${signal('working')};
              reset role; select string_agg(device_hash, ',') into r from availability_signals
               where distributor_id = '${DEMO}' and user_id = ${USER} and created_at = now()`);
          assert.ok(p.reachedEnd, p.message);
          assert.equal(p.result, 'account');
      });

      it('un device_hash « demo-… » reste refuse (22023)', async () => {
          const p = await probe(`${AS_USER} perform confirm_availability('${DEMO}', 'demo-itest-000000002', '[]'::jsonb, 'empty')`);
          assert.equal(p.reachedEnd, false, p.message);
          assert.equal(p.code, '22023');
      });

      it('plus aucun ancien identifiant en base ; index retire', async () => {
          const [r] = await query(`select
              position('p_device_hash, v_user_id' in pg_get_functiondef('public.confirm_availability'::regproc)) = 0 as plus_enregistre,
              (select count(*)::int from pg_indexes where schemaname = 'public' and indexname = 'idx_signals_device_recent') as index_appareil,
              (select count(*)::int from availability_signals where device_hash not like 'demo-%' and device_hash <> 'account') as anciens_identifiants`);
          assert.deepEqual(r, { plus_enregistre: true, index_appareil: 0, anciens_identifiants: 0 });
      });

      it('purge nocturne des evenements de plus de 13 mois (pg_cron)', async () => {
          const rows = await query("select schedule, command, active from cron.job where jobname = 'distrimatch-events-purge'");
          assert.equal(rows.length, 1);
          assert.equal(rows[0].schedule, '45 3 * * *');
          assert.match(rows[0].command, /delete from public\.events where created_at < now\(\) - interval '13 months'/);
          assert.equal(rows[0].active, true);
      });
  });
  ```
- **Ce qu'ils font** : blocs PL/pgSQL annulés (`probe`) ou lectures du catalogue (`query`). Rien
  n'est écrit en base. `created_at = now()` ne retient que les signaux de la transaction du test.
- **Avant l'application de 032** (base actuelle), attendu :
  - « account » : **échoue**, le résultat vaut `itest-device-0000000001`.
  - « demo- » : **passe déjà** (garde de 028) : c'est un test de non-régression.
  - « plus aucun ancien identifiant » : **échoue** (`plus_enregistre` false ; `index_appareil` 1
    si l'index existe ; `anciens_identifiants` peut valoir 0 s'il n'y a aucun vrai signal).
  - « purge nocturne » : **échoue** (`rows.length` vaut 0).
- **Ils passeront seulement après l'application de la migration par Claude** : ne rien
  « corriger » pour les faire passer.

### Test 2 — unitaires (`tests/unit/unit.test.js`)
a. **Imports**. Ligne 20, remplacer `getDeviceId,` par `SIGNAL_DEVICE_HASH, DEVICE_ID_KEY, resetDeviceId,` :
   Avant :
   ```js
       timeAgo, getFreshness, getDeviceId, buildAvailabilityPayload, describeRhythm, centroidOf, hasValidCoords, resolveProductStatus, resolveMachineStatus, describeSignalError, isBusinessSignalError, describeFicheHero,
   ```
   Après :
   ```js
       timeAgo, getFreshness, SIGNAL_DEVICE_HASH, DEVICE_ID_KEY, resetDeviceId, buildAvailabilityPayload, describeRhythm, centroidOf, hasValidCoords, resolveProductStatus, resolveMachineStatus, describeSignalError, isBusinessSignalError, describeFicheHero,
   ```
   Ligne 42 :
   Avant :
   ```js
   import { buildEventArgs, logEvent, rememberEntrySource, getEntrySource, EVENT_TYPES, ENTRY_SOURCE_KEY } from '../../js/events.js';
   ```
   Après :
   ```js
   import { buildEventArgs, logEvent, rememberEntrySource, getEntrySource, EVENT_TYPES, ENTRY_SOURCE_KEY, getSessionId, SESSION_ID_KEY } from '../../js/events.js';
   ```
b. **Signal (UC11)**. Avant (lignes 111-119) :
   ```js
   describe('signal de dispo (UC11) : getDeviceId / buildAvailabilityPayload', () => {
       const DEVICE = 'device-0123456789abcdef';

       it('getDeviceId est stable entre deux appels et assez long pour la RPC (>= 16)', () => {
           const a = getDeviceId();
           const b = getDeviceId();
           assert.equal(a, b);
           assert.ok(a.length >= 16);
       });
   ```
   Après :
   ```js
   describe('signal de dispo (UC11) : SIGNAL_DEVICE_HASH / buildAvailabilityPayload', () => {
       const DEVICE = 'device-0123456789abcdef';

       it('PRIV-05 : valeur fixe pour tous, acceptee par la RPC (16 a 128 caracteres, jamais « demo- »)', () => {
           assert.equal(SIGNAL_DEVICE_HASH, 'distrimatch-account');
           assert.ok(SIGNAL_DEVICE_HASH.length >= 16 && SIGNAL_DEVICE_HASH.length <= 128);
           assert.ok(!SIGNAL_DEVICE_HASH.toLowerCase().startsWith('demo-'));
       });

       it('PRIV-05 : resetDeviceId efface l\'ancien identifiant persistant (snackmatch_device)', () => {
           assert.equal(DEVICE_ID_KEY, 'snackmatch_device');
           localStorage.setItem(DEVICE_ID_KEY, 'ancien-appareil-0123456789');
           resetDeviceId();
           assert.equal(localStorage.getItem(DEVICE_ID_KEY), null);
       });
   ```
c. **Mesure**. Avant (lignes 186-191) :
   ```js
       it('l\'appareil est identifie par getDeviceId (aleatoire local), rien d\'autre ne part', () => {
           const args = buildEventArgs('fiche_ouverte', { distributorId: 'dist-002' });
           assert.equal(args.p_device_hash, getDeviceId());
           assert.equal(args.p_distributor_id, 'dist-002');
           assert.deepEqual(Object.keys(args).sort(), ['p_device_hash', 'p_distributor_id', 'p_source', 'p_type']);
       });
   ```
   Après :
   ```js
       it('PRIV-05 : la session est identifiee par getSessionId (sessionStorage), rien d\'autre ne part', () => {
           const args = buildEventArgs('fiche_ouverte', { distributorId: 'dist-002' });
           assert.equal(args.p_device_hash, getSessionId());
           assert.equal(args.p_distributor_id, 'dist-002');
           assert.deepEqual(Object.keys(args).sort(), ['p_device_hash', 'p_distributor_id', 'p_source', 'p_type']);
       });

       it('PRIV-05 : identifiant stable dans la session, nouveau a la session suivante, jamais en localStorage', () => {
           const a = getSessionId();
           assert.equal(getSessionId(), a);
           assert.ok(a.length >= 16 && a.length <= 128);
           assert.equal(sessionStorage.getItem(SESSION_ID_KEY), a);
           assert.equal(localStorage.getItem('snackmatch_device'), null);
           sessionStorage.clear();   // nouvelle session (onglet ou app rouverts)
           const b = getSessionId();
           assert.notEqual(b, a);
           assert.ok(b.length >= 16);
       });

       it('PRIV-05 : signal_envoye ne porte pas l\'identifiant de la session', () => {
           const args = buildEventArgs('signal_envoye', { distributorId: 'dist-002' });
           assert.notEqual(args.p_device_hash, getSessionId());
           assert.ok(args.p_device_hash.length >= 16);
       });

       it('PRIV-05 : sessionStorage bloque -> identifiant en memoire, stable le temps de la page', () => {
           const saved = globalThis.sessionStorage;
           globalThis.sessionStorage = { getItem() { throw new Error('bloque'); }, setItem() { throw new Error('bloque'); } };
           try {
               const a = getSessionId();
               assert.ok(a.length >= 16);
               assert.equal(getSessionId(), a);
           } finally {
               globalThis.sessionStorage = saved;
           }
       });
   ```
d. **Commentaire** (lignes 166-168) :
   Avant :
   ```js
   // Les evenements passent par la RPC log_event et ne portent aucune donnee
   // personnelle ; un type inconnu n'est jamais envoye ; sans client Supabase
   // c'est un no-op silencieux : la mesure ne casse jamais l'app.
   ```
   Après :
   ```js
   // Les evenements passent par la RPC log_event et ne portent qu'un identifiant
   // de session (PRIV-05) ; un type inconnu n'est jamais envoye ; sans client
   // Supabase c'est un no-op silencieux : la mesure ne casse jamais l'app.
   ```
- **Doit échouer avant la correction** parce que `SIGNAL_DEVICE_HASH`, `getSessionId` et
  `SESSION_ID_KEY` ne sont pas exportés : le fichier ne se charge pas (`SyntaxError … does not
  provide an export named …`). C'est la bonne raison.

### Test 3 — fonctionnels (`tests/functional/donnees.spec.js`, bloc `16. Mesure du pilote (log_event)`)
a. Avant (ligne 213) :
   ```js
       test('fiche_ouverte puis itineraire : un evenement chacun, meme appareil, source organic, aucune donnee personnelle', async ({ page }) => {
   ```
   Après :
   ```js
       test('fiche_ouverte puis itineraire : un evenement chacun, meme session, source organic, aucun identifiant persistant', async ({ page }) => {
   ```
b. Avant (ligne 222) :
   ```js
           const device = await page.evaluate(() => localStorage.getItem('snackmatch_device'));
   ```
   Après :
   ```js
           // PRIV-05 : identifiant limite a la session (sessionStorage), plus rien en localStorage
           const device = await page.evaluate(() => sessionStorage.getItem('distrimatch_session'));
           expect(device?.length).toBeGreaterThanOrEqual(16);
           expect(await page.evaluate(() => localStorage.getItem('snackmatch_device'))).toBeNull();
   ```
c. Nouveau test, juste **après** la fin du test précédent (son `    });`) et **avant** le commentaire
   `    // EPIC-T12 : modifier la fiche (renommer...) la re-rend sans la rouvrir : pas recomptee`,
   séparé par une ligne vide de chaque côté :
   ```js
       // PRIV-05 : l'ancien identifiant d'appareil persistant ne reste pas sur le telephone
       test('l’ancien identifiant d’appareil (snackmatch_device) est efface a l’ouverture', async ({ page }) => {
           await page.evaluate(() => localStorage.setItem('snackmatch_device', 'ancien-appareil-0123456789'));
           await page.reload();
           await expect.poll(() => page.evaluate(() => localStorage.getItem('snackmatch_device')), { timeout: 15000 }).toBeNull();
       });
   ```
- **Doivent échouer avant la correction** : (a+b) `device` vaut `null` (`toBeGreaterThanOrEqual`
  échoue) ; (c) la clé reste (l'app la relit au démarrage), le `poll` expire.
- Lancer (serveur local sur 8080, voir README) :
  `npx playwright test --project=functional -g "Mesure du pilote"`.

## Vérification (dans l'ordre)

Par l'exécutant :
```bash
npm test                                                     # tout vert (dont cache-busting)
node --test --test-name-pattern="032" tests/integration/db.test.js
#   attendu : 3 echecs (account, ancien identifiant, purge) + 1 succes (demo-), raisons de « Tests ».
#   Sans jeton (.env.local) : lot saute, le dire dans la PR. Ne pas lancer tout db.test.js plusieurs
#   fois de suite (l'API de gestion limite le debit).
diff --strip-trailing-cr <(sed -n '/^CREATE OR REPLACE FUNCTION confirm_availability/,/^GRANT EXECUTE ON FUNCTION confirm_availability/p' supabase/028_db_hardening.sql) \
     <(sed -n '/^CREATE OR REPLACE FUNCTION confirm_availability/,/^GRANT EXECUTE ON FUNCTION confirm_availability/p' supabase/032_audience_privacy.sql)
#   028 est en CRLF, 032 en LF : --strip-trailing-cr est obligatoire.
#   attendu EXACTEMENT (2 blocs, rien d'autre) :
#   87c87
#   <       VALUES (p_distributor_id, v_product, v_state, v_source, v_weight, p_device_hash, v_user_id);
#   ---
#   >       VALUES (p_distributor_id, v_product, v_state, v_source, v_weight, 'account', v_user_id);   -- PRIV-05
#   107c107
#   <       VALUES (p_distributor_id, NULL, p_machine_state, v_source, v_weight, p_device_hash, v_user_id);
#   ---
#   >       VALUES (p_distributor_id, NULL, p_machine_state, v_source, v_weight, 'account', v_user_id);   -- PRIV-05
grep -c "^begin;\|^commit;" supabase/032_audience_privacy.sql        # attendu : 2
grep -rn "getDeviceId" js/ tests/                                     # attendu : rien
grep -rn "ucune donnee personnelle" js/events.js js/utils.js          # attendu : rien
grep -n "SIGNAL_DEVICE_HASH" js/availability.js                       # attendu : 2 lignes (import + appel)
npx playwright test --project=functional -g "Mesure du pilote"        # vert
npm run test:functional                                               # en arriere-plan (README) : vert
git diff --stat
#   attendu : js/utils.js, js/events.js, js/availability.js, js/app.js, index.html,
#   tests/unit/unit.test.js, tests/functional/donnees.spec.js, tests/integration/db.test.js,
#   CLAUDE.md (+ supabase/032_audience_privacy.sql non suivi)
```

## Avant la fusion (Claude, modèle principal — jamais l'exécutant)
1. **Relecture** du SQL par un modèle plus fort (recopie de la fonction, rattrapage, job).
2. **État de la base** :
   ```bash
   node scripts/supabase-sql.mjs -e "select proname from pg_proc where pronamespace = 'public'::regnamespace and prosrc ~* 'device_hash\s*=\s*p_device_hash' order by 1;"
   #   attendu : seulement log_event (table events). Une autre fonction : s'arreter, l'index sert encore.
   node scripts/supabase-sql.mjs -e "select count(*) filter (where device_hash not like 'demo-%' and device_hash <> 'account') as a_rattraper, (select count(*) from pg_indexes where indexname = 'idx_signals_device_recent') as index_appareil, (select count(*) from events where created_at < now() - interval '13 months') as events_a_purger from availability_signals;"
   ```
3. **Essai à blanc** (rien ne reste) : copie avec `rollback;` à la place du `commit;` final, dans
   le scratchpad (le fichier peut être en CRLF après checkout, d'où le `\r\?`) :
   ```bash
   sed 's/^commit;\r\?$/rollback;/' supabase/032_audience_privacy.sql > "<scratchpad>/032-essai.sql"
   grep -c '^rollback;' "<scratchpad>/032-essai.sql"            # attendu : 1
   node scripts/supabase-sql.mjs "<scratchpad>/032-essai.sql"    # HTTP 201 / 200, aucune ERROR
   ```
   Puis relancer la 2e requête de l'étape 2 : valeurs **inchangées** (rollback).
4. **Appliquer** : `node scripts/supabase-sql.mjs supabase/032_audience_privacy.sql`.
5. **Tests db restreints** (débit limité de l'API de gestion) :
   `node --test --test-name-pattern="032" tests/integration/db.test.js` (4 verts), puis
   `node --test --test-name-pattern="signaux|028|023" tests/integration/db.test.js` (verts).
6. **Compatibilité** : entre l'application et le déploiement Pages, l'ancien front envoie encore
   son identifiant persistant ; la base l'ignore et enregistre `'account'` : rien ne casse. Le
   nouveau front envoie `'distrimatch-account'`, accepté par l'ancienne comme par la nouvelle RPC.
7. **Fusionner**, puis `npm run test:e2e` après le déploiement Pages (signal connecté sur dist-007
   toujours accepté).

## Hors périmètre
- **Interrupteur « mesure d'audience »** (refuser la mesure dans les réglages) : décision à
  prendre par Stéphane, story à part. Le noter dans la PR.
- `log_event` (008) : garde `demo-`, refus des fiches non publiées, renommage de `p_device_hash` :
  on n'y touche pas.
- Les `device_hash` déjà présents dans `events` (anciens identifiants persistants) : ils ne se
  relient plus à aucun compte après le rattrapage des signaux et disparaissent avec la purge des
  13 mois. Les réécrire tout de suite = décision à part (le signaler dans la PR).
- « Effacer mes données » n'efface pas `distrimatch_session` (sessionStorage, effacé à la fin de
  la session) : on n'y touche pas.
- Les commentaires des migrations 007 et 008 (une migration appliquée ne se modifie pas) ;
  `js/gmaps-ui.js:423` (commentaire exact).
- `js/push.js`, `sw.js`, `supabase/functions/push-notify/` : aucun changement.

## Pièges connus
- **Ne jamais exécuter la migration** (ni `supabase-sql.mjs`, ni `begin … rollback` à la main) :
  seul `node --test … db.test.js` est permis.
- **Recopie de la fonction** : le `diff` doit montrer **exactement** les 2 blocs `87c87` et
  `107c107`. Toute autre ligne `<` ou `>` = copie fautive : corriger avant de continuer.
- `--strip-trailing-cr` est obligatoire dans le `diff` (028 en CRLF, 032 en LF).
- **CRLF** : `js/*.js`, `tests/**/*.js` sont en CRLF. Garder celles du fichier (README, « Fins
  de ligne ») ; si l'outil Edit refuse un bloc multi-lignes, petit script Node dans le scratchpad.
- **Ordre des étapes** : écrire les tests d'abord. Après l'étape 2 (utils.js) et avant l'étape 3
  (events.js), `npm test` casse (`getDeviceId` n'existe plus) : enchaîner les étapes 2 à 5 avant
  de relancer.
- **Ne pas garder** `getDeviceId` « au cas où » : le contrôle `grep -rn "getDeviceId" js/ tests/`
  doit être vide.
- `index.html` : **toutes** les entrées de l'import map à la même valeur (test `cache-busting`).
- Test « account » : il suppose que le plus ancien compte n'a pas déjà un signal « working » sur
  dist-007 dans l'heure (même hypothèse que « avec un compte : accepte »). Si le résultat est
  vide (`''`), le noter dans la PR, ne rien changer.
- Test fonctionnel (c) : `page.reload()` relance tout le démarrage ; si l'écran d'accueil reste
  affiché, ce n'est pas grave, l'effacement a lieu avant la géolocalisation.

## Terminé quand
- [ ] Contrôles passés ; tests écrits (unitaires et fonctionnels échouent avant, passent après ; db : 3 échouent avant l'application)
- [ ] `diff` de confirm_availability : exactement les 2 lignes `VALUES`
- [ ] `npm test` et `npm run test:functional` verts
- [ ] Captures iPhone : non (aucun écran ne change)
- [ ] PR ouverte (non fusionnée), avec la mention « migration 032 à appliquer par Claude avant fusion »
- [ ] Story cochée dans BACKLOG.md si elle y figure (sinon : le noter dans la PR, ne pas l'ajouter)

## Modèle de PR
**Titre** : `fix(vie-privee): la mesure d'audience ne se relie plus au compte (migration 032)`

**Corps** : constat corrigé ; ce qui change (signaux sans identifiant d'appareil, mesure par
session, purge des événements à 13 mois, `snackmatch_device` effacé ; rien de visible pour
l'utilisateur) ; tests ajoutés / adaptés avec la sortie montrant les échecs avant ; sortie du
`diff` de confirm_availability ; sorties de `npm test` et de la suite fonctionnelle ; ligne en gras
« **Migration 032 à appliquer par Claude après relecture, avant fusion** » ; points laissés à
Stéphane : interrupteur « mesure d'audience », anciens `device_hash` de `events`.
