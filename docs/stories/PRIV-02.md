# PRIV-02 — Avis vraiment anonymes : l'API ne donne plus l'auteur d'un avis

- **Lot** : 2. Vie privée · **Gravité** : moyen · **Niveau conseillé** : medium, relecture par un modèle plus fort avant fusion (SQL de droits)
- **Prérequis** : **PRIV-01 fusionnée** sur master (migration 029 appliquée). Branche créée à partir
  de `master` **à jour** (`git switch master && git pull` d'abord). Ordre du lot 2 :
  PRIV-01 → **PRIV-02** → PRIV-03 → PRIV-05 → PRIV-06 → PRIV-07 → PRIV-04.
- **Branche** : `fix/avis-anonymes` · **Taille** : 1 migration SQL + 1 fichier JS + 2 fichiers de tests + `CLAUDE.md` (+ `index.html`).
  Au-dessus de la limite de 3, **exception acceptée** : la base et le front changent ensemble
  (l'ancien front demande `user_id`, refusé une fois la migration appliquée), à garder dans une seule PR.
- **Constats couverts** (rapport du 2026-10-21) :
  - Identifiants de compte publics (avis, ajouts, modifications, profils) : toute l'activité d'un membre peut être reliée — `supabase/016_reviews.sql:59` (partie **avis** ; `distributors` / `products` : PRIV-01 ; `profiles` / `reports` / `votes` / photos : PRIV-03)
  - La liste publique des avis expose l'UUID de compte de chaque auteur (anonymat de façade) — `js/reviews.js:24`

> **Application sur la vraie base** : c'est **Claude (modèle principal)** qui applique la migration
> 030, **après relecture**, puis fusionne. L'exécutant n'exécute **jamais** de SQL sur la base
> (ni `node scripts/supabase-sql.mjs`, ni SQL Editor). Voir « Avant la fusion (Claude) ».

## But
Un avis affiché « Membre DistriMatch » ne peut plus être relié à un compte : personne (visiteur
ou membre) ne lit plus la colonne `user_id` des avis ni ne liste les avis d'un même compte.

## User story
En tant que membre qui donne son avis sur un distributeur, je veux que personne ne puisse
retrouver mon compte à partir de mes avis, afin de noter librement, y compris un distributeur
concurrent ou voisin.

**Critères d'acceptation**
- [ ] Par l'API, un visiteur comme un compte connecté reçoit un refus (42501) s'il demande `user_id`
      d'un avis ou filtre les avis par `user_id`.
- [ ] Tout le reste d'un avis (`id`, `distributor_id`, `author_name`, `rating`, `body`, `created_at`,
      `updated_at`) et la note (`distributor_ratings`) restent lisibles par un visiteur.
- [ ] La RPC `my_review(p_distributor_id)` rend l'avis du compte connecté sur cette fiche (0 ou 1
      ligne, sans `user_id`) ; refusée sans compte (42501).
- [ ] L'onglet Avis ne demande plus jamais `user_id` ; « Ton avis » (titre, étiquette dans la liste,
      « Modifier mon avis », « Supprimer ») marche comme avant, grâce à `my_review` et à l'id de l'avis.
- [ ] Publier, modifier, supprimer son avis marchent comme avant (tests fonctionnels verts, puis
      E2E connecté vert après le déploiement).

