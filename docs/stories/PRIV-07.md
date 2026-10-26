# PRIV-07 — Un compte peut être supprimé (RGPD)

- **Lot** : 2. Vie privée · **Gravité** : faible · **Niveau conseillé** : medium, relecture par un modèle plus fort avant fusion (SQL de clés étrangères)
- **Prérequis** : **PRIV-06 fusionnée** sur master (et donc les migrations 029 à 032 de PRIV-01, 02, 03, 05
  appliquées). Branche créée à partir de `master` **à jour** (`git switch master && git pull` d'abord).
  Ordre du lot 2 : PRIV-01 → PRIV-02 → PRIV-03 → PRIV-05 → PRIV-06 → **PRIV-07** → PRIV-04.
- **Branche** : `fix/suppression-compte` · **Taille** : 1 migration SQL + 1 fichier de tests + `CLAUDE.md`. Aucun fichier JS.
- **Constats couverts** (rapport du 2026-10-21) :
  - Suppression d'un compte impossible dès qu'il a signalé, ajouté ou modifié quelque chose — `supabase/006_audit_trail.sql:28`

> **Application sur la vraie base** : c'est **Claude (modèle principal)** qui applique la migration
> 033, **après relecture**, puis fusionne. L'exécutant n'exécute **jamais** de SQL sur la base
> (ni `node scripts/supabase-sql.mjs`, ni SQL Editor). Voir « Avant la fusion (Claude) ».

## But
Quand un membre demande l'effacement de son compte, Claude peut le supprimer en une requête :
ses contributions publiques restent (sans auteur), ses données propres partent avec lui.

## User story
En tant que membre qui ne veut plus utiliser DistriMatch, je veux que mon compte puisse être
supprimé sur simple demande, afin que mon e-mail et ce qui me relie à mes contributions disparaissent (RGPD).

**Critères d'acceptation**
- [ ] Plus aucune clé étrangère du schéma `public` vers `auth.users` sans règle `ON DELETE`
      (NO ACTION / RESTRICT) ; la migration échoue si une seule reste.
- [ ] Un compte qui a ajouté une fiche, envoyé un signal, changé un niveau de prix (qui pose
      `distributors.modified_by`), renommé un produit et fait un signalement se supprime par
      `delete from auth.users where id = ...` sans erreur.
- [ ] Après suppression : la fiche, le produit, les signaux et le signalement restent, auteur à
      `null` ; le journal `product_edits` n'est plus relié au compte ; son profil est effacé.
- [ ] `push_subscribe` appelé sans compte sur un abonnement existant d'un compte remet `user_id` à `null`.
- [ ] La fiche documente le mode d'emploi « supprimer un compte à la demande d'un membre ».

## Ce qui est déjà tranché (ne pas refaire l'analyse)
Toutes les références à `auth.users` des migrations 001 à 028 (inventaire `grep`, voir contrôles) :

| Clé (migration) | Règle actuelle | Règle après 033 | Pourquoi |
|---|---|---|---|
| `distributors.added_by` (001) | aucune | **SET NULL** | la fiche sert à tous ; elle reste, sans auteur |
| `distributors.modified_by` (006) | aucune | **SET NULL** | posée par chaque signal jusqu'à PRIV-01 (029 a purgé ces valeurs) ; encore posée par un changement de niveau de prix ou par la modération |
| `products.modified_by` (006) | aucune | **SET NULL** | le produit reste |
| `distributor_photos.modified_by` (006) | aucune | **SET NULL** | idem |
| `distributor_photos.user_id` (003) | aucune | **SET NULL** | photos inactives en V1 ; une suppression de ligne laisserait de toute façon le fichier dans Storage (orphelin) : on garde la ligne sans auteur |
| `reports.user_id` (001) | aucune | **SET NULL** | signalement sans texte libre (type + nom de produit) : contribution anonymisée, comme les signaux |
| `availability_signals.user_id` (007) | SET NULL | inchangé | signal = information collective |
| `push_subscriptions.user_id` (024) | SET NULL | inchangé | l'abonnement appartient à l'appareil, pas au compte |
| `products.removed_by`, `product_edits.user_id` (025) | SET NULL | inchangé | historique de restauration, sans auteur |
| `distributor_operators.granted_by`, `operator_requests.decided_by` (020), `distributors.reviewed_by` (022) | SET NULL | inchangé | trace de la décision de l'admin |
| `profiles.id`, `subscriptions.user_id`, `votes.user_id` (001) | CASCADE | inchangé | données du compte |
| `signal_bans.user_id` (014) | CASCADE | inchangé | le blocage n'a plus d'objet sans le compte |
| `reviews.user_id` (016) | CASCADE | inchangé | avis = texte personnel (décision de 016) |
| `app_admins.user_id`, `distributor_operators.user_id`, `operator_requests.user_id` (020) | CASCADE | inchangé | statut et demandes du compte (SIRET, messages : `operator_request_messages` suit par `request_id`) |

- **Méthode** : pour chacune des 6 clés, `alter table if exists ... drop constraint if exists <nom>,
  add constraint <nom> foreign key (...) references auth.users(id) on delete set null;` (modèle de
  007, 020, 022). Noms par défaut de Postgres (`<table>_<colonne>_fkey`) : vérifiés sur la vraie base
  par Claude avant application (« Avant la fusion »).
- **Garde finale** dans la migration : si une clé de `public` vers `auth.users` reste en NO ACTION /
  RESTRICT (nom réel différent, clé ajoutée par 029-032), la migration lève une erreur et rien n'est
  appliqué (une seule transaction).
- **Déclencheur d'audit (006)** : `SET NULL` est un UPDATE ; sur `products` et `distributor_photos`
  (sur `distributors`, depuis PRIV-01 / 029, le déclencheur ne part plus pour ces colonnes), `set_audit_columns` réécrit alors
  `modified_by = auth.uid()` et `updated_at = now()`. En postgres **sans jeton** (SQL Editor,
  `scripts/supabase-sql.mjs`, bouton « Delete user » du tableau de bord), `auth.uid()` est nul :
  sans effet sur `modified_by`. Effet accepté : `updated_at` des lignes touchées passe à l'heure de
  la suppression. Les gardes de 025 / 027 (`auth.role()` / `current_user` = `anon` ou
  `authenticated`) ne s'appliquent pas non plus. **Ne jamais supprimer un compte avec le jeton du
  membre** (le déclencheur remettrait son id et la suppression échouerait).
- **`push_subscribe` (décision du modèle principal, complément de PRIV-06)** : dans 026, le
  `on conflict` garde `user_id = coalesce(auth.uid(), push_subscriptions.user_id)` : un réabonnement
  sans compte ne retire jamais le compte. 033 recopie la fonction **mot pour mot** depuis 026, seule
  cette ligne devient `user_id = auth.uid(),` (même signature, mêmes `revoke` / `grant` : le front
  ne change pas). Un contrôle `diff` le vérifie (voir « Vérification »).
- **Pas d'écran** « Supprimer mon compte » : suppression par Claude, sur demande de Stéphane (mode d'emploi ci-dessous).

