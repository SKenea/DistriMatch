# BUG-02 — App bloquée au démarrage après un ajout annulé

> **Ordre du lot 3 (EPIC-R3)** : BUG-07 → BUG-02 → BUG-13 → BUG-05 → BUG-04 → BUG-14 → BUG-03 → BUG-06 → BUG-11 → BUG-12 → BUG-15 → BUG-08 → BUG-09 → BUG-10. **Prérequis** : BUG-07 fusionnée dans master (sinon s'arrêter).

- **Lot** : 3. Bugs visibles · **Gravité** : élevé · **Niveau conseillé** : medium, relecture par un modèle plus fort avant fusion
- **Branche** : `fix/ajout-annule-demarrage` · **Taille** : 4 fichiers JS + 2 tests. Au-dessus de la limite de 3,
  **exception acceptée** : une seule chaîne de cause (l'ajout annulé crée la fiche, le démarrage
  plante dessus) ; `js/map.js` ne change que d'une ligne. Séparer laisserait des téléphones bloqués.
- **Constats couverts** (rapport du 2026-10-21) :
  - Annuler pendant la vérification GPS enregistre une fiche aux coordonnées nulles qui bloque ensuite l'app à chaque lancement — `js/add-distributor.js:408` (aujourd'hui ligne 415)
  - Init sans garde-fou ni validation des fiches locales : une fiche aux coordonnées invalides (ou Leaflet absent) bloque l'app à chaque démarrage — `js/app.js:570` (aujourd'hui ligne 579)

## But
Toucher « Annuler » pendant la vérification de position n'enregistre plus rien, et un téléphone
qui garde déjà une fiche sans position redémarre normalement (la fiche est retirée).

## User story
En tant que membre qui ajoute un distributeur puis change d'avis pendant que sa position est
vérifiée, je veux que « Annuler » annule vraiment, afin que l'app ne reste pas bloquée sur
« Chargement des distributeurs... » à chaque ouverture.

**Critères d'acceptation**
- [ ] « Annuler » touché pendant la vérification de position : aucune fiche n'est envoyée à la base ni gardée sur le téléphone.
- [ ] Repère glissé pendant la vérification : rien n'est enregistré, un message invite à toucher « Ajouter » à nouveau.
- [ ] Pendant l'envoi à la base (après la vérification), « Annuler » et « + » sont sans effet : la fiche part telle quelle.
- [ ] Une fiche locale à coordonnées nulles dans `snackmatch_user_distributors` : la carte s'affiche, les boutons répondent, la fiche est retirée du stockage.
- [ ] Si la carte ne peut pas s'afficher (erreur dans `initMainMap`), le chargeur disparaît, un message s'affiche et le reste de l'app (barre du bas, recherche, réglages) fonctionne.

## Pourquoi ça arrive (déjà analysé, ne pas refaire)
`confirmAddDistributorImpl` lit `AddMode.lat/lng`, attend `verifyUserOnSite` (GPS haute précision,
jusqu'à 10 s), puis **relit** `AddMode.lat/lng` pour construire la fiche. Pendant l'attente, seul
« Ajouter » est désactivé : « Annuler » (popup), « + » et `#placement-cancel` appellent
`cancelAddDistributor()`, qui remet `AddMode.lat/lng` à `null`. La fiche part avec `lat: null`,
la base la refuse (NOT NULL), elle est gardée en local (`isLocalOnly`). Leaflet ne sait pas placer
`[null, null]` (`toLatLng` renvoie `null`, puis `project(null)` lève une TypeError).
Au lancement suivant, `loadDistributors` fusionne la fiche sans contrôle, `initMainMap()` lève, et
comme le rappel `DOMContentLoaded` n'a aucun try/catch, ni le chargeur n'est masqué ni aucun
écouteur n'est posé. Seul l'effacement des données du site débloque.

La correction, en trois couches :
1. **Source** : position et repère figés au début ; après la vérification, abandon si l'ajout a
   été annulé ou le repère déplacé ; « Annuler » ignoré **seulement pendant l'envoi** (après la
   vérification, quand la base a peut-être déjà la fiche). Pendant la vérification, « Annuler »
   reste un vrai abandon : c'est ce que le test vérifie.
