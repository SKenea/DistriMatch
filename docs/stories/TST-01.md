# TST-01 — Les tests ne dérangent plus les testeurs et ne faussent plus les chiffres

- **Lot** : 7. Tests · **Gravité** : faible · **Niveau conseillé** : medium
- **Prérequis** : **SCR-01 fusionnée** dans `master` ; partir de `master` **à jour**. Sinon : s'arrêter
  (SCR-01 ajoute la migration 034 à `CLAUDE.md`, cette fiche ajoute 035 juste après).
- **Branche** : `fix/tests-sans-effet` · **Taille** : 1 migration (`supabase/035_push_ignore_test_account.sql`) +
  `tests/functional/helpers.js` + 4 fichiers `tests/functional/*.spec.js` (remplacement mécanique) +
  `tests/integration/db.test.js` + `tests/unit/unit.test.js` + `CLAUDE.md`. **Aucun module JS de l'app, aucun `?v=`.**
- **Constats couverts** (rapport du 2026-10-21, revérifiés le 2026-11-10 : **non corrigés**) :
  - T2. Le parcours E2E connecté envoie de vraies notifications push aux abonnés de dist-007 — `tests/e2e/connecte.spec.js:62`
    (preuve du 2026-11-10, transaction annulée : un signal du compte e2e met bien un appel dans `net.http_request_queue`)
  - T3. Des tests fonctionnels envoient de vrais événements `log_event` à la base de production — `tests/functional/onboarding.spec.js:162`
  - T10. Les `beforeEach` « override : pas de setupApp » n'annulent pas setupApp — `tests/functional/onboarding.spec.js:44`
    (couvert seulement pour sa conséquence ici : les contextes créés à la main n'étaient pas protégés)

## But
1. Après chaque mise en ligne, les tests E2E connectés envoient un vrai signal « En service » sur la fiche de
   démo dist-007 avec le compte `e2e@distrimatch.test`. La base le transmet à `push-notify`, qui prévient tout
   abonné de cette fiche : un testeur reçoit une fausse alerte. **Après** : la base ignore, pour les
   notifications, les signaux d'un compte marqué `app_metadata.e2e = true` (le signal reste enregistré).
2. 15 tests fonctionnels créent leur propre navigateur (`browser.newContext`) : 4 d'entre eux (onboarding) ne
   bloquent pas la mesure d'audience, et l'app envoie de vrais « app ouverte » / « fiche ouverte » à la table
   `events` de production, qui sert à juger le POC. **Après** : tout navigateur de test passe par un seul
   assistant, `newTestContext`, qui bloque `log_event` pour tout le contexte ; `setupApp` bloque aussi au
   niveau du contexte ; un test rapide interdit `browser.newContext` dans les fichiers de tests fonctionnels.

## User story
En tant que testeur abonné à une fiche, je veux ne recevoir que de vraies alertes, et en tant que Stéphane je
veux des chiffres d'audience sans visites de robots, afin de juger le POC sur du réel.

**Critères d'acceptation**
- [ ] Un signal du compte de test E2E est enregistré mais ne met aucun appel vers `push-notify` en file ; le
      signal d'un autre compte, si (test de base).
- [ ] `tests/functional/helpers.js` exporte `newTestContext(browser, options = {})`, qui bloque `log_event` pour le contexte.
- [ ] `setupApp` bloque `log_event` au niveau du contexte (pages ouvertes ensuite comprises).
- [ ] Plus aucun `browser.newContext(` dans `tests/functional/*.spec.js` ; un test rapide le vérifie.
- [ ] Suite fonctionnelle complète verte ; aucun test ne change de comportement attendu.

## Ce qui est déjà tranché (ne pas refaire l'analyse)
- Le compte de test se reconnaît par `auth.users.raw_app_meta_data->>'e2e' = 'true'` (migration 015). Pas par
  son e-mail. Un seul compte l'a (vérifié le 2026-11-10).
- La fonction `notify_push_on_signal` en base est **exactement** celle de `supabase/024_push_notifications.sql`
  (vérifié le 2026-11-10) : la migration 035 la reprend telle quelle avec **une** condition en plus.
- La mesure d'audience des **E2E** est déjà coupée (`route.abort()` dans `tests/e2e/*.spec.js`) : ne pas y toucher.
- Les lignes `await context.route(EVENTS_ROUTE, ...)` déjà présentes dans certains tests **restent** (inoffensives :
  la route la plus récente gagne). Ne pas les supprimer.
- La migration est **appliquée par Claude** (modèle principal) après relecture, pas par l'exécutant : au moment de
  la PR, le nouveau test de base **échoue** (attendu, à écrire dans la PR).

## Avant de coder
**Lire en entier** : `supabase/024_push_notifications.sql` lignes 90-121 (`notify_push_on_signal`) ;
`tests/functional/helpers.js` lignes 1-75 (`EVENTS_ROUTE`, `captureEvents`, `setupApp`) ; `tests/integration/db.test.js`
lignes 1-60 (`probe`, `AS_USER`, `signal`) et sa fin ; la fin de `tests/unit/unit.test.js`.

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter ; un numéro de ligne différent n'est pas un échec) :
```bash
grep -c "if coalesce(new.device_hash, '') like 'demo-%' then return new; end if;" supabase/024_push_notifications.sql   # 1
ls supabase/ | grep -c '^035'                                                       # 0
grep -c '034_demo_signal_flag' CLAUDE.md                                            # 1 (SCR-01 fusionnée)
grep -c "ne jamais ecrire \`s.device_hash\` dans ces vues). AVANT d'appliquer une migration" CLAUDE.md   # 1
grep -c "^export const EVENTS_ROUTE = '\*\*/rest/v1/rpc/log_event';" tests/functional/helpers.js       # 1
grep -c '^export async function setupApp(page, context) {' tests/functional/helpers.js               # 1
grep -c 'newTestContext' tests/functional/*.js | grep -vc ':0$'                     # 0
grep -o 'browser.newContext(' tests/functional/*.spec.js | wc -l                     # 15
grep -c 'browser.newContext(' tests/functional/auth.spec.js tests/functional/confidentialite.spec.js tests/functional/fiche.spec.js tests/functional/onboarding.spec.js   # 3, 1, 4, 7
grep -c "^import { readFileSync, readdirSync } from 'node:fs';" tests/unit/unit.test.js               # 1
grep -c "^describe('base : signaux de demo reconnaissables sans device_hash (NOTIF-02, 034)'" tests/integration/db.test.js   # 1
grep -c "aides partagees dans \`tests/functional/helpers.js\` (\`setupApp\`, \`loginForTest\`, \`openSignalableFiche\`, \`routeSignals\`...)" CLAUDE.md   # 1
```

## Étapes
Fichiers en CRLF : outil Edit ou petit script Node, **jamais `sed -i`**.

1. **Créer `supabase/035_push_ignore_test_account.sql`** (contenu complet) :
   ```sql
   -- ============================================================================
   -- 035 : pas de notification app fermee pour un signal du compte de test E2E (TST-01)
   -- ============================================================================
   -- Revue du 2026-10-21 (lot 7, T2). Apres chaque deploiement, les tests E2E
   -- connectes (compte e2e@distrimatch.test, 015 : app_metadata.e2e = true)
   -- envoient un vrai signal « En service » sur la fiche de demo dist-007 : le
   -- declencheur notify_push_on_signal (024) le transmettait a push-notify, qui
   -- prevenait les abonnes de cette fiche.
   -- Apres : notify_push_on_signal ignore aussi les signaux d'un compte marque
   -- app_metadata.e2e = true (reprise exacte de 024, une condition en plus). Le
   -- signal lui-meme est enregistre comme avant.
   -- Idempotente, en une seule transaction. Execution (Claude, apres relecture ;
   -- d'abord avec « rollback; » a la place du « commit; » final) :
   --   node scripts/supabase-sql.mjs supabase/035_push_ignore_test_account.sql
   -- ============================================================================

   begin;

   create or replace function public.notify_push_on_signal() returns trigger
   language plpgsql security definer set search_path = public as $$
   declare
       v_url text;
       v_secret text;
   begin
       if coalesce(new.device_hash, '') like 'demo-%' then return new; end if;
       -- 035 (TST-01) : le compte de test E2E ne notifie personne
       if new.user_id is not null and exists (
           select 1 from auth.users u
           where u.id = new.user_id and coalesce(u.raw_app_meta_data->>'e2e', '') = 'true'
       ) then return new; end if;
       select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_notify_url';
       select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_trigger_secret';
       if v_url is null or v_secret is null then return new; end if;
       perform net.http_post(
           url := v_url,
           body := jsonb_build_object('signal_id', new.id),
           headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret)
       );
       return new;
   exception when others then
       -- Une notification ne bloque jamais un signal.
       raise warning 'push-notify : %', sqlerrm;
       return new;
   end;
   $$;
   revoke all on function public.notify_push_on_signal() from public, anon, authenticated;

   commit;
   ```
   Le déclencheur `notify_push_on_signal` (024) reste branché : `create or replace function` suffit.
2. **tests/functional/helpers.js** — juste après la fonction `captureEvents` (après son `return events;` et son `}`),
   ajouter :
   ```js

   // TST-01 : tout navigateur cree par un test passe par ici (jamais browser.newContext
   // directement) : la mesure d'audience est bloquee pour tout le contexte, aucun
   // vrai evenement n'atteint la table events de production (test garde-fou dans
   // tests/unit/unit.test.js).
   export async function newTestContext(browser, options = {}) {
       const context = await browser.newContext(options);
       await context.route(EVENTS_ROUTE, route => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
       return context;
   }
   ```
3. **tests/functional/helpers.js**, `setupApp` — bloquer aussi au niveau du contexte. Avant :
   ```js
   export async function setupApp(page, context) {
       await captureEvents(page);
   ```
   Après :
   ```js
   export async function setupApp(page, context) {
       // TST-01 : contexte entier (une page ouverte ensuite n'envoie rien non plus) ;
       // captureEvents(page) garde la priorite pour cette page.
       await context.route(EVENTS_ROUTE, route => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
       await captureEvents(page);
   ```
4. **Les 4 fichiers de tests** `tests/functional/auth.spec.js`, `confidentialite.spec.js`, `fiche.spec.js`,
   `onboarding.spec.js` — avec **un seul** petit script Node (pas à la main) :
   - remplacer `browser.newContext()` par `newTestContext(browser)` ;
   - puis remplacer `browser.newContext(` par `newTestContext(browser, ` ;
   - ajouter `newTestContext` à la liste importée de `'./helpers.js'` (ligne `import { ... } from './helpers.js';`
     du haut du fichier) : remplacer ` } from './helpers.js';` par `, newTestContext } from './helpers.js';` sur
     cette seule ligne.
   Le script doit s'arrêter (sortie non nulle) si un fichier n'a pas exactement le nombre de remplacements attendu
   (3, 1, 4, 7) ou si sa ligne d'import est introuvable. Il préserve les fins de ligne (lire et écrire en `utf8`
   sans toucher aux `\r\n`).