## Ce qui est déjà tranché (ne pas refaire l'analyse)
- **Droits par colonne en lecture** (modèle de 023 pour `availability_signals`) : `revoke select`
  sur la table puis `grant select (colonnes sans user_id)`. Un `REVOKE` au niveau de la table retire
  aussi les droits par colonne déjà posés. Les droits d'écriture de 016 (`INSERT (distributor_id,
  rating, body)`, `UPDATE (rating, body)`, `DELETE`) ne changent pas.
- **Les règles RLS « son propre avis » continuent de marcher** : Postgres ne contrôle les droits
  par colonne que sur les colonnes **écrites dans la requête** (liste du SELECT, `WHERE`,
  `RETURNING`, `SET`). L'expression d'une règle RLS de la table elle-même
  (`USING (user_id = auth.uid())`) n'y est pas soumise. En revanche, une requête du client qui
  contient `user_id` (ex. `.eq('user_id', uid)` ou `update ... where user_id = ...`) est refusée.
  D'où : le front vise **l'id de l'avis** (`.eq('id', ...)`, déjà le cas pour modifier et supprimer),
  jamais `user_id`. Le test base réécrit « on modifie et supprime son avis… » le vérifie.
- **Plus de `.select(COLUMNS).single()` après l'insertion ou la modification** : la ligne rendue
  n'était pas lue (`refreshAfterChange()` relit tout), et sans `.select()` PostgREST ne renvoie
  aucune colonne : aucun doute possible sur les droits de `RETURNING`. Cas limite accepté : modifier
  un avis supprimé entre-temps ailleurs affiche « Avis modifié » puis le formulaire revient à
  « Donne ton avis » (la relecture ne le trouve plus).
- **« Mon avis » = RPC `my_review`** (`SECURITY DEFINER`, `search_path` fixé, `execute` pour
  `authenticated` seulement). Elle rend les mêmes colonnes que `COLUMNS`. Appelée **sans**
  `.maybeSingle()` (le front prend `data[0]`) : pas de dépendance au comportement de l'en-tête
  « objet unique » sur une requête POST.
- **« Ton avis » dans la liste** : reconnu par `rv.id === state.mine.id` (au lieu de
  `rv.user_id === uid`). `fetchPage` et `fetchMine` appellent tous deux `renderReviews()` : la
  liste se marque dès que les deux réponses sont là, quel que soit l'ordre.
- **Autres lecteurs de `reviews`** : `my_activity()` (023) et la fonction serveur `push-notify`
  ne lisent pas `user_id` par l'API (SECURITY DEFINER / service role) ; `tests/e2e/session.mjs`
  lit en postgres. La vue `distributor_ratings` (security_invoker) n'utilise que `distributor_id`
  et `rating` : inchangée.

## Avant de coder
**Lire en entier** : `supabase/016_reviews.sql`, `supabase/023_activity_privacy.sql` (modèle) ;
`js/reviews.js` ; `tests/functional/avis.spec.js` ; `tests/integration/db.test.js` lignes 1-55
et le bloc `describe('base : avis (016)'` (vers les lignes 223-322).

**Réutiliser** (ne pas réécrire) : `probe` / `query` / `AS_USER` / `AS_ANON` / `USER` / `DEMO`
(`tests/integration/db.test.js`), `insertReview` (bloc 016 du même fichier), `routeReviews` /
`openReviewsTab` / `fakeReviews` (`tests/functional/avis.spec.js`), `loginForTest` (`tests/functional/helpers.js`).

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
ls supabase/                                                      # dernier fichier numéroté : 029_*.sql (PRIV-01), aucun 030_*
grep -n "reviews" supabase/029_*.sql                              # aucun résultat (PRIV-01 ne touche pas aux avis ; sinon s'arrêter)
grep -n "GRANT SELECT ON reviews TO anon, authenticated;" supabase/016_reviews.sql   # 1 ligne (59)
grep -rln "reviews" supabase/                                     # exactement : 016_reviews.sql, 022_distributor_review.sql, 023_activity_privacy.sql
grep -rn "my_review" js/ tests/ supabase/                         # aucun résultat
grep -n "user_id" js/reviews.js
# attendu exactement 4 lignes : 24 (const COLUMNS), 112 (.eq('user_id', uid)), 184 et 186 (rv.user_id === uid)
grep -n "\.select(COLUMNS)" js/reviews.js                         # 3 lignes : 110, 265, 266
grep -n "user_id\|TEST_UID" tests/functional/avis.spec.js
# attendu exactement 6 lignes : 12 (const TEST_UID), 20, 27, 36, 55, 140
grep -n "user_id = auth.uid()\|user_id is null" tests/integration/db.test.js
# attendu (bloc 016) : 235, 236, 248, 249, 252, 255 ; plus 301 (« demo_sur_reel », lu en postgres : on n'y touche pas)
grep -n "// EPIC-T18 (020) : exploitants, demandes, page admin, priorite des signaux" tests/integration/db.test.js   # 1 ligne
grep -n "test('refus de la base : le message dit la raison" tests/functional/avis.spec.js   # 1 ligne (161)
grep -o '"./js/app.js": "./js/app.js?v=[0-9]*"' index.html         # noter la valeur V
grep -c ". AVANT d'appliquer une migration :" CLAUDE.md          # 1
grep -c "auteur « Membre DistriMatch » force |" CLAUDE.md         # 1
grep -c 'Aides pures `describeRating` / `validateReview` / `describeReviewError` (utils.js)' CLAUDE.md   # 1
```
Les numéros de ligne peuvent avoir bougé (PRIV-01) : seul compte le nombre de lignes trouvées.

## Étapes

1. **supabase/030_reviews_author_private.sql** — nouveau fichier (outil Write), contenu **exact** :
   ```sql
   -- ============================================================================
   -- 030 : avis vraiment anonymes : l'API ne lit plus l'auteur d'un avis (PRIV-02)
   -- ============================================================================
   -- Revue du 2026-10-21. Avant : « GRANT SELECT ON reviews TO anon, authenticated »
   -- (016) rendait toutes les colonnes lisibles, dont user_id : un avis affiche
   -- « Membre DistriMatch » etait relie a son compte, et n'importe qui listait
   -- tous les avis d'un meme compte (filtre user_id=eq.<uuid>).
   -- Apres :
   --   1. Lecture par colonne (modele de 023) : toutes les colonnes sauf user_id,
   --      pour anon et authenticated. Ecritures inchangees (016). Les regles RLS
   --      « son propre avis » (user_id = auth.uid()) marchent toujours : Postgres
   --      ne controle pas les droits par colonne dans l'expression d'une regle de
   --      la table elle-meme. Le front vise l'id de l'avis, jamais user_id.
   --   2. my_review(p_distributor_id) : l'avis du compte connecte sur une fiche
   --      (0 ou 1 ligne, sans user_id). Seule voie pour retrouver « mon avis ».
   -- Une seule transaction (begin / commit). Rejouable.
   -- Execution (Claude, apres relecture) :
   --   node scripts/supabase-sql.mjs supabase/030_reviews_author_private.sql
   -- ============================================================================

   begin;

   -- ---------------------------------------------------------------------------
   -- 1. Lecture : tout sauf user_id
   -- (un REVOKE au niveau de la table retire aussi les droits par colonne poses)
   -- ---------------------------------------------------------------------------
   revoke select on public.reviews from anon, authenticated;
   grant select (id, distributor_id, author_name, rating, body, created_at, updated_at)
     on public.reviews to anon, authenticated;

   -- ---------------------------------------------------------------------------
   -- 2. Mon avis (onglet Avis de la fiche, js/reviews.js)
   -- ---------------------------------------------------------------------------
   create or replace function public.my_review(p_distributor_id text)
   returns table (id bigint, author_name text, rating smallint, body text,
                  created_at timestamptz, updated_at timestamptz)
   language sql stable security definer set search_path = public as $$
     select r.id, r.author_name, r.rating, r.body, r.created_at, r.updated_at
       from reviews r
      where r.distributor_id = p_distributor_id
        and r.user_id = auth.uid()
      limit 1;
   $$;
   revoke execute on function public.my_review(text) from public, anon;
   grant execute on function public.my_review(text) to authenticated;

   notify pgrst, 'reload schema';   -- envoye au commit

   commit;

   -- ============================================================================
   -- VERIFICATION (Claude)
   -- select grantee, column_name from information_schema.column_privileges
   --  where table_name = 'reviews' and privilege_type = 'SELECT'
   --    and grantee in ('anon', 'authenticated') order by 1, 2;
   -- -> 7 colonnes par role, jamais user_id
   -- ============================================================================
   ```

2. **js/reviews.js** — ne plus jamais demander `user_id`.
   a) En-tête, avant :
   ```js
    * Securite portee par la base (016) : RLS, un avis par compte et par machine,
    * 10 avis / heure / compte, comptes bloques. Ce module ne bloque jamais
    * l'ouverture de la fiche : lectures en fire-and-forget.
   ```
   après :
   ```js
    * Securite portee par la base (016) : RLS, un avis par compte et par machine,
    * 10 avis / heure / compte, comptes bloques. PRIV-02 (030) : l'API ne lit plus
    * l'auteur (user_id) d'un avis ; « mon avis » vient de la RPC my_review et la
    * liste reconnait le sien par son id. Ce module ne bloque jamais
    * l'ouverture de la fiche : lectures en fire-and-forget.
   ```
   b) Colonnes, avant :
   ```js
   const COLUMNS = 'id, user_id, author_name, rating, body, created_at, updated_at';
   ```
   après :
   ```js
   // PRIV-02 (030) : jamais user_id (illisible par l'API) ; memes colonnes que my_review()
   const COLUMNS = 'id, author_name, rating, body, created_at, updated_at';
   ```
   c) `fetchMine`, avant :
   ```js
       try {
           const { data, error } = await supabaseClient
               .from('reviews')
               .select(COLUMNS)
               .eq('distributor_id', distributorId)
               .eq('user_id', uid)
               .maybeSingle();
           if (error) throw error;
           if (state.distributorId !== distributorId) return;
           state.mine = data || null;
   ```
   après :
   ```js
       try {
           // PRIV-02 : la base retrouve l'avis du compte connecte (auth.uid()) ;
           // 0 ou 1 ligne, sans .maybeSingle()
           const { data: rows, error } = await supabaseClient.rpc('my_review', { p_distributor_id: distributorId });
           if (error) throw error;
           if (state.distributorId !== distributorId) return;
           const data = Array.isArray(rows) ? rows[0] || null : null;
           state.mine = data;
   ```
   Les lignes suivantes (`state.draftRating = data ? data.rating : 0;`, remplissage du champ,
   `renderReviews()`) ne changent pas. La garde `const uid = isAuthenticated() ? getCurrentUser()?.id : null;`
   au début de la fonction reste (elle évite l'appel en visiteur).
   d) `renderReviews`, avant :
   ```js
           const uid = getCurrentUser()?.id;
           list.innerHTML = state.items.map(rv => `
               <li class="review-item${uid && rv.user_id === uid ? ' is-mine' : ''}">
                   <div class="review-head">
                       <span class="review-author">${escapeHTML(rv.author_name || 'Membre DistriMatch')}${uid && rv.user_id === uid ? ' <span class="review-mine-tag">Ton avis</span>' : ''}</span>
   ```
   après :
   ```js
           // PRIV-02 : l'auteur n'est plus lisible ; son avis se reconnait a son id (my_review)
           const mineId = authed && state.mine ? state.mine.id : null;
           list.innerHTML = state.items.map(rv => `
               <li class="review-item${mineId !== null && rv.id === mineId ? ' is-mine' : ''}">
                   <div class="review-head">
                       <span class="review-author">${escapeHTML(rv.author_name || 'Membre DistriMatch')}${mineId !== null && rv.id === mineId ? ' <span class="review-mine-tag">Ton avis</span>' : ''}</span>
   ```
   (`authed` est déjà déclaré en tête de `renderReviews`.)
   e) `submitReview`, avant :
   ```js
           const res = await withSessionRetry(() => editing
               ? supabaseClient.from('reviews').update(check.value).eq('id', state.mine.id).select(COLUMNS).single()
               : supabaseClient.from('reviews').insert({ distributor_id: distributor.id, ...check.value }).select(COLUMNS).single());
   ```
   après :
   ```js
           // PRIV-02 : pas de .select() apres l'ecriture (la ligne rendue n'etait pas lue) ;
           // refreshAfterChange() relit la liste et my_review
           const res = await withSessionRetry(() => editing
               ? supabaseClient.from('reviews').update(check.value).eq('id', state.mine.id)
               : supabaseClient.from('reviews').insert({ distributor_id: distributor.id, ...check.value }));
   ```
   `getCurrentUser` reste importé (encore utilisé dans `fetchMine`). Ne rien changer d'autre.