## Avant de coder
**Lire en entier** : `supabase/001_schema.sql` lignes 1-110, `supabase/003_photos.sql`,
`supabase/006_audit_trail.sql`, `supabase/015_e2e_test_account.sql`, `supabase/020_operators.sql` lignes 25-85,
`supabase/026_push_subscriptions_limits.sql` lignes 49-113 (`push_subscribe`, recopiée en section 4),
`supabase/025_product_soft_delete.sql` lignes 30-70 et 95-195, chaque migration `029_*` à `032_*` ;
`tests/integration/db.test.js` lignes 1-60 et 948-1022.

**Réutiliser** (ne pas réécrire) : `probe` / `query` / `DEMO` / `DEVICE` / `SKIP` (`tests/integration/db.test.js`),
le modèle d'insertion dans `auth.users` de `supabase/015_e2e_test_account.sql`.

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter ; un numéro de ligne différent n'est pas un échec) :
```bash
ls supabase/                                       # dernier fichier numéroté : 032_*.sql (PRIV-05), aucun 033_*
grep -rniE "references auth\.users" supabase/0[01][0-9]_*.sql supabase/02[0-8]_*.sql
# attendu exactement 21 lignes : 001:22, 001:38, 001:48, 001:57, 001:71, 003:10, 006:28, 006:32, 006:36,
# 007:43, 014:29, 016:31, 020:33, 020:51, 020:53, 020:75, 020:81, 022:20, 024:24, 025:40, 025:67
grep -rniE "references auth\.users" supabase/029_*.sql supabase/03[0-2]_*.sql
# chaque ligne trouvée doit contenir « on delete set null » ou « on delete cascade » ; sinon s'arrêter
# et signaler la clé (Claude décidera de l'ajouter à 033)
grep -niE "drop (table|column)|rename (to|column)" supabase/029_*.sql supabase/03[0-2]_*.sql
# aucune ligne ne doit viser distributors.added_by, une colonne modified_by, la table reports,
# la table distributor_photos ou distributor_photos.user_id ; sinon s'arrêter
grep -n "^describe('base : rien n’a ete ecrit par ces tests', { skip: SKIP }, () => {" tests/integration/db.test.js   # 1 ligne
grep -n "auth.users (" tests/integration/db.test.js                                   # aucun résultat
grep -n ". AVANT d'appliquer une migration :" CLAUDE.md                               # 1 ligne
grep -c "033_" CLAUDE.md                                                              # 0
```