5. **CLAUDE.md** — deux ajouts.
   a. Liste des migrations, juste après 034. Avant :
   ```
   ne jamais ecrire `s.device_hash` dans ces vues). AVANT d'appliquer une migration
   ```
   Après :
   ```
   ne jamais ecrire `s.device_hash` dans ces vues), `035_push_ignore_test_account` (TST-01 : `notify_push_on_signal` ignore aussi les signaux d'un compte marque `app_metadata.e2e = true` (compte des E2E, 015) : les E2E connectes ne notifient plus les abonnes de dist-007 ; le signal reste enregistre). AVANT d'appliquer une migration
   ```
   b. Section Commandes. Avant :
   ```
   aides partagees dans `tests/functional/helpers.js` (`setupApp`, `loginForTest`, `openSignalableFiche`, `routeSignals`...)
   ```
   Après :
   ```
   aides partagees dans `tests/functional/helpers.js` (`setupApp`, `loginForTest`, `openSignalableFiche`, `routeSignals`...) ; un test qui cree son propre navigateur passe par `newTestContext(browser, options)`, jamais `browser.newContext` : la mesure d'audience (`log_event`) y est bloquee pour tout le contexte (TST-01, test garde-fou dans `tests/unit/unit.test.js`)
   ```
6. **BACKLOG.md** : cocher TST-01 (`- [ ] TST-01` → `- [x] TST-01`).

