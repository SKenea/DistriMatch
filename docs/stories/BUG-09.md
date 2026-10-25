# BUG-09 — Recherche : accents, ligature et adresse vide

> **Ordre du lot 3 (EPIC-R3)** : BUG-07 → BUG-02 → BUG-13 → BUG-05 → BUG-04 → BUG-14 → BUG-03 → BUG-06 → BUG-11 → BUG-12 → BUG-15 → BUG-08 → BUG-09 → BUG-10. **Prérequis** : BUG-08 fusionnée dans master (sinon s'arrêter).

- **Lot** : 3. Bugs visibles · **Gravité** : moyen · **Niveau conseillé** : medium
- **Branche** : `fix/recherche-accents` · **Taille** : 1 fichier JS + 1 test DOM (+ `index.html` pour les `?v=`)
- **Constats couverts** (rapport du 2026-10-21) :
  - Recherche sensible aux accents et à la ligature : « œufs », l'exemple de l'aide, ne trouve pas « Oeufs fermiers » — `js/navigation.js:182`
  - La recherche plante si une fiche a une adresse nulle — `js/navigation.js:186`

## But
Taper « œufs », « oeufs » ou « Œufs » trouve les mêmes distributeurs, « creme » trouve
« Crème », un espace final ajouté par le clavier ne fait rien rater, et une fiche sans adresse
ne casse plus la recherche de tout le monde.

## User story
En tant que visiteur qui cherche un produit sur son téléphone, je veux trouver « Œufs » que je
tape « œufs », « oeufs » ou « creme » sans accent, afin de ne pas conclure à tort qu'aucun
distributeur n'en vend.

**Critères d'acceptation**
- [ ] « oeufs » trouve un produit « Œufs fermiers » ; « œufs » et « Œufs » trouvent « Oeufs bio ».
- [ ] « creme » trouve « Crème fraîche ».
- [ ] « pain » suivi d'un espace trouve « Pain » ; une saisie faite seulement d'espaces affiche
      les suggestions (aide + « Près de toi »), pas tous les distributeurs.
- [ ] Une fiche dont l'adresse vaut `null` ne lève plus d'erreur : la recherche affiche ses résultats.

## Pourquoi ça arrive (déjà analysé, ne pas refaire)
`performSearch` (`js/navigation.js` vers la ligne 173) compare avec `query.toLowerCase()` puis
`.includes(q)`, sans retirer les accents ni transformer « œ » en « oe », sans `trim`. L'aide de
la recherche propose pourtant « œufs » (ligne 163) et les données de démo écrivent « Oeufs ».
Et `d.address.toLowerCase()` lève une `TypeError` si `address` vaut `null` (colonne nullable
en base) : le `.filter()` s'arrête, plus aucun résultat pour personne.

`normalizeName` (`js/utils.js` ligne 368) fait déjà exactement la comparaison voulue :
`String(name || '')` (accepte `null`), retire les accents (NFD), met en minuscules, `œ` → `oe`,
`æ` → `ae`, réduit les espaces et fait un `trim`. Elle est testée (`tests/unit/unit.test.js`,
`normalizeName('Œufs') === 'oeufs'`). On l'applique à la requête, au nom, à l'adresse et aux
noms de produits.

## Avant de coder
**Lire en entier** : `js/navigation.js` lignes 1 à 10 (imports) et 137 à 199 (recherche :
`searchItemHTML`, `renderSearchSuggestions`, `closeSearch`, `performSearch`) ; `js/utils.js`
lignes 367 à 373 (`normalizeName`).

**Réutiliser** (ne pas réécrire) : `normalizeName` — `js/utils.js`. Ne pas la modifier : elle
sert aussi à la détection des doublons (`findLocalDuplicates`).

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
grep -n 'getTopPreferredTypes, loadUserDistributors, getLevelInfo$' js/navigation.js   # attendu : ligne 7
grep -n 'const q = query.toLowerCase();' js/navigation.js                              # attendu : ligne 182
grep -n 'd.address.toLowerCase().includes(q)' js/navigation.js                         # attendu : ligne 186
grep -n 'export function normalizeName' js/utils.js                                     # attendu : ligne 368
grep -n 'u0153' js/utils.js                                                             # attendu : ligne 371 (œ -> oe dans normalizeName)
grep -n '"./js/app.js": "./js/app.js?v=' index.html                                     # attendu : ?v=95 (ou plus)
```

## Étapes
1. **js/navigation.js**, import depuis `./utils.js` (lignes 6 à 8) — ajouter `normalizeName`.
   Avant :
   ```js
       escapeHTML, formatDistance, updateImplicitProfile, getTopPreferredTypes, loadUserDistributors, getLevelInfo
   } from './utils.js';
   ```
   Après :
   ```js
       escapeHTML, formatDistance, updateImplicitProfile, getTopPreferredTypes, loadUserDistributors, getLevelInfo, normalizeName
   } from './utils.js';
   ```
2. **js/navigation.js**, début de `performSearch` (lignes 173 à 189) — comparer les formes normalisées.
   Avant :
   ```js
   export function performSearch(query) {
       const results = document.getElementById('search-results');

       if (query.length < 2) {
           renderSearchSuggestions();
           return;
       }

       updateImplicitProfile('search', { query });
       const q = query.toLowerCase();

       const matches = AppState.distributors.filter(d => {
           const nameMatch = d.name.toLowerCase().includes(q);
           const addressMatch = d.address.toLowerCase().includes(q);
           const productMatch = d.products.some(p => p.name.toLowerCase().includes(q));
           return nameMatch || addressMatch || productMatch;
       });
   ```
   Après :
   ```js
   export function performSearch(query) {
       const results = document.getElementById('search-results');
       // Compare sans casse, accents, ligature ni espaces en trop (BUG-09) :
       // « œufs », « Oeufs » et « oeufs » se trouvent l'un l'autre, « creme » trouve « Crème »
       const q = normalizeName(query);

       if (q.length < 2) {
           renderSearchSuggestions();
           return;
       }

       updateImplicitProfile('search', { query });

       // normalizeName accepte null : une fiche sans adresse ne casse plus la recherche
       const matches = AppState.distributors.filter(d => {
           const nameMatch = normalizeName(d.name).includes(q);
           const addressMatch = normalizeName(d.address).includes(q);
           const productMatch = (d.products || []).some(p => normalizeName(p.name).includes(q));
           return nameMatch || addressMatch || productMatch;
       });
   ```
   La suite de la fonction (message « Aucun résultat pour "${escapeHTML(query)}" », rendu des
   résultats) ne change pas : le message garde la saisie **brute** échappée.
3. **index.html** — import map : monter le `?v=` de **toutes** les entrées à la même valeur
   (aujourd'hui `?v=95` → `?v=96` ; si master a bougé, valeur courante + 1). Aucun CSS ne change.

## Tests
- **Fichier** : `tests/integration/dom.test.js`, **à la toute fin du fichier** (après le
  `describe('Tag « Démo » (isDemo)'`). `AppState`, `describe`, `it`, `beforeEach`, `assert`
  sont déjà importés en haut ; `performSearch` ne l'est pas : l'import est dans le bloc ci-dessous.
- **Nom** : `Recherche : accents, ligature et adresse vide (BUG-09)` (5 tests)
- **Code à ajouter** :
  ```js

  // ============================================
  // RECHERCHE : ACCENTS, LIGATURE, ADRESSE VIDE (BUG-09)
  // ============================================

  const { performSearch } = await import('../../js/navigation.js');

  describe('Recherche : accents, ligature et adresse vide (BUG-09)', () => {
      const base = { type: 'other', emoji: '📍', rating: 4, reviewCount: 0 };

      beforeEach(() => {
          if (!document.getElementById('search-results')) {
              document.body.insertAdjacentHTML('beforeend', '<div id="search-results"></div>');
          }
          AppState.distributors = [
              { ...base, id: 'oeufs-ligature', name: 'Ferme A', address: '1 Rue A', products: [{ name: 'Œufs fermiers' }] },
              { ...base, id: 'oeufs-simple', name: 'Ferme B', address: '2 Rue B', products: [{ name: 'Oeufs bio (x6)' }] },
              { ...base, id: 'creme', name: 'Laiterie', address: '3 Rue C', products: [{ name: 'Crème fraîche' }] },
              { ...base, id: 'pain', name: 'Fournil', address: '4 Rue D', products: [{ name: 'Pain' }] }
          ];
      });

      function resultIds() {
          return [...document.querySelectorAll('#search-results .search-item-clean')].map(el => el.dataset.distId);
      }

      it('« oeufs » trouve « Œufs fermiers » et « Oeufs bio »', () => {
          performSearch('oeufs');
          assert.deepEqual(resultIds(), ['oeufs-ligature', 'oeufs-simple']);
      });

      it('« œufs » et « Œufs » trouvent aussi « Oeufs bio »', () => {
          performSearch('œufs');
          assert.deepEqual(resultIds(), ['oeufs-ligature', 'oeufs-simple']);
          performSearch('Œufs');
          assert.deepEqual(resultIds(), ['oeufs-ligature', 'oeufs-simple']);
      });

      it('« creme » trouve « Crème fraîche »', () => {
          performSearch('creme');
          assert.deepEqual(resultIds(), ['creme']);
      });

      it('un espace final (clavier du telephone) ne fait rien rater ; des espaces seuls = suggestions', () => {
          performSearch('pain ');
          assert.deepEqual(resultIds(), ['pain']);
          performSearch('   ');
          assert.ok(document.querySelector('#search-results .search-suggest-hint'), 'aide de la recherche vide attendue');
      });

      it('une fiche sans adresse (null) ne casse pas la recherche', () => {
          AppState.distributors.push({ ...base, id: 'sans-adresse', name: 'Sans adresse', address: null, products: [{ name: 'Pain de campagne' }] });
          assert.doesNotThrow(() => performSearch('pain'));
          assert.deepEqual(resultIds(), ['pain', 'sans-adresse']);
      });
  });
  ```
- **Doit échouer avant la correction** (vérifié sur le code actuel) : les 5 tests échouent ;
  les 4 premiers sur `assert.deepEqual` (liste vide ou incomplète), le 5ᵉ avec
  `Cannot read properties of null (reading 'toLowerCase')`.

## Vérification (dans l'ordre)
```bash
node --test --test-name-pattern="BUG-09" tests/integration/dom.test.js   # 5 tests passent
npm test                                                                  # tout vert (dont cache-busting)
npx playwright test --project=functional -g "SEC-02"                      # tous passent (la recherche ouvre la fiche)
npx playwright test --project=functional -g "43. Recherche"               # tous passent
npm run test:functional                                                   # en arrière-plan (~10 min) : tout vert, instables notés
```

## Hors périmètre
- Le texte d'aide « Tape un produit (œufs, pain, pizza…) » : il reste tel quel.
- Chercher dans la ville (`d.city`), tolérer les fautes de frappe, trier les résultats, surligner
  le mot trouvé : non.
- Le bouton retour d'Android qui ferme l'app au lieu de la recherche : autre constat, autre story.
- `normalizeName` (`js/utils.js`) : ne pas la modifier.
- Corriger en base les fiches sans adresse : non, la recherche doit simplement les tolérer.

## Pièges connus
- Normaliser la requête **avant** le test de longueur : sinon « `   ` » (3 espaces) donne `q = ''`,
  et `''` est contenu dans tous les noms : tous les distributeurs s'afficheraient.
- Garder `updateImplicitProfile('search', { query })` et `escapeHTML(query)` sur la saisie **brute**.
- `searchItemHTML` écrit `data-dist-id` : dans le test, la valeur se lit par `el.dataset.distId`.
- Le test ajoute `#search-results` au document seulement s'il manque : ne pas modifier le gabarit
  HTML du haut de `dom.test.js`.
- Un seul module JS change mais **toutes** les entrées de l'import map montent (test `cache-busting`).

## Terminé quand
- [ ] Contrôles passés, test écrit (échoue avant, passe après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : non (aucun changement visuel)
- [ ] BUG-09 absent de `BACKLOG.md` à ce jour : ne pas l'ajouter, le noter dans la PR ; PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `fix(recherche): accents, ligature et adresse vide`

**Corps** : constats corrigés (« œufs » ne trouvait pas « Oeufs », « creme » ne trouvait pas
« Crème », espace final ; une fiche sans adresse cassait la recherche), correction (comparaison
par `normalizeName` sur la requête, le nom, l'adresse et les produits), tests DOM ajoutés,
sorties des commandes, « BUG-09 pas encore dans BACKLOG.md ».
