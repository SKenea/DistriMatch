# PRIV-03 — Tables héritées : plus aucun identifiant de compte lisible

- **Lot** : 2. Vie privée · **Gravité** : faible · **Niveau conseillé** : medium, relecture par un modèle plus fort avant fusion (SQL de droits)
- **Prérequis** : **PRIV-02 fusionnée** sur master (migration 030 appliquée). Branche créée à partir
  de `master` **à jour** (`git switch master && git pull` d'abord). Ordre du lot 2 :
  PRIV-01 → PRIV-02 → **PRIV-03** → PRIV-05 → PRIV-06 → PRIV-07 → PRIV-04.
- **Branche** : `fix/tables-heritees-privees` · **Taille** : 1 migration SQL + 1 fichier de tests + `CLAUDE.md`. Aucun fichier JS.
- **Constats couverts** (rapport du 2026-10-21) :
  - Tables profiles, reports et votes lisibles par tous avec l'identifiant de compte (le correctif 023 n'a couvert que les signaux) — `supabase/001_schema.sql:90`
  - Identifiants de compte publics (avis, ajouts, modifications, profils) — `supabase/016_reviews.sql:59` (partie **profils**, **signalements**, **votes** et **photos** : `distributor_photos.user_id` — `supabase/003_photos.sql:19` — et `distributor_photos.modified_by` — `supabase/006_audit_trail.sql:36`)

> **Application sur la vraie base** : c'est **Claude (modèle principal)** qui applique la migration
> 031, **après relecture**, puis fusionne. L'exécutant n'exécute **jamais** de SQL sur la base
> (ni `node scripts/supabase-sql.mjs`, ni SQL Editor). Voir « Avant la fusion (Claude) ».

## But
Plus personne ne télécharge la liste des comptes (`profiles`), ni ne relie un signalement, un vote
ou une photo à un compte : ces tables héritées ne sont plus lisibles par un visiteur, et un membre
n'y voit que ses propres lignes.

## User story
En tant que membre, je veux que mon compte (identifiant, date d'inscription, signalements, votes,
photos) ne soit lisible par personne d'autre, afin que mon activité passée ne puisse pas être
reconstituée à partir de tables que l'app n'utilise plus.

**Critères d'acceptation**
- [ ] Un visiteur ne lit ni `profiles`, ni `reports`, ni `votes` (42501).
- [ ] Un compte connecté ne lit que **sa** ligne de `profiles` et **ses** lignes de `reports` / `votes`.
- [ ] Aucune écriture directe par l'API dans `profiles`, `reports`, `votes` (42501).
- [ ] `distributor_photos` : `user_id` et `modified_by` illisibles (42501) ; un visiteur ne voit que
      les photos `approved` d'une fiche **publiée**.
- [ ] L'app marche comme avant (`npm test` vert ; aucun module JS ne lit ces tables, voir ci-dessous).
- [ ] La création d'un compte (déclencheur `handle_new_user`) n'est pas touchée.

## Ce qui est déjà tranché (ne pas refaire l'analyse)
- **Le front ne lit ni `profiles`, ni `reports`, ni `votes`** : aucun `from('profiles' | 'reports' |
  'votes')` dans `js/`. La modale Signaler (`js/activity.js:74`, chat inactif) appelle la RPC
  `submit_report`, déjà retirée de l'API par 028 ; `cast_vote` aussi. Les points du profil sont
  locaux (`snackmatch_user`). Donc : **rien pour `anon`**, lecture de ses propres lignes pour
  `authenticated`, plus aucun droit d'écriture (INSERT / UPDATE / DELETE) : les règles d'écriture
  de 001 (« Creation signalements », « Creation votes », « Modification profil perso ») restent
  en base mais n'ont plus d'effet sans droit. `handle_new_user`, `submit_report` et `cast_vote` sont
  `SECURITY DEFINER` (propriétaire `postgres`) : ces droits ne les concernent pas.
- **`distributor_photos`** est lue par `js/distributor.js:42` et `:70` (`loadDistributorPhotos`,
  `loadPhotoThumbnails`), seulement si `FEATURES.photos` (faux en V1). Colonnes demandées :
  `distributor_id`, `storage_path`, `status`, `created_at`. D'où la lecture par colonne
  `(id, distributor_id, storage_path, status, created_at)` : **aucune modification du JS**.
