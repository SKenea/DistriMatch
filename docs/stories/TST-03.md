# TST-03 — Premier lancement, ajout d'un distributeur et carte branchée sur la vraie base : testés

- **Lot** : 7. Tests · **Gravité** : moyenne · **Niveau conseillé** : medium
- **Prérequis** : **TST-01 fusionnée** dans `master` (`newTestContext` existe dans `tests/functional/helpers.js`) ;
  partir de `master` **à jour**. Sinon : s'arrêter.
- **Branche** : `fix/tests-parcours-cles` · **Taille** : `tests/functional/onboarding.spec.js`,
  `tests/functional/donnees.spec.js`, `tests/e2e/visiteur.spec.js` (+ `BACKLOG.md`). **Aucun code de l'app.**
- **Constats couverts** (rapport du 2026-10-21, revérifiés le 2026-11-10 : **non corrigés**) :
  - T21. Premier lancement : toucher « Voir autour de moi » puis accepter la localisation n'est testé nulle part — `tests/functional/onboarding.spec.js:19`
  - T5. L'ajout d'un distributeur (UC1) n'a aucun test, le garde anti-double envoi n'est vérifié que par son existence — `tests/functional/donnees.spec.js:109`
  - T16. E2E « la carte se charge avec la vraie base » passe aussi sur les données de repli — `tests/e2e/visiteur.spec.js:49`

## But
1. Tous les tests fonctionnels partent avec la localisation **déjà autorisée** : le geste du **premier lancement**
   (accueil → « Voir autour de moi » → le téléphone demande → « Autoriser » → la carte) n'est jamais joué. S'il
   casse, chaque nouveau testeur reste bloqué sur l'accueil. **Après** : un test le joue de bout en bout.
2. Ajouter un distributeur n'a aucun test : le seul test vérifie qu'une propriété `submitting` **existe**.
   **Après** : un test ajoute vraiment une fiche (sans rien écrire en base : envois interceptés), en appelant
   « Ajouter » deux fois d'affilée, et vérifie **un seul** envoi, le contenu envoyé, et la fiche « en attente ».
3. Le test E2E « la carte se charge avec la vraie base » reste vert si l'app retombe sur le JSON de secours (base
   en pause, règle cassée). **Après** : il compare les fiches de l'app à celles que l'API de la base renvoie.

## User story
En tant que nouveau testeur, je veux que mon premier lancement et l'ajout d'un distributeur marchent toujours, afin
que le POC ne s'arrête pas dès le premier geste.

**Critères d'acceptation**
- [ ] Un test fonctionnel : contexte neuf, localisation « à demander », toucher « Voir autour de moi », accord du
      téléphone simulé → accueil fermé, carte visible, `distrimatch_geo_ok = '1'`, position retenue.
- [ ] Un test fonctionnel : ajout d'un distributeur par un membre, « Ajouter » appelé deux fois → **un** envoi de la
      fiche, **un** envoi des produits, contenu du formulaire, message « après validation », fiche « en attente ».
      Le test tautologique `le garde anti-double-submit existe sur AddMode` est **remplacé**.
- [ ] Le test E2E 1 échoue si les fiches de l'app ne sont pas celles de l'API (mêmes identifiants).
- [ ] Chaque nouveau test a été vu **rouge** une fois en cassant volontairement le code (sans le commiter).