3. **CLAUDE.md** — documenter (trois remplacements, texte sans accents comme le reste).
   a) Ligne du module `reviews.js`, avant (morceau unique) :
   ```
   Aides pures `describeRating` / `validateReview` / `describeReviewError` (utils.js)
   ```
   après :
   ```
   Aides pures `describeRating` / `validateReview` / `describeReviewError` (utils.js). PRIV-02 : l'auteur d'un avis n'est jamais lu (pas de `user_id`) ; « mon avis » vient de la RPC `my_review`, la liste reconnait le sien par son id
   ```
   b) Ligne UC4b, avant (morceau unique) :
   ```
   auteur « Membre DistriMatch » force |
   ```
   après :
   ```
   auteur « Membre DistriMatch » force ; auteur (`user_id`) illisible par l'API, « mon avis » par la RPC `my_review` (030) |
   ```
   c) Liste des migrations, avant (morceau unique) :
   ```
   . AVANT d'appliquer une migration :
   ```
   après :
   ```
   , `030_reviews_author_private` (PRIV-02 : l'API ne lit plus `reviews.user_id` (droits SELECT par colonne, ecritures inchangees) ; RPC `my_review(distributor_id)` = l'avis du compte connecte, sans `user_id`). AVANT d'appliquer une migration :
   ```

