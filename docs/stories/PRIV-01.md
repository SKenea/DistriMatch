# PRIV-01 — Le compte qui signale, modifie ou ajoute une fiche n'est plus lisible par tous

- **Lot** : 2. Vie privée · **Gravité** : moyen · **Niveau conseillé** : medium, relecture par un modèle plus fort avant fusion (SQL de droits)
- **Ordre** : **première** story du lot 2 (PRIV-01 → PRIV-02 → PRIV-03 → PRIV-05 → PRIV-06 → PRIV-07 → PRIV-04).
  Prérequis : lot 1 fusionné, migrations 025 à 028 appliquées (c'est le cas). Branche créée à partir
  de `master` **à jour** (`git switch master && git pull` d'abord).
- **Branche** : `fix/auteurs-illisibles` · **Taille** : 1 migration SQL + 3 fichiers JS (`js/utils.js`,
  `js/app.js`, `js/additions.js`) + `CLAUDE.md` + 4 fichiers de tests. Au-dessus de la limite de 3,
  **exception acceptée** : la base et le front changent ensemble (après la migration, l'ancien
  `select('*')` est refusé), à garder dans une seule PR.
- **Constats couverts** (rapport du 2026-10-21) :
  - Chaque signal révèle son auteur via distributors.modified_by, ce qui annule l'objectif de la migration 023 — `supabase/006_audit_trail.sql:50`
  - (doublon) Le compte qui a signalé en dernier chaque distributeur est lisible par tous (distributors.modified_by), ce qui annule la migration 023 — `supabase/014_signals_require_account.sql:136`
  - L'UUID du compte contributeur de chaque fiche est lisible anonymement (`added_by`, `reviewed_by`) — `supabase/001_schema.sql:83`
  - Identifiants de compte publics, part « fiches et produits » : `distributors.added_by` / `reviewed_by`, `products.modified_by` — `supabase/016_reviews.sql:59`
    (les parts `reviews.user_id`, `profiles`, `reports`, `votes`, `distributor_photos` sont pour les stories PRIV suivantes)

> **Application sur la vraie base** : c'est **Claude (modèle principal)** qui applique la migration
> 029, **après relecture**. L'exécutant n'exécute **jamais** de SQL sur la base (ni
> `node scripts/supabase-sql.mjs`, ni SQL Editor). **Attention, ordre inverse de SEC-03** : ici on
> **fusionne d'abord** (le nouveau front marche avec l'ancienne base), puis on applique 029
> **après le déploiement** (l'ancien front ne marche pas avec la nouvelle base). Voir
> « Avant et après la fusion (Claude) ».

## But
Plus personne (visiteur ou membre) ne peut savoir quel compte a signalé en dernier sur un
distributeur, qui a ajouté ou validé une fiche, ni qui a renommé ou retiré un produit.

## User story
En tant que membre qui signale devant un distributeur (donc à un endroit et une heure précis),
je veux que mon compte ne soit lisible par personne d'autre, afin que mes passages ne puissent
pas être suivis ni reliés à mes avis et à mes ajouts.

**Critères d'acceptation**
- [ ] Un signal retenu (`confirm_availability`) ne modifie plus `distributors.modified_by`.
- [ ] `distributors.modified_by` vaut NULL partout juste après 029 ; ensuite il n'est écrit que par
      un ajout (déclencheur de 027), un changement de prix ou la modération, et reste illisible par
      l'API (journal pour l'admin, en SQL seulement).
- [ ] Un membre qui se connecte sans recharger (code par e-mail) voit ses fiches reconnues
      (`addedById`) dès le rafraîchissement de « Mes ajouts ».
- [ ] Par l'API, un visiteur comme un compte reçoit 42501 en lisant `distributors.added_by`,
      `modified_by`, `reviewed_by`, `reviewed_at`, `review_reason`, `author_read_at`, ou
      `products.modified_by` / `removed_by`, et en faisant `select *` sur `distributors`.
- [ ] La carte, la liste et la fiche se chargent depuis Supabase comme avant (aucun repli sur le JSON) :
      colonnes listées par le front, produits imbriqués, vues `product_availability` / `distributor_status`.
- [ ] « Mes ajouts » montre toujours les fiches du membre, leur statut et le motif d'un refus
      (RPC `my_distributors()`).
- [ ] Sur sa fiche en attente, l'auteur voit toujours « Visible seulement par toi… » ; Mon profil
      compte toujours ses ajouts.

## Ce qui est déjà tranché (ne pas refaire l'analyse)
- **D'où vient la fuite** : `confirm_availability` (version en vigueur : 028, section 4) fait
  `UPDATE distributors SET last_verified = now()` à chaque signal retenu. Le déclencheur
  `distributors_audit_trigger` (006, `BEFORE UPDATE`, toutes colonnes) y écrit
  `modified_by = auth.uid()` : dans une fonction `SECURITY DEFINER`, `auth.uid()` lit le jeton de
  l'appelant, donc le compte qui signale. `distributors` est lisible en entier (aucun droit par
  colonne en lecture ; 013 et 027 ne touchent qu'UPDATE / INSERT).
- **Correction du déclencheur** : recréé en `BEFORE UPDATE OF <colonnes modifiables>` (nom, type,
  emoji, adresse, ville, position, prix, état, fuseau, horaires, validation). Les UPDATE qui ne
  touchent que `last_verified` (signaux, démo) ou `author_read_at` (fil de l'auteur, 022) ne le
  déclenchent plus. La fonction `set_audit_columns()` (006) est réutilisée telle quelle ; les
  déclencheurs de `products` et `distributor_photos` ne changent pas.
- **Purge** : `modified_by` remis à NULL sur toutes les fiches (les valeurs écrites par les
  signaux ne se distinguent pas de celles des changements de prix). Le déclencheur est recréé
  **avant** la purge (sinon l'ancien déclencheur réécrirait `updated_at` partout).
- **Lecture par colonne** (modèle de 023 pour `availability_signals`) : `REVOKE SELECT` puis
  `GRANT SELECT (liste)` pour `anon` et `authenticated`, sur `distributors` et `products`.
  INSERT / UPDATE ne changent pas (droits de 013, 025, 027 intacts). `service_role` (fonction
  serveur `push-notify`) garde ses droits.
  - `distributors` ouvertes : `id, name, type, emoji, address, city, lat, lng, rating, review_count,
    status, last_verified, price_range, is_user_added, created_at, updated_at, tz, is_demo, source,
    opening_hours, review_status`.
    Fermées : `added_by`, `modified_by`, `reviewed_by` (uuid de compte), `review_reason`,
    `author_read_at`, `reviewed_at` (ne concernent que l'auteur et l'admin ; le front ne lit pas `reviewed_at`).
  - `products` ouvertes : `id, distributor_id, name, price, available, created_at, updated_at, removed_at`.
    Fermées : `modified_by`, `removed_by`. **`removed_at` doit rester ouverte** : la vue
    `product_availability` (025, `security_invoker`) le lit avec les droits du visiteur ; sans
    lui, l'état des produits disparaît (42501 sur la vue). Il vaut toujours NULL sur une ligne
    lisible (règle de lecture de 025).
  - Les règles RLS (lecture des fiches : `added_by = auth.uid()`, 022) continuent de lire
    `added_by` : PostgreSQL ne contrôle pas les droits par colonne sur les colonnes de la table
    citées par ses propres règles. Un test le vérifie (l'auteur lit sa fiche en attente).
  - Les fonctions `SECURITY DEFINER` (`my_activity`, `admin_*`, `is_my_distributor`,
    `distributor_is_published`, `confirm_availability`...) et les vues KPI / `product_rhythm`
    (droits du propriétaire) ne sont pas concernées.
- **Comment l'auteur retrouve ses fiches : RPC `my_distributors()`** (et pas une vue ni une colonne calculée) :
  - une colonne calculée PostgREST `is_mine(distributors)` reçoit la ligne entière, ce qui exige
    le droit de lecture sur **toutes** les colonnes : refusée (42501) dès 029 ;
  - une vue « mes fiches » doublerait la table pour PostgREST (relations, règles) pour un seul usage ;
  - la requête actuelle de « Mes ajouts » (`.eq('added_by', user.id)`) ne peut plus marcher :
    filtrer sur `added_by` exige de pouvoir le lire.
  Donc une fonction `SECURITY DEFINER` qui rend les fiches du compte appelant (`id, name, type,
  emoji, city, review_status, review_reason, author_read_at, created_at, added_by`), de la plus
  récente à la plus ancienne. Exécutable par `anon` (elle rend 0 ligne) : l'app l'appelle au
  chargement sans savoir si la session est restaurée, sans bruit d'erreur.
  - `js/additions.js` (« Mes ajouts ») : la requête sur la table devient `rpc('my_distributors')`.
  - `js/app.js` (chargement) : 4e requête en parallèle ; chaque fiche du compte reçoit les champs
    de la RPC avant `mapDistributorRow` (`added_by` compris). Ainsi `addedById` reste rempli pour
    SES fiches : `countMyAdditions` (Mon profil, `js/utils.js:377`) et le bandeau « Visible
    seulement par toi » (`js/gmaps-ui.js:780`) marchent sans changement. RPC en échec (ex. 029
    pas encore appliquée) : aucune fiche reconnue comme sienne, rien ne casse.
  - `mapDistributorRow` (`js/utils.js`) **ne change pas**.
- **Lectures de `distributors` / `products` dans `js/`** (inventaire complet, 8 appels) :

  | Fichier:ligne | Appel | Après 029 |
  |---|---|---|
  | `app.js:95` | `select('*, products(id, name, price, available)')` | **refusé (42501) → à changer** (liste de colonnes) |
  | `additions.js:49-50` | `select('id, ..., review_reason, author_read_at, ...').eq('added_by', ...)` | **refusé → à changer** (RPC) |
  | `add-distributor.js:307` | `select('review_status').eq('id', id)` | OK (colonnes ouvertes) |
  | `add-distributor.js:327` | `insert({...})` sans `.select()` | OK (INSERT inchangé, pas de RETURNING de colonnes) |
  | `add-distributor.js:348` | `insert([...])` produits sans `.select()` | OK |
  | `fiche-edit.js:197` | `update({ name }).eq('id' / 'distributor_id' + 'name')` | OK (filtres sur colonnes ouvertes) |
  | `fiche-edit.js:382` | `insert(...).select('id')` | OK (`id` ouvert) |
  | `fiche-edit.js:457` | `update({ price_range }).eq('id', ...)` | OK |

  Les autres `select('*')` de `js/` visent des **vues** (`product_availability`, `distributor_status`,
  `product_rhythm`, `kpi_*`) : non concernées.
- **Garde-fou contre la dérive** : les listes de colonnes du front deviennent deux constantes de
  `js/utils.js` (`DISTRIBUTOR_PUBLIC_COLUMNS`, `PRODUCT_PUBLIC_COLUMNS`) ; un test unitaire lit
  `supabase/029_private_contributors.sql` et vérifie que chaque colonne lue est ouverte, et
  qu'aucun fichier de `js/` ne fait `select('*')` sur ces deux tables.
- **Compatibilité** : le nouveau front marche **avant** 029 (toutes les colonnes listées existent ;
  la RPC absente est ignorée au chargement ; seul « Mes ajouts » affiche « Impossible de charger »
  jusqu'à l'application). L'ancien front (`select('*')`) **ne marche pas après** 029 : toute la
  lecture des fiches échoue et l'app retombe sur le JSON de démo. Rendre 029 compatible avec
  l'ancien front est impossible (tout droit par colonne fait refuser `*`). D'où l'ordre :
  fusion → déploiement → attente du cache → application de 029.

## Avant de coder
**Lire en entier** : `supabase/006_audit_trail.sql`, `supabase/022_distributor_review.sql`,
`supabase/023_activity_privacy.sql`, `supabase/025_product_soft_delete.sql` (sections 3, 4, 9),
`supabase/027_distributor_insert_guard.sql` (section 1) ; `js/app.js` lignes 1-20 et 91-131 ;
`js/additions.js` lignes 38-64 ; `js/utils.js` lignes 950-996 et 375-380 ; `js/gmaps-ui.js` lignes 776-784 ;
`tests/integration/db.test.js` lignes 1-56, 497-555, 713-730 et 1000-1020 ;
`tests/functional/validation.spec.js` lignes 1-80, 120-130, 160-180 ; `tests/functional/doublons.spec.js` lignes 108-135 ;
`tests/unit/unit.test.js` lignes 1-45 et 795-810.

**Réutiliser** (ne pas réécrire) : `set_audit_columns()` (006) ; `probe` / `query` / `AS_USER` /
`AS_ANON` / `USER` / `DEMO` / `DEVICE` / `signal` (`tests/integration/db.test.js`) ; `json`,
`TEST_USER`, `setupApp`, `loginForTest`, `minutesAgoIso` (`tests/functional/validation.spec.js`) ;
`readFileSync`, `readdirSync` (déjà importés dans `tests/unit/unit.test.js`) ; `mapDistributorRow`
(inchangé).

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
ls supabase/                                                     # dernier fichier numéroté : 028_db_hardening.sql (aucun 029_*)
grep -rn "distributors_audit_trigger" supabase/
# attendu exactement 3 lignes : 006_audit_trail.sql:61, 006_audit_trail.sql:62, 010_is_demo.sql:70 (commentaire)
grep -n "BEFORE UPDATE ON distributors" supabase/006_audit_trail.sql          # 1 ligne (63)
grep -rn "from('distributors')\|from('products')" js/
# attendu exactement 8 lignes : add-distributor.js:307, :327, :348 ; additions.js:49 ; app.js:95 ;
# fiche-edit.js:197, :382, :457 (voir le tableau ci-dessus)
grep -n "select('\*, products(id, name, price, available)')" js/app.js        # 1 ligne (95)
grep -n "const rows = data.map(mapDistributorRow);" js/app.js                 # 1 ligne (104)
grep -n "mapDistributorRow, findLocalDuplicates, removeUserDistributors, saveToLocalStorage, hasValidCoords, resetDeviceId" js/app.js   # 1 ligne (15)
grep -n ".eq('added_by', user.id).order('created_at', { ascending: false })," js/additions.js   # 1 ligne (50)
grep -n "        mine = d.data || \[\];" js/additions.js                     # 1 ligne (56)
grep -n "^import { AppState, supabaseClient } from './state.js';" js/additions.js   # 1 ligne (11)
grep -n "^// Ligne Supabase (snake_case, produits imbriques) -> distributeur de l'app" js/utils.js   # 1 ligne (955)
grep -rn "my_distributors\|DISTRIBUTOR_PUBLIC_COLUMNS\|PRODUCT_PUBLIC_COLUMNS" js/ tests/ supabase/   # aucun résultat
grep -n "    mapDistributorRow, diffFavoriteSignals,$" tests/unit/unit.test.js # 1 ligne (25)
grep -n "^describe('mapDistributorRow (ligne Supabase -> distributeur, isDemo)'" tests/unit/unit.test.js   # 1 ligne (807)
grep -n "coalesce(review_reason, '-') from distributors where id = 'itest-rev')" tests/integration/db.test.js   # 1 ligne (533)
grep -n 'coalesce((modified_by = ${USER})::text' tests/integration/db.test.js   # 1 ligne (726) — guillemets SIMPLES
grep -n "^describe('base : rien n" tests/integration/db.test.js               # 1 ligne (1008)
grep -n "u.searchParams.has('added_by')" tests/functional/validation.spec.js # 2 lignes (25, 168)
grep -n "r.url().includes('added_by')" tests/functional/validation.spec.js   # 1 ligne (127)
grep -n "        expect(id).toBeTruthy();" tests/functional/validation.spec.js   # 1 ligne (76)
grep -n "startsWith('\*')" tests/functional/doublons.spec.js                  # 1 ligne (114)
grep -c "limitees aux fiches publiees). AVANT d'appliquer une migration" CLAUDE.md   # 1
grep -o '"./js/app.js": "./js/app.js?v=[0-9]*"' index.html                   # noter la valeur V (108 ou plus)
```

## Étapes

1. **supabase/029_private_contributors.sql** — nouveau fichier (outil Write), contenu **exact** :
   ```sql
   -- ============================================================================
   -- 029 : le compte d'un contributeur n'est plus lisible par tous (PRIV-01)
   -- ============================================================================
   -- Revue du 2026-10-21. Avant :
   --   * chaque signal retenu par confirm_availability fait
   --     « update distributors set last_verified = now() » ; le declencheur d'audit
   --     de 006 (before update, toutes colonnes) y ecrivait modified_by = auth.uid(),
   --     soit le compte qui signale. distributors etant lisible en entier, le dernier
   --     compte qui avait signale sur chaque fiche etait public (ce que 023 voulait
   --     empecher), exploitant verifie compris ;
   --   * distributors.added_by (auteur), reviewed_by (admin), review_reason,
   --     author_read_at, products.modified_by / removed_by : lisibles par tous.
   -- Apres :
   --   1. Le declencheur d'audit de distributors ne part plus que sur les colonnes
   --      modifiables (nom, type, position, prix, etat, fuseau, horaires,
   --      validation) : ni last_verified (signaux), ni author_read_at (fil, 022).
   --   2. modified_by remis a NULL sur toutes les fiches (les valeurs des signaux
   --      ne se distinguent pas des autres).
   --   3. Lecture par colonne pour anon et authenticated sur distributors et
   --      products (modele de 023). Plus de select('*') possible : le front liste
   --      ses colonnes (DISTRIBUTOR_PUBLIC_COLUMNS / PRODUCT_PUBLIC_COLUMNS,
   --      js/utils.js). products.removed_at reste lisible : la vue
   --      product_availability (security_invoker, 025) le lit avec les droits du
   --      visiteur. INSERT / UPDATE inchanges (013, 025, 027).
   --   4. my_distributors() : l'auteur relit ses propres fiches (statut, motif de
   --      refus, lecture du fil, son id) pour « Mes ajouts » et Mon profil. Vide
   --      pour un visiteur (executable par anon : l'app l'appelle au chargement).
   -- Inchanges : les regles RLS (elles lisent toujours added_by), les fonctions
   -- SECURITY DEFINER, les vues KPI / product_rhythm (droits du proprietaire),
   -- service_role (fonction push-notify).
   -- INCOMPATIBLE avec le front d'avant PRIV-01 (select('*') -> 42501 : l'app
   -- retombe sur le JSON de demo). Appliquer APRES le deploiement du front de
   -- PRIV-01 et l'expiration du cache (docs/stories/PRIV-01.md).
   -- Secours si le site casse : grant select on distributors, products to anon, authenticated;
   -- Rejouable, tout ou rien (begin / commit). Execution (Claude, apres relecture) :
   --   node scripts/supabase-sql.mjs supabase/029_private_contributors.sql
   -- ============================================================================

   begin;

   -- ---------------------------------------------------------------------------
   -- 1. Audit de distributors : seulement les colonnes modifiables
   --    (un « update of » ne part que si la colonne est dans le SET)
   -- ---------------------------------------------------------------------------
   drop trigger if exists distributors_audit_trigger on distributors;
   create trigger distributors_audit_trigger
     before update of name, type, emoji, address, city, lat, lng, price_range, status, tz, opening_hours, review_status
     on distributors
     for each row execute function set_audit_columns();

   -- ---------------------------------------------------------------------------
   -- 2. Valeurs deja ecrites (apres le point 1 : cet UPDATE ne declenche plus l'audit)
   -- ---------------------------------------------------------------------------
   update distributors set modified_by = null where modified_by is not null;

   -- ---------------------------------------------------------------------------
   -- 3. Lecture par colonne (le REVOKE retire aussi les droits par colonne existants)
   -- ---------------------------------------------------------------------------
   revoke select on distributors from anon, authenticated;
   grant select (id, name, type, emoji, address, city, lat, lng, rating, review_count, status,
                 last_verified, price_range, is_user_added, created_at, updated_at, tz, is_demo,
                 source, opening_hours, review_status)
     on distributors to anon, authenticated;

   revoke select on products from anon, authenticated;
   grant select (id, distributor_id, name, price, available, created_at, updated_at, removed_at)
     on products to anon, authenticated;

   -- ---------------------------------------------------------------------------
   -- 4. Les fiches du compte appelant (« Mes ajouts », Mon profil, bandeau de la fiche)
   -- ---------------------------------------------------------------------------
   create or replace function my_distributors()
   returns table (id text, name text, type text, emoji text, city text, review_status text,
                  review_reason text, author_read_at timestamptz, created_at timestamptz, added_by uuid)
   language sql stable security definer set search_path = public as $$
     select d.id, d.name, d.type, d.emoji, d.city, d.review_status, d.review_reason,
            d.author_read_at, d.created_at, d.added_by
       from distributors d
      where auth.uid() is not null and d.added_by = auth.uid()
      order by d.created_at desc;
   $$;
   revoke execute on function my_distributors() from public;
   grant execute on function my_distributors() to anon, authenticated;

   notify pgrst, 'reload schema';   -- envoye au commit

   commit;

   -- ============================================================================
   -- VERIFICATION (en tant que postgres)
   -- ============================================================================
   -- select grantee, count(*) from information_schema.column_privileges
   --  where table_name = 'distributors' and privilege_type = 'SELECT'
   --    and grantee in ('anon', 'authenticated') group by 1;
   -- -> anon 21, authenticated 21 (products : 8 chacun)
   -- select count(*) from distributors where modified_by is not null;   -- -> 0
   -- select tgname, pg_get_triggerdef(oid) from pg_trigger where tgname = 'distributors_audit_trigger';
   -- -> BEFORE UPDATE OF name, type, ... ON public.distributors
   -- ============================================================================
   ```

2. **js/utils.js** — les listes de colonnes du front, juste **au-dessus** de la ligne
   `// Ligne Supabase (snake_case, produits imbriques) -> distributeur de l'app` (ligne 955).
   Avant :
   ```js
   // Ligne Supabase (snake_case, produits imbriques) -> distributeur de l'app
   ```
   Après :
   ```js
   // PRIV-01 (029) : colonnes lues par l'app, ouvertes a l'API colonne par colonne.
   // Jamais select('*') sur distributors / products : une colonne non ouverte (added_by,
   // modified_by, reviewed_by, review_reason, author_read_at...) fait echouer TOUTE la
   // lecture (42501) et l'app retombe sur le JSON de demo. Nouvelle colonne a lire =
   // l'ouvrir d'abord par une migration (GRANT SELECT). L'auteur relit ses propres fiches
   // par la RPC my_distributors. Garde-fou : test unitaire « colonnes lues par l'app ».
   export const DISTRIBUTOR_PUBLIC_COLUMNS = 'id, name, type, emoji, address, city, lat, lng, rating, review_count, status, last_verified, price_range, is_user_added, is_demo, source, tz, opening_hours, review_status, created_at';
   export const PRODUCT_PUBLIC_COLUMNS = 'id, name, price, available';

   // Ligne Supabase (snake_case, produits imbriques) -> distributeur de l'app
   ```
   `mapDistributorRow` en dessous **ne change pas**.

3. **js/app.js** — liste de colonnes + fiches du compte par la RPC.
   a) Ligne 15 (import depuis `./utils.js`), avant :
   ```js
       showToast, getUserLocation, sortByDistance, loadFromLocalStorage, loadProfile, loadConversations, loadNotificationPrefs, loadNotificationQueue, loadUserDistributors, saveUserDistributor, mapDistributorRow, findLocalDuplicates, removeUserDistributors, saveToLocalStorage, hasValidCoords, resetDeviceId
   ```
   après :
   ```js
       showToast, getUserLocation, sortByDistance, loadFromLocalStorage, loadProfile, loadConversations, loadNotificationPrefs, loadNotificationQueue, loadUserDistributors, saveUserDistributor, mapDistributorRow, findLocalDuplicates, removeUserDistributors, saveToLocalStorage, hasValidCoords, resetDeviceId, DISTRIBUTOR_PUBLIC_COLUMNS, PRODUCT_PUBLIC_COLUMNS
   ```
   b) Dans `loadDistributorsFromSupabase`, avant (lignes 94-104) :
   ```js
           const [{ data, error }, ratingsRes, operatorsRes] = await Promise.all([
               supabaseClient.from('distributors').select('*, products(id, name, price, available)'),
               supabaseClient.from('distributor_ratings').select('distributor_id, avis, moyenne'),
               supabaseClient.from('distributor_operators').select('distributor_id')
           ]);
           if (error) throw error;
           if (!data || data.length === 0) return null;

           // EPIC-T21 : une fiche refusee n'est visible que dans « Mes ajouts » ; une fiche
           // en attente n'est lue (RLS) que par son auteur et l'admin
           const rows = data.map(mapDistributorRow);
   ```
   après :
   ```js
           // PRIV-01 (029) : colonnes listees, jamais '*' (une colonne non ouverte ferait
           // echouer toute la lecture) ; les fiches du compte viennent de my_distributors
           const [{ data, error }, ratingsRes, operatorsRes, mineRes] = await Promise.all([
               supabaseClient.from('distributors').select(`${DISTRIBUTOR_PUBLIC_COLUMNS}, products(${PRODUCT_PUBLIC_COLUMNS})`),
               supabaseClient.from('distributor_ratings').select('distributor_id, avis, moyenne'),
               supabaseClient.from('distributor_operators').select('distributor_id'),
               supabaseClient.rpc('my_distributors')
           ]);
           if (error) throw error;
           if (!data || data.length === 0) return null;

           // PRIV-01 : auteur, motif de refus et lecture du fil de SES fiches (vide pour un
           // visiteur ; RPC en echec = aucune fiche reconnue comme sienne, rien ne casse)
           const mine = new Map(!mineRes?.error && Array.isArray(mineRes?.data) ? mineRes.data.map(m => [m.id, m]) : []);
           // EPIC-T21 : une fiche refusee n'est visible que dans « Mes ajouts » ; une fiche
           // en attente n'est lue (RLS) que par son auteur et l'admin
           const rows = data.map(r => mapDistributorRow(mine.has(r.id) ? { ...r, ...mine.get(r.id) } : r));
   ```
   Le reste de la fonction ne change pas.

4. **js/additions.js** — « Mes ajouts » par la RPC (filtrer sur `added_by` n'est plus possible).
   Dans `refreshMyAdditions`, avant (lignes 49-50) :
   ```js
               supabaseClient.from('distributors').select('id, name, type, emoji, city, review_status, review_reason, author_read_at, created_at')
                   .eq('added_by', user.id).order('created_at', { ascending: false }),
   ```
   après :
   ```js
               // PRIV-01 (029) : auteur et motif ne se lisent plus dans la table ; la RPC rend
               // les fiches du compte, de la plus recente a la plus ancienne
               supabaseClient.rpc('my_distributors'),
   ```
   Puis, dans la même fonction, avant (lignes 56-57) :
   ```js
           mine = d.data || [];
           messages = (m.data || []).filter(x => mine.some(f => f.id === x.distributor_id));
   ```
   après :
   ```js
           mine = d.data || [];
           // PRIV-01 : addedById ne vient plus de la table ; connexion sans rechargement
           // (code recu par e-mail) : ses fiches deja chargees sont reconnues ici
           const myIds = new Set(mine.map(f => f.id));
           for (const f of [...AppState.distributors, ...(AppState.rejectedDistributors || [])]) {
               if (myIds.has(f.id)) f.addedById = user.id;
           }
           messages = (m.data || []).filter(x => mine.some(f => f.id === x.distributor_id));
   ```
   Pourquoi : `my_distributors` n'est appelée par `app.js` qu'au chargement. Un membre qui se
   connecte par le code reçu par e-mail (`verifyEmailCode`, BUG-05, sans rechargement) n'aurait
   pas ses fiches reconnues avant le lancement suivant (Mon profil compterait moins, bandeau
   « Visible seulement par toi » absent). `refreshMyAdditions` est rappelée à chaque changement de
   connexion (`onAuthChange`, ligne 125). `AppState` est déjà importé (ligne 11) ; la variable du
   compte s'appelle `user` (début de la fonction). Ne rien changer d'autre.

5. **CLAUDE.md** — documenter la migration (texte sans accents comme le reste de la liste).
   Avant (morceau unique de la ligne 111) :
   ```
   `kpi_top_distributors` limitees aux fiches publiees). AVANT d'appliquer une migration
   ```
   après :
   ```
   `kpi_top_distributors` limitees aux fiches publiees), `029_private_contributors` (PRIV-01 : le compte d'un contributeur n'est plus lisible : declencheur d'audit de `distributors` limite aux colonnes modifiables (un signal, qui rafraichit `last_verified`, n'ecrit plus `modified_by`), `modified_by` purge ; lecture PAR COLONNE pour anon / authenticated sur `distributors` et `products`, sans `added_by`, `modified_by`, `reviewed_by`, `reviewed_at`, `review_reason`, `author_read_at`, `removed_by` ; le front liste ses colonnes (`DISTRIBUTOR_PUBLIC_COLUMNS` / `PRODUCT_PUBLIC_COLUMNS`, utils.js) : JAMAIS `select('*')` sur ces deux tables (42501 = toute l'app retombe sur le JSON), une nouvelle colonne lue s'ouvre d'abord par une migration ; l'auteur relit ses fiches (statut, motif de refus, son id) par la RPC `my_distributors()`). AVANT d'appliquer une migration
   ```

6. **index.html** — `js/utils.js`, `js/app.js`, `js/additions.js` changent : monter le `?v=` de
   **toutes** les entrées de l'import map à la même valeur V+1 (V noté aux contrôles). Aucun CSS ne change.

## Tests

### Test 1 — unitaire (garde-fou colonnes front ↔ base)
- **Fichier** : `tests/unit/unit.test.js`.
- a) Import, avant :
  ```js
      mapDistributorRow, diffFavoriteSignals,
  ```
  après :
  ```js
      mapDistributorRow, diffFavoriteSignals, DISTRIBUTOR_PUBLIC_COLUMNS, PRODUCT_PUBLIC_COLUMNS,
  ```
- b) Nouveau bloc, inséré juste **AVANT** la ligne
  `describe('mapDistributorRow (ligne Supabase -> distributeur, isDemo)', () => {` (ligne 807) :
  ```js
  // PRIV-01 (029) : l'app ne lit que les colonnes ouvertes a l'API. Une colonne non ouverte
  // (ou un select('*')) fait echouer toute la lecture des fiches (42501) : l'app retombe
  // sur le JSON de demo pour tout le monde.
  describe('colonnes lues par l’app = colonnes ouvertes par la base (PRIV-01, 029)', () => {
      const root = new URL('../../', import.meta.url);
      const sql = readFileSync(new URL('supabase/029_private_contributors.sql', root), 'utf8');
      const columns = (list) => list.split(',').map(c => c.trim()).filter(Boolean);
      const granted = (table) => {
          const m = sql.match(new RegExp(`grant select \\(([^)]*)\\)\\s+on ${table} to anon, authenticated`, 'i'));
          assert.ok(m, `grant select (...) on ${table} introuvable dans 029`);
          return columns(m[1]);
      };
      const PRIVATE = ['added_by', 'modified_by', 'reviewed_by', 'reviewed_at', 'review_reason', 'author_read_at', 'removed_by'];

      it('distributors : chaque colonne lue est ouverte, aucune colonne privee, pas de « * »', () => {
          const open = granted('distributors');
          for (const c of columns(DISTRIBUTOR_PUBLIC_COLUMNS)) assert.ok(open.includes(c), `${c} lue mais non ouverte`);
          for (const c of PRIVATE) {
              assert.ok(!open.includes(c), `${c} ouverte`);
              assert.ok(!columns(DISTRIBUTOR_PUBLIC_COLUMNS).includes(c), `${c} lue`);
          }
          assert.ok(!DISTRIBUTOR_PUBLIC_COLUMNS.includes('*'));
      });

      it('products : colonnes lues + distributor_id (imbrication) + removed_at (vue product_availability) ouvertes, aucune colonne privee', () => {
          const open = granted('products');
          for (const c of [...columns(PRODUCT_PUBLIC_COLUMNS), 'distributor_id', 'removed_at']) assert.ok(open.includes(c), `${c} non ouverte`);
          for (const c of PRIVATE) assert.ok(!open.includes(c), `${c} ouverte`);
      });

      it('aucun select(\'*\') sur distributors ni products dans js/', () => {
          for (const f of readdirSync(new URL('js/', root)).filter(f => f.endsWith('.js'))) {
              const src = readFileSync(new URL(`js/${f}`, root), 'utf8');
              assert.doesNotMatch(src, /from\('(distributors|products)'\)\s*\.select\(\s*['"`]\s*\*/, f);
          }
      });
  });

  ```
- **Doit échouer avant les étapes 1-3** : tout `unit.test.js` refuse de se charger
  (« does not provide an export named 'DISTRIBUTOR_PUBLIC_COLUMNS' »), puis, une fois l'étape 2
  faite, `029_private_contributors.sql` manque (ENOENT) ou `app.js` fait encore `select('*')`.
  Après les étapes 1 à 3 : vert.

### Test 2 — base (intégration, vraie base, transactions annulées)
- **Fichier** : `tests/integration/db.test.js`.
- **a) Corriger le test existant de 022** « admin : publier avec corrections… » (ligne 533) : il lit
  `review_reason` en compte connecté, colonne fermée par 029. Avant :
  ```js
              perform admin_review_distributor('itest-rev', 'reject');
              r := (select review_status || '|' || coalesce(review_reason, '-') from distributors where id = 'itest-rev')
  ```
  après :
  ```js
              perform admin_review_distributor('itest-rev', 'reject');
              reset role;   -- PRIV-01 (029) : review_reason ne se lit plus par l'API (l'auteur : my_distributors)
              r := (select review_status || '|' || coalesce(review_reason, '-') from distributors where id = 'itest-rev')
  ```
- **b) Corriger le test existant de 027** « ajout par l'API : date, auteur… » (ligne 725) : il lit
  `modified_by` en compte connecté. Avant :
  ```js
                      v_other, now(), 'warning', 4.9, 999, 'Pas/Un_Fuseau');
              r := (select (created_at = now())::text || '|' || (updated_at = now())::text
  ```
  après :
  ```js
                      v_other, now(), 'warning', 4.9, 999, 'Pas/Un_Fuseau');
              reset role;   -- PRIV-01 (029) : modified_by ne se lit plus par l'API
              r := (select (created_at = now())::text || '|' || (updated_at = now())::text
  ```
  (a et b passent avant comme après 029 : `reset role` relit en postgres.)
- **c) Nouveau bloc**, inséré juste **AVANT** la ligne
  `describe('base : rien n’a ete ecrit par ces tests', { skip: SKIP }, () => {` (ligne 1008),
  suivi d'une ligne vide :
  ```js
  // PRIV-01 (029) : le compte qui signale, modifie ou ajoute une fiche n'est plus lisible
  describe('base : auteurs des fiches et des produits illisibles (029)', { skip: SKIP }, () => {
      // Retour en postgres SANS jeton (comme le SQL Editor)
      const AS_POSTGRES = `perform set_config('request.jwt.claims', '', true); reset role;`;
      const ADD = `insert into distributors (id, name, type, lat, lng, is_user_added, added_by) values ('itest-priv', 'Fiche itest', 'pizza', 43.49, -1.47, true, ${USER})`;
      const OTHER = `(select id from auth.users where id <> ${USER} order by created_at limit 1)`;
      // Copie de DISTRIBUTOR_PUBLIC_COLUMNS (js/utils.js) ; produits : PRODUCT_PUBLIC_COLUMNS + distributor_id (imbrication)
      const FRONT_DISTRIBUTOR_COLUMNS = 'id, name, type, emoji, address, city, lat, lng, rating, review_count, status, last_verified, price_range, is_user_added, is_demo, source, tz, opening_hours, review_status, created_at';
      const FRONT_PRODUCT_COLUMNS = 'id, distributor_id, name, price, available';

      it('ni un visiteur ni un compte ne lisent l’auteur, le moderateur ou le motif d’une fiche, ni l’auteur d’un produit (42501)', async () => {
          for (const role of [AS_ANON, AS_USER]) {
              for (const col of ['added_by', 'modified_by', 'reviewed_by', 'reviewed_at', 'review_reason', 'author_read_at']) {
                  const p = await probe(`${role} perform ${col} from distributors limit 1`);
                  assert.equal(p.code, '42501', `distributors.${col}`);
              }
              for (const col of ['modified_by', 'removed_by']) {
                  const p = await probe(`${role} perform ${col} from products limit 1`);
                  assert.equal(p.code, '42501', `products.${col}`);
              }
              const star = await probe(`${role} perform * from distributors limit 1`);
              assert.equal(star.code, '42501', 'select * refuse : l’app liste ses colonnes');
          }
      });

      it('les colonnes lues par l’app, les produits et les vues d’etat restent lisibles', async () => {
          for (const role of [AS_ANON, AS_USER]) {
              const p = await probe(`${role}
                  r := (select count(*) from (select ${FRONT_DISTRIBUTOR_COLUMNS} from distributors) d)::text
                    || '|' || (select count(*) from (select ${FRONT_PRODUCT_COLUMNS} from products) p)::text
                    || '|' || (select count(*) from product_availability)::text
                    || '|' || (select count(*) from distributor_status)::text`);
              assert.ok(p.reachedEnd, p.message);
              const [fiches, produits] = p.result.split('|').map(Number);
              assert.ok(fiches > 0, 'fiches');
              assert.ok(produits > 0, 'produits');
          }
      });

      it('ajouter un produit et relire son id (insert ... returning id, comme l’app) : accepte', async () => {
          const p = await probe(`delete from product_edits where user_id = ${USER};
              ${AS_USER} insert into products (distributor_id, name, available) values ('${DEMO}', 'Produit itest', true) returning id into v_pid;
              r := (v_pid is not null)::text`, 'v_pid bigint;');
          assert.ok(p.reachedEnd, p.message);
          assert.equal(p.result, 'true');
      });

      it('un signal rafraichit last_verified sans ecrire le compte dans modified_by', async () => {
          const p = await probe(`delete from availability_signals where user_id = ${USER} and created_at > now() - interval '1 hour';
              update distributors set modified_by = null where id = '${DEMO}';
              ${AS_USER} perform ${signal('working')};
              ${AS_POSTGRES}
              r := (select coalesce(modified_by::text, 'null') || '|' || (last_verified = now())::text
                    from distributors where id = '${DEMO}')`);
          assert.ok(p.reachedEnd, p.message);
          assert.equal(p.result, 'null|true');
      });

      it('changer le niveau de prix garde son auteur dans le journal (lisible en SQL seulement)', async () => {
          const p = await probe(`${AS_USER} update distributors set price_range = price_range where id = '${DEMO}';
              ${AS_POSTGRES} r := (select (modified_by = ${USER})::text from distributors where id = '${DEMO}')`);
          assert.ok(p.reachedEnd, p.message);
          assert.equal(p.result, 'true');
      });

      it('l’auteur lit toujours sa fiche en attente (la regle de lecture compare added_by), un visiteur non', async () => {
          const p = await probe(`${AS_USER} ${ADD}; v_mine := (select count(*) from distributors where id = 'itest-priv');
              ${AS_ANON} r := v_mine::text || '|' || (select count(*) from distributors where id = 'itest-priv')::text`, 'v_mine int;');
          assert.ok(p.reachedEnd, p.message);
          assert.equal(p.result, '1|0');
      });

      it('my_distributors : l’auteur retrouve ses fiches, leur statut et le motif d’un refus ; un autre compte et un visiteur, rien', async () => {
          const own = await probe(`${AS_USER} ${ADD};
              ${AS_POSTGRES} update distributors set review_status = 'rejected', review_reason = 'Motif itest' where id = 'itest-priv';
              ${AS_USER} r := (select review_status || '|' || coalesce(review_reason, '-') || '|' || (added_by = ${USER})::text
                               from my_distributors() where id = 'itest-priv')`);
          assert.ok(own.reachedEnd, own.message);
          assert.equal(own.result, 'rejected|Motif itest|true');
          const other = await probe(`${AS_USER} ${ADD};
              ${AS_POSTGRES} update distributors set added_by = ${OTHER} where id = 'itest-priv';
              ${AS_USER} r := (select count(*) from my_distributors() where id = 'itest-priv')::text`);
          assert.ok(other.reachedEnd, other.message);
          assert.equal(other.result, '0');
          const anon = await probe(`${AS_USER} ${ADD}; ${AS_ANON} r := (select count(*) from my_distributors())::text`);
          assert.ok(anon.reachedEnd, anon.message);
          assert.equal(anon.result, '0');
      });
  });

  ```
- **Avant l'application de 029, exactement 3 tests de ce bloc échouent** : « ni un visiteur ni un
  compte… (42501) » (les colonnes se lisent encore), « un signal rafraichit last_verified… »
  (résultat `<uuid>|true` au lieu de `null|true`), « my_distributors… » (fonction absente, 42883).
  Les 4 autres passent déjà (non-régression). **L'exécutant ne peut pas faire passer les 3** (il
  n'applique pas la migration) : il lance le fichier une fois, constate, colle la sortie dans la
  PR. Tous les **autres** tests de `db.test.js` restent verts (dont 022 et 027 corrigés).
- Sans jeton dans `.env.local`, tout le fichier est sauté : le noter dans la PR, ne rien contourner.

### Test 3 — fonctionnel (serveur simulé)
- **a) `tests/functional/validation.spec.js`** : « Mes ajouts » passe par la RPC.
  1. Dans `routeReviewApi` (ligne 25), avant :
     ```js
         await page.route(u => u.pathname.endsWith('/rest/v1/distributors') && u.searchParams.has('added_by'), r => r.fulfill(json(mine)));
     ```
     après :
     ```js
         await page.route('**/rest/v1/rpc/my_distributors', r => r.fulfill(json(mine)));   // PRIV-01 (029)
     ```
  2. Ligne 127, avant :
     ```js
             const reloaded = page.waitForResponse(r => r.url().includes('/rest/v1/distributors') && r.url().includes('added_by'));
     ```
     après :
     ```js
             const reloaded = page.waitForResponse(r => r.url().includes('/rest/v1/rpc/my_distributors'));
     ```
  3. Lignes 168-169, avant :
     ```js
             await page.route(u => u.pathname.endsWith('/rest/v1/distributors') && u.searchParams.has('added_by'),
                 r => r.fulfill(down ? json({ message: 'panne simulee' }, 500) : json(mine)));
     ```
     après :
     ```js
             await page.route('**/rest/v1/rpc/my_distributors',
                 r => r.fulfill(down ? json({ message: 'panne simulee' }, 500) : json(mine)));
     ```
  4. Nouveau test, inséré juste **après** la fin du premier test du bloc `37.` (après les deux lignes
     `        expect(id).toBeTruthy();` et `    });`, lignes 76-77), précédé d'une ligne vide :
     ```js
         // PRIV-01 (029) : l'auteur ne se lit plus dans la table ; l'app le reconnait par my_distributors
         test('fiche en attente lue au chargement : son auteur est reconnu par my_distributors (PRIV-01)', async ({ page, context }) => {
             await page.route(u => u.pathname.endsWith('/rest/v1/distributors') && (u.searchParams.get('select') || '').includes('products('), async route => {
                 if (route.request().method() !== 'GET') return route.continue();
                 const res = await route.fetch();
                 const rows = await res.json();
                 rows.push({ ...rows[0], id: 'user-priv01', name: 'ZZ PRIV-01 en attente', lat: 43.3701, lng: -1.2701, review_status: 'pending', added_by: null, products: [] });
                 return route.fulfill({ response: res, json: rows });
             });
             await page.route('**/rest/v1/rpc/my_distributors', r => r.fulfill(json([
                 { id: 'user-priv01', name: 'ZZ PRIV-01 en attente', type: 'other', emoji: '📦', city: null, review_status: 'pending', review_reason: null, author_read_at: null, created_at: minutesAgoIso(5), added_by: TEST_USER }
             ])));
             await setupApp(page, context);   // rechargement : les fiches se lisent au chargement
             await loginForTest(page);
             await page.evaluate(() => window.openDistributorModal('user-priv01'));
             await page.waitForSelector('#dist-modal-overlay.active');
             await expect(page.locator('#dist-review-pending')).toBeVisible();
             await expect(page.locator('#dist-review-pending-text')).toContainText('Visible seulement par toi');
         });

         // PRIV-01 : connexion sans rechargement (code par e-mail) -> ses fiches deja chargees sont reconnues
         test('connexion sans rechargement : « Mes ajouts » reconnait ses fiches deja chargees (PRIV-01)', async ({ page }) => {
             const id = await page.evaluate(() => window.AppState.distributors[0].id);
             expect(await page.evaluate((x) => window.AppState.distributors.find(d => d.id === x).addedById || null, id)).toBeNull();
             await routeReviewApi(page, {
                 mine: [{ id, name: 'Fiche du membre', type: 'pizza', emoji: '🍕', city: 'Bayonne', review_status: 'published', review_reason: null, author_read_at: minutesAgoIso(10), created_at: minutesAgoIso(200), added_by: TEST_USER }]
             });
             await loginForTest(page);   // onAuthChange -> refreshMyAdditions, sans recharger la page
             await expect.poll(() => page.evaluate((x) => window.AppState.distributors.find(d => d.id === x).addedById, id)).toBe(TEST_USER);
         });
     ```
     (inséré juste après le test précédent, précédé d'une ligne vide.)
- **b) `tests/functional/doublons.spec.js`** (ligne 114) : la base simulée attrapait la lecture
  des fiches par `select=*`, qui n'existe plus. Avant :
  ```js
          await page.route(u => u.pathname.endsWith('/rest/v1/distributors') && (u.searchParams.get('select') || '').startsWith('*'), async route => {
  ```
  après :
  ```js
          await page.route(u => u.pathname.endsWith('/rest/v1/distributors') && (u.searchParams.get('select') || '').includes('products('), async route => {
  ```
- **Rien à changer** dans `tests/functional/helpers.js` : `routeDistributors` répond à tout GET
  sur `distributors` quel que soit `select` (sa fixture n'a ni `added_by` ni `modified_by`) ;
  `routeEditWrites` ne touche que les écritures. L'appel `rpc/my_distributors` du chargement part
  vers la vraie base : 404 tant que 029 n'est pas appliquée, tableau vide ensuite (appels
  anonymes) ; l'app l'ignore dans les deux cas.
- **Doivent échouer avant les étapes 3-4** : le nouveau test « fiche en attente lue au chargement »
  (sans la RPC au chargement, le bandeau dit « Fiche ajoutée par un membre… »), le test « connexion
  sans rechargement » (rien ne pose `addedById`, le `expect.poll` expire) et les 4 tests « Mes ajouts » de validation.spec.js (le
  front interroge encore `distributors?added_by=…`, que plus rien ne simule). Le test BUG-07 de
  doublons.spec.js passe avant comme après (le prédicat attrape les deux formes).

## Vérification (dans l'ordre)
```bash
grep -rn "from('distributors').select('\*\|from('products').select('\*" js/   # attendu : aucun résultat
grep -rn "eq('added_by'" js/                                   # attendu : aucun résultat
grep -n "rpc('my_distributors')" js/app.js js/additions.js     # attendu : 2 lignes
npm test                                                       # tout vert, dont « colonnes lues par l’app » et « cache-busting »
npx playwright test --project=functional -g "Validation des nouvelles fiches|BUG-07"   # tout vert
node --test tests/integration/db.test.js                       # AVANT 029 : seuls les 3 tests annoncés du bloc
                                                               # « (029) » échouent ; tous les autres verts. Coller la sortie dans la PR.
npm run test:functional                                        # en arrière-plan (~10 min) : tout vert, instables notés dans la PR
git diff --stat                                                # seuls les fichiers de la fiche (+ index.html)
```

## Avant et après la fusion (Claude, modèle principal — jamais l'exécutant)
Ordre **inverse** de SEC-03 : le nouveau front marche avec l'ancienne base, pas l'inverse.
1. **Relecture** du SQL (liste des colonnes ouvertes, déclencheur, RPC) par un modèle plus fort.
2. **État de la base** (rien n'est écrit) :
   `node scripts/supabase-sql.mjs -e "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'distributors' order by ordinal_position;"`
   → exactement les 27 colonnes connues (les 21 ouvertes + `added_by`, `modified_by`, `review_reason`,
   `reviewed_at`, `reviewed_by`, `author_read_at`). Une colonne inconnue (ajoutée au tableau de bord) :
   s'arrêter et décider avec Stéphane si elle est publique. Même contrôle pour `products` (10 colonnes :
   les 8 ouvertes + `modified_by`, `removed_by`).
3. **Essai à blanc** sur la vraie base (rien ne reste) :
   `sed 's/^commit;\r\?$/rollback;/' supabase/029_private_contributors.sql > <scratchpad>/029-essai.sql`,
   vérifier `grep -c "^rollback;" <scratchpad>/029-essai.sql` = 1 et aucun `^commit;`, puis
   `node scripts/supabase-sql.mjs <scratchpad>/029-essai.sql` → aucune erreur.
4. **Fusionner la PR**, puis attendre le déploiement **et l'expiration du cache** de `index.html`
   (GitHub Pages : 10 min) : `curl -s https://skenea.github.io/DistriMatch/ | grep -o 'app.js?v=[0-9]*'`
   et `curl -s https://distrimatch.pages.dev/ | grep -o 'app.js?v=[0-9]*'` → V+1 sur les deux,
   puis encore **10 minutes**. Entre la fusion et l'étape 5, la RPC n'existe pas encore : la
   ligne « Mes ajouts » de la page Compte s'affiche **en erreur pour TOUT membre connecté**, même
   sans aucun ajout (`row.hidden = !mine.length && !loadError`), et la page dit « Impossible de
   charger tes ajouts ». À dire à Stéphane avant de fusionner : c'est attendu, ça disparaît à
   l'étape 5 ; réduire l'attente au minimum.
5. **Appliquer** : `node scripts/supabase-sql.mjs supabase/029_private_contributors.sql`.
6. **Contrôler tout de suite** :
   - `node --test --test-name-pattern="029|022|027|lectures anonymes" tests/integration/db.test.js` → vert
     (si le filtre ne lance aucun test, lancer le fichier entier une fois) ;
   - avec la clé anon publique (`js/config.js`) :
     `curl -s "<SUPABASE_URL>/rest/v1/distributors?select=modified_by&limit=1" -H "apikey: <ANON>"` → erreur `42501` ;
     `curl -s "<SUPABASE_URL>/rest/v1/distributors?select=id,name,products(id,name)&limit=1" -H "apikey: <ANON>"` → une fiche ;
   - site en ligne : la carte charge les fiches de la base (console : « Donnees chargees via Supabase »),
     puis `npm run test:e2e`.
7. **Secours** si le site retombe sur le JSON après l'étape 5 :
   `node scripts/supabase-sql.mjs -e "grant select on distributors, products to anon, authenticated;"`
   (rétablit la lecture complète, la fuite revient), puis chercher la colonne manquante avant de
   rejouer 029.

## Hors périmètre
- `reviews.user_id`, `profiles`, `reports.user_id`, `votes.user_id`, `distributor_photos.user_id` :
  stories PRIV suivantes (même famille de constat, 016:59).
- Supprimer les colonnes `modified_by` / `added_by`, ou un écran admin d'historique : le journal reste
  consultable en SQL.
- Purger `products.modified_by` / `removed_by` : désormais illisibles par l'API, gardés pour l'admin.
- `distributor_photos` (photos inactives, déclencheur d'audit inchangé).
- Changer `mapDistributorRow`, `countMyAdditions`, `js/gmaps-ui.js` : ils marchent tels quels.
- Les commentaires de 006 / 028 qui disent que le déclencheur remplit `updated_at` à chaque signal :
  ne pas modifier d'anciennes migrations.

## Pièges connus
- **Ne jamais exécuter la migration** (ni SQL Editor, ni `scripts/supabase-sql.mjs`) : les 3 tests
  annoncés du bloc « (029) » restent rouges tant qu'elle n'est pas appliquée, c'est attendu.
- **Jamais `select('*')`** sur `distributors` ou `products`, ni `products(*)` en imbrication : 42501,
  toute l'app retombe sur le JSON de démo. Toujours les constantes de `js/utils.js`.
- **`removed_at` doit rester dans le GRANT de `products`** (vue `product_availability` en
  `security_invoker`) : sinon plus aucun état de produit ne s'affiche.
- Ne révoquer **que** SELECT : pas d'INSERT / UPDATE retiré (le front ajoute des fiches et des
  produits, renomme, change le prix).
- Le déclencheur doit être recréé **avant** la purge (section 1 avant section 2), et sa liste ne
  doit contenir ni `last_verified`, ni `author_read_at`, ni `modified_by`, ni `updated_at`.
- Dans `app.js`, garder `supabaseClient.rpc('my_distributors')` **dans** le `Promise.all` (ni
  `await` séparé, ni dépendance à `isAuthenticated()` : la session peut ne pas être encore relue,
  supabase-js attend lui-même sa restauration avant d'envoyer la requête).
- Dans `additions.js`, ne pas garder `.order(...)` derrière `rpc(...)` : la RPC trie déjà.
- Après l'étape 2 mais avant l'étape 1, le test unitaire échoue sur ENOENT (fichier SQL absent) :
  normal, faire les étapes dans l'ordre.
- Fins de ligne mélangées dans plusieurs fichiers (`db.test.js`, `app.js`) : utiliser l'outil Edit
  (il garde les fins de ligne) ; le nouveau `.sql` avec Write. Si Edit refuse un bloc, script Node
  dans le scratchpad (voir README).
- `grep` avec `${USER}` : guillemets **simples** (voir les contrôles).
- Bump de **toutes** les entrées de l'import map à la **même** valeur, sinon `cache-busting` échoue.
- `validation.spec.js` : la route de `my_distributors` posée **après** `routeReviewApi` passe en
  premier (même règle Playwright qu'avant) ; le nouveau test recharge l'app par `setupApp` (les
  fiches ne se lisent qu'au chargement), comme le test BUG-07 de doublons.spec.js.

## Terminé quand
- [ ] Contrôles passés ; test unitaire et tests fonctionnels écrits (échouent avant, passent après) ;
      tests base écrits (3 rouges avant 029, sortie collée dans la PR)
- [ ] Vérifications vertes (hors les 3 tests « (029) » attendus rouges avant application)
- [ ] Captures iPhone : non (aucun changement visible)
- [ ] Story cochée dans BACKLOG.md si elle y figure (sinon le noter dans la PR), PR ouverte (non
      fusionnée), mention « migration 029 à appliquer par Claude APRÈS fusion et déploiement »

## Modèle de PR
**Titre** : `fix(vie-privee): le compte d'un contributeur n'est plus lisible (migration 029)`

**Corps** : constats corrigés (liste ci-dessus) ; cause (déclencheur d'audit de 006 sur tout
UPDATE, donc sur le `last_verified` de chaque signal ; `distributors` / `products` lisibles en
entier) ; correction (déclencheur limité aux colonnes modifiables, purge de `modified_by`,
lecture par colonne, RPC `my_distributors`, front sans `select('*')`) ; pourquoi une RPC et pas
une vue ou une colonne calculée ; ce qui change pour l'utilisateur (rien de visible) ; tests
ajoutés ; sortie de `npm test`, des tests fonctionnels et de `db.test.js` (3 tests 029 rouges
avant application, attendu) ; **« Ordre : fusionner, attendre le déploiement + 10 min de cache,
PUIS appliquer 029 (Claude) ; entre les deux, seul « Mes ajouts » est indisponible »** ; points à
relire : liste des colonnes ouvertes, colonnes du déclencheur, `my_distributors` exécutable par anon.