2. **Données** : aide `hasValidCoords` (la logique de `centroidOf`, qui exclut `null` et `''`
   car `Number(null) === 0`) ; fiches locales invalides écartées **et** retirées du stockage au
   chargement (répare les téléphones déjà touchés) ; `updateMapMarkers` les ignore.
3. **Init** : `initMainMap()` dans un try/catch ; la suite de l'init continue.

Après `publishDistributor`, on ne contrôle plus l'annulation : la base a peut-être déjà la fiche,
on garde donc la trace locale avec les valeurs figées (c'est pour ça qu'« Annuler » est ignoré à
ce moment-là).

## Avant de coder
**Lire en entier** : `js/add-distributor.js` lignes 1-20 et 245-483 ; `js/app.js` lignes 14-16,
126-206 et 550-625 ; `js/utils.js` lignes 346-402 et 632-643 ; `js/map.js` lignes 1-12 et 175-211 ;
`tests/functional/donnees.spec.js` lignes 1-116 ; `tests/functional/helpers.js` lignes 35-84 et 326-344.

**Réutiliser** (ne pas réécrire) : `removeUserDistributors(ids)` et `loadUserDistributors()`
(`js/utils.js`), `showToast` (`js/utils.js`, déjà importée dans app.js et add-distributor.js),
`routeEditWrites(page, { fail })` et `passWelcome(page)` (`tests/functional/helpers.js`).

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
grep -n 'export function cancelAddDistributor() {' js/add-distributor.js       # attendu : ligne 249
grep -n 'AddMode.submitting = false;' js/add-distributor.js                    # attendu : ligne 354 (finally de confirmAddDistributor)
grep -n 'if (!typeSelect || !nameInput) return;' js/add-distributor.js         # attendu : ligne 367
grep -n 'calculateDistance(AddMode.lat, AddMode.lng, d.lat, d.lng)' js/add-distributor.js   # attendu : ligne 394
grep -n 'verifyUserOnSite(AddMode.lat, AddMode.lng, 30)' js/add-distributor.js # attendu : ligne 403
grep -n 'lat: AddMode.lat,' js/add-distributor.js                              # attendu : ligne 415
grep -n 'const published = await publishDistributor(newDistributor);' js/add-distributor.js # attendu : ligne 431
grep -n 'let userDistributors = loadUserDistributors();' js/app.js             # attendu : ligne 149
grep -n '^    initMainMap();' js/app.js                                        # attendu : ligne 579, une seule
grep -n 'export function centroidOf(points) {' js/utils.js                     # attendu : ligne 635
grep -n 'const filteredDistributors = getFilteredDistributors();' js/map.js    # attendu : ligne 181
grep -rn 'hasValidCoords' js/ tests/                                           # attendu : aucune ligne
grep -n '"./js/app.js": "./js/app.js?v=' index.html                            # attendu : ?v=95 ou plus (valeur courante)
```

## Étapes

1. **js/utils.js** — nouvelle aide `hasValidCoords`, et `centroidOf` la réutilise.
   Avant :
   ```js
   export function centroidOf(points) {
       const valid = (Array.isArray(points) ? points : []).filter(p =>
           p && p.lat !== null && p.lat !== '' && p.lng !== null && p.lng !== ''
               && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))
       );
   ```
   Après :
   ```js
   export function centroidOf(points) {
       const valid = (Array.isArray(points) ? points : []).filter(p => hasValidCoords(p));
   ```
   Puis, juste **au-dessus** du commentaire `// Centre geometrique d'une liste de points { lat, lng } (coordonnees`
   (ligne 632), ajouter :
   ```js
   // Coordonnees utilisables par la carte : nombres finis (texte numerique accepte),
   // ni null ni '' (Number(null) === 0 passerait sinon). BUG-02 : une fiche sans
   // position bloquait Leaflet, donc tout le demarrage.
   export function hasValidCoords(p) {
       return !!p && p.lat !== null && p.lat !== '' && p.lng !== null && p.lng !== ''
           && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng));
   }

   ```

2. **js/add-distributor.js** — import de l'aide.
   Avant :
   ```js
       compressImage
   } from './utils.js';
   ```
   Après :
   ```js
       compressImage, hasValidCoords
   } from './utils.js';
   ```

3. **js/add-distributor.js** — « Annuler » ignoré pendant l'envoi.
   Avant :
   ```js
   export function cancelAddDistributor() {
       if (AddMode.marker) {
   ```
   Après :
   ```js
   // BUG-02 : vrai pendant l'envoi a la base et l'enregistrement local (confirmAddDistributorImpl) ;
   // « Annuler » et « + » sont alors ignores, la fiche part telle quelle
   let isPublishing = false;

   export function cancelAddDistributor() {
       if (isPublishing) return;
       if (AddMode.marker) {
   ```

4. **js/add-distributor.js** — `confirmAddDistributor` : le drapeau retombe toujours.
   Avant :
   ```js
       } finally {
           AddMode.submitting = false;
   ```
   Après :
   ```js
       } finally {
           AddMode.submitting = false;
           isPublishing = false;
   ```

5. **js/add-distributor.js** — `confirmAddDistributorImpl`, cinq remplacements dans l'ordre.
   a) Figer position et repère. Avant :
   ```js
       if (!typeSelect || !nameInput) return;

       const type = typeSelect.value;
   ```
   Après :
   ```js
       if (!typeSelect || !nameInput) return;

       // BUG-02 : position et repere figes ici. Pendant l'attente du GPS, « Annuler »,
       // « + » ou un glisser du repere changent AddMode : on ne le relit plus apres un await.
       const lat = AddMode.lat;
       const lng = AddMode.lng;
       const marker = AddMode.marker;
       if (!hasValidCoords({ lat, lng })) {
           showToast('Place d’abord le repère sur la carte', 'error');
           return;
       }

       const type = typeSelect.value;
   ```
   b) Contrôle des doublons. Avant :
   ```js
           const distKm = calculateDistance(AddMode.lat, AddMode.lng, d.lat, d.lng);
   ```
   Après :
   ```js
           const distKm = calculateDistance(lat, lng, d.lat, d.lng);
   ```
   c) Après la vérification de position. Avant :
   ```js
       const onSite = await verifyUserOnSite(AddMode.lat, AddMode.lng, 30);
       if (!onSite) return;
   ```
   Après :
   ```js
       const onSite = await verifyUserOnSite(lat, lng, 30);
       if (!onSite) return;
       // BUG-02 : ajout annule pendant la verification (« Annuler », « + », nouvel ajout) : rien n'est enregistre
       if (!AddMode.active || AddMode.marker !== marker) return;
       // Repere deplace pendant la verification : la nouvelle position n'a ete controlee
       // ni pour la presence sur place (30 m) ni pour le doublon (50 m)
       if (AddMode.lat !== lat || AddMode.lng !== lng) {
           showToast('Le repère a bougé : touche « Ajouter » pour vérifier ce nouvel emplacement', 'warning');
           return;
       }
   ```
   d) La fiche prend les valeurs figées. Avant :
   ```js
           lat: AddMode.lat,
           lng: AddMode.lng,
   ```
   Après :
   ```js
           lat: lat,
           lng: lng,
   ```
   e) Début de l'envoi. Avant :
   ```js
       const published = await publishDistributor(newDistributor);
   ```
   Après :
   ```js
       // BUG-02 : a partir d'ici « Annuler » est ignore : la base a peut-etre deja la fiche
       isPublishing = true;
       const published = await publishDistributor(newDistributor);
   ```
   Ne rien changer d'autre dans la fonction (la fin, qui remet `AddMode` à zéro, reste telle quelle).