4. **index.html** — `js/reviews.js` change : monter le `?v=` de **toutes** les entrées de
   l'import map à la même valeur V+1 (V noté aux contrôles). Aucun CSS ne change.

## Tests

### Test 1 — base (intégration, vraie base, transactions annulées)
- **Fichier** : `tests/integration/db.test.js`.
- **a) Réécrire deux tests existants du bloc `base : avis (016)`** : ils lisent `user_id` en tant
  que compte, refusé après 030. Réécrits, ils passent **avant comme après** 030.
  Test « avec un compte : avis depose… », avant :
  ```js
      it('avec un compte : avis depose, auteur et compte forces par la base', async () => {
          const p = await probe(`${AS_USER} ${insertReview()};
              select json_build_object('auteur', author_name, 'moi', user_id = auth.uid())::text into r
                from reviews where distributor_id = '${DEMO}' and user_id = auth.uid()`);
  ```
  après :
  ```js
      it('avec un compte : avis depose, auteur et compte forces par la base', async () => {
          // PRIV-02 (030) : user_id n'est plus lisible par le compte : relu en postgres
          const p = await probe(`${AS_USER} ${insertReview()} returning id into v_id;
              reset role;
              select json_build_object('auteur', author_name, 'moi', user_id = ${USER})::text into r
                from reviews where id = v_id`, 'v_id bigint;');
  ```
  (les deux lignes `assert` qui suivent ne changent pas.)
  Test « on modifie et supprime son avis… », avant :
  ```js
          const p = await probe(`${AS_USER} ${insertReview(2)};
              update reviews set rating = 5 where distributor_id = '${DEMO}' and user_id = auth.uid();
              update reviews set rating = 1 where distributor_id = '${DEMO}' and user_id is null;
              get diagnostics v_n = row_count;
              r := json_build_object(
                  'mien', (select rating from reviews where distributor_id = '${DEMO}' and user_id = auth.uid()),
                  'autres_modifies', v_n
              )::text;
              delete from reviews where distributor_id = '${DEMO}' and user_id is null;
              get diagnostics v_n = row_count;
              r := (r::jsonb || jsonb_build_object('autres_supprimes', v_n))::text`, 'v_n int;');
  ```
  après :
  ```js
          // PRIV-02 (030) : le compte vise son avis par son id (user_id illisible) ;
          // les regles RLS « son propre avis » font le reste
          const p = await probe(`${AS_USER} ${insertReview(2)} returning id into v_id;
              update reviews set rating = 5 where id = v_id;
              update reviews set rating = 1 where distributor_id = '${DEMO}' and id <> v_id;
              get diagnostics v_n = row_count;
              r := json_build_object(
                  'mien', (select rating from reviews where id = v_id),
                  'autres_modifies', v_n
              )::text;
              delete from reviews where distributor_id = '${DEMO}' and id <> v_id;
              get diagnostics v_n = row_count;
              r := (r::jsonb || jsonb_build_object('autres_supprimes', v_n))::text`, 'v_n int; v_id bigint;');
  ```
  (l'`assert.deepEqual` qui suit ne change pas : `{ mien: 5, autres_modifies: 0, autres_supprimes: 0 }`.)
- **b) Nouveau bloc**, inséré juste **AVANT** la ligne
  `// EPIC-T18 (020) : exploitants, demandes, page admin, priorite des signaux` :
  ```js
  // PRIV-02 (030) : avis vraiment anonymes : l'API ne lit plus l'auteur d'un avis
  describe('base : avis anonymes (030)', { skip: SKIP }, () => {
      it('personne ne lit l’auteur d’un avis (user_id) ni ne filtre par compte (42501)', async () => {
          for (const role of [AS_ANON, AS_USER]) {
              const who = await probe(`${role} perform user_id from reviews limit 1`);
              assert.equal(who.code, '42501');
              const filter = await probe(`${role} perform id from reviews where user_id is not null limit 1`);
              assert.equal(filter.code, '42501');
          }
          const [r] = await query(`select
              has_column_privilege('anon', 'public.reviews', 'user_id', 'select') as anon_auteur,
              has_column_privilege('authenticated', 'public.reviews', 'user_id', 'select') as auth_auteur,
              has_column_privilege('anon', 'public.reviews', 'body', 'select') as anon_texte`);
          assert.deepEqual(r, { anon_auteur: false, auth_auteur: false, anon_texte: true });
      });

      it('un visiteur lit toujours les avis (sans l’auteur) et la note', async () => {
          const p = await probe(`${AS_ANON}
              r := (select count(*) from (select id, distributor_id, author_name, rating, body, created_at, updated_at
                                            from reviews where distributor_id = '${DEMO}') x)::text
                || '|' || (select avis from distributor_ratings where distributor_id = '${DEMO}')::text`);
          assert.ok(p.reachedEnd, p.message);
          const [lus, note] = p.result.split('|').map(Number);
          assert.ok(lus > 0);
          assert.equal(lus, note);
      });

      it('my_review : rend mon avis sur la fiche (sans user_id), rien ailleurs ; refuse sans compte', async () => {
          const p = await probe(`${AS_USER} ${insertReview(3)} returning id into v_id;
              r := (select json_build_object('meme', id = v_id, 'note', rating, 'auteur', author_name)::text from my_review('${DEMO}'))
                || '|' || (select count(*) from my_review('${DEMO}'))::text
                || '|' || (select count(*) from my_review('itest-aucune'))::text`, 'v_id bigint;');
          assert.ok(p.reachedEnd, p.message);
          const [mine, n, ailleurs] = p.result.split('|');
          assert.deepEqual(JSON.parse(mine), { meme: true, note: 3, auteur: 'Membre DistriMatch' });
          assert.equal(n, '1');
          assert.equal(ailleurs, '0');
          const anon = await probe(`${AS_ANON} perform * from my_review('${DEMO}')`);
          assert.equal(anon.code, '42501');
          const [f] = await query(`select
              position('user_id' in pg_get_function_result('public.my_review(text)'::regprocedure)) = 0 as sans_auteur,
              has_function_privilege('anon', 'public.my_review(text)', 'execute') as anon_exec,
              has_function_privilege('authenticated', 'public.my_review(text)', 'execute') as auth_exec`);
          assert.deepEqual(f, { sans_auteur: true, anon_exec: false, auth_exec: true });
      });
  });
  ```