## Tests
### Test 1 — garde-fou des tests fonctionnels (rapide)
- **Fichier** : `tests/unit/unit.test.js`, **à la fin du fichier** (après le dernier `});`).
- **Code à ajouter** :
  ```js

  // ============================================
  // TESTS FONCTIONNELS : AUCUN VRAI EVENEMENT D'AUDIENCE (TST-01)
  // ============================================
  // La table events de production sert a juger le POC : un navigateur de test
  // ne doit jamais y envoyer de log_event.

  describe('tests fonctionnels : aucun vrai log_event vers la base (TST-01)', () => {
      const dir = new URL('../functional/', import.meta.url);
      const helpers = readFileSync(new URL('helpers.js', dir), 'utf8');

      it('newTestContext existe et bloque log_event pour tout le contexte', () => {
          assert.match(helpers, /export async function newTestContext\(browser, options = \{\}\) \{[\s\S]*?context\.route\(EVENTS_ROUTE,/,
              'newTestContext absente de tests/functional/helpers.js');
      });

      it('aucun fichier de tests fonctionnels n\'appelle browser.newContext directement', () => {
          for (const f of readdirSync(dir).filter(n => n.endsWith('.spec.js'))) {
              const src = readFileSync(new URL(f, dir), 'utf8');
              assert.doesNotMatch(src, /browser\.newContext\(/,
                  `${f} : browser.newContext() laisse partir la mesure d'audience, utiliser newTestContext(browser, ...)`);
          }
      });

      it('setupApp bloque log_event au niveau du contexte, avant d\'ouvrir l\'app', () => {
          const setup = helpers.slice(helpers.indexOf('export async function setupApp'));
          assert.match(setup.slice(0, setup.indexOf('page.goto')), /context\.route\(EVENTS_ROUTE,/,
              'setupApp ne bloque log_event que pour la page');
      });
  });
  ```
- `readFileSync` et `readdirSync` sont **déjà importés** (ligne `import { readFileSync, readdirSync } from 'node:fs';`) :
  ne pas les réimporter.
- **Doit échouer avant la correction** : `newTestContext absente de tests/functional/helpers.js`, puis
  `auth.spec.js : browser.newContext() laisse partir ...`, puis `setupApp ne bloque log_event que pour la page`.

### Test 2 — base : le compte de test E2E ne notifie personne (intégration, vraie base, transaction annulée)
- **Fichier** : `tests/integration/db.test.js`, **à la fin du fichier** (après le dernier `});`).
- **Code à ajouter** :
  ```js

  // ============================================
  // NOTIFICATIONS APP FERMEE : LE COMPTE DE TEST E2E NE NOTIFIE PERSONNE (TST-01, 035)
  // ============================================
  // pg_net met chaque appel vers push-notify dans net.http_request_queue, dans la
  // transaction : on compte la file avant / apres chaque signal, puis tout est annule.
  describe('base : un signal du compte de test E2E ne part pas vers push-notify (TST-01, 035)', { skip: SKIP }, () => {
      it('compte de test E2E : signal enregistre, aucun appel ; autre compte : un appel', async () => {
          const p = await probe(`
              select id into v_uid from auth.users where raw_app_meta_data->>'e2e' = 'true';
              n0 := (select count(*) from net.http_request_queue);
              ${AS_USER} a := ${signal('working')};
              reset role;
              n1 := (select count(*) from net.http_request_queue);
              v_uid := (select id from auth.users where coalesce(raw_app_meta_data->>'e2e', '') <> 'true' order by created_at limit 1);
              ${AS_USER} b := ${signal('broken')};
              reset role;
              n2 := (select count(*) from net.http_request_queue);
              r := json_build_object('e2e', a->'inserted', 'autre', b->'inserted', 'appels_e2e', n1 - n0, 'appels_autre', n2 - n1)::text`,
              'n0 int; n1 int; n2 int; a jsonb; b jsonb;');
          assert.ok(p.reachedEnd, p.message);
          const res = JSON.parse(p.result);
          assert.equal(res.e2e, 1, 'le signal du compte de test est bien enregistre');
          assert.equal(res.autre, 1, 'le signal de l’autre compte est bien enregistre');
          assert.equal(res.appels_autre, 1, 'un signal ordinaire part vers push-notify (Vault en place)');
          assert.equal(res.appels_e2e, 0, 'le signal du compte de test E2E ne doit notifier personne');
      });
  });
  ```
- **Doit échouer avant la correction** (et **encore au moment de la PR**, la migration n'étant appliquée que par
  Claude ensuite) : `le signal du compte de test E2E ne doit notifier personne` (1 au lieu de 0).
- Lancer **seulement** ce test (l'API de gestion limite le débit) :
  `node --test --test-name-pattern="TST-01" tests/integration/db.test.js`

## Vérification (dans l'ordre)
```bash
npm test                                    # tout vert, dont « TST-01 » (garde-fou)
node --test --test-name-pattern="TST-01" tests/integration/db.test.js   # 1 échec attendu « ne doit notifier personne » (migration non appliquée)
npx playwright test --project=functional tests/functional/onboarding.spec.js   # tout vert
npm run test:functional                     # en arrière-plan (~13 min) : tout vert, instables notés dans la PR
git diff --stat                             # 035, helpers.js, 4 spec.js, db.test.js, unit.test.js, CLAUDE.md, BACKLOG.md
```
Le serveur local doit répondre sur le port 8080 (`npx http-server -p 8080 -c-1`).

## Hors périmètre
- **Ne jamais exécuter de SQL sur la vraie base** en dehors de `db.test.js` restreint ci-dessus : la migration est
  appliquée par Claude. Ne pas lancer `scripts/supabase-sql.mjs`, ni `scripts/deploy-push.mjs`.
- `supabase/functions/push-notify` : inchangée. Les tests E2E (`tests/e2e/`) : inchangés.
- Les autres défauts de `setupApp` (délai de 50 s, sélecteur d'attente) : mis de côté (EPIC-R7), ne pas y toucher.

## Pièges connus
- `browser.newContext()` (sans argument) doit devenir `newTestContext(browser)`, pas `newTestContext(browser, )`.
  D'où l'ordre des deux remplacements à l'étape 4.
- Dans `db.test.js`, le test 2 utilise `reset role;` pour relire la file en tant que postgres : c'est voulu.
- Si le test 2 donne `autre: 0` (le plus ancien compte a déjà signalé « En panne » sur dist-007 dans l'heure),
  ce n'est pas la correction : le noter dans la PR (TST-02 passera ces tests sur un compte jetable).

## Terminé quand
- [ ] Contrôles passés, tests écrits (le garde-fou échoue avant, passe après ; le test de base échoue tant que 035 n'est pas appliquée)
- [ ] Vérifications vertes (sauf l'échec de base attendu)
- [ ] Captures iPhone : non (rien de visible ne change)
- [ ] Story cochée dans BACKLOG.md, PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `fix(tests): plus de fausse alerte ni de fausse visite envoyees par les tests (TST-01)`

**Corps** : constats corrigés ; ce qui change (les E2E connectés ne notifient plus les abonnés de dist-007 ; aucun
test fonctionnel n'envoie de vrai `log_event`) ; migration 035 **à appliquer par Claude** (d'abord avec `rollback;`) ;
tests ajoutés (échec avant / succès après ; l'échec de base attendu jusqu'à l'application de 035) ; sorties des
commandes de vérification ; éléments non faits.