6. **js/map.js** — `updateMapMarkers` ignore les fiches sans position.
   a) Import, avant :
   ```js
   import { showToast, getFilteredDistributors, centroidOf, escapeHTML, pinsNear, zoomFromDrag } from './utils.js';
   ```
   après :
   ```js
   import { showToast, getFilteredDistributors, centroidOf, escapeHTML, pinsNear, zoomFromDrag, hasValidCoords } from './utils.js';
   ```
   b) Avant :
   ```js
       const filteredDistributors = getFilteredDistributors();
   ```
   après :
   ```js
       // BUG-02 : jamais de pastille sans position (Leaflet leverait une TypeError)
       const filteredDistributors = getFilteredDistributors().filter(hasValidCoords);
   ```

7. **js/app.js** — import, fiches locales invalides retirées, carte sous try/catch.
   a) Ligne 15, avant :
   ```js
       showToast, getUserLocation, sortByDistance, loadFromLocalStorage, loadProfile, loadConversations, loadNotificationPrefs, loadNotificationQueue, loadUserDistributors, saveUserDistributor, mapDistributorRow, findLocalDuplicates, removeUserDistributors, saveToLocalStorage
   ```
   après :
   ```js
       showToast, getUserLocation, sortByDistance, loadFromLocalStorage, loadProfile, loadConversations, loadNotificationPrefs, loadNotificationQueue, loadUserDistributors, saveUserDistributor, mapDistributorRow, findLocalDuplicates, removeUserDistributors, saveToLocalStorage, hasValidCoords
   ```
   b) Dans `loadDistributors`, avant :
   ```js
       let userDistributors = loadUserDistributors();
   ```
   après :
   ```js
       let userDistributors = loadUserDistributors();
       // BUG-02 : une fiche locale sans position valide (ajout annule pendant la
       // verification de position, avant le correctif) bloquait la carte a chaque
       // demarrage : elle est ecartee et retiree du telephone.
       const invalidIds = userDistributors.filter((d) => !hasValidCoords(d)).map((d) => d.id);
       if (invalidIds.length > 0) {
           removeUserDistributors(invalidIds);
           userDistributors = userDistributors.filter((d) => hasValidCoords(d));
           console.warn('[DistriMatch] Fiches locales sans position retirees:', invalidIds.length);
       }
   ```
   c) Dans le rappel `DOMContentLoaded`, avant :
   ```js
       // Initialiser la carte
       initMainMap();
   ```
   après :
   ```js
       // Initialiser la carte. BUG-02 : une erreur ici (Leaflet absent, pastille
       // impossible) ne laisse plus le chargeur affiche ni l'app sans boutons.
       try {
           initMainMap();
       } catch (e) {
           console.error('[DistriMatch] Carte indisponible :', e);
           showToast('La carte n’a pas pu s’afficher : recharge la page pour réessayer', 'error');
       }
   ```
   Le masquage du chargeur, juste après, ne change pas : il s'exécute maintenant dans les deux cas.