- **Doit échouer avant l'application de 030** : `user_id` est encore lisible (le premier test
  attend 42501 et la lecture passe) et `my_review` n'existe pas (42883). Le 2e test (« un visiteur
  lit toujours… ») passe avant comme après : normal. **L'exécutant ne peut pas les faire passer**
  (il n'applique pas la migration) : il les lance une fois, constate l'échec, colle la sortie dans
  la PR. Les deux tests réécrits en a) et tous les autres tests doivent rester verts.
- Sans jeton dans `.env.local`, tout le fichier est sauté : le noter dans la PR, ne rien contourner.

### Test 2 — onglet Avis (fonctionnel, serveur simulé)
- **Fichier** : `tests/functional/avis.spec.js`.
- a) Supprimer la ligne 12 (devenue inutile) :
  ```js
  const TEST_UID = '00000000-0000-0000-0000-00000000e2e0';   // compte simule par window.__testLogin()
  ```
- b) `fakeReviews`, avant :
  ```js
          id: 1000 + i, user_id: null, author_name: `Auteur ${i + 1}`, rating: 1 + (i % 5),
  ```
  après :
  ```js
          id: 1000 + i, author_name: `Auteur ${i + 1}`, rating: 1 + (i % 5),   // PRIV-02 : l'API ne rend plus user_id
  ```