- **Règle de lecture des photos** : `status = 'approved' and distributor_is_published(distributor_id)`.
  La fonction (022, `SECURITY DEFINER`) évite de dépendre des droits par colonne posés sur
  `distributors` par PRIV-01 (une sous-requête dans une règle est contrôlée avec les droits de
  l'appelant). Règle lisible par `anon` qui appelle une fonction : `grant execute ... to anon`
  obligatoire (incident du 2026-10-02, voir `CLAUDE.md`).
- **Règles créées au tableau de bord** : la base en a déjà eu qui n'étaient dans aucune migration
  (cf. 025). La migration retire donc **toutes** les règles `SELECT` et `ALL` de ces 4 tables,
  quel que soit leur nom (bloc `do $$`), avant de poser les nouvelles. Rejouable.

## Avant de coder
**Lire en entier** : `supabase/001_schema.sql` lignes 36-104 et 140-153, `supabase/003_photos.sql`,
`supabase/006_audit_trail.sql` lignes 25-37, `supabase/022_distributor_review.sql` lignes 66-72,
`supabase/028_db_hardening.sql` lignes 1-66, `supabase/030_reviews_author_private.sql` (modèle) ;
`tests/integration/db.test.js` lignes 1-55 et le bloc `base : petites failles fermees (028)`.

**Réutiliser** (ne pas réécrire) : `distributor_is_published(text)` (022) ; `probe` / `query` /
`AS_USER` / `AS_ANON` / `USER` / `DEMO` (`tests/integration/db.test.js`).

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
ls supabase/                                                      # dernier fichier numéroté : 030_reviews_author_private.sql, aucun 031_*
grep -n "profiles\|reports\|votes\|distributor_photos" supabase/029_*.sql supabase/030_*.sql   # aucun résultat
grep -rn "from('profiles')\|from('reports')\|from('votes')" js/   # aucun résultat
grep -rn "from('distributor_photos')" js/
# attendu exactement 3 lignes : add-distributor.js:218 (insert, photos inactives et fermées par 028),
# distributor.js:42 et distributor.js:70 (lectures)
grep -n "\.select('storage_path, status, created_at')\|\.select('distributor_id, storage_path, created_at')" js/distributor.js   # 2 lignes
grep -n "create or replace function distributor_is_published(p_id text) returns boolean" supabase/022_distributor_review.sql   # 1 ligne
grep -n "language sql stable security definer set search_path = public as" supabase/022_distributor_review.sql               # au moins 1 ligne (dont celle qui suit la précédente)
grep -n 'CREATE POLICY "Lecture publique profils"' supabase/001_schema.sql                    # 1 ligne (90)
grep -n 'CREATE POLICY "Lecture publique photos"' supabase/003_photos.sql                     # 1 ligne (19)
grep -n "values ('itest-kpi', 'Fiche itest', 'pizza', 43.49, -1.47, true, \${USER});" tests/integration/db.test.js   # 1 ligne (forme d'ajout de fiche à reprendre)
grep -n "describe('base : rien n’a ete ecrit par ces tests'" tests/integration/db.test.js     # 1 ligne
grep -c ". AVANT d'appliquer une migration :" CLAUDE.md          # 1
grep -c 'Tables utilisees par le front : `distributors`, `products`, `distributor_photos`, `reports`, `votes`, `reviews`' CLAUDE.md   # 1
```
Les numéros de ligne peuvent avoir bougé (PRIV-01, PRIV-02) : seul compte le nombre de lignes trouvées.
Si la ligne `itest-kpi` a changé de forme (PRIV-01), utiliser **la même forme** pour `itest-photo`
dans le test ci-dessous (seuls l'id et le nom de fiche diffèrent) et le noter dans la PR.

## Étapes

1. **supabase/031_legacy_tables_private.sql** — nouveau fichier (outil Write), contenu **exact** :
   ```sql
   -- ============================================================================
   -- 031 : tables heritees : plus aucun identifiant de compte lisible (PRIV-03)
   -- ============================================================================
   -- Revue du 2026-10-21. Avant : profiles, reports et votes (001) etaient lisibles
   -- par tous (USING (true), toutes les colonnes) : liste de tous les comptes avec
   -- leur date d'inscription, chaque signalement et chaque vote relie a son compte.
   -- 023 ne l'avait corrige que pour les signaux. distributor_photos (003, 006)
   -- exposait aussi user_id et modified_by, et les photos en attente ou refusees.
   -- Le front ne lit aucune de ces tables (photos inactives, FEATURES.photos =
   -- false ; la modale Signaler appelle submit_report, fermee par 028).
   -- Apres :
   --   1. Toutes les regles de lecture (SELECT, ALL) de ces 4 tables sont retirees,
   --      celles des migrations comme celles creees au tableau de bord (cf. 025).
   --   2. profiles / reports / votes : rien pour anon ; un compte connecte ne lit
   --      que ses propres lignes ; plus aucune ecriture directe par l'API. Les
   --      fonctions SECURITY DEFINER (handle_new_user, submit_report, cast_vote)
   --      ne dependent pas de ces droits. Les regles d'ecriture de 001 restent
   --      mais n'ont plus d'effet sans droit.
   --   3. distributor_photos : lecture sans user_id ni modified_by (droits par
   --      colonne), seulement les photos approuvees d'une fiche publiee.
   --      distributor_is_published() est appelee par une regle lisible par anon :
   --      grant execute a anon obligatoire (incident du 2026-10-02, cf. 022).
   -- Une seule transaction (begin / commit). Rejouable.
   -- Execution (Claude, apres relecture) :
   --   node scripts/supabase-sql.mjs supabase/031_legacy_tables_private.sql
   -- ============================================================================

   begin;

   -- ---------------------------------------------------------------------------
   -- 1. Regles de lecture existantes retirees (quel que soit leur nom)
   -- ---------------------------------------------------------------------------
   do $$
   declare
     p record;
   begin
     for p in
       select tablename, policyname from pg_policies
        where schemaname = 'public'
          and tablename in ('profiles', 'reports', 'votes', 'distributor_photos')
          and cmd in ('SELECT', 'ALL')
     loop
       execute format('drop policy %I on public.%I', p.policyname, p.tablename);
       raise notice 'PRIV-03 : regle retiree : %.%', p.tablename, p.policyname;
     end loop;
   end $$;

   -- ---------------------------------------------------------------------------
   -- 2. profiles, reports, votes : ses propres lignes, en lecture seulement
   -- ---------------------------------------------------------------------------
   revoke all on public.profiles, public.reports, public.votes from anon, authenticated;
   grant select on public.profiles, public.reports, public.votes to authenticated;

   create policy "Lecture de son profil" on public.profiles for select to authenticated
     using (id = auth.uid());
   create policy "Lecture de ses signalements" on public.reports for select to authenticated
     using (user_id = auth.uid());
   create policy "Lecture de ses votes" on public.votes for select to authenticated
     using (user_id = auth.uid());

   -- ---------------------------------------------------------------------------
   -- 3. distributor_photos : sans auteur, photos approuvees d'une fiche publiee
   -- (un REVOKE au niveau de la table retire aussi les droits par colonne poses)
   -- ---------------------------------------------------------------------------
   revoke select on public.distributor_photos from anon, authenticated;
   grant select (id, distributor_id, storage_path, status, created_at)
     on public.distributor_photos to anon, authenticated;
   grant execute on function public.distributor_is_published(text) to anon, authenticated;
   create policy "Lecture publique photos" on public.distributor_photos for select
     using (status = 'approved' and distributor_is_published(distributor_id));

   notify pgrst, 'reload schema';   -- envoye au commit

   commit;

   -- ============================================================================
   -- VERIFICATION (Claude)
   -- select tablename, policyname, cmd, roles::text from pg_policies
   --  where schemaname = 'public' and tablename in ('profiles', 'reports', 'votes', 'distributor_photos')
   --  order by 1, 2;
   -- -> SELECT : « Lecture de son profil », « Lecture de ses signalements »,
   --    « Lecture de ses votes », « Lecture publique photos » ; plus les regles
   --    d'ecriture de 001 (sans effet, aucun droit d'ecriture)
   -- ============================================================================
   ```

2. **CLAUDE.md** — documenter (deux remplacements, texte sans accents comme le reste).
   a) Liste des migrations, avant (morceau unique) :
   ```
   . AVANT d'appliquer une migration :
   ```
   après :
   ```
   , `031_legacy_tables_private` (PRIV-03 : `profiles` / `reports` / `votes` illisibles par anon, un compte ne lit que ses lignes, plus aucune ecriture directe par l'API ; `distributor_photos` lisible sans `user_id` ni `modified_by`, seulement les photos `approved` d'une fiche publiee (`distributor_is_published`, executable par anon) ; toutes les regles de lecture precedentes retirees, y compris celles du tableau de bord). AVANT d'appliquer une migration :
   ```
   b) Tables du front, avant (morceau unique) :
   ```
   Tables utilisees par le front : `distributors`, `products`, `distributor_photos`, `reports`, `votes`, `reviews`
   ```
   après :
   ```
   Tables utilisees par le front : `distributors`, `products`, `distributor_photos` (photos inactives), `reviews`
   ```

Aucun fichier de `js/` ne change : **pas** de montée de `?v=` dans `index.html`.

## Tests

### Test — base (intégration, vraie base, transactions annulées)
- **Fichier** : `tests/integration/db.test.js`.
- **Nouveau bloc**, inséré juste **AVANT** la ligne
  `describe('base : rien n’a ete ecrit par ces tests', { skip: SKIP }, () => {` :
  ```js
  // PRIV-03 (031) : tables heritees : plus aucun identifiant de compte lisible
  describe('base : tables heritees privees (031)', { skip: SKIP }, () => {
      const OTHER = `(select id from auth.users where id <> ${USER} order by created_at limit 1)`;

      it('un visiteur ne lit ni profiles, ni reports, ni votes (42501)', async () => {
          for (const table of ['profiles', 'reports', 'votes']) {
              const p = await probe(`${AS_ANON} perform count(*) from ${table}`);
              assert.equal(p.reachedEnd, false, table);
              assert.equal(p.code, '42501', table);
          }
      });

      it('un compte ne lit que ses propres lignes de profiles, reports et votes', async () => {
          const p = await probe(`
              insert into profiles (id) values (${USER}) on conflict (id) do nothing;
              insert into reports (user_id, distributor_id, report_type)
                values (${USER}, '${DEMO}', 'itest'), (${OTHER}, '${DEMO}', 'itest');
              insert into votes (user_id, report_id, vote_type)
                select user_id, id, 'confirm' from reports where report_type = 'itest';
              ${AS_USER}
              r := json_build_object(
                  'mon_profil', (select count(*) from profiles where id = ${USER}),
                  'profils_autres', (select count(*) from profiles where id <> ${USER}),
                  'signalements_itest', (select count(*) from reports where report_type = 'itest'),
                  'signalements_autres', (select count(*) from reports where user_id <> ${USER}),
                  'votes_autres', (select count(*) from votes where user_id <> ${USER})
              )::text`);
          assert.ok(p.reachedEnd, p.message);
          assert.deepEqual(JSON.parse(p.result),
              { mon_profil: 1, profils_autres: 0, signalements_itest: 1, signalements_autres: 0, votes_autres: 0 });
      });

      it('aucune ecriture directe dans profiles, reports, votes (42501)', async () => {
          for (const write of [
              `insert into reports (user_id, distributor_id, report_type) values (${USER}, '${DEMO}', 'itest')`,
              `update profiles set points = 999999 where id = ${USER}`,
              `insert into votes (user_id, report_id, vote_type) values (${USER}, 1, 'confirm')`
          ]) {
              const p = await probe(`${AS_USER} ${write}`);
              assert.equal(p.reachedEnd, false, write);
              assert.equal(p.code, '42501', write);
          }
      });

      it('photos : ni user_id ni modified_by lisibles ; seulement les photos approuvees d’une fiche publiee', async () => {
          for (const role of [AS_ANON, AS_USER]) {
              for (const col of ['user_id', 'modified_by']) {
                  const p = await probe(`${role} perform ${col} from distributor_photos limit 1`);
                  assert.equal(p.code, '42501', col);
              }
          }
          const p = await probe(`
              insert into distributor_photos (distributor_id, user_id, storage_path, status) values
                ('${DEMO}', ${USER}, 'itest/approuvee.jpg', 'approved'),
                ('${DEMO}', ${USER}, 'itest/en-attente.jpg', 'pending');
              ${AS_USER} insert into distributors (id, name, type, lat, lng, is_user_added, added_by)
                values ('itest-photo', 'Fiche itest', 'pizza', 43.49, -1.47, true, ${USER});
              perform set_config('request.jwt.claims', '', true); reset role;
              insert into distributor_photos (distributor_id, user_id, storage_path, status)
                values ('itest-photo', ${USER}, 'itest/fiche-en-attente.jpg', 'approved');
              ${AS_ANON}
              r := (select string_agg(storage_path, ',' order by storage_path) from distributor_photos
                     where storage_path like 'itest/%')`);
          assert.ok(p.reachedEnd, p.message);
          assert.equal(p.result, 'itest/approuvee.jpg');
          const [r] = await query(`select
              has_column_privilege('anon', 'public.distributor_photos', 'user_id', 'select') as anon_auteur,
              has_column_privilege('authenticated', 'public.distributor_photos', 'modified_by', 'select') as auth_modif,
              has_column_privilege('anon', 'public.distributor_photos', 'storage_path', 'select') as anon_chemin,
              has_function_privilege('anon', 'public.distributor_is_published(text)', 'execute') as anon_publiee`);
          assert.deepEqual(r, { anon_auteur: false, auth_modif: false, anon_chemin: true, anon_publiee: true });
      });
  });

  ```
- **Doit échouer avant l'application de 031** : les tables sont encore lisibles par tous (le
  visiteur compte les lignes, le compte voit les signalements des autres), un compte peut encore
  insérer un signalement et modifier son profil, `user_id` des photos est lisible et le visiteur
  voit les trois photos de test. Les 4 tests échouent. **L'exécutant ne peut pas les faire passer**
  (il n'applique pas la migration) : il les lance une fois, constate l'échec, colle la sortie dans
  la PR. Tous les **autres** tests de `db.test.js` doivent rester verts.
- Sans jeton dans `.env.local`, tout le fichier est sauté : le noter dans la PR, ne rien contourner.
- Pas de test fonctionnel : aucun écran ne lit ces tables (photos inactives).

## Vérification (dans l'ordre)
```bash
grep -rn "from('profiles')\|from('reports')\|from('votes')" js/   # attendu : aucun résultat (inchangé)
npm test                                                          # tout vert
node --test --test-name-pattern="tables heritees|petites failles" tests/integration/db.test.js
# AVANT 031 : les 4 tests « tables heritees privees (031) » échouent, ceux de 028 sont verts.
# Coller la sortie dans la PR.
git diff --stat                                                   # seuls : supabase/031_legacy_tables_private.sql,
                                                                  # tests/integration/db.test.js, CLAUDE.md (+ BACKLOG.md)
```
(La suite fonctionnelle n'est pas à relancer : aucun fichier du front ne change.)

## Avant la fusion (Claude, modèle principal — jamais l'exécutant)
1. **Relecture** du SQL (règles, droits, bloc `do $$`) par un modèle plus fort.
2. **État réel** (noter la sortie : les `raise notice` de la migration ne remontent pas par l'API de gestion) :
   ```bash
   node scripts/supabase-sql.mjs -e "select tablename, policyname, cmd, roles::text, qual from pg_policies where schemaname = 'public' and tablename in ('profiles', 'reports', 'votes', 'distributor_photos') order by 1, 2;"
   node scripts/supabase-sql.mjs -e "select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where table_schema = 'public' and table_name in ('profiles', 'reports', 'votes', 'distributor_photos') and grantee in ('anon', 'authenticated', 'PUBLIC') group by 1, 2 order by 1, 2;"
   node scripts/supabase-sql.mjs -e "select p.proname, pg_get_userbyid(p.proowner) as proprietaire, p.prosecdef as definer from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('handle_new_user', 'submit_report', 'cast_vote', 'distributor_is_published') order by 1;"
   ```
   Attendu pour la 3e : les 4 fonctions, propriétaire `postgres`, `definer` vrai. Sinon : s'arrêter,
   le dire à Stéphane (la création de compte pourrait dépendre des droits retirés).
3. **Essai à blanc** (rien ne reste) :
   ```bash
   sed 's/^commit;$/rollback;/' supabase/031_legacy_tables_private.sql > "<scratchpad>/031-essai.sql"
   grep -c "^rollback;$" "<scratchpad>/031-essai.sql"              # 1
   node scripts/supabase-sql.mjs "<scratchpad>/031-essai.sql"        # HTTP 201, aucune erreur
   ```
4. **Appliquer** : `node scripts/supabase-sql.mjs supabase/031_legacy_tables_private.sql`, puis
   relancer la 1re requête de l'étape 2 (règles attendues : voir « VERIFICATION » en fin de migration).
5. **Tests base restreints** :
   `node --test --test-name-pattern="tables heritees|petites failles|lectures anonymes|aucune trace" tests/integration/db.test.js` : tout vert.
   **Retour arrière** si un problème apparaît (rétablit les lectures de 001 / 003, sans rouvrir les
   écritures) : écrire dans `<scratchpad>/031-retour.sql` puis l'exécuter avec `node scripts/supabase-sql.mjs` :
   ```sql
   begin;
   drop policy if exists "Lecture de son profil" on public.profiles;
   drop policy if exists "Lecture de ses signalements" on public.reports;
   drop policy if exists "Lecture de ses votes" on public.votes;
   drop policy if exists "Lecture publique photos" on public.distributor_photos;
   grant select on public.profiles, public.reports, public.votes, public.distributor_photos to anon, authenticated;
   create policy "Lecture publique profils" on public.profiles for select using (true);
   create policy "Lecture publique signalements" on public.reports for select using (true);
   create policy "Lecture publique votes" on public.votes for select using (true);
   create policy "Lecture publique photos" on public.distributor_photos for select using (true);
   notify pgrst, 'reload schema';
   commit;
   ```
6. **Fusionner** ensuite (le front ne change pas : pas d'urgence, mais garder master aligné sur la
   base). Après le déploiement Pages : `npm run test:e2e` (aucun test E2E ne lit ces tables :
   vérifie seulement que rien d'autre n'a bougé).

## Hors périmètre
- Supprimer les tables `profiles`, `reports`, `votes` ou les fonctions `submit_report` / `cast_vote`
  (décision produit, à trancher par Stéphane).
- Retirer les règles d'écriture de 001 (sans effet une fois les droits retirés).
- Table `subscriptions` (001, déjà limitée à ses propres lignes) ; stockage `distributor-photos`
  (bucket public, fichiers rangés par compte) : à reprendre à la réactivation des photos.
- `distributors` / `products` (PRIV-01), `reviews` (PRIV-02).
- Ne modifier aucun fichier de `js/`, ni `index.html`.

## Pièges connus
- **Ne jamais exécuter la migration** : les tests « tables heritees privees (031) » échouent tant
  qu'elle n'est pas appliquée, c'est attendu.
- Ne pas écrire la règle des photos avec une sous-requête sur `distributors` : elle serait contrôlée
  avec les droits par colonne de l'appelant (PRIV-01). Garder `distributor_is_published(...)` et son
  `grant execute ... to anon`.
- Le bloc `do $$` retire aussi les règles `ALL` : voulu (les écritures de photos sont fermées
  depuis 028, celles des 3 autres tables le sont ici).
- Dans le test des photos, revenir en postgres avec `perform set_config('request.jwt.claims', '', true); reset role;`
  avant d'insérer la photo de la fiche en attente (comme `AS_POSTGRES` du bloc 025).
- Garder `begin;` / `commit;` autour de toute la migration (l'essai à blanc remplace `commit;`).
- Le nouveau `.sql` avec l'outil Write ; `db.test.js` et `CLAUDE.md` (fins de ligne LF) avec Edit.

## Terminé quand
- [ ] Contrôles passés ; tests base écrits (échouent avant 031, sortie collée dans la PR)
- [ ] Vérifications vertes (hors tests « tables heritees privees (031) », attendus rouges avant 031)
- [ ] Captures iPhone : non (aucun changement visible)
- [ ] Story cochée dans BACKLOG.md (si elle n'y figure pas : le noter dans la PR), PR ouverte
      (non fusionnée), mention « migration 031 à appliquer par Claude avant fusion »

## Modèle de PR
**Titre** : `fix(vie-privee): tables heritees privees, plus aucun identifiant de compte lisible (migration 031)`

**Corps** : constats corrigés (liste ci-dessus) ; cause (règles `USING (true)` de 001 / 003 sur
toutes les colonnes, jamais reprises après 023) ; correction (règles de lecture remplacées, droits
retirés à anon, ses propres lignes pour un compte, photos sans auteur et seulement approuvées sur
fiche publiée) ; ce qui change pour l'utilisateur (rien de visible) ; tests ajoutés ; sortie de
`npm test` et de `db.test.js` (tests 031 rouges avant application, attendu) ;
**« Migration 031 à appliquer par Claude après relecture, avant fusion »** ; points à relire :
retrait des règles par le bloc `do $$`, droits d'écriture retirés, propriétaire des fonctions.
