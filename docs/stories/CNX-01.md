# CNX-01 — Bouton retour : fermer puis ouvrir dans le même toucher ne perd plus d'entrée d'historique

- **Lot** : 4. Connexion, retour et liens · **Gravité** : faible (prérequis technique du lot) · **Niveau conseillé** : medium
- **Prérequis** : partir de `master` **à jour** (`git switch master && git pull`). Première fiche du lot 4.
  Ordre du lot : **CNX-01** → CNX-02 → CNX-03 → CNX-04 → CNX-05 → CNX-06 → CNX-07 → CNX-08
  (chaque fiche suppose la précédente fusionnée).
- **Branche** : `fix/historique-retour` · **Taille** : 1 fichier JS (+ `index.html`) + 1 fichier de tests. **Aucune migration.**
- **Constats couverts** (rapport du 2026-10-21) :
  - Fermer le panneau latéral par sa croix sous une fiche laisse une entrée d'historique orpheline — `js/navigation.js:128` (volet « croix sous une fiche » ; le volet Échap est dans CNX-02)
  - **Story technique (TS)**, trouvée en vérifiant le constat « La recherche n'est pas une couche d'historique » (`js/navigation.js:137`, corrigé par CNX-02) : sa correction ne marche pas sans celle-ci (voir « Pourquoi »).

## But
Le bouton retour du téléphone ferme toujours ce qui est à l'écran, même quand l'app a fermé une
couche et en a ouvert une autre dans le même toucher (hamburger depuis Favoris, résultat de
recherche, « Voir sur la carte »), et même après avoir fermé la liste par sa croix sous une fiche.

## User story
En tant que membre sur téléphone, je veux que « retour » ferme la fiche ou la liste affichée,
afin de ne jamais quitter l'app par surprise ni devoir appuyer deux fois.

**Critères d'acceptation**
- [ ] Depuis Favoris, le hamburger ouvre la liste ; « retour » ferme la liste et l'app reste.
- [ ] Liste ouverte, fiche ouverte par-dessus, croix de la liste : plus que la fiche dans la pile ;
      un seul « retour » ferme la fiche et il ne reste aucune entrée d'historique orpheline.
- [ ] Deux fermetures dans le même toucher (« Voir sur la carte » ferme fiche + liste) : plus aucune
      couche, et le « retour » suivant n'est pas avalé (bug WebKit / iPhone, voir « Pourquoi »).
- [ ] Les tests existants « 23. Bouton retour » restent verts sans modification.

## Pourquoi ça arrive (déjà analysé et vérifié dans Chromium, WebKit et Firefox, ne pas refaire)
1. `popLayer` appelle `history.back()`, qui est **asynchrone**. Si un `pushLayer` suit dans la même
   tâche (`goBackToMap()` puis `openSidePanelForFilters()`, `app.js` vers la ligne 771 ;
   `closeSearch()` puis `openDistributorModal()`, `app.js` vers la ligne 584), le `pushState` part
   avant le retour, puis le retour l'annule : la pile dit `['panel']` mais l'historique est revenu
   à l'entrée de départ (`history.state === null`). Le « retour » suivant quitte l'app.
2. Deux `popLayer` dans la même tâche (« Voir sur la carte » : `closeDistModal(); closeSidePanel();`,
   `gmaps-ui.js` vers la ligne 293) : Chromium fait deux retours, mais **WebKit n'en fait qu'un**.
   `ignorePops` reste à 1 et le « retour » suivant de l'utilisateur est ignoré.
3. `popLayer(name)` ne fait rien si la couche n'est pas au sommet : la croix de la liste visible
   au-dessus d'une fiche en feuille (téléphone) laisse `['panel', 'fiche']`.

**Correction (vérifiée dans les trois moteurs avec un prototype)** :
- les retours demandés pendant une tâche sont regroupés en **un seul** `history.go(-n)`, envoyé en
  micro-tâche (`queueMicrotask`) ;
- une couche ouverte pendant un retour pas encore abouti est mise dans la pile tout de suite, mais
  son `pushState` attend le `popstate` de ce retour ;
- une couche fermée sous une autre est marquée `stale` ; elle disparaît de `openLayers()` et son
  entrée est retirée dès qu'elle arrive au sommet (fermeture par l'UI ou par « retour ») ;
- pendant la fermeture par « retour » d'une couche, l'appel `popLayer` que fait sa propre fonction
  de fermeture est ignoré (`closing`).

## Avant de coder
**Lire en entier** : `js/history.js` (62 lignes) ; `tests/functional/navigation.spec.js` lignes 439-523
(sections 20 et 23).