- c) Début de `routeReviews`, avant :
  ```js
  // Simule la table reviews : liste paginee (offset / limit + total dans
  // Content-Range), « mon avis » (filtre user_id), insertion, modification,
  // suppression. Retourne l'etat pour les verifications.
  async function routeReviews(page, { list = [], mine = null, rating = null, insertError = null } = {}) {
      const db = { list, mine, rating, calls: [] };
      await page.route(url => url.pathname.endsWith('/rest/v1/reviews'), async route => {
          const req = route.request();
          const url = new URL(req.url());
          const method = req.method();
          db.calls.push({ method, body: req.postDataJSON?.() ?? null });
          if (method === 'GET' && url.searchParams.get('user_id')) {
              return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(db.mine ? [db.mine] : []) });
          }
          if (method === 'GET') {
  ```
  après :
  ```js
  // Simule la table reviews : liste paginee (offset / limit + total dans
  // Content-Range), insertion, modification, suppression ; « mon avis » par la
  // RPC my_review (PRIV-02 : l'API ne rend plus user_id). Retourne l'etat pour
  // les verifications (calls : methode, corps, parametres de l'URL).
  async function routeReviews(page, { list = [], mine = null, rating = null, insertError = null } = {}) {
      const db = { list, mine, rating, calls: [] };
      await page.route(url => url.pathname.endsWith('/rest/v1/rpc/my_review'), async route => {
          db.calls.push({ method: 'RPC', body: route.request().postDataJSON?.() ?? null, search: '' });
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(db.mine ? [db.mine] : []) });
      });
      await page.route(url => url.pathname.endsWith('/rest/v1/reviews'), async route => {
          const req = route.request();
          const url = new URL(req.url());
          const method = req.method();
          db.calls.push({ method, body: req.postDataJSON?.() ?? null, search: url.search });
          if (method === 'GET') {
  ```
- d) Branche POST, avant :
  ```js
              db.mine = { id: 5000, user_id: TEST_UID, author_name: 'Membre DistriMatch', rating: b.rating, body: b.body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  ```
  après :
  ```js
              db.mine = { id: 5000, author_name: 'Membre DistriMatch', rating: b.rating, body: b.body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  ```