8. **index.html** — quatre modules JS changent : partir de la valeur courante de master
   (`grep -n '"./js/app.js": "./js/app.js?v=' index.html`), **+1 sur toutes les entrées** de
   l'import map, à la même valeur (ex. `?v=95` → `?v=96` partout). Aucun CSS ne change.

## Tests

### Test 1 — `hasValidCoords` (unitaire)
- **Fichier** : `tests/unit/unit.test.js`.
- a) Import, ligne 20, avant :
  ```js
      timeAgo, getFreshness, getDeviceId, buildAvailabilityPayload, describeRhythm, centroidOf, resolveProductStatus, resolveMachineStatus, describeSignalError, isBusinessSignalError, describeFicheHero,
  ```
  après :
  ```js
      timeAgo, getFreshness, getDeviceId, buildAvailabilityPayload, describeRhythm, centroidOf, hasValidCoords, resolveProductStatus, resolveMachineStatus, describeSignalError, isBusinessSignalError, describeFicheHero,
  ```
- b) Juste après la fin du bloc `describe('centroidOf (centre des distributeurs charges)', () => { ... });`
  (avant le commentaire « FICHE : DISPO OU PAS (EPIC-T2) »), ajouter :
  ```js

  // BUG-02 : une fiche sans position bloquait Leaflet, donc tout le demarrage
  describe('hasValidCoords (BUG-02 : jamais de pastille sans position)', () => {
      it('accepte des nombres finis, y compris en texte', () => {
          assert.equal(hasValidCoords({ lat: 43.49, lng: -1.47 }), true);
          assert.equal(hasValidCoords({ lat: '43.49', lng: '-1.47' }), true);
          assert.equal(hasValidCoords({ lat: 0, lng: 0 }), true);
      });
      it('refuse null, vide, absent, non numerique, infini', () => {
          assert.equal(hasValidCoords({ lat: null, lng: null }), false);
          assert.equal(hasValidCoords({ lat: 43.49, lng: null }), false);
          assert.equal(hasValidCoords({ lat: '', lng: '' }), false);
          assert.equal(hasValidCoords({ lat: 'x', lng: 0 }), false);
          assert.equal(hasValidCoords({ lat: Infinity, lng: 0 }), false);
          assert.equal(hasValidCoords({ name: 'sans position' }), false);
          assert.equal(hasValidCoords(null), false);
          assert.equal(hasValidCoords(undefined), false);
      });
  });
  ```