**Réutiliser** : `setupApp` (déjà appelé par le `beforeEach` du fichier), `window.__distrimatchLayers`
(`js/app.js`, renvoie `openLayers()`).

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
grep -n 'let ignorePops = 0;    // popstate provoques par nos propres history.back()' js/history.js   # 1 ligne (13)
grep -n '^export function pushLayer(name, close) {' js/history.js            # 1 ligne (20)
grep -n '^export function popLayer(name) {' js/history.js                    # 1 ligne (32)
grep -n '^function onPopState() {' js/history.js                             # 1 ligne (46)
grep -n 'queueMicrotask\|stale\|waiting' js/history.js                       # aucun résultat
grep -n 'goBackToMap();' js/app.js | head -3                                 # dont une ligne suivie de openSidePanelForFilters (vers 771)
grep -n '__distrimatchLayers = openLayers' js/app.js                         # 1 ligne (386)
grep -n '27. FILTRES ET PANNEAU (audit UX-11/12)' tests/functional/navigation.spec.js   # 1 ligne (519)
grep -c '\.js?v=' index.html                                                 # 29
grep -o '"./js/app.js": "./js/app.js?v=[0-9]*"' index.html                   # noter V (113 à l'écriture de la fiche)
```

## Étapes

1. **js/history.js** — état, `pushLayer`, `popLayer`. Avant (lignes 12 à 39) :
   ```js
   const stack = [];      // couches ouvertes, de la plus ancienne a la plus recente
   let ignorePops = 0;    // popstate provoques par nos propres history.back()

   function hasHistory() {
       return typeof window !== 'undefined' && !!window.history && typeof window.history.pushState === 'function';
   }

   // A l'ouverture d'une couche : close() sera appele si l'utilisateur fait "retour".
   export function pushLayer(name, close) {
       if (!hasHistory() || typeof close !== 'function') return;
       stack.push({ name, close });
       try {
           window.history.pushState({ layer: name, depth: stack.length }, '');
       } catch (e) {
           stack.pop();
       }
   }

   // A la fermeture par l'UI : retire l'entree d'historique de la couche si elle
   // est bien la plus haute (sinon rien : la couche a deja ete fermee par retour).
   export function popLayer(name) {
       if (!hasHistory()) return;
       const top = stack[stack.length - 1];
       if (!top || top.name !== name) return;
       stack.pop();
       ignorePops++;
       window.history.back();
   }
   ```
   Après :
   ```js
   // CNX-01 : history.back() est asynchrone. Un pushState lance dans la meme tache
   // etait annule par le retour (fermer puis ouvrir d'un seul toucher), et WebKit ne
   // fait qu'un retour pour deux back() d'affilee. Les retours d'une tache partent donc
   // en un seul history.go(-n), et une couche ouverte pendant un retour en cours ne
   // pousse son entree qu'apres lui. Une couche fermee sous une autre (croix de la
   // liste sous une fiche) est marquee stale et retiree des qu'elle arrive au sommet.
   const stack = [];      // couches ouvertes, de la plus ancienne a la plus recente : { name, close, pushed, stale }
   let ignorePops = 0;    // popstate provoques par nos propres retours
   let pendingBack = 0;   // retours demandes pendant la tache en cours
   let waiting = [];      // couches ouvertes pendant un retour pas encore abouti
   let closing = null;    // couche en cours de fermeture par « retour »

   function hasHistory() {
       return typeof window !== 'undefined' && !!window.history && typeof window.history.pushState === 'function';
   }

   function pushEntry(layer) {
       try {
           window.history.pushState({ layer: layer.name, depth: stack.indexOf(layer) + 1 }, '');
           layer.pushed = true;
       } catch (e) {
           const i = stack.indexOf(layer);
           if (i !== -1) stack.splice(i, 1);
       }
   }

   function pushWaiting() {
       const layers = waiting;
       waiting = [];
       layers.forEach(l => { if (stack.includes(l)) pushEntry(l); });
   }

   function sendBack() {
       const n = pendingBack;
       pendingBack = 0;
       if (n === 0) return;
       ignorePops++;
       window.history.go(-n);
   }

   function goBack(n) {
       pendingBack += n;
       if (pendingBack === n) queueMicrotask(sendBack);
   }

   // Couches fermees sous une autre, arrivees au sommet : retirees avec leur entree
   function dropStaleTop() {
       let n = 0;
       while (stack.length && stack[stack.length - 1].stale) {
           const layer = stack.pop();
           if (layer.pushed) n++;
           else waiting = waiting.filter(l => l !== layer);
       }
       if (n) goBack(n);
   }

   // A l'ouverture d'une couche : close() sera appele si l'utilisateur fait "retour".
   export function pushLayer(name, close) {
       if (!hasHistory() || typeof close !== 'function') return;
       const layer = { name, close, pushed: false, stale: false };
       stack.push(layer);
       if (pendingBack > 0 || ignorePops > 0) waiting.push(layer);
       else pushEntry(layer);
   }

   // A la fermeture par l'UI : retire l'entree d'historique de la couche. Couche sous
   // une autre : marquee stale, son entree part quand elle arrive au sommet. Deja
   // fermee par « retour » : rien.
   export function popLayer(name) {
       if (!hasHistory()) return;
       if (closing && closing.name === name) return;
       const top = stack[stack.length - 1];
       if (!top) return;
       if (top.name !== name) {
           for (let i = stack.length - 2; i >= 0; i--) {
               if (stack[i].name === name && !stack[i].stale) {
                   stack[i].stale = true;
                   break;
               }
           }
           return;
       }
       stack.pop();
       if (top.pushed) goBack(1);
       else waiting = waiting.filter(l => l !== top);
       dropStaleTop();
   }
   ```

2. **js/history.js** — `openLayers` et `onPopState`. Avant :
   ```js
   export function openLayers() {
       return stack.map(l => l.name);
   }

   function onPopState() {
       if (ignorePops > 0) {
           ignorePops--;
           return;
       }
       const top = stack.pop();
       if (!top) return;
       try {
           top.close();
       } catch (e) {
           console.warn('[DistriMatch] Fermeture de couche :', e?.message || e);
       }
   }
   ```
   Après :
   ```js
   export function openLayers() {
       return stack.filter(l => !l.stale).map(l => l.name);
   }

   function onPopState() {
       if (ignorePops > 0) {
           ignorePops--;
           // Nos retours sont arrives : les couches ouvertes entre-temps poussent leur entree
           if (ignorePops === 0 && pendingBack === 0) pushWaiting();
           return;
       }
       const top = stack.pop();
       if (!top) return;
       closing = top;
       try {
           top.close();
       } catch (e) {
           console.warn('[DistriMatch] Fermeture de couche :', e?.message || e);
       } finally {
           closing = null;
       }
       dropStaleTop();
   }
   ```
   La ligne de commentaire au-dessus (`// Pour les tests et le debug : noms des couches ouvertes.`) et
   l'écouteur `popstate` en fin de fichier ne changent pas.

