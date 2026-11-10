# TST-02 — Tests de la base justes quoi que fassent les testeurs

- **Lot** : 7. Tests · **Gravité** : faible à moyenne · **Niveau conseillé** : medium
- **Prérequis** : **TST-01 fusionnée** dans `master` et la migration 035 appliquée par Claude ; partir de
  `master` **à jour**. Sinon : s'arrêter (TST-01 ajoute un test à la fin de `db.test.js`).
- **Branche** : `fix/tests-base-justes` · **Taille** : `tests/integration/db.test.js` seulement (+ `BACKLOG.md`).
  **Aucune migration, aucun code de l'app.**
- **Constats couverts** (rapport du 2026-10-21, revérifiés le 2026-11-10 : **non corrigés**) :
  - T19. `db.test.js` agit avec le plus ancien compte réel : résultats liés à son activité — `tests/integration/db.test.js:35`
  - T17. Le test de cohérence des avis de démo casse dès qu'un membre note une fiche de démo — `tests/integration/db.test.js:297`
  - T1. Les règles d'écriture anonyme sur `products` et `distributors` ne sont testées nulle part — `tests/integration/db.test.js:158`
    (depuis, SEC-03 a couvert l'ajout et la suppression d'un produit par un visiteur ; restent : renommer un produit,
    ajouter / renommer / déplacer une fiche en visiteur, supprimer une fiche)

## But
1. Chaque cas de `db.test.js` agit aujourd'hui avec **le plus ancien vrai compte** (sans doute celui de Stéphane).
   Dès que ce compte signale « En service » sur dist-007, dépose un avis, ou atteint une limite, des tests passent
   au rouge pendant une heure. **Après** : la sonde crée un **compte jetable** au début de chaque transaction
   annulée (rien ne reste), et agit avec lui.
2. Le test « demo : chaque fiche de demo a ses avis annonces » compare **tous** les avis d'une fiche de démo au
   nombre d'avis de démo prévu : un seul avis de testeur sur une fiche de démo le casse. **Après** : il ne compte
   que les avis de démo (`user_id is null`), et il le prouve en ajoutant un avis de membre dans la transaction.
3. Nouveaux tests : un visiteur ne renomme pas un produit, n'ajoute, ne renomme, ne déplace aucune fiche ; ni un
   visiteur ni un compte ne suppriment une fiche (aucune ligne touchée).

## User story
En tant que Stéphane, je veux que les tests de la base restent justes quoi que fassent les testeurs, et qu'ils
prouvent qu'un visiteur ne peut ni vider ni modifier une fiche, afin de ne jamais bloquer une correction sur une
fausse alerte.

**Critères d'acceptation**
- [ ] `probe` crée un compte jetable (`itest-<uuid>@distrimatch.test`) dans la transaction annulée ; `v_uid` est son id.
- [ ] Toute la suite `db.test.js` passe avec ce compte (vérifié par Claude le 2026-11-10 sur une copie : voir plus bas).
- [ ] Le test des avis de démo ne compte que les avis de démo, et reste vert avec un avis de membre ajouté.
- [ ] Un visiteur : renommer un produit, ajouter / renommer / déplacer une fiche → 42501 ; supprimer une fiche
      (visiteur ou compte) → 0 ligne.

## Ce qui est déjà tranché (ne pas refaire l'analyse)
- Le compte jetable reprend l'insertion de `supabase/015_e2e_test_account.sql` (colonnes de `auth.users`), **sans**
  `auth.identities` (inutile pour les règles) et **sans** `"e2e": true`.