- **Doit échouer avant** : `npm test` s'arrête sur l'import (`does not provide an export named 'hasValidCoords'`).

### Test 2 et 3 — annuler pendant la vérification, démarrage avec une fiche sans position (fonctionnels)
- **Fichier** : `tests/functional/donnees.spec.js`.
- a) Import, ligne 8, avant :
  ```js
  import { captureEvents, setupApp, openDistModal, loginForTest, RPC_ROUTE, openSignalableFiche, signalFirstProduct, chooseMachineState, routeSignals, routeEditWrites, kpiFixture, routeKpi } from './helpers.js';
  ```
  après :
  ```js
  import { captureEvents, setupApp, openDistModal, loginForTest, RPC_ROUTE, openSignalableFiche, signalFirstProduct, chooseMachineState, routeSignals, routeEditWrites, kpiFixture, routeKpi, passWelcome } from './helpers.js';
  ```
- b) Nouveau bloc **à la fin du fichier** :
  ```js

  // ============================================
  // AJOUT ANNULE ET DEMARRAGE ROBUSTE (BUG-02)
  // ============================================

  test.describe('Ajout annulé et démarrage robuste (BUG-02)', () => {
      test('annuler pendant la vérification de position n\'enregistre rien', async ({ page }) => {
          const NAME = 'ZZ-BUG02-ANNULE-' + Date.now();
          // Aucune ecriture reelle : l'envoi a la base est intercepte et refuse
          const writes = await routeEditWrites(page, { fail: { method: 'POST', table: 'distributors', status: 401, code: '42501' } });
          await loginForTest(page);

          // Emplacement libre (aucun distributeur a moins de 60 m) pres du centre de la carte
          const spot = await page.evaluate(async () => {
              const { mainMap } = await import('./js/state.js');
              const { calculateDistance } = await import('./js/utils.js');
              const c = mainMap.getCenter();
              for (let k = 0; k < 50; k++) {
                  const lat = c.lat + k * 0.001;
                  const free = window.AppState.distributors.every((d) => !(calculateDistance(lat, c.lng, Number(d.lat), Number(d.lng)) * 1000 < 60));
                  if (free) return { lat, lng: c.lng };
              }
              return null;
          });
          expect(spot).not.toBeNull();

          // GPS de verification (haute precision, maximumAge 0) mis en attente : le test decide quand il repond
          await page.evaluate(() => {
              window.__gpsWaiting = [];
              const real = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
              navigator.geolocation.getCurrentPosition = function (ok, err, opts) {
                  if (opts && opts.enableHighAccuracy && opts.maximumAge === 0) { window.__gpsWaiting.push(ok); return; }
                  return real(ok, err, opts);
              };
          });

          await page.click('#btn-add-distributor');
          await page.waitForSelector('#placement-hint.visible', { timeout: 3000 });
          await page.evaluate(async (s) => {
              const { mainMap } = await import('./js/state.js');
              mainMap.fire('click', { latlng: L.latLng(s.lat, s.lng) });
          }, spot);
          await page.waitForSelector('.add-distributor-popup', { timeout: 3000 });
          await page.fill('#new-dist-name', NAME);
          await page.click('#btn-confirm-add');
          await page.waitForFunction(() => window.__gpsWaiting.length > 0, null, { timeout: 3000 });

          // Pendant la verification : « Annuler »
          await page.click('.add-distributor-popup .btn-cancel');
          await expect(page.locator('.add-distributor-popup')).toHaveCount(0);

          // Le GPS repond ensuite : sur place
          await page.evaluate((s) => {
              window.__gpsWaiting.splice(0).forEach((ok) => ok({ coords: { latitude: s.lat, longitude: s.lng, accuracy: 5 }, timestamp: Date.now() }));
          }, spot);
          await page.waitForFunction(() => window.AddMode.submitting === false, null, { timeout: 5000 });

          expect(writes.filter((w) => w.table === 'distributors')).toHaveLength(0);
          const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('snackmatch_user_distributors') || '[]'));
          expect(saved.filter((d) => d.name === NAME)).toHaveLength(0);
          expect(await page.evaluate((n) => window.AppState.distributors.some((d) => d.name === n), NAME)).toBe(false);
      });

      test('une fiche locale sans position ne bloque pas le démarrage et est retirée', async ({ page }) => {
          await page.evaluate(() => {
              const base = { type: 'other', emoji: '📦', address: '', city: 'Test', rating: 0,
                  reviewCount: 0, status: 'verified', priceRange: '€', products: [], isUserAdded: true };
              localStorage.setItem('snackmatch_user_distributors', JSON.stringify([
                  { ...base, id: 'user-bug02-null', name: 'ZZ-BUG02-SANS-POSITION', lat: null, lng: null },
                  { ...base, id: 'user-bug02-ok', name: 'ZZ-BUG02-OK', lat: 43.4931, lng: -1.4752 }
              ]));
          });
          await page.reload();
          await passWelcome(page);

          // Le chargeur disparait (avant le correctif : il restait affiche, initMainMap levait)
          await page.waitForFunction(() => {
              const l = document.getElementById('map-loader');
              return !l || l.classList.contains('hidden');
          }, null, { timeout: 20000 });
          // Les boutons repondent
          await page.click('.bottom-nav [data-tab="favorites"]');
          await page.waitForSelector('#subscriptions-view.view-active', { timeout: 3000 });

          const ids = await page.evaluate(() => window.AppState.distributors.map((d) => d.id));
          expect(ids).not.toContain('user-bug02-null');
          expect(ids).toContain('user-bug02-ok');
          const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('snackmatch_user_distributors') || '[]').map((d) => d.id));
          expect(saved).toEqual(['user-bug02-ok']);
      });
  });
  ```