## Ce qui est déjà tranché (ne pas refaire l'analyse)
- Premier lancement : on ne donne **pas** la permission au contexte (sinon l'app saute l'accueil). On remplace
  seulement `navigator.geolocation.getCurrentPosition` par un script d'init qui répond « position » après 50 ms
  (c'est ce que ferait le téléphone après « Autoriser »). `navigator.permissions.query` reste à `prompt`.
- Le gestionnaire du bouton est attaché **après** une vérification asynchrone (`initGeolocationOverlay`, `js/app.js`) :
  le clic est enveloppé dans `expect(...).toPass()` pour absorber cette course.
- Ajout d'un distributeur : `setupApp` (localisation Bayonne accordée), `loginForTest`. On cherche dans la page un
  point à plus de 80 m de toute fiche (règle des 50 m), puis on place le téléphone **sur** ce point
  (`context.setGeolocation`, règle des 30 m). Le repère est posé par `mainMap.fire('click', ...)` (Leaflet).
- **Aucune écriture en base** : les POST vers `/rest/v1/distributors` et `/rest/v1/products` sont interceptés,
  comptés, répondus `201` après 300 ms (fenêtre du double appel). Tout autre appel continue (`route.fallback()`).
- Les deux appels `window.confirmAddDistributor()` sont faits **dans le même `evaluate`** : on teste le verrou lui-même.
- E2E : comparer aux identifiants que renvoie `GET /rest/v1/distributors?select=id` avec la clé publique (contexte
  neuf, donc aucune fiche locale ; la base ne montre au visiteur que les fiches publiées, comme à l'app).

## Avant de coder
**Lire en entier** : `js/app.js` fonction `initGeolocationOverlay` (vers les lignes 456-500) ; `js/add-distributor.js`
lignes 23-70 (`toggleAddMode`, `onMapClickForPlacement`) et 270-480 (`verifyUserOnSite`, `publishDistributor`,
`confirmAddDistributor`, `confirmAddDistributorImpl`) ; `tests/functional/helpers.js` (`newTestContext`, `setupApp`,
`overlayGone`, `loginForTest`) ; `tests/functional/onboarding.spec.js` le groupe
`test.describe('Retour avec la localisation autorisee', ...)` ; `tests/functional/donnees.spec.js` le groupe
`test.describe('9. Dedup distributeurs', ...)` ; `tests/e2e/visiteur.spec.js` lignes 1-56.

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter ; un numéro de ligne différent n'est pas un échec) :
```bash
grep -c '^export async function newTestContext(browser, options = {}) {' tests/functional/helpers.js   # 1 (TST-01 fusionnée)
grep -c '^export const overlayGone = (page) =>' tests/functional/helpers.js                    # 1
grep -c "^test.describe('Retour avec la localisation autorisee', () => {" tests/functional/onboarding.spec.js   # 1
grep -c "test('sans autorisation : l accueil reste, meme si l appareil avait autorise avant'" tests/functional/onboarding.spec.js   # 1
grep -c "test('le garde anti-double-submit existe sur AddMode'" tests/functional/donnees.spec.js   # 1
grep -c "^import { BASE_URL, captureEvents, setupApp, openDistModal, loginForTest," tests/functional/donnees.spec.js   # 1
grep -c "test('la carte se charge avec les distributeurs de la vraie base', async ({ page, context }) => {" tests/e2e/visiteur.spec.js   # 1
grep -c "^const ANON_KEY = config.match" tests/e2e/visiteur.spec.js                            # 1
grep -c '^window.confirmAddDistributor = confirmAddDistributor;' js/app.js                     # 1
grep -c '^window.addProductRow = addProductRow;' js/app.js                                     # 1
grep -c '^export let mainMap = null;' js/state.js                                              # 1
grep -c "showToast('Merci ! Ton distributeur sera visible par tous après validation par l’équipe.', 'success');" js/add-distributor.js   # 1
grep -c '<input type="text" class="product-name-input"' js/add-distributor.js                 # 1
```

## Étapes
Fichiers en CRLF : outil Edit ou petit script Node, **jamais `sed -i`**. Aucun fichier de `js/` ne change.

1. **tests/functional/onboarding.spec.js** — dans le groupe `Retour avec la localisation autorisee`, **après** le
   test `sans autorisation : l accueil reste, ...` (après son `await context.close();` et son `});`), ajouter :
   ```js

       // TST-03 : le geste du premier lancement, joue de bout en bout. Localisation jamais
       // autorisee (« demander ») : on simule seulement la reponse « Autoriser » du telephone.
       test('premier lancement : « Voir autour de moi » puis accepter la localisation ouvre la carte', async ({ browser }) => {
           const context = await newTestContext(browser, { viewport: { width: 390, height: 844 } });
           await context.addInitScript(() => {
               navigator.geolocation.getCurrentPosition = (ok) => setTimeout(() => ok({ coords: { latitude: 43.4929, longitude: -1.4748, accuracy: 10 } }), 50);
           });
           const page = await context.newPage();
           await page.goto(BASE_URL);
           const btn = page.locator('#geoloc-btn');
           await expect(btn).toBeVisible({ timeout: 15000 });
           expect(await page.evaluate(async () => (await navigator.permissions.query({ name: 'geolocation' })).state)).toBe('prompt');
           // Le gestionnaire du bouton arrive apres une verification asynchrone : on retouche tant qu'il le faut
           await expect(async () => {
               await btn.click({ timeout: 1000 }).catch(() => {});
               expect(await overlayGone(page)).toBe(true);
           }).toPass({ timeout: 15000 });
           await page.waitForFunction(() => window.AppState?.mapInitialized === true, null, { timeout: 30000 });
           await expect(page.locator('#main-map')).toBeVisible();
           expect(await page.evaluate(() => ({ ok: localStorage.getItem('distrimatch_geo_ok'), loc: window.AppState.userLocation })))
               .toEqual({ ok: '1', loc: { lat: 43.4929, lng: -1.4748 } });
           await context.close();
       });
   ```
2. **tests/functional/donnees.spec.js** — remplacer **tout** le test `le garde anti-double-submit existe sur AddMode`
   (de `test('le garde anti-double-submit existe sur AddMode', ...` jusqu'à son `});`) par :
   ```js
       // TST-03 : un vrai ajout, sans rien ecrire en base (envois interceptes). « Ajouter »
       // appele deux fois dans la meme tache : le verrou AddMode.submitting lui-meme est teste.
       test('ajout d’un distributeur : un seul envoi meme en appelant « Ajouter » deux fois, fiche en attente', async ({ page, context }) => {
           await loginForTest(page);
           // Point libre (a plus de 80 m de toute fiche, regle des 50 m) ; le telephone y est (regle des 30 m)
           const spot = await page.evaluate(() => {
               const rad = (x) => x * Math.PI / 180;
               const meters = (a, b) => {
                   const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
                   return 2 * 6371000 * Math.asin(Math.sqrt(h));
               };
               for (let k = 1; k < 300; k++) {
                   const p = { lat: 43.4929 + 0.0009 * k, lng: -1.4748 + 0.0007 * k };
                   if (window.AppState.distributors.every(d => meters(p, d) > 80)) return p;
               }
               return null;
           });
           expect(spot).not.toBeNull();
           await context.setGeolocation({ latitude: spot.lat, longitude: spot.lng });
           const posts = { distributors: [], products: [] };
           await page.route(url => /\/rest\/v1\/(distributors|products)$/.test(url.pathname), async route => {
               if (route.request().method() !== 'POST') return route.fallback();
               const table = new URL(route.request().url()).pathname.endsWith('/products') ? 'products' : 'distributors';
               posts[table].push(route.request().postDataJSON());
               await new Promise(r => setTimeout(r, 300));
               await route.fulfill({ status: 201, contentType: 'application/json', body: '' });
           });
           await page.click('#btn-add-distributor');
           await expect(page.locator('#placement-hint')).toHaveClass(/visible/);
           await page.evaluate(async (p) => {
               const { mainMap } = await import('./js/state.js');
               mainMap.fire('click', { latlng: window.L.latLng(p.lat, p.lng) });
           }, spot);
           await expect(page.locator('#new-dist-name')).toBeVisible();
           await page.fill('#new-dist-name', 'Distributeur itest');
           await page.evaluate(() => window.addProductRow());
           await page.locator('#add-products-list .product-name-input').first().fill('Oeufs itest');
           await page.evaluate(() => { window.confirmAddDistributor(); window.confirmAddDistributor(); });
           await expect(page.locator('#toast-container')).toContainText('après validation', { timeout: 15000 });
           expect(posts.distributors).toHaveLength(1);
           expect(posts.distributors[0]).toMatchObject({ name: 'Distributeur itest', is_user_added: true, price_range: '€€' });
           const id = posts.distributors[0].id;
           expect(posts.products).toEqual([[{ distributor_id: id, name: 'Oeufs itest', available: true }]]);
           const added = await page.evaluate((x) => {
               const d = window.AppState.distributors.find(v => v.id === x);
               return d ? { reviewStatus: d.reviewStatus, local: !!d.isLocalOnly } : null;
           }, id);
           expect(added).toEqual({ reviewStatus: 'pending', local: false });
       });
   ```
3. **tests/e2e/visiteur.spec.js** — test 1. Avant :
   ```js
       test('la carte se charge avec les distributeurs de la vraie base', async ({ page, context }) => {
   ```
   Après :
   ```js
       test('la carte se charge avec les distributeurs de la vraie base', async ({ page, context, request }) => {
   ```
   Puis, dans ce même test, juste **avant** sa ligne `expect(errors).toEqual([]);`, ajouter :
   ```js
           // TST-03 : les fiches viennent bien de la base, pas du JSON de secours (base en pause,
           // regle cassee) : memes identifiants que l'API (contexte neuf, aucune fiche locale)
           const res = await request.get(`${SUPABASE_URL}/rest/v1/distributors?select=id`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } });
           expect(res.ok()).toBe(true);
           const apiIds = (await res.json()).map(r => r.id).sort();
           const appIds = await page.evaluate(() => window.AppState.distributors.map(d => d.id).sort());
           expect(apiIds.length).toBeGreaterThan(1);
           expect(appIds).toEqual(apiIds);
   ```
4. **BACKLOG.md** : cocher TST-03 (`- [ ] TST-03` → `- [x] TST-03`).

## Tests
Les tests **sont** la story. Chacun doit être vu **rouge une fois** en cassant volontairement le code, avec un petit
script Node, puis **remis en état par `git checkout -- <fichier>`** (rien de cassé ne doit être commité) :
- **Premier lancement** : dans `js/app.js`, branche succès du **clic** (`btn.addEventListener('click', ...)`), retirer
  la ligne `hideGeolocOverlay(overlay);` **de cette branche seulement** (la 2e occurrence dans le fichier) → le test
  échoue (`toPass` expire). `git checkout -- js/app.js` → vert.
- **Ajout** : dans `js/add-distributor.js`, retirer la ligne `if (AddMode.submitting) return;` → 2 envois de la fiche,
  le test échoue sur `toHaveLength(1)`. `git checkout -- js/add-distributor.js` → vert.
- **E2E** : ne pas casser la base. Ajouter **temporairement**, au début du test 1, une interception qui coupe la
  lecture des fiches : `await page.route(url => url.pathname.endsWith('/rest/v1/distributors'), r => r.abort());`
  → l'app retombe sur le JSON, le test échoue sur `expect(appIds).toEqual(apiIds)`. Retirer la ligne → vert.
  (Le test E2E ne lit que la base, il n'écrit rien : on peut le lancer.)

## Vérification (dans l'ordre)
```bash
npm test                                                                      # tout vert
npx playwright test --project=functional -g "premier lancement|ajout d’un distributeur"   # 2 verts
npx playwright test --project=e2e -g "la carte se charge avec les distributeurs de la vraie base"   # vert (site en ligne, lecture seule)
npm run test:functional                                                       # en arrière-plan (~13 min) : tout vert, instables notés dans la PR
git diff --stat                                                               # onboarding.spec.js, donnees.spec.js, visiteur.spec.js, BACKLOG.md
```
Le serveur local doit répondre sur le port 8080 (`npx http-server -p 8080 -c-1`). **Ne pas** lancer toute la suite
E2E (`npm run test:e2e`) : elle écrit avec le compte de test ; seul le test E2E 1 (lecture seule) est lancé ici.

## Hors périmètre
- Les autres cas d'ajout (doublon à 50 m, trop loin à 30 m, échec réseau) : mis de côté (EPIC-R7).
- Le `catch` de `setupApp` qui masque l'accueil de force, l'assertion conditionnelle `if (overlay)` du test
  « la carte se charge apres validation geoloc » : mis de côté, ne pas y toucher.
- Aucun fichier de `js/` ne change (sauf les essais rouges, remis en état par `git checkout`).

## Pièges connus
- Le POST des produits porte un paramètre `?columns=...` : filtrer sur `url.pathname` (sans la requête), comme le code fourni.
- `window.L.latLng` : Leaflet est global dans la page ; `mainMap` vient de `./js/state.js` (import dynamique dans `evaluate`).
- Le bouton « Voir autour de moi » peut être visible avant d'avoir son gestionnaire : ne pas remplacer `toPass` par un simple `click`.
- Les essais rouges modifient `js/` : **toujours** `git checkout -- js/app.js js/add-distributor.js` avant de commiter,
  et vérifier `git status` (aucun fichier de `js/` modifié).

## Terminé quand
- [ ] Contrôles passés ; les 3 tests vus rouges une fois (code cassé volontairement, remis en état), puis verts
- [ ] Vérifications vertes
- [ ] Captures iPhone : non
- [ ] Story cochée dans BACKLOG.md, PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `test: premier lancement, ajout d'un distributeur et carte sur la vraie base (TST-03)`

**Corps** : constats couverts ; ce que chaque test joue ; preuves rouges (ligne retirée / lecture coupée, puis remise
en état) ; sorties des commandes de vérification ; éléments non faits.
