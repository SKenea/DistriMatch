# BUG-03 — Type « Produits agricoles » absent de la liste des types

> **Ordre du lot 3 (EPIC-R3)** : BUG-07 → BUG-02 → BUG-13 → BUG-05 → BUG-04 → BUG-14 → BUG-03 → BUG-06 → BUG-11 → BUG-12 → BUG-15 → BUG-08 → BUG-09 → BUG-10. **Prérequis** : BUG-14 fusionnée dans master (sinon s'arrêter).

- **Lot** : 3. Bugs visibles · **Gravité** : moyen · **Niveau conseillé** : medium
- **Branche** : `fix/type-agricole` · **Taille** : 2 fichiers JS + 2 tests
- **Constats couverts** (rapport du 2026-10-21) :
  - Type « agricultural » absent de DISTRIBUTOR_TYPES : impossible à choisir à l'ajout et à l'édition admin — `js/add-distributor.js:71` (et la liste elle-même, `js/state.js:90`)

## But
Un membre qui ajoute un distributeur de légumes ou d'œufs peut choisir « 🥕 Produits agricoles »,
et l'admin peut publier une fiche sans que son type soit remplacé en douce par « Pizza ».

## User story
En tant que membre devant un distributeur fermier, je veux choisir « Produits agricoles » dans
le formulaire d'ajout, afin que la fiche apparaisse sous la chip « Agricole » de la carte.

**Critères d'acceptation**
- [ ] Le choix du type du formulaire d'ajout propose « 🥕 Produits agricoles » (après « Produits laitiers »).
- [ ] Le choix du type de la console admin (« Nouveaux distributeurs ») le propose aussi.
- [ ] Console : une fiche dont le type n'est pas dans la liste garde ce type sélectionné ; « Publier » sans y toucher envoie `p_type: null` et `p_emoji: null` (le type n'est pas réécrit).
- [ ] Un test garde-fou échoue si une chip de filtre n'a pas son type dans la liste, ou si un type de la liste n'a pas sa config.

## Pourquoi ça arrive (déjà analysé, ne pas refaire)
Les types vivent à trois endroits à garder cohérents (CLAUDE.md, « Types de distributeurs ») :
`DISTRIBUTOR_TYPES` et `EMBEDDED_DATA.typeConfig` (`js/state.js`), `typeConfig` de
`data/distributors.json`, et les chips `data-type` d'`index.html`. `agricultural` est partout
(typeConfig des deux côtés, chip « Agricole » 🥕, seed dist-007/014/019 en 🥕) **sauf** dans
`DISTRIBUTOR_TYPES`, d'où sont construits les deux menus : `getAddPopupContent`
(`js/add-distributor.js:71`) et `showPendingDetail` (`js/admin.js:163`). Oubli d'origine (git :
jamais présent, jamais retiré).

Vérifié aujourd'hui pour les autres types (le garde-fou passera donc après la correction) :
- chips d'`index.html` sauf `all` : pizza, bakery, fries, meals, cheese, meat, dairy, agricultural,
  terroir, ice, other → toutes dans `DISTRIBUTOR_TYPES` **sauf agricultural** ;
