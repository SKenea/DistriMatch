# BUG-10 — « Centrer sur ma position » ne recalcule pas les distances

> **Ordre du lot 3 (EPIC-R3)** : BUG-07 → BUG-02 → BUG-13 → BUG-05 → BUG-04 → BUG-14 → BUG-03 → BUG-06 → BUG-11 → BUG-12 → BUG-15 → BUG-08 → BUG-09 → BUG-10. **Prérequis** : BUG-09 fusionnée dans master (sinon s'arrêter).

- **Lot** : 3. Bugs visibles · **Gravité** : moyen · **Niveau conseillé** : medium
- **Branche** : `fix/centrer-recalcule-distances` · **Taille** : 2 fichiers JS + 1 test fonctionnel (+ `index.html` pour les `?v=`)
- **Constats couverts** (rapport du 2026-10-21) :
  - « Centrer sur ma position » met la position à jour sans recalculer les distances : liste, fiche et « Près de toi » restent sur la position de lancement — `js/map.js:337`

## But
Après « Centrer sur ma position », la liste ouverte (tranches « À proximité / À côté / Plus
loin »), la distance de la fiche ouverte et les suggestions « Près de toi » de la recherche
partent de la nouvelle position, plus de celle du lancement de l'app.

## User story
En tant que visiteur qui a gardé l'app ouverte en se déplaçant, je veux que « Centrer sur ma
position » mette aussi à jour les distances, afin que la liste me montre les distributeurs
vraiment proches de là où je suis.

**Critères d'acceptation**
- [ ] Après « Centrer sur ma position », `AppState.distributors[i].distance` est recalculé depuis
      la nouvelle position (et la liste reste triée par distance).
- [ ] Liste ouverte : la distance affichée d'une ligne est celle depuis la nouvelle position, et
      la ligne est dans la bonne tranche.
- [ ] Fiche ouverte : « À propos » affiche la distance depuis la nouvelle position.
- [ ] Recherche vide ouverte ensuite : « Près de toi » propose les distributeurs proches de la
      nouvelle position (conséquence directe du recalcul, rien de plus à coder).

## Pourquoi ça arrive (déjà analysé, ne pas refaire)
`centerMapOnUser` (`js/map.js` ligne 319) écrit `AppState.userLocation = { lat, lng }` (ligne 337),
déplace le point bleu et recentre la carte, mais n'appelle pas `sortByDistance()`
(`js/utils.js` ligne 404). Or `d.distance` n'est calculé **que** par `sortByDistance()`, appelé au
démarrage (`js/app.js` lignes 204 et 571). La liste (`openSidePanelForFilters`, `js/gmaps-ui.js`),
la fiche (`openDistributorModal`) et « Près de toi » (`renderSearchSuggestions`,
`js/navigation.js`) lisent tous `d.distance`.

La correction :
1. `map.js` appelle `sortByDistance()` juste après la mise à jour de la position, puis émet un
   événement `distrimatch:location` (même principe que `SUMMARIES_EVENT` de `summaries.js`).
2. `gmaps-ui.js` écoute cet événement (dans `initSidePanel`, à côté de l'écoute de
   `SUMMARIES_EVENT`) : liste ouverte → reconstruite par `openSidePanelForFilters(currentFilter)`
   (n'ajoute pas de couche d'historique, puisque le panneau est déjà ouvert) ; fiche ouverte →
   `#dist-apropos-distance` réécrit.

`map.js` ne doit **pas** importer `gmaps-ui.js` (qui importe déjà `map.js`) : d'où l'événement.
La page Favoris n'affiche pas de distance (vérifié dans `js/distributor.js`) : rien à y faire.
« Près de toi » est recalculé à chaque ouverture de la recherche : rien à y faire.

## Avant de coder
**Lire en entier** : `js/map.js` lignes 1 à 12 (imports) et 319 à 369 (`centerMapOnUser`) ;
`js/gmaps-ui.js` lignes 1 à 30 (imports, `currentFilter`), 116 à 232 (`initSidePanel`,
`refreshSidePanelSummaries`, `openSidePanelForFilters`) et 428 à 471 (`openDistributorModal`,
écriture de `#dist-apropos-distance`) ; `js/utils.js` lignes 404 à 417 (`sortByDistance`).

**Réutiliser** (ne pas réécrire) : `sortByDistance` — `js/utils.js` ; `openSidePanelForFilters`
et `formatDistance` (déjà importé) — `js/gmaps-ui.js`.

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
grep -n "zoomFromDrag } from './utils.js';" js/map.js                           # attendu : ligne 10
grep -n 'AppState.userLocation = { lat, lng };' js/map.js                        # attendu : ligne 337, une seule
grep -n "showToast('Centre sur ta position', 'success');" js/map.js              # attendu : ligne 359
grep -n "import { locateOnMap, setSelectedPin, updateMapMarkers } from './map.js';" js/gmaps-ui.js # attendu : ligne 20
grep -n 'document.addEventListener(SUMMARIES_EVENT, refreshSidePanelSummaries);' js/gmaps-ui.js   # attendu : ligne 119
grep -n '^export function openSidePanelForType' js/gmaps-ui.js                   # attendu : ligne 148
grep -n '^let currentFilter = null;' js/gmaps-ui.js                              # attendu : ligne 28
grep -n 'export function sortByDistance' js/utils.js                             # attendu : ligne 404
grep -rn 'distrimatch:location' js/                                              # attendu : aucune ligne
grep -n '"./js/app.js": "./js/app.js?v=' index.html                              # attendu : ?v=95 (ou plus)
```

## Étapes
1. **js/map.js**, import depuis `./utils.js` (ligne 10) — ajouter `sortByDistance`.
   Avant :
   ```js
   import { showToast, getFilteredDistributors, centroidOf, escapeHTML, pinsNear, zoomFromDrag } from './utils.js';
   ```
   Après :
   ```js
   import { showToast, getFilteredDistributors, centroidOf, escapeHTML, pinsNear, zoomFromDrag, sortByDistance } from './utils.js';
   ```
2. **js/map.js**, juste au-dessus de `centerMapOnUser` (ligne 319) — nom de l'événement.
   Avant :
   ```js
   export function centerMapOnUser() {
       if (!mainMap) {
   ```
   Après :
   ```js
   // Position relue par « Centrer sur ma position » (BUG-10) : les distances sont deja
   // recalculees (sortByDistance) ; la liste et la fiche ouvertes suivent (gmaps-ui.js)
   export const LOCATION_EVENT = 'distrimatch:location';

   export function centerMapOnUser() {
       if (!mainMap) {
   ```
3. **js/map.js**, dans le rappel de succès (ligne 337) — recalculer les distances.
   Avant :
   ```js
               // Mettre a jour la position dans l'etat
               AppState.userLocation = { lat, lng };
   ```
   Après :
   ```js
               // Mettre a jour la position dans l'etat
               AppState.userLocation = { lat, lng };
               // ... et les distances qui en dependent (liste, fiche, « Près de toi »), BUG-10
               sortByDistance();
   ```
4. **js/map.js**, fin du rappel de succès (ligne 359) — prévenir l'interface.
   Avant :
   ```js
               showToast('Centre sur ta position', 'success');
   ```
   Après :
   ```js
               showToast('Centre sur ta position', 'success');
               document.dispatchEvent(new CustomEvent(LOCATION_EVENT));
   ```
5. **js/gmaps-ui.js**, import depuis `./map.js` (ligne 20).
   Avant :
   ```js
   import { locateOnMap, setSelectedPin, updateMapMarkers } from './map.js';
   ```
   Après :
   ```js
   import { locateOnMap, setSelectedPin, updateMapMarkers, LOCATION_EVENT } from './map.js';
   ```
6. **js/gmaps-ui.js**, dans `initSidePanel` (ligne 119) — écouter l'événement.
   Avant :
   ```js
       document.addEventListener(SUMMARIES_EVENT, refreshSidePanelSummaries);
   ```
   Après :
   ```js
       document.addEventListener(SUMMARIES_EVENT, refreshSidePanelSummaries);
       // BUG-10 : nouvelle position -> la liste et la fiche ouvertes affichent les nouvelles distances
       document.addEventListener(LOCATION_EVENT, refreshDistances);
   ```
7. **js/gmaps-ui.js**, juste au-dessus de `openSidePanelForType` (ligne 148) — la fonction appelée.
   Avant :
   ```js
   export function openSidePanelForType(type) {
   ```
   Après :
   ```js
   // Position relue (« Centrer sur ma position », BUG-10) : d.distance est deja a jour
   // (sortByDistance, map.js). La liste ouverte est reconstruite (tranches de distance)
   // et la distance de la fiche ouverte est reecrite.
   function refreshDistances() {
       if (document.getElementById('sidebar')?.classList.contains('open')) {
           openSidePanelForFilters(currentFilter || []);
       }
       const d = AppState.currentDistributor;
       const distanceEl = document.getElementById('dist-apropos-distance');
       if (d && distanceEl && document.getElementById('dist-modal-overlay')?.classList.contains('active')) {
           distanceEl.textContent = d.distance ? formatDistance(d.distance) : 'Distance non disponible';
       }
   }

   export function openSidePanelForType(type) {
   ```
8. **index.html** — import map : monter le `?v=` de **toutes** les entrées à la même valeur
   (aujourd'hui `?v=95` → `?v=96` ; si master a bougé, valeur courante + 1). Aucun CSS ne change.

Contrôle après les étapes : `git diff --stat` montre `js/map.js` (+8 lignes environ),
`js/gmaps-ui.js` (+17 environ), `index.html`, `tests/functional/navigation.spec.js`, rien d'autre.

## Tests
- **Fichier** : `tests/functional/navigation.spec.js`, **à la toute fin du fichier** (après le
  `test.describe('Sécurité : identifiant piégé (SEC-02)'`). `openDistModal` est déjà importé
  en haut ; le `beforeEach` du fichier lance `setupApp` (position Bayonne 43.4929, -1.4748).
- **Nom** : `48. Centrer sur ma position (BUG-10)` (2 tests)
- **Code à ajouter** :
  ```js

  // ============================================
  // 48. CENTRER SUR MA POSITION (BUG-10)
  // ============================================
  test.describe('48. Centrer sur ma position (BUG-10)', () => {
      // Saint-Jean-de-Luz : une vingtaine de km de la position Bayonne de setupApp
      const FAR = { latitude: 43.3881, longitude: -1.6631 };

      async function distanceOf(page, id) {
          return page.evaluate(x => window.AppState.distributors.find(d => d.id === x).distance, id);
      }

      // Le telephone a bouge, puis « Centrer sur ma position ». Clic DOM : sur grand ecran,
      // la liste ou la fiche ouvertes peuvent recouvrir le bouton (on teste le recalcul, pas le clic).
      async function moveAndCenter(page, context, id, before) {
          await context.setGeolocation(FAR);
          await page.evaluate(() => document.getElementById('center-map').click());
          await page.waitForFunction(([x, b]) => {
              const d = window.AppState.distributors.find(y => y.id === x);
              return Math.abs(d.distance - b) > 1;
          }, [id, before], { timeout: 10000 });
          return page.evaluate(async (x) => {
              const u = await import('./js/utils.js');
              return u.formatDistance(window.AppState.distributors.find(d => d.id === x).distance);
          }, id);
      }

      test('la liste ouverte affiche les distances depuis la nouvelle position', async ({ page, context }) => {
          await page.evaluate(async () => { const g = await import('./js/gmaps-ui.js'); g.openSidePanelForType('all'); });
          const id = await page.locator('#side-panel-list .side-panel-item').first().getAttribute('data-id');
          const before = await distanceOf(page, id);
          const expected = await moveAndCenter(page, context, id, before);
          await expect(page.locator(`#side-panel-list .side-panel-item[data-id="${id}"] .side-panel-item-distance`)).toHaveText(expected);
      });

      test('la fiche ouverte affiche la distance depuis la nouvelle position', async ({ page, context }) => {
          await openDistModal(page, 0);
          const id = await page.evaluate(() => window.AppState.currentDistributor.id);
          const before = await distanceOf(page, id);
          const expected = await moveAndCenter(page, context, id, before);
          await expect(page.locator('#dist-apropos-distance')).toHaveText(expected);
      });
  });
  ```
- **Doit échouer avant la correction** (vérifié sur le code actuel) : les 2 tests échouent sur
  `page.waitForFunction: Timeout 10000ms exceeded` (la distance ne change jamais).
- Après la correction, vérifié : la distance passe de 0 (ou quelques centaines de mètres) à
  « 19 km » dans la liste et dans la fiche.

## Vérification (dans l'ordre)
```bash
npx playwright test --project=functional -g "48. Centrer"            # 2 passed
npx playwright test --project=functional -g "3ter. Groupes"          # tous passent (tranches de distance)
npx playwright test --project=functional -g "39. Voir sur la carte"  # tous passent
npm test                                                              # tout vert (dont cache-busting)
npm run test:functional                                               # en arrière-plan (~10 min) : tout vert, instables notés
```

## Hors périmètre
- Relire la position au retour au premier plan (`visibilitychange`) ou suivre la position en
  continu (`watchPosition`) : c'est la cause de fond, à traiter dans une autre story.
- Les pastilles de la carte, la surveillance de zone (`notifications.js`), la page Favoris
  (pas de distance affichée) : ne pas y toucher.
- `centerMapOnUser` en cas d'erreur de géolocalisation : inchangé (pas d'événement émis).
- Garder ouverte la même tranche de l'accordéon après reconstruction de la liste : non (voir Pièges).

## Pièges connus
- **Ne pas importer `gmaps-ui.js` dans `map.js`** (import circulaire) : passer par l'événement.
- `sortByDistance()` **après** `AppState.userLocation = ...`, sinon il recalcule depuis l'ancienne
  position. L'événement est émis seulement dans le rappel de **succès**.
- `refreshDistances` est une déclaration `function` (convention du projet), posée au niveau du
  module, pas à l'intérieur d'une autre fonction.
- Reconstruire la liste rouvre la première tranche non vide et referme les autres : c'est voulu
  (les lignes ont pu changer de tranche).
- Dans le test, la distance « avant » se lit **avant** `setGeolocation` (sinon on compare la
  nouvelle à elle-même et le test attend pour rien). Ne pas comparer l'ancien **texte** affiché :
  près de Bayonne, la première fiche peut être à 0 km et n'afficher aucune distance.
- `toHaveText` réessaie seul : ne pas ajouter de `waitForTimeout`.

## Terminé quand
- [ ] Contrôles passés, test écrit (échoue avant, passe après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : non (le défaut ne se voit qu'après un déplacement)
- [ ] BUG-10 absent de `BACKLOG.md` à ce jour : ne pas l'ajouter, le noter dans la PR ; PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `fix(carte): « Centrer sur ma position » recalcule les distances`

**Corps** : constat corrigé (liste, fiche et « Près de toi » restaient sur la position du
lancement), correction (`sortByDistance()` après la nouvelle position, événement
`distrimatch:location` écouté par `gmaps-ui.js` : liste et fiche ouvertes rafraîchies), tests
fonctionnels ajoutés, sorties des commandes, hors périmètre noté (relecture de la position au
retour au premier plan), « BUG-10 pas encore dans BACKLOG.md ».