- e) Test « connecte : modifier puis supprimer son avis », avant :
  ```js
          const mine = { id: 5000, user_id: TEST_UID, author_name: 'Membre DistriMatch', rating: 5, body: 'Top', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  ```
  après :
  ```js
          const mine = { id: 5000, author_name: 'Membre DistriMatch', rating: 5, body: 'Top', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  ```
- f) **Nouveau test**, inséré juste **AVANT** la ligne
  `    test('refus de la base : le message dit la raison (deja un avis, trop d’avis)', async ({ page }) => {` :
  ```js
      // PRIV-02 : l'auteur d'un avis n'est plus lisible ; « Ton avis » vient de my_review et de l'id
      test('PRIV-02 : la liste ne demande jamais l’auteur (user_id) ; « Ton avis » vient de my_review', async ({ page }) => {
          const mine = { id: 5000, author_name: 'Membre DistriMatch', rating: 4, body: 'Le mien', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
          const db = await routeReviews(page, { list: fakeReviews(2), mine, rating: { avis: 3, moyenne: 3 } });
          await loginForTest(page);
          const id = await openReviewsTab(page, { rating: 3, reviewCount: 3 });
          await expect(page.locator('#dist-reviews-list .review-item')).toHaveCount(3);
          await expect(page.locator('#dist-reviews-list .review-item.is-mine')).toHaveCount(1);
          await expect(page.locator('#dist-reviews-list .review-item.is-mine')).toContainText('Le mien');
          await expect(page.locator('#dist-review-mine-title')).toHaveText('Ton avis');
          const gets = db.calls.filter(c => c.method === 'GET');
          expect(gets.length).toBeGreaterThan(0);
          for (const c of gets) expect(c.search).not.toContain('user_id');
          expect(db.calls.find(c => c.method === 'RPC').body).toEqual({ p_distributor_id: id });
      });

  ```
- **Doit échouer avant l'étape 2** : l'ancien front cherche son avis par `GET ...&user_id=eq...`,
  que le nouveau simulateur traite comme la liste (3 lignes) : `.maybeSingle()` échoue, aucun
  avis n'est marqué « Ton avis » (`.is-mine` reste à 0), et la liste demande `select=id,user_id,...`.
  Les tests « connecte : publier… » et « connecte : modifier puis supprimer… » échouent aussi
  avant l'étape 2 (même cause : « mon avis » introuvable) : attendu. Après l'étape 2 : tout le
  bloc `32. Avis` passe.

## Vérification (dans l'ordre)
```bash
grep -n "user_id" js/reviews.js                                   # attendu : aucun résultat
grep -n "rpc('my_review'" js/reviews.js                           # attendu : 1 ligne
grep -n "\.select(COLUMNS)" js/reviews.js                         # attendu : 1 ligne (fetchPage)
npm test                                                          # tout vert, dont « cache-busting »
npx playwright test --project=functional -g "Avis"                # tout vert (bloc 32, dont le test PRIV-02)
node --test --test-name-pattern="avis" tests/integration/db.test.js
# AVANT 030 : seuls « personne ne lit l’auteur… » et « my_review : … » échouent ; les tests 016 réécrits
# et « Mon activité » (023) sont verts. Coller la sortie dans la PR.
npm run test:functional                                           # en arrière-plan (~10 min) : tout vert, instables notés dans la PR
git diff --stat                                                   # seuls les fichiers de la fiche (+ index.html)
```

## Avant la fusion (Claude, modèle principal — jamais l'exécutant)
1. **Relecture** du SQL (droits, RPC) et du diff de `js/reviews.js` par un modèle plus fort.
2. **État réel des droits** (la base a déjà eu des règles créées au tableau de bord, cf. 025) :
   ```bash
   node scripts/supabase-sql.mjs -e "select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'reviews' and grantee in ('anon', 'authenticated', 'PUBLIC') order by 1, 2;"
   node scripts/supabase-sql.mjs -e "select policyname, cmd, roles::text, qual from pg_policies where schemaname = 'public' and tablename = 'reviews' order by 1;"
   ```
   Attendu : les 4 règles de 016 (`reviews_select`, `reviews_insert_own`, `reviews_update_own`,
   `reviews_delete_own`). Une règle en plus ne gêne pas 030 (les colonnes sont cachées par les
   droits, pas par les règles) : la signaler à Stéphane.