- les 11 ids de `DISTRIBUTOR_TYPES` (dont `general`, sans chip, c'est voulu) sont tous des clés
  d'`EMBEDDED_DATA.typeConfig` et du `typeConfig` de `data/distributors.json`.
- Le sens inverse (chaque typeConfig a sa chip) n'est **pas** testé : `general` n'a pas de chip.

Console admin : `publishPending` envoie `p_type` seulement si `type !== f.type`. Si `f.type` n'est
pas dans la liste, aucune option n'est `selected`, le menu affiche la première (Pizza) et une
publication sans y toucher envoie `p_type: 'pizza'`, `p_emoji: '🍕'`. On ajoute donc en tête une
option pour le type actuel.

## Avant de coder
**Lire en entier** : `js/state.js` lignes 89-103 et 171-185 ; `js/admin.js` lignes 150-199 et
220-250 ; `js/add-distributor.js` lignes 70-73 ; `index.html` lignes 190-239 ;
`tests/functional/validation.spec.js` en entier (130 lignes) ; `tests/unit/unit.test.js` lignes 1-45
et 717-750.

**Réutiliser** : `escapeHTML` (déjà importée dans admin.js), `routeReviewApi`, `loginForTest`,
`minutesAgoIso` (déjà dans `validation.spec.js`). Ne pas créer de nouvelle aide.

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
grep -n "{ id: 'dairy', emoji: '🥛', name: 'Produits laitiers' }," js/state.js   # attendu : ligne 96
grep -n "id: 'agricultural'" js/state.js                                          # attendu : aucune ligne
grep -n 'agricultural: { label: "Produits agricoles"' js/state.js                 # attendu : 1 ligne vers 179
grep -n '"agricultural": {' data/distributors.json                                # attendu : 1 ligne vers 557
grep -n 'class="filter-chip" data-type="agricultural"' index.html                 # attendu : ligne 224
grep -n 'const types = DISTRIBUTOR_TYPES.map' js/admin.js                         # attendu : ligne 163
grep -n "p_type: type !== f.type ? type : null," js/admin.js                      # attendu : ligne 231
grep -n "^import { setSupabaseClient } from '../../js/state.js';" tests/unit/unit.test.js   # attendu : ligne 43
grep -n "test('console : refuser sans motif'" tests/functional/validation.spec.js # attendu : ligne 113
grep -n '"./js/app.js": "./js/app.js?v=' index.html                               # attendu : ?v=95 ou plus (valeur courante)
```

## Étapes

1. **js/state.js** — ajouter le type manquant, à la place qu'il a dans les chips (après laitiers).
   Avant :
   ```js
       { id: 'dairy', emoji: '🥛', name: 'Produits laitiers' },
       { id: 'meat', emoji: '🥩', name: 'Viande' },
   ```
   Après :
   ```js
       { id: 'dairy', emoji: '🥛', name: 'Produits laitiers' },
       { id: 'agricultural', emoji: '🥕', name: 'Produits agricoles' },
       { id: 'meat', emoji: '🥩', name: 'Viande' },
   ```
   Emoji et nom repris d'`EMBEDDED_DATA.typeConfig.agricultural` (« Produits agricoles »), de la
   chip (🥕) et du seed. Ne rien changer dans `EMBEDDED_DATA` ni dans `data/distributors.json`.

2. **js/admin.js** — `showPendingDetail` : le type actuel reste choisi s'il n'est pas dans la liste.
   Avant :
   ```js
       const types = DISTRIBUTOR_TYPES.map(t => `<option value="${t.id}"${t.id === f.type ? ' selected' : ''}>${t.emoji} ${escapeHTML(t.name)}</option>`).join('');
   ```
   Après :
   ```js
       // BUG-03 : un type absent de la liste reste choisi ; sinon le menu tombait sur le
       // premier type (Pizza) et « Publier » sans y toucher reecrivait le type de la fiche
       const knownType = DISTRIBUTOR_TYPES.some(t => t.id === f.type);
       const currentType = f.type && !knownType
           ? `<option value="${escapeHTML(f.type)}" selected>${escapeHTML(f.emoji || '📍')} ${escapeHTML(f.type)} (type actuel)</option>`
           : '';
       const types = currentType + DISTRIBUTOR_TYPES.map(t => `<option value="${t.id}"${t.id === f.type ? ' selected' : ''}>${t.emoji} ${escapeHTML(t.name)}</option>`).join('');
   ```
   Ne pas toucher à `publishPending` : avec le type actuel sélectionné, `type === f.type`, donc
   `p_type` et `p_emoji` restent `null`.

3. **index.html** — deux modules JS changent : partir de la valeur courante de master
   (`grep -n '"./js/app.js": "./js/app.js?v=' index.html`), **+1 sur toutes les entrées** de
   l'import map, à la même valeur (ex. `?v=95` → `?v=96` partout). Aucun CSS ne change.
   Ne pas toucher aux chips.

## Tests

### Test 1 — garde-fou des types (unitaire)
- **Fichier** : `tests/unit/unit.test.js`.
- a) Import, ligne 43, avant :
  ```js
  import { setSupabaseClient } from '../../js/state.js';
  ```
  après :
  ```js
  import { setSupabaseClient, DISTRIBUTOR_TYPES, EMBEDDED_DATA } from '../../js/state.js';
  ```
- b) Juste après la fin du bloc `describe('XSS : aucune donnee dans un attribut on...= (SEC-02)', () => { ... });`
  (avant `describe('aucun territoire en dur dans index.html et manifest.json'`), ajouter :
  ```js

  // BUG-03 : les types vivent a trois endroits (CLAUDE.md) ; un oubli dans DISTRIBUTOR_TYPES
  // rendait « Produits agricoles » impossible a choisir a l'ajout et dans la console
  describe('types de distributeur coherents (BUG-03)', () => {
      const root = new URL('../../', import.meta.url);
      const typeIds = DISTRIBUTOR_TYPES.map(t => t.id);

      it('chaque chip de filtre (sauf « Tous ») est un type proposable', () => {
          const html = readFileSync(new URL('index.html', root), 'utf8');
          const chips = [...html.matchAll(/class="filter-chip" data-type="([^"]+)"/g)].map(m => m[1]).filter(t => t !== 'all');
          assert.ok(chips.length > 0, 'aucune chip de filtre trouvee dans index.html');
          assert.deepEqual(chips.filter(t => !typeIds.includes(t)), [], 'chip sans type dans DISTRIBUTOR_TYPES');
      });

      it('chaque type proposable a sa config (EMBEDDED_DATA et data/distributors.json)', () => {
          const data = JSON.parse(readFileSync(new URL('data/distributors.json', root), 'utf8'));
          assert.deepEqual(typeIds.filter(id => !(id in EMBEDDED_DATA.typeConfig)), [], 'type sans EMBEDDED_DATA.typeConfig');
          assert.deepEqual(typeIds.filter(id => !(id in data.typeConfig)), [], 'type sans typeConfig dans data/distributors.json');
      });
  });
  ```
- **Doit échouer avant** : le premier `it` reçoit `['agricultural']` au lieu de `[]`. Le second
  passe déjà (c'est normal : il protège l'avenir).

### Test 2 — console : type hors liste gardé (fonctionnel)
- **Fichier** : `tests/functional/validation.spec.js`, dans `test.describe('37. Validation des nouvelles fiches'`,
  juste **avant** le test `console : refuser sans motif`.
- **Code** :
  ```js
      test('console : un type hors liste reste choisi, Publier ne le réécrit pas ; « Produits agricoles » proposé (BUG-03)', async ({ page }) => {
          const log = await routeReviewApi(page, {
              admin: true,
              pending: [{ id: 'user-new', name: 'Type inconnu', type: 'type-hors-liste', emoji: '🥤', address: null, city: null, lat: 43.49, lng: -1.47,
                  created_at: minutesAgoIso(60), email: 'membre@example.test', products: [], unread: 0 }]
          });
          await loginForTest(page);
          await page.evaluate(() => window.switchView('admin'));
          await page.locator('#admin-pending .admin-request').click();
          const select = page.locator('#admin-pending-form select[name="type"]');
          await expect(select).toHaveValue('type-hors-liste');
          await expect(select.locator('option[value="agricultural"]')).toHaveCount(1);
          await page.click('#admin-pending-form button[type="submit"]');
          await expect.poll(() => log.find(l => l.rpc === 'admin_review_distributor')?.body).toEqual({
              p_id: 'user-new', p_decision: 'publish', p_name: null, p_type: null, p_emoji: null, p_lat: null, p_lng: null
          });
      });
  ```
- **Doit échouer avant la correction** : `toHaveValue` reçoit `pizza` au lieu de `type-hors-liste`
  (aucune option sélectionnée, le menu affiche la première).

## Vérification (dans l'ordre)
```bash
grep -n "id: 'agricultural'" js/state.js        # attendu : 1 ligne, juste après dairy
npm test                                        # tout vert, dont « types de distributeur coherents » et « cache-busting »
npx playwright test --project=functional -g "BUG-03"                     # 1 passed
npx playwright test --project=functional -g "37. Validation"             # tout vert
npm run test:functional                         # en arrière-plan (~10 min) : tout vert, instables notés dans la PR
```

## Hors périmètre
- Changer le type d'une fiche déjà publiée (aucune interface, règles 013 / 022) : non.
- Recorriger les fiches déjà ajoutées sous « Autre » ou « Terroir » : non (aucune connue, et ce serait du SQL).
- Le contrôle de valeur de `type` côté base (liste fermée en SQL) : autre story.
- Les chips, `EMBEDDED_DATA.typeConfig`, `data/distributors.json`, `PRODUCT_SUGGESTIONS` : déjà justes, ne pas toucher.
- L'ordre des autres types dans `DISTRIBUTOR_TYPES` : ne pas réordonner.

## Pièges connus
- Le motif du garde-fou vise `class="filter-chip" data-type=` : `index.html` a aussi des
  `data-type` sur les boutons de signalement (`report-type-btn`) qui ne sont **pas** des types.
- `general` est dans `DISTRIBUTOR_TYPES` sans chip : c'est voulu, ne pas ajouter de test dans ce sens.
- Dans la console, `escapeHTML` sur la `value` de l'option : le navigateur la décode, donc
  `form.type.value === f.type` et `p_type` reste `null`.
- Ne pas mettre l'option « type actuel » quand `f.type` est vide ou `null` (la condition `f.type &&` s'en charge).
- Bump de **toutes** les entrées de l'import map à la **même** valeur. Si BUG-02 a été fusionnée
  avant, repartir de la valeur de master à jour.

## Terminé quand
- [ ] Contrôles passés, tests écrits (échouent avant, passent après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : non, aucun écran du script ne montre le formulaire d'ajout ni la console.
      Vérification à la main à la place (serveur local, navigateur) : toucher « + », placer le
      repère, ouvrir le choix du type : « 🥕 Produits agricoles » apparaît après « Produits laitiers ».
      Noter le résultat dans la PR.
- [ ] Story cochée dans BACKLOG.md si elle y figure ; sinon, le noter dans la PR. PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `fix(types): « Produits agricoles » proposable a l'ajout et dans la console`

**Corps** : constat corrigé, cause (type oublié dans `DISTRIBUTOR_TYPES`, d'où sont construits
les deux menus), correction (entrée ajoutée, type actuel gardé dans la console), tests ajoutés
(garde-fou de cohérence des types, console avec type hors liste), sorties des commandes,
résultat de la vérification à la main, éléments non faits.