- Les autres comptes utilisés par les tests (`OTHER`, `v_other` : « le plus ancien compte qui n'est pas `v_uid` »)
  **restent** : ils servent de « quelqu'un d'autre » et ne dépendent pas de son activité. Ne pas y toucher.
- Le test TST-01 (fin du fichier) fixe lui-même `v_uid` (compte E2E puis un autre compte) : ne pas le modifier.
- **Vérifié par Claude le 2026-11-10** : une copie de `db.test.js` avec cette sonde passe (les 9 premiers groupes
  d'un coup ; les suivants après une pause, l'API de gestion limitant le débit).
- Les tests qui dépendent des **fiches de démo** (dist-007, avis de démo, job de nuit) restent tels quels : c'est
  la story « avant de purger la démo » (EPIC-R7), hors périmètre ici.
- Supprimer une fiche : la base répond « 0 ligne » (pas d'erreur), car la table a le droit DELETE par défaut de
  Supabase mais **aucune règle** RLS de suppression. Le test vérifie donc `row_count = 0`. Retirer ce droit est
  hors périmètre (pas de migration dans cette story).

## Avant de coder
**Lire en entier** : `tests/integration/db.test.js` lignes 1-60 (en-tête, `probe`, `AS_USER`, `AS_ANON`), le groupe
`describe('base : fiches (010, 013)', ...)` (vers la ligne 158), le groupe `describe('base : avis (016)', ...)`
(vers les lignes 223-327) ; `supabase/015_e2e_test_account.sql` (insertion dans `auth.users`).

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter ; un numéro de ligne différent n'est pas un échec) :
```bash
grep -c "v_uid uuid := (select id from auth.users order by created_at limit 1); \${declare} begin \${body};" tests/integration/db.test.js   # 1
grep -c ' \* PostgREST. Le compte utilise est le plus ancien de auth.users (lecture de son' tests/integration/db.test.js   # 1
grep -c '^// Execute un corps PL/pgSQL puis annule tout.' tests/integration/db.test.js        # 1
grep -c "it('demo : chaque fiche de demo a ses avis annonces" tests/integration/db.test.js     # 1
grep -c 'from distributors d left join distributor_ratings x on x.distributor_id = d.id' tests/integration/db.test.js   # 1
grep -c "it('un visiteur ne modifie rien', async () => {" tests/integration/db.test.js         # 1
grep -c 'TST-01' tests/integration/db.test.js                                               # 1 ou plus (TST-01 fusionnée)
grep -c 'NEW_ACCOUNT\|TST-02' tests/integration/db.test.js                                  # 0
```

## Étapes
Fichier en CRLF : outil Edit ou petit script Node, **jamais `sed -i`**. Attention aux `$$` : dans un script Node,
`String.replace` avec une **chaîne** de remplacement transforme `$$` en `$` ; passer une **fonction**
(`s.replace(avant, () => apres)`).

1. **En-tête du fichier** (commentaire). Avant :
   ```js
    * PostgREST. Le compte utilise est le plus ancien de auth.users (lecture de son
    * id seulement).
   ```
   Après :
   ```js
    * PostgREST. Le compte utilise est un compte JETABLE cree au debut de chaque bloc
    * (TST-02), annule avec le reste : les tests ne dependent plus de l'activite d'un
    * vrai membre.
   ```
2. **Compte jetable** : juste **avant** la ligne `// Execute un corps PL/pgSQL puis annule tout.`, ajouter :
   ```js
   // TST-02 : compte jetable cree dans la transaction annulee (reprise de 015, sans
   // identite ni marque e2e) : aucun signal, avis, limite ou blocage d'un vrai membre
   // ne fausse plus un test. v_uid = son id (gen_random_uuid() dans probe).
   const NEW_ACCOUNT = `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token) values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', 'itest-' || v_uid || '@distrimatch.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');`;

   ```
3. **`probe`**. Avant :
   ```js
       const sql = `do $$ declare r text; v_uid uuid := (select id from auth.users order by created_at limit 1); ${declare} begin ${body}; raise exception 'PROBE_END %', coalesce(r, ''); end $$;`;
   ```
   Après :
   ```js
       const sql = `do $$ declare r text; v_uid uuid := gen_random_uuid(); ${declare} begin ${NEW_ACCOUNT} ${body}; raise exception 'PROBE_END %', coalesce(r, ''); end $$;`;
   ```
4. **Avis de démo** : remplacer **tout** le test `it('demo : chaque fiche de demo a ses avis annonces, ...', ...)`
   (de sa ligne `it(` jusqu'à son `});`) par :
   ```js
       // TST-02 : seuls les avis de demo (user_id null) sont compares a review_count / rating :
       // un avis de membre sur une fiche de demo (ajoute ici, annule) ne fausse plus le test
       it('demo : chaque fiche de demo a ses avis annonces, aucune fiche reelle n’a d’avis de demo', async () => {
           const p = await probe(`insert into reviews (distributor_id, user_id, rating) values ('${DEMO}', ${USER}, 1);
               select json_build_object(
                   'ecarts', count(*) filter (where coalesce(x.avis, 0) <> d.review_count),
                   'moyennes_hors', count(*) filter (where x.avis > 0 and abs(x.moyenne - d.rating) > 0.1),
                   'demo_sur_reel', (select count(*) from reviews rv join distributors f on f.id = rv.distributor_id where not f.is_demo and rv.user_id is null)
               )::text into r
               from distributors d
               left join (select distributor_id, count(*)::int as avis, round(avg(rating)::numeric, 1) as moyenne
                            from reviews where user_id is null group by distributor_id) x on x.distributor_id = d.id
               where d.is_demo and d.review_count > 0 and d.rating >= 1`);
           assert.ok(p.reachedEnd, p.message);
           assert.deepEqual(JSON.parse(p.result), { ecarts: 0, moyennes_hors: 0, demo_sur_reel: 0 });
       });
   ```
5. **Écritures interdites** : dans le groupe `describe('base : fiches (010, 013)', ...)`, **juste après** le test
   `it('un visiteur ne modifie rien', ...)` (qui se termine par `assert.equal(p.code, '42501');` puis `});`), ajouter :
   ```js

       // TST-02 : un visiteur n'ecrit rien (la base refuse : 42501), personne ne supprime une fiche
       it('un visiteur ne renomme pas un produit, n’ajoute, ne renomme ni ne deplace une fiche (42501)', async () => {
           const cases = {
               'renommer un produit': `update products set name = name where distributor_id = '${DEMO}'`,
               'ajouter une fiche': `insert into distributors (id, name, type, lat, lng) values ('itest-anon', 'Fiche itest', 'other', 43.49, -1.47)`,
               'renommer une fiche': `update distributors set name = name where id = '${DEMO}'`,
               'deplacer une fiche': `update distributors set lat = lat where id = '${DEMO}'`
           };
           for (const [label, sql] of Object.entries(cases)) {
               const p = await probe(`${AS_ANON} ${sql}`);
               assert.equal(p.reachedEnd, false, label);
               assert.equal(p.code, '42501', label);
           }
       });

       it('ni un visiteur ni un compte ne suppriment une fiche (aucune ligne touchee)', async () => {
           for (const [label, role] of [['visiteur', AS_ANON], ['compte', AS_USER]]) {
               const p = await probe(`${role} delete from distributors where id = '${DEMO}'; get diagnostics v_n = row_count; r := v_n::text`, 'v_n int;');
               assert.ok(p.reachedEnd, `${label} : ${p.message}`);
               assert.equal(p.result, '0', label);
           }
       });
   ```
6. **BACKLOG.md** : cocher TST-02 (`- [ ] TST-02` → `- [x] TST-02`).

## Tests
Les tests **sont** la story. Ce qui doit être montré :
- **Étape 4, rouge avant** : écrire d'abord le nouveau test des avis de démo **avec l'ancienne requête** (jointure
  à `distributor_ratings`) : il échoue (`ecarts` ≥ 1 à cause de l'avis de membre ajouté). Avec la nouvelle
  requête : vert. Noter les deux sorties dans la PR.
- **Étapes 2-3** : lancer le groupe « signaux » avant et après : vert dans les deux cas ; vérifier dans la sortie que
  les cas passent (le compte jetable n'a aucun signal récent).
- **Étape 5, garde-fou** : ces tests sont verts dès l'écriture (la base est déjà correcte). Preuve qu'ils voient une
  régression, à faire une fois **sans rien commiter** : dans le test « ni un visiteur ni un compte », mettre en tête
  du bloc `create policy itest_del on distributors for delete using (true);` (DDL annulé avec la transaction) :
  il doit échouer (`'1'` au lieu de `'0'`). Retirer la ligne, noter le résultat dans la PR.

## Vérification (dans l'ordre)
L'API de gestion limite le débit (`ThrottlerException: Too Many Requests`) : lancer par groupes, pas tout d'un coup
plusieurs fois. Si un test échoue sur `Too Many Requests`, attendre 3-4 minutes et relancer **ce groupe seulement**.
```bash
npm test                                                                            # tout vert (rien ne change ici)
node --test --test-name-pattern="\(007, 011, 012, 014\)|\(014\)|\(010, 013\)|\(016\)|\(030\)" tests/integration/db.test.js   # vert
node --test --test-name-pattern="\(020\)|\(021\)|\(022\)|\(025\)|027" tests/integration/db.test.js                         # vert (après 3-4 min de pause)
node --test --test-name-pattern="\(023\)|\(024\)|\(026\)|lectures anonymes|\(028\)|\(029\)" tests/integration/db.test.js   # vert (après pause)
node --test --test-name-pattern="\(031\)|\(032\)|\(033\)|rien n|\(017\)|034|TST-01" tests/integration/db.test.js           # vert (après pause)
git diff --stat                                                                     # db.test.js, BACKLOG.md
```
Pas de tests fonctionnels à lancer (rien ne change dans l'app ni dans `tests/functional`).

## Hors périmètre
- Rendre les tests indépendants des fiches de démo (avant la purge) : story à part, EPIC-R7.
- Retirer le droit DELETE de `anon` / `authenticated` sur `distributors` : pas de migration ici.
- **Ne jamais exécuter de SQL** sur la vraie base en dehors de `db.test.js` (transactions annulées).

## Pièges connus
- `$$` dans un script Node : passer une fonction à `replace` (voir Étapes).
- Le compte jetable a `created_at = now()` : `OTHER` (« le plus ancien compte qui n'est pas v_uid ») reste un vrai
  compte. C'est voulu.
- Un échec `Too Many Requests` n'est pas un échec du test : relancer le groupe après une pause.

## Terminé quand
- [ ] Contrôles passés ; nouveau test des avis rouge avec l'ancienne requête, vert avec la nouvelle ; garde-fou de suppression vérifié par la règle temporaire
- [ ] Les 4 groupes de vérification verts
- [ ] Captures iPhone : non
- [ ] Story cochée dans BACKLOG.md, PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `fix(tests): tests de la base avec un compte jetable, avis de demo, ecritures interdites (TST-02)`

**Corps** : constats corrigés ; ce qui change (compte jetable dans chaque transaction annulée ; avis de démo
comparés seuls ; nouveaux tests d'écritures interdites) ; preuves rouge / vert (avis de démo, règle temporaire de
suppression) ; sorties des 4 groupes ; éléments non faits.