- **Doivent échouer avant la correction** :
  - test « annuler... » : la fiche part quand même avec `lat: null` ; `writes` contient un POST
    sur `distributors` (assertion `toHaveLength(0)` reçoit 1), et la fiche est dans le stockage.
    (Si Supabase est hors ligne en local, aucun POST n'a lieu mais l'assertion du stockage échoue.)
  - test « une fiche locale... » : l'attente du chargeur masqué expire (20 s), `initMainMap` lève.

## Vérification (dans l'ordre)
```bash
grep -n 'AddMode.lat' js/add-distributor.js     # attendu : 6 lignes exactement : onMapClickForPlacement (41), dragend (62),
                                                #   cancelAddDistributor (255), « const lat = AddMode.lat; », la garde
                                                #   « if (AddMode.lat !== lat ... », la remise a zero en fin de fonction
npm test                                        # tout vert, dont « hasValidCoords », « centroidOf » et « cache-busting »
npx playwright test --project=functional -g "BUG-02"                    # 2 passed
npx playwright test --project=functional -g "Dedup|Confirmation maison" # tout vert (meme fichier)
npm run test:functional                         # en arrière-plan (~10 min) : tout vert, instables notés dans la PR
```

## Hors périmètre
- `clearUserData` qui n'efface pas `snackmatch_user_distributors` (« Effacer mes données ») : autre story.
- `findLocalDuplicates` : inutile d'y toucher, les fiches invalides sont retirées avant lui.
- Isoler chaque étape de l'init (panneau latéral, filtres...) dans son propre try/catch : seul `initMainMap` est protégé ici.
- Désactiver le glisser du repère ou griser « Annuler » pendant l'envoi : non, l'envoi utilise les valeurs figées.
- Le commentaire mal placé « Garde anti double-soumission » au-dessus de `publishDistributor` : ne pas le déplacer.