## Étapes

1. **supabase/033_account_deletion.sql** — nouveau fichier (outil Write), contenu **exact** :
   ```sql
   -- ============================================================================
   -- 033 : un compte peut etre supprime (PRIV-07, RGPD)
   -- ============================================================================
   -- Revue du 2026-10-21. Six cles etrangeres vers auth.users n'avaient aucune regle
   -- ON DELETE (NO ACTION) : des qu'un membre avait ajoute une fiche, change un niveau
   -- de prix ou envoye un signal (avant 029, le declencheur d'audit de 006 posait alors
   -- distributors.modified_by), renomme un produit ou fait un signalement,
   -- « delete from auth.users » (ou « Delete user » du tableau de bord) echouait en 23503.
   -- Apres : ces six cles passent en ON DELETE SET NULL. La contribution reste
   -- (fiche, produit, photo, signalement), sans auteur.
   -- Cles deja posees, inchangees :
   --   SET NULL : availability_signals.user_id (007), distributor_operators.granted_by,
   --     operator_requests.decided_by (020), distributors.reviewed_by (022),
   --     push_subscriptions.user_id (024), products.removed_by, product_edits.user_id (025)
   --   CASCADE (donnees du compte, effacees avec lui) : profiles.id, subscriptions.user_id,
   --     votes.user_id (001), signal_bans.user_id (014), reviews.user_id (016),
   --     app_admins.user_id, distributor_operators.user_id, operator_requests.user_id (020)
   -- push_subscribe (026) recopiee avec une seule ligne changee : un reabonnement sans
   -- compte (celui qui suit la deconnexion, PRIV-06) retire le compte de l'abonnement.
   -- Garde finale : la migration echoue si une cle de public vers auth.users reste sans
   -- regle (NO ACTION / RESTRICT), y compris une cle ajoutee apres 028.
   -- Supprimer un compte : TOUJOURS en postgres sans jeton (SQL Editor ou
   -- scripts/supabase-sql.mjs) ; mode d'emploi en fin de fichier.
   -- Idempotente, tout ou rien (begin / commit). Execution (Claude, apres relecture) :
   --   node scripts/supabase-sql.mjs supabase/033_account_deletion.sql
   -- ============================================================================

   begin;

   -- 1. Fiches : auteur (001) et dernier modificateur (006)
   alter table if exists public.distributors
     drop constraint if exists distributors_added_by_fkey,
     add constraint distributors_added_by_fkey
       foreign key (added_by) references auth.users(id) on delete set null;

   alter table if exists public.distributors
     drop constraint if exists distributors_modified_by_fkey,
     add constraint distributors_modified_by_fkey
       foreign key (modified_by) references auth.users(id) on delete set null;

   -- 2. Produits et photos : dernier modificateur (006), auteur de la photo (003)
   alter table if exists public.products
     drop constraint if exists products_modified_by_fkey,
     add constraint products_modified_by_fkey
       foreign key (modified_by) references auth.users(id) on delete set null;

   alter table if exists public.distributor_photos
     drop constraint if exists distributor_photos_modified_by_fkey,
     add constraint distributor_photos_modified_by_fkey
       foreign key (modified_by) references auth.users(id) on delete set null;

   alter table if exists public.distributor_photos
     drop constraint if exists distributor_photos_user_id_fkey,
     add constraint distributor_photos_user_id_fkey
       foreign key (user_id) references auth.users(id) on delete set null;

   -- 3. Signalements (001)
   alter table if exists public.reports
     drop constraint if exists reports_user_id_fkey,
     add constraint reports_user_id_fkey
       foreign key (user_id) references auth.users(id) on delete set null;

   -- 4. push_subscribe (recopie de 026, une seule ligne change) : un reabonnement
   --    sans compte (synchronisation qui suit la deconnexion, js/push.js) retire le
   --    compte de l'abonnement ; un reabonnement connecte le repose.
   create or replace function public.push_subscribe(
       p_endpoint text, p_p256dh text, p_auth text,
       p_favorites text[], p_followed text[],
       p_quiet_start integer, p_quiet_end integer, p_tz text
   ) returns void
   language plpgsql security definer set search_path = public as $$
   declare
       v_favorites text[];
   begin
       if not push_endpoint_allowed(p_endpoint)
          or coalesce(p_p256dh, '') = '' or length(p_p256dh) > 200
          or coalesce(p_auth, '') = '' or length(p_auth) > 100 then
           raise exception 'Abonnement invalide' using errcode = '22023';
       end if;
       -- Une seule dimension : array_length(.., 1) ne comptait que la premiere
       if coalesce(array_ndims(p_favorites), 1) > 1 or coalesce(array_ndims(p_followed), 1) > 1
          or cardinality(coalesce(p_favorites, '{}')) > 200
          or exists (select 1 from unnest(coalesce(p_favorites, '{}')) v where length(v) > 100) then
           raise exception 'Trop de favoris' using errcode = '22023';
       end if;
       if cardinality(coalesce(p_followed, '{}')) > 30
          or array_position(coalesce(p_followed, '{}'), null) is not null
          or exists (select 1 from unnest(coalesce(p_followed, '{}')) v where length(v) > 60) then
           raise exception 'Trop de produits suivis' using errcode = '22023';
       end if;

       -- Seulement des fiches publiees qui existent ; le reste est ignore sans erreur
       select coalesce(array_agg(distinct d.id), '{}') into v_favorites
         from distributors d
        where d.id = any(coalesce(p_favorites, '{}')) and d.review_status = 'published';

       -- Plafonds globaux pour un NOUVEL abonnement : 200 par heure, 5000 au total.
       -- Une mise a jour d'un abonnement existant passe toujours.
       if not exists (select 1 from push_subscriptions where endpoint = p_endpoint) then
           if (select count(*) from push_subscriptions where created_at > now() - interval '1 hour') >= 200 then
               raise exception 'Trop d''abonnements en ce moment, reessaie plus tard' using errcode = 'P0001';
           end if;
           if (select count(*) from push_subscriptions) >= 5000 then
               raise exception 'Trop d''abonnements enregistres, reessaie plus tard' using errcode = 'P0001';
           end if;
       end if;

       insert into push_subscriptions (endpoint, p256dh, auth, user_id, favorites, followed_products, quiet_start, quiet_end, tz)
       values (p_endpoint, p_p256dh, p_auth, auth.uid(), v_favorites, coalesce(p_followed, '{}'),
               p_quiet_start, p_quiet_end, coalesce(nullif(left(p_tz, 64), ''), 'UTC'))
       on conflict (endpoint) do update set
           p256dh = excluded.p256dh,
           auth = excluded.auth,
           user_id = auth.uid(),   -- PRIV-06 : un reabonnement sans compte retire le compte
           favorites = excluded.favorites,
           followed_products = excluded.followed_products,
           quiet_start = excluded.quiet_start,
           quiet_end = excluded.quiet_end,
           tz = excluded.tz,
           fail_count = 0,
           updated_at = now();
   end;
   $$;

   revoke all on function public.push_subscribe(text, text, text, text[], text[], integer, integer, text) from public;
   grant execute on function public.push_subscribe(text, text, text, text[], text[], integer, integer, text) to anon, authenticated;

   -- 5. Garde : plus aucune cle de public vers auth.users sans regle ON DELETE
   do $$
   declare
     v_left text;
   begin
     select string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ' order by c.conrelid::regclass::text, c.conname)
       into v_left
       from pg_constraint c
      where c.contype = 'f'
        and c.confrelid = 'auth.users'::regclass
        and c.connamespace = 'public'::regnamespace
        and c.confdeltype not in ('n', 'c');   -- n = SET NULL, c = CASCADE
     if v_left is not null then
       raise exception 'Cles vers auth.users encore sans regle ON DELETE : %', v_left;
     end if;
   end $$;

   commit;

   -- ============================================================================
   -- MODE D'EMPLOI : supprimer un compte a la demande d'un membre
   -- (Claude, sur demande de Stephane ; detail dans docs/stories/PRIV-07.md)
   -- ============================================================================
   -- 1. Bilan, lecture seule (remplacer l'e-mail) :
   --    with u as (select id from auth.users where email = 'membre@exemple.fr')
   --    select (select count(*) from u) as compte,
   --           (select count(*) from app_admins where user_id in (select id from u)) as admin,
   --           (select count(*) from distributor_operators where user_id in (select id from u)) as exploitant,
   --           (select count(*) from distributors where added_by in (select id from u)) as fiches_ajoutees,
   --           (select count(*) from availability_signals where user_id in (select id from u)) as signaux,
   --           (select count(*) from reviews where user_id in (select id from u)) as avis,
   --           (select count(*) from operator_requests where user_id in (select id from u)) as demandes;
   --    compte = 1 attendu ; admin = 1 : s'arreter et demander a Stephane.
   -- 2. Suppression (postgres SANS jeton) :
   --    delete from auth.users where email = 'membre@exemple.fr' returning id;
   -- 3. Controle : select count(*) from auth.users where email = 'membre@exemple.fr';   -- 0
   -- Ne jamais supprimer e2e@distrimatch.test (compte des tests E2E, 015) sans accord de Stephane.
   ```