3. **index.html** — `js/history.js` change : monter le `?v=` de **toutes** les entrées de l'import
   map à la même valeur V+1 (V noté aux contrôles ; 29 entrées). Aucun CSS ne change.

## Tests
- **Fichier** : `tests/functional/navigation.spec.js`, **juste avant** ces 3 lignes (uniques ensemble) :
  ```js
  // ============================================
  // 27. FILTRES ET PANNEAU (audit UX-11/12)
  // ============================================
  ```
- **Code à ajouter** :
  ```js
  // ============================================
  // 23b. RETOUR : FERMER ET OUVRIR D'UN SEUL TOUCHER (CNX-01)
  // ============================================

  test.describe('23b. Retour : fermetures et ouvertures enchainees (CNX-01)', () => {
      test.use({ viewport: { width: 390, height: 844 } });
      const layers = (page) => page.evaluate(() => window.__distrimatchLayers());
      const historyLayer = (page) => page.evaluate(() => window.history.state?.layer ?? null);

      test('depuis Favoris, le hamburger ouvre la liste ; retour la ferme, l’app reste', async ({ page }) => {
          await page.evaluate(() => window.switchView('favorites'));
          await expect(page.locator('#subscriptions-view')).toHaveClass(/view-active/);
          await page.click('#sidebar-toggle');
          await expect(page.locator('#sidebar')).toHaveClass(/open/);
          expect(await layers(page)).toEqual(['panel']);
          await expect.poll(() => historyLayer(page)).toBe('panel');
          await page.goBack({ waitUntil: 'commit' }).catch(() => {});
          await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
          expect(await layers(page)).toEqual([]);
          expect(await page.evaluate(() => !!window.AppState)).toBe(true);
      });

      test('croix de la liste sous une fiche : un seul retour ferme la fiche, aucune entree orpheline', async ({ page }) => {
          await page.click('.filter-chip[data-type="all"]');
          await expect(page.locator('#sidebar')).toHaveClass(/open/);
          await page.evaluate(() => window.openDistributorModal(window.AppState.distributors[0].id));
          await page.waitForSelector('#dist-modal-overlay.active');
          expect(await layers(page)).toEqual(['panel', 'fiche']);
          await page.evaluate(() => document.getElementById('side-panel-close').click());
          await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
          expect(await layers(page)).toEqual(['fiche']);
          await page.goBack({ waitUntil: 'commit' }).catch(() => {});
          await expect(page.locator('#dist-modal-overlay')).not.toHaveClass(/active/);
          expect(await layers(page)).toEqual([]);
          await expect.poll(() => historyLayer(page)).toBeNull();
          expect(await page.evaluate(() => !!window.AppState)).toBe(true);
      });

      test('« Voir sur la carte » depuis la liste : fiche et liste fermees, plus aucune couche', async ({ page }) => {
          await page.click('.filter-chip[data-type="all"]');
          await expect(page.locator('#sidebar')).toHaveClass(/open/);
          await page.evaluate(() => window.openDistributorModal(window.AppState.distributors[0].id));
          await page.waitForSelector('#dist-modal-overlay.active');
          await page.waitForSelector('#dist-action-locate:not([hidden])');
          await page.evaluate(() => document.getElementById('dist-action-locate').click());
          await expect(page.locator('#dist-modal-overlay')).not.toHaveClass(/active/);
          await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
          expect(await layers(page)).toEqual([]);
          await expect.poll(() => historyLayer(page)).toBeNull();
      });
  });
  ```