## Pièges connus
- Poser `isPublishing = true` **juste avant** `publishDistributor`, pas au début de la fonction :
  sinon « Annuler » serait ignoré pendant la vérification et le test 2 échouerait (fiche enregistrée).
- `let isPublishing` au **niveau du module** (étape 3), pas dans une fonction.
- Ne plus lire `AddMode.lat/lng` dans `confirmAddDistributorImpl` sauf dans la garde de l'étape 5c.
- `hasValidCoords` garde les tests `!== null` et `!== ''` : `Number(null)` et `Number('')` valent 0, fini.
- Filtrer les fiches invalides **avant** le bloc EPIC-T9 (`findLocalDuplicates`), donc juste après `loadUserDistributors()`.
- Dans le test, `mainMap` vient de `await import('./js/state.js')` (même module grâce à l'import map) :
  il n'existe pas de `window.mainMap`. `L` est global (Leaflet chargé par `index.html`).
- Le faux GPS ne capture que les appels haute précision avec `maximumAge: 0` ; les autres passent au vrai.
- Bump de **toutes** les entrées de l'import map à la **même** valeur. Si BUG-03 a été fusionnée
  avant, repartir de la valeur de master à jour.

## Terminé quand
- [ ] Contrôles passés, tests écrits (échouent avant, passent après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : oui, écran `carte` seulement, en non-régression (`node tests/tools/capture-iphone.mjs BUG-02-avant-carte carte`, puis `BUG-02-apres-carte`) ; avant et après identiques à l'œil. Aucun écran du script ne reproduit le blocage : il est couvert par le test 3.
- [ ] Story cochée dans BACKLOG.md si elle y figure ; sinon, le noter dans la PR. PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `fix(ajout): annuler pendant la verification n'enregistre plus rien, demarrage robuste`

**Corps** : constats corrigés (les deux ci-dessus), cause (`AddMode` relu après l'attente du GPS,
fiche `lat: null` gardée en local, `initMainMap` sans garde-fou), correction en trois couches
(valeurs figées + abandon, `hasValidCoords` + nettoyage du stockage, try/catch de la carte),
comportement de « Annuler » (vrai abandon pendant la vérification, ignoré pendant l'envoi), tests
ajoutés, sorties des commandes, captures, éléments non faits (`clearUserData`).