2. **CLAUDE.md** — la migration dans la liste. Remplacer (1 occurrence, fin de la liste des migrations) :
   ```
   . AVANT d'appliquer une migration :
   ```
   par :
   ```
   , `033_account_deletion` (PRIV-07, RGPD : les six cles vers `auth.users` sans regle (`distributors.added_by` / `modified_by`, `products.modified_by`, `distributor_photos.user_id` / `modified_by`, `reports.user_id`) passent en ON DELETE SET NULL : un compte se supprime, ses contributions restent sans auteur, ses donnees propres (profil, avis, demandes et statut d'exploitant, blocage, admin) partent en cascade ; push_subscribe : un reabonnement sans compte retire le compte de l'abonnement (PRIV-06) ; garde : la migration echoue si une cle de `public` vers `auth.users` reste sans regle ; supprimer un compte = `delete from auth.users` en postgres SANS jeton, jamais avec le jeton du membre, mode d'emploi en fin de fichier et dans `docs/stories/PRIV-07.md`). AVANT d'appliquer une migration :
   ```
   Attention : le texte remplacé commence par le **point** qui suit la parenthèse de la dernière
   migration listée ; le texte de remplacement commence par une **virgule**.

## Tests

### Test — base (intégration, vraie base, transactions annulées)
- **Fichier** : `tests/integration/db.test.js`. **Nouveau bloc**, inséré juste **AVANT** la ligne
  `describe('base : rien n’a ete ecrit par ces tests', { skip: SKIP }, () => {` (avec une ligne vide après le bloc) :
  ```js
  // PRIV-07 (033) : un compte peut etre supprime (RGPD)
  describe('base : suppression d’un compte (033)', { skip: SKIP }, () => {
      const ITEST_EMAIL = 'itest-suppression@distrimatch.test';
      // Compte cree DANS la transaction annulee (modele de 015) ; v_new est declare par le test
      const CREATE_USER = `insert into auth.users (
              instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
              raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
              confirmation_token, email_change, email_change_token_new, recovery_token)
          values ('00000000-0000-0000-0000-000000000000', v_new, 'authenticated', 'authenticated',
              '${ITEST_EMAIL}', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(),
              '', '', '', '');`;
      const AS_NEW = `perform set_config('request.jwt.claims', json_build_object('sub', v_new, 'role', 'authenticated')::text, true); set local role authenticated;`;
      // Retour en postgres SANS jeton : comme le SQL Editor (gardes et audit sans auteur)
      const AS_POSTGRES = `perform set_config('request.jwt.claims', '', true); reset role;`;

      it('plus aucune cle de public vers auth.users sans regle ON DELETE', async () => {
          const [r] = await query(`select coalesce(string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ' order by c.conname), '') as restantes
              from pg_constraint c
              where c.contype = 'f' and c.confrelid = 'auth.users'::regclass
                and c.connamespace = 'public'::regnamespace and c.confdeltype not in ('n', 'c')`);
          assert.equal(r.restantes, '');
      });

      it('un compte qui a ajoute une fiche, signale, change un prix, renomme un produit et signale un probleme se supprime ; ses contributions restent sans auteur', async () => {
          const p = await probe(`${CREATE_USER}
              select id into v_product from products where distributor_id = '${DEMO}' and removed_at is null order by id limit 1;
              insert into reports (user_id, distributor_id, report_type) values (v_new, '${DEMO}', 'itest');
              ${AS_NEW}
              insert into distributors (id, name, type, lat, lng, is_user_added, added_by)
              values ('itest-suppr', 'Fiche itest', 'pizza', 43.49, -1.47, true, v_new);
              perform confirm_availability('${DEMO}', '${DEVICE}', jsonb_build_array(jsonb_build_object('product_id', v_product, 'state', 'available')), 'working');
              -- Depuis PRIV-01 (029), seul un changement de prix pose encore distributors.modified_by
              update distributors set price_range = price_range where id = '${DEMO}';
              update products set name = name where id = v_product;
              ${AS_POSTGRES}
              v_before := json_build_object(
                  'fiche', (select added_by = v_new from distributors where id = 'itest-suppr'),
                  'demo_modifiee', (select modified_by = v_new from distributors where id = '${DEMO}'),
                  'produit', (select modified_by = v_new from products where id = v_product),
                  'signaux', (select count(*) from availability_signals where user_id = v_new),
                  'journal', (select count(*) from product_edits where user_id = v_new)
              )::text;
              -- Ids des signaux du compte (depuis PRIV-05, device_hash ne distingue plus les appareils)
              v_signals := array(select id from availability_signals where user_id = v_new);
              delete from auth.users where id = v_new;
              r := v_before || '|' || json_build_object(
                  'fiche_reste', (select count(*) from distributors where id = 'itest-suppr' and added_by is null),
                  'demo_sans_auteur', (select modified_by is null from distributors where id = '${DEMO}'),
                  'produit_sans_auteur', (select modified_by is null from products where id = v_product),
                  'signaux_lies', (select count(*) from availability_signals where user_id = v_new),
                  'signaux_restes', (select count(*) from availability_signals where id = any(v_signals) and user_id is null),
                  'journal_lie', (select count(*) from product_edits where user_id = v_new),
                  'signalement_reste', (select count(*) from reports where report_type = 'itest' and user_id is null),
                  'profil', (select count(*) from profiles where id = v_new)
              )::text`,
              'v_new uuid := gen_random_uuid(); v_product bigint; v_before text; v_signals bigint[];');
          assert.ok(p.reachedEnd, p.message);
          const [before, after] = p.result.split('|').map(s => JSON.parse(s));
          assert.deepEqual(before, { fiche: true, demo_modifiee: true, produit: true, signaux: 2, journal: 1 });
          assert.deepEqual(after, {
              fiche_reste: 1, demo_sans_auteur: true, produit_sans_auteur: true,
              signaux_lies: 0, signaux_restes: 2, journal_lie: 0, signalement_reste: 1, profil: 0
          });
      });

      it('push_subscribe sans compte retire le compte d’un abonnement existant (PRIV-06)', async () => {
          const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/itest-033';
          const sub = `push_subscribe('${ENDPOINT}', 'p256dh-itest', 'auth-itest', '{}', '{}', null, null, 'UTC')`;
          const p = await probe(`${AS_USER} perform ${sub};
              set local role postgres; v_avant := (select (user_id = ${USER})::text from push_subscriptions where endpoint = '${ENDPOINT}');
              ${AS_ANON} perform ${sub};
              set local role postgres;
              r := v_avant || '|' || (select coalesce(user_id::text, 'null') from push_subscriptions where endpoint = '${ENDPOINT}')`, 'v_avant text;');
          assert.ok(p.reachedEnd, p.message);
          assert.equal(p.result, 'true|null');
      });

      it('rien n’est reste : aucun compte « itest-suppression »', async () => {
          const [r] = await query(`select count(*)::int as n from auth.users where email = '${ITEST_EMAIL}'`);
          assert.equal(r.n, 0);
      });
  });

  ```
- **Doit échouer avant l'application de 033** : le 1er test liste les 6 clés
  (`distributor_photos.distributor_photos_modified_by_fkey, ...`) ; le 2e s'arrête sur
  `delete from auth.users` en **23503** (`violates foreign key constraint "distributors_..._fkey"`) ;
  le 3e (`push_subscribe`) donne `true|<uuid du compte>` au lieu de `true|null`.
  Le dernier (« rien n'est reste ») passe avant comme après (la transaction est toujours annulée). **L'exécutant ne peut pas
  les faire passer** (il n'applique pas la migration) : il lance une fois
  `node --test --test-name-pattern="suppression" tests/integration/db.test.js`, constate l'échec
  pour ces raisons, colle la sortie dans la PR. Claude les fait passer après application.
- Tous les **autres** tests de `db.test.js` restent verts. Sans jeton dans `.env.local`, tout le
  fichier est sauté : le noter dans la PR, ne rien contourner.

## Vérification (dans l'ordre)
```bash
grep -c "on delete set null" supabase/033_account_deletion.sql    # 6
grep -cE "^(begin|commit);" supabase/033_account_deletion.sql      # 2
diff --strip-trailing-cr <(sed -n '/^create or replace function public.push_subscribe(/,/^grant execute on function public.push_subscribe/p' supabase/026_push_subscriptions_limits.sql) <(sed -n '/^create or replace function public.push_subscribe(/,/^grant execute on function public.push_subscribe/p' supabase/033_account_deletion.sql)
# attendu : exactement 1 bloc (« 49c49 »), la ligne user_id ; toute autre différence = recopie inexacte, corriger
grep -c "033_account_deletion" CLAUDE.md                           # 1 (la ligne de la liste des migrations)
npm test                                                           # tout vert (aucun JS ne change)
node --test --test-name-pattern="suppression" tests/integration/db.test.js
# AVANT 033 : « plus aucune cle... » et « un compte qui a ajoute... » échouent (raisons ci-dessus),
# « rien n'est reste » passe. Coller la sortie dans la PR.
git diff --stat                                                    # seuls : supabase/033_account_deletion.sql, tests/integration/db.test.js, CLAUDE.md, BACKLOG.md
```
Pas de `npm run test:functional` ni de bump `?v=` : aucun fichier du front ne change.

## Avant la fusion (Claude, modèle principal — jamais l'exécutant)
1. **Relecture** du SQL (noms de clés, règles, garde) et du test par un modèle plus fort.
2. **État réel des clés** (noms créés au fil des migrations ou au tableau de bord, autres schémas) :
   ```bash
   node scripts/supabase-sql.mjs -e "select c.connamespace::regnamespace as schema, c.conrelid::regclass as table_, c.conname, c.confdeltype from pg_constraint c where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and c.connamespace <> 'auth'::regnamespace order by 1, 2, 3;"
   ```
   Attendu, schéma `public`, `confdeltype = a` : exactement `distributor_photos_modified_by_fkey`,
   `distributor_photos_user_id_fkey`, `distributors_added_by_fkey`, `distributors_modified_by_fkey`,
   `products_modified_by_fkey`, `reports_user_id_fkey` ; toutes les autres en `c` ou `n`.
   - Un **nom différent** : corriger le nom dans 033 sur la branche de la PR (commit), puis reprendre.
   - Une clé d'un **autre schéma** (ex. `storage.objects`) en `a` : ne rien changer, prévenir Stéphane
     (un compte propriétaire de fichiers ne se supprimerait pas).
3. **Essai à blanc** (rien ne reste) :
   ```bash
   sed -E 's/^commit;(\r?)$/rollback;\1/' supabase/033_account_deletion.sql > "<scratchpad>/033-essai.sql"
   grep -c "^rollback;" "<scratchpad>/033-essai.sql"               # 1 (le fichier peut etre en CRLF)
   node scripts/supabase-sql.mjs "<scratchpad>/033-essai.sql"        # aucune erreur (la garde n'a rien levé)
   ```
4. **Appliquer** : `node scripts/supabase-sql.mjs supabase/033_account_deletion.sql`, puis refaire la
   requête du point 2 : plus aucune ligne `public` en `a`.
5. **Tests base restreints** (l'API de gestion limite le débit : pas tout `db.test.js` plusieurs fois) :
   `node --test --test-name-pattern="suppression|aucune trace" tests/integration/db.test.js` : tout vert.
6. **Fusionner** (aucun front concerné : l'ordre application / déploiement est sans effet).

## Mode d'emploi : supprimer un compte à la demande d'un membre
À faire **par Claude**, uniquement sur demande de Stéphane (qui a vérifié que la demande vient bien
de l'adresse e-mail du compte). Toujours en postgres **sans jeton** (`scripts/supabase-sql.mjs`).
1. **Bilan** (lecture seule, remplacer l'e-mail) :
   ```bash
   node scripts/supabase-sql.mjs -e "with u as (select id from auth.users where email = 'membre@exemple.fr') select (select count(*) from u) as compte, (select count(*) from app_admins where user_id in (select id from u)) as admin, (select count(*) from distributor_operators where user_id in (select id from u)) as exploitant, (select count(*) from distributors where added_by in (select id from u)) as fiches_ajoutees, (select count(*) from distributors where added_by in (select id from u) and review_status = 'pending') as fiches_en_attente, (select count(*) from availability_signals where user_id in (select id from u)) as signaux, (select count(*) from reviews where user_id in (select id from u)) as avis, (select count(*) from operator_requests where user_id in (select id from u)) as demandes;"
   ```
   - `compte` doit valoir 1 (sinon : e-mail inexact, s'arrêter).
   - `admin` = 1 : **s'arrêter** et demander à Stéphane.
   - `exploitant` > 0 : prévenir Stéphane (les fiches perdent le tag « Exploitant vérifié »).
   - `e2e@distrimatch.test` : ne jamais le supprimer sans accord (compte des tests E2E, 015).
2. **Supprimer** :
   ```bash
   node scripts/supabase-sql.mjs -e "delete from auth.users where email = 'membre@exemple.fr' returning id;"
   ```
   Une ligne renvoyée. Une erreur 23503 = une clé oubliée : ne rien forcer, la signaler.
3. **Contrôle** : `node scripts/supabase-sql.mjs -e "select count(*) from auth.users where email = 'membre@exemple.fr';"` → 0.
4. **Compte rendu à Stéphane** : effacés (e-mail, sessions, profil, avis, demandes et statut
   d'exploitant, blocage éventuel) ; restés sans auteur (fiches ajoutées, signaux, produits,
   signalements, messages échangés avec l'équipe au sujet des fiches ajoutées
   (`distributor_review_messages`, liés à la fiche et non au compte) ; une fiche encore en attente reste dans la console admin, à publier ou refuser) ;
   sur le téléphone du membre, favoris et réglages restent locaux (« Effacer mes données » dans l'app).

## Hors périmètre
- Bouton « Supprimer mon compte » en libre-service : demanderait une fonction serveur et un
  déclencheur d'audit qui n'écrase pas `modified_by` pendant une action de clé étrangère
  (ex. sortir si `pg_trigger_depth() > 1`). Pas maintenant.
- Fichiers Storage des photos (inactives en V1) : non supprimés par la base ; à traiter à la main
  si une demande en concerne un jour.
- Changer une règle déjà posée (SET NULL / CASCADE du tableau) : décision documentée, ne pas toucher.
- Toute modification de `js/` ou de `index.html`.

## Pièges connus
- **Ne jamais exécuter la migration** (ni SQL Editor, ni `scripts/supabase-sql.mjs`) : les tests
  « suppression d'un compte (033) » échouent tant qu'elle n'est pas appliquée, c'est attendu.
- Garder `begin;` / `commit;` autour de toute la migration : la garde finale doit pouvoir tout annuler.
- `alter table if exists ... drop constraint if exists ..., add constraint ...` : une seule instruction
  par clé (les deux sous-commandes ensemble), ne pas les séparer.
- Dans le test, revenir en postgres avec `AS_POSTGRES` (efface aussi le jeton) **avant** le `delete` :
  avec le jeton du compte, le déclencheur d'audit remettrait son id dans `modified_by` et la
  suppression échouerait ; un simple `reset role` ne suffit pas.
- `v_new` est déclaré dans le 2e argument de `probe` (`'v_new uuid := gen_random_uuid(); ...'`) ;
  `CREATE_USER` et `AS_NEW` s'en servent. Ne pas réutiliser `USER` / `AS_USER` (compte le plus ancien)
  **dans le test de suppression seulement** ; le test `push_subscribe` utilise au contraire
  `AS_USER` / `AS_ANON` / `USER`, c'est voulu.
- Section 4 de 033 : recopier `push_subscribe` depuis 026 **à l'identique** (y compris `$$`, le
  `revoke` et le `grant`), seule la ligne `user_id` change ; le contrôle `diff` de « Vérification »
  doit montrer un seul bloc.
- Le résultat `r` assemble deux JSON séparés par `|` : ne pas mettre de `|` dans les textes du test.
- `signaux: 2` : un signal produit + un signal d'état (`'working'`) dans le même appel. Les signaux
  sont retrouvés après suppression par leurs ids (`v_signals`), pas par `device_hash` (PRIV-05 le
  remplace par `'account'`).
- `distributors.modified_by` n'est plus posé par un signal depuis PRIV-01 (029) : le test change donc
  le niveau de prix (`update distributors set price_range = price_range ...`), seul geste d'un membre
  qui le pose encore. Ne pas retirer cette ligne.
- Commentaires SQL dans les gabarits du test : sans apostrophe ni guillemet (ils sont dans un bloc `do $$`).
- Fichiers en CRLF : outil Edit pour `db.test.js` et `CLAUDE.md` ; le nouveau `.sql` avec Write.

## Terminé quand
- [ ] Contrôles passés ; test écrit (les deux premiers cas échouent avant 033 pour la raison annoncée, sortie collée dans la PR)
- [ ] Vérifications vertes (hors cas « suppression d'un compte (033) », attendus rouges avant 033)
- [ ] Captures iPhone : non (aucun changement visible)
- [ ] Story cochée dans BACKLOG.md (si elle n'y figure pas : le noter dans la PR), PR ouverte (non fusionnée),
      mention « migration 033 à appliquer par Claude avant fusion »

## Modèle de PR
**Titre** : `fix(vie-privee): un compte peut etre supprime (migration 033)`

**Corps** : constat corrigé ; cause (six clés vers `auth.users` sans règle `ON DELETE`, dont
`distributors.modified_by` posée par chaque signal) ; correction (SET NULL sur ces six clés,
garde finale, tableau des règles inchangées et pourquoi) ; mode d'emploi de suppression
(renvoi à la fiche) ; test ajouté ; sortie de `npm test` et de `db.test.js` restreint (cas 033
rouges avant application, attendu) ; **« Migration 033 à appliquer par Claude après relecture,
avant fusion »** ; points à relire : SET NULL (et non CASCADE) pour `distributor_photos.user_id`
et `reports.user_id`, noms réels des clés sur la base, recopie de `push_subscribe` (sortie du `diff`).