- **Doivent échouer avant la correction** : le 1er parce que `history.state` reste `null` (l'entrée
  de la liste est annulée par le retour) ; le 2e parce que la pile vaut `['panel', 'fiche']` après la
  croix de la liste. Le 3e **passe déjà avant** dans Chromium (le bug à deux retours est propre à
  WebKit) : c'est un garde-fou, le noter dans la PR.

## Vérification (dans l'ordre)
```bash
node --check js/history.js                                         # aucune sortie
npx playwright test --project=functional -g "CNX-01"               # 3 passed
npx playwright test --project=functional -g "Bouton retour|Liste via le hamburger|Voir sur la carte|Fiche en trois positions|Fiche et barres"   # tout vert
npm test                                                           # tout vert, dont « cache-busting »
npm run test:functional                                            # en arrière-plan (~10 min) : tout vert, instables notés dans la PR
git diff --stat                                                    # js/history.js, index.html, navigation.spec.js (+ BACKLOG.md)
```

## Hors périmètre
- Faire de la recherche, de la fenêtre de connexion et de la fermeture par Échap des couches : **CNX-02**.
- Aucun autre module ne change : les appels `pushLayer` / `popLayer` existants restent tels quels.
- Le paramètre `depth` de l'état d'historique n'est lu nulle part : ne pas chercher à le rendre exact.

## Pièges connus
- Fichier en CRLF : faire les deux remplacements avec l'outil Edit (blocs entiers). S'il refuse,
  petit script Node dans le scratchpad (voir README). Ne pas réécrire le fichier entier.
- `goBack(n)` ne programme la micro-tâche qu'au premier retour de la tâche
  (`pendingBack === n`) : ne pas la programmer à chaque appel, sinon deux `history.go`.
- `closing` doit être remis à `null` dans un `finally` : une fonction de fermeture qui lève une
  exception bloquerait sinon tous les `popLayer` suivants du même nom.
- Le test 2 clique la croix par `evaluate` : sur téléphone, la feuille de la fiche peut la recouvrir
  pour un clic réel ; c'est voulu (on teste l'historique, pas la position de la croix).
- Bump de **toutes** les entrées de l'import map à la **même** valeur, sinon `cache-busting` échoue.

## Terminé quand
- [ ] Contrôles passés, tests écrits (les deux premiers échouent avant, passent après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : non (aucun écran ne change)
- [ ] Story cochée dans BACKLOG.md si elle y figure (sinon le noter dans la PR), PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `fix(retour): fermer puis ouvrir d'un seul toucher garde l'historique juste`

**Corps** : constats couverts (liste ci-dessus) ; cause (`history.back()` asynchrone annule un
`pushState` de la même tâche ; WebKit fusionne deux `back()` ; `popLayer` ignoré sous une autre
couche) ; correction (retours regroupés en un `history.go(-n)`, entrée poussée après le retour en
cours, couche `stale` retirée au sommet) ; tests ajoutés (dont le 3e, garde-fou qui passait déjà dans
Chromium) ; sorties des commandes de vérification ; rien de visible ne change hors du bouton retour.