3. **Essai à blanc** (rien ne reste) : copie de la migration avec `rollback;` à la place du
   `commit;` final, dans le scratchpad, puis exécution :
   ```bash
   sed 's/^commit;$/rollback;/' supabase/030_reviews_author_private.sql > "<scratchpad>/030-essai.sql"
   grep -c "^rollback;$" "<scratchpad>/030-essai.sql"              # 1
   node scripts/supabase-sql.mjs "<scratchpad>/030-essai.sql"        # HTTP 201, aucune erreur
   ```
4. **Appliquer** : `node scripts/supabase-sql.mjs supabase/030_reviews_author_private.sql`.
5. **Tests base restreints** (l'API de gestion limite le débit : pas tout `db.test.js` plusieurs fois) :
   `node --test --test-name-pattern="avis|aucune trace" tests/integration/db.test.js` : tout vert.
   **Si un test échoue** et que la PR n'est pas fusionnée : retour arrière immédiat (l'ancien front
   remarche) `node scripts/supabase-sql.mjs -e "grant select on public.reviews to anon, authenticated;"`,
   puis analyser.
6. **Fusionner juste après** : entre l'application et le déploiement Pages, l'ancien front demande
   `user_id` : liste des avis vide et publication refusée (message d'erreur), rien n'est perdu.
7. Après le déploiement Pages : `npm run test:e2e` (le test connecté « avis : le compte publie un
   avis, le voit… » vérifie l'écriture réelle sans `.select()`, « Ton avis » par `my_review`, et la
   suppression).

## Hors périmètre
- `distributors.added_by` / `reviewed_by` / `modified_by` et `products.modified_by` : PRIV-01.
- `profiles`, `reports`, `votes`, `distributor_photos` : PRIV-03.
- Lecture des avis d'une fiche non publiée (règle `reviews_select` à `true`) : inchangée.
- Message plus précis quand on modifie un avis supprimé ailleurs (cas limite accepté, voir « déjà tranché »).
- Ne pas modifier `my_activity()`, `push-notify`, `tests/e2e/*`, `tests/integration/dom.test.js`.

## Pièges connus
- **Ne jamais exécuter la migration** : les tests « base : avis anonymes (030) » échouent tant
  qu'elle n'est pas appliquée, c'est attendu.
- Ne pas remettre `.maybeSingle()` sur l'appel `rpc('my_review', ...)` : on prend `rows[0]`.
- Ne pas filtrer par `user_id` nulle part dans le front (refusé par la base après 030) : viser l'id.
- Ne pas ajouter `.select(...)` après `insert` / `update` des avis.
- Dans `db.test.js`, `insertReview()` rend `insert into reviews (...) values (...)` sans point-virgule :
  `${insertReview()} returning id into v_id;` est voulu.
- `reset role` (test réécrit) suffit pour **lire** en postgres : aucune garde ne s'applique à une lecture.
- Bump de **toutes** les entrées de l'import map à la **même** valeur, sinon `cache-busting` échoue.
- Le nouveau `.sql` avec l'outil Write ; les autres fichiers (fins de ligne LF) avec Edit.
- Garder `begin;` / `commit;` autour de toute la migration (l'essai à blanc remplace `commit;`).

## Terminé quand
- [ ] Contrôles passés ; test fonctionnel écrit (échoue avant l'étape 2, passe après) ;
      tests base écrits (échouent avant 030, sortie collée dans la PR)
- [ ] Vérifications vertes (hors tests « base : avis anonymes (030) », attendus rouges avant 030)
- [ ] Captures iPhone : non (aucun changement visible)
- [ ] Story cochée dans BACKLOG.md (si elle n'y figure pas : le noter dans la PR), PR ouverte
      (non fusionnée), mention « migration 030 à appliquer par Claude avant fusion »

## Modèle de PR
**Titre** : `fix(vie-privee): avis vraiment anonymes, auteur illisible par l'API (migration 030)`

**Corps** : constats corrigés (liste ci-dessus) ; cause (`GRANT SELECT ON reviews` de 016 sur toutes
les colonnes, `user_id` demandé par le front) ; correction (droits SELECT par colonne, RPC
`my_review`, « Ton avis » reconnu par l'id, plus de `.select()` après écriture) ; ce qui change pour
l'utilisateur (rien de visible) ; tests ajoutés ou réécrits ; sortie de `npm test`, des tests
fonctionnels et de `db.test.js` (tests 030 rouges avant application, attendu) ;
**« Migration 030 à appliquer par Claude après relecture, avant fusion ; fusion juste après »** ;
points à relire : règles RLS sans droit de lecture sur `user_id`, écriture sans `.select()`.
