# BUG-06 — Console admin : écrire au membre efface les corrections non publiées

- **Ordre** : après BUG-03, avant BUG-11 (lot 3 : BUG-07 → BUG-02 → BUG-13 → BUG-05 → BUG-04 → BUG-14 → BUG-03 → BUG-06 → BUG-11 → BUG-12 → BUG-15 → BUG-08 → BUG-09 → BUG-10). Partir de `master` à jour, après fusion de la story précédente.
- **Prérequis** : BUG-03 fusionnée dans `master` (l'étape 3a part du bloc que BUG-03 pose dans `showPendingDetail`). Sinon, s'arrêter.
- **Lot** : 3. Bugs visibles · **Gravité** : moyen · **Niveau conseillé** : medium
- **Branche** : `fix/admin-brouillon-corrections` · **Taille** : 1 fichier JS + 2 tests fonctionnels
- **Constats couverts** (rapport du 2026-10-21) :
  - Console admin : envoyer un message au membre efface la position corrigée et le nom ou type modifiés avant « Publier » — `js/admin.js:602`
  - (doublon) Console admin : écrire au membre efface les corrections non publiées (nom, type, position) — `js/admin.js:602`

## But
Dans la console, section « Nouveaux distributeurs », l'admin qui corrige le nom, le type ou la
position d'une fiche en attente garde ses corrections quand il écrit au membre ou quand il quitte
la page Admin puis y revient : « Publier » envoie bien ce qu'il a corrigé.

## User story
En tant qu'admin qui valide une fiche en attente, je veux pouvoir écrire au membre au milieu de
mes corrections, afin de ne pas publier par erreur le nom et la position d'origine.

**Critères d'acceptation**
- [ ] Nom corrigé + repère déplacé, puis message envoyé : le champ Nom garde la correction, le
      repère reste à sa nouvelle place, et « Publier » envoie `p_name`, `p_lat` et `p_lng`.
- [ ] Nom et type corrigés, repère déplacé, puis page Admin quittée et rouverte : le détail
      réaffiché montre les corrections, et « Publier » les envoie.
- [ ] Après « Publier », « Refuser » ou « ← Retour à la console », les corrections sont oubliées :
      rouvrir la fiche montre les valeurs d'origine.
- [ ] Le fil « Échange avec le membre » affiche le message envoyé (comme avant).

## Pourquoi ça arrive (déjà analysé, ne pas refaire)
Après `post_review_message`, `handleAdminSubmit` rappelle `showPendingDetail(currentPendingId)`
(ligne 602). Cette fonction réécrit tout `#admin-detail` avec les valeurs d'origine du tableau
`pending` (`value="${escapeHTML(f.name)}"`, `t.id === f.type`), et `mountPendingMap(f)` recrée la
mini-carte au point d'origine, sur un nouvel élément sans `data-lat` / `data-lng` : `publishPending`
lit alors `moved = null`. Même perte quand `loadAdmin` (rappel de la vue Admin, `js/app.js:316`)
réaffiche le détail. Une fois publiée, la fiche n'est plus corrigeable ni par la console (elle n'est
plus en attente) ni par l'API (013 : seulement `price_range`).

La correction : (1) après un message, ne relire **que le fil** (nouvelle fonction
`refreshPendingThread`) ; (2) garder les corrections dans un **brouillon au niveau du module**
(`pendingDraft = { id, name, type, lat, lng }`), mis à jour à la saisie et au relâchement du repère,
repris par `showPendingDetail` et `mountPendingMap` quand l'id correspond, vidé à la publication,
au refus et au retour à la liste.

## Avant de coder
**Lire en entier** : `js/admin.js` lignes 30-36 (variables du module), 57-97 (`loadAdmin`),
150-267 (`showPendingDetail`, `mountPendingMap`, `publishPending`, `rejectPending`), 406-417
(`backToList`), 582-634 (`handleAdminSubmit`, `initAdmin`) ; `tests/functional/validation.spec.js`
en entier. Ces numéros sont ceux du `master` d'avant BUG-03 : après BUG-03, tout ce qui suit la
ligne 163 est décalé d'environ 5 lignes. Se fier aux extraits et aux greps, pas aux numéros.

**Réutiliser** (ne pas réécrire) : `renderReviewThread(list, 'admin')` (`js/additions.js`, déjà
importée dans admin.js), la requête du fil déjà écrite dans `showPendingDetail`
(`distributor_review_messages`, `select('id, author, body, created_at')`), `routeReviewApi`
(`tests/functional/validation.spec.js`).

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
grep -n 'let pendingMap = null;' js/admin.js                          # attendu : 1 ligne, vers 35
grep -n 'const knownType = DISTRIBUTOR_TYPES.some(t => t.id === f.type);' js/admin.js   # attendu : 1 ligne (posée par BUG-03), vers 165
grep -n "t.id === f.type ? ' selected'" js/admin.js                   # attendu : 1 ligne, la « const types = currentType + ... » de BUG-03
grep -n 'value="${escapeHTML(f.name)}"' js/admin.js                   # attendu : 1 ligne, vers 181 (après BUG-03)
grep -n 'setView(\[f.lat, f.lng\], 17)' js/admin.js                   # attendu : 1 ligne, vers 214 (après BUG-03)
grep -n '^        showPendingDetail(currentPendingId);' js/admin.js   # attendu : 1 ligne, vers 607 (handleAdminSubmit)
grep -n "view.addEventListener('submit', handleAdminSubmit);" js/admin.js   # attendu : 1 ligne, vers 638
grep -n "registerViewCallback('admin', loadAdmin);" js/app.js         # attendu : 1 ligne, vers 316
grep -n '"./js/admin.js": "./js/admin.js?v=' index.html               # attendu : la valeur courante de master (plus de 95 : d'autres stories sont passées)
```
Les motifs avec `$`, `{` ou `[` sont entre **guillemets simples** : ne pas les changer.

## Étapes
Toutes les étapes 1 à 8 sont dans **js/admin.js** (garder les fins de ligne du fichier ; admin.js est en LF).

1. **Variable du brouillon** — juste après la ligne 35.
   Avant :
   ```js
   let pendingMap = null;        // mini-carte Leaflet du detail
   ```
   Après :
   ```js
   let pendingMap = null;        // mini-carte Leaflet du detail
   let pendingDraft = null;      // corrections non publiees { id, name, type, lat, lng } (BUG-06)
   ```

2. **Aide `updatePendingDraft`** — juste au-dessus de `async function showPendingDetail(id) {`
   (ligne 150), ajouter :
   ```js
   // BUG-06 : corrections en cours (nom, type, position) gardees hors du DOM, pour
   // survivre a un reaffichage du detail (message envoye, retour sur la page Admin).
   // null = pas corrige.
   function updatePendingDraft(id, changes) {
       if (pendingDraft?.id !== id) pendingDraft = { id, name: null, type: null, lat: null, lng: null };
       Object.assign(pendingDraft, changes);
   }

   ```

3. **`showPendingDetail` reprend le brouillon** (deux remplacements).
   a) Bloc posé par BUG-03 (si ce bloc n'est pas dans `showPendingDetail` exactement ainsi :
   s'arrêter, BUG-03 n'est pas fusionnée ou a changé). Avant :
   ```js
       // BUG-03 : un type absent de la liste reste choisi ; sinon le menu tombait sur le
       // premier type (Pizza) et « Publier » sans y toucher reecrivait le type de la fiche
       const knownType = DISTRIBUTOR_TYPES.some(t => t.id === f.type);
       const currentType = f.type && !knownType
           ? `<option value="${escapeHTML(f.type)}" selected>${escapeHTML(f.emoji || '📍')} ${escapeHTML(f.type)} (type actuel)</option>`
           : '';
       const types = currentType + DISTRIBUTOR_TYPES.map(t => `<option value="${t.id}"${t.id === f.type ? ' selected' : ''}>${t.emoji} ${escapeHTML(t.name)}</option>`).join('');
   ```
   Après :
   ```js
       // BUG-06 : corrections en cours (brouillon) reprises si le detail est reaffiche
       const draft = pendingDraft?.id === id ? pendingDraft : null;
       const shownName = draft?.name ?? f.name;
       const shownType = draft?.type ?? f.type;
       // BUG-03 : un type absent de la liste reste choisi ; sinon le menu tombait sur le
       // premier type (Pizza) et « Publier » sans y toucher reecrivait le type de la fiche
       const knownType = DISTRIBUTOR_TYPES.some(t => t.id === f.type);
       const currentType = f.type && !knownType
           ? `<option value="${escapeHTML(f.type)}"${shownType === f.type ? ' selected' : ''}>${escapeHTML(f.emoji || '📍')} ${escapeHTML(f.type)} (type actuel)</option>`
           : '';
       const types = currentType + DISTRIBUTOR_TYPES.map(t => `<option value="${t.id}"${t.id === shownType ? ' selected' : ''}>${t.emoji} ${escapeHTML(t.name)}</option>`).join('');
   ```
   Deux changements seulement dans le bloc de BUG-03 : l'option « type actuel » n'est `selected` que
   si `shownType === f.type` (sinon l'admin a choisi un autre type dans le brouillon), et la liste
   compare à `shownType` au lieu de `f.type`. `knownType` reste calculé sur `f.type` (type d'origine).
   b) Avant :
   ```js
                   <label class="operator-field">Nom<input type="text" name="name" maxlength="80" value="${escapeHTML(f.name)}"></label>
   ```
   Après :
   ```js
                   <label class="operator-field">Nom<input type="text" name="name" maxlength="80" value="${escapeHTML(shownName)}"></label>
   ```
   Ne pas toucher au titre `<h3>${escapeHTML(f.emoji || '📍')} ${escapeHTML(f.name)}</h3>` : il garde
   le nom proposé par le membre.

4. **`mountPendingMap` reprend la position corrigée et la mémorise** — remplacer toute la fonction
   (commentaire compris).
   Avant :
   ```js
   // Mini-carte : repere deplacable ; la position corrigee part a la publication
   function mountPendingMap(f) {
       if (pendingMap) {
           pendingMap.remove();
           pendingMap = null;
       }
       const el = document.getElementById('admin-pending-map');
       if (!el || typeof L === 'undefined' || !Number.isFinite(Number(f.lat))) return;
       pendingMap = L.map(el, { zoomControl: true, attributionControl: true }).setView([f.lat, f.lng], 17);
       L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(pendingMap);
       const marker = L.marker([f.lat, f.lng], { draggable: true, title: 'Position du distributeur' }).addTo(pendingMap);
       marker.on('dragend', () => {
           const { lat, lng } = marker.getLatLng();
           el.dataset.lat = String(lat);
           el.dataset.lng = String(lng);
       });
       setTimeout(() => pendingMap?.invalidateSize(), 50);
   }
   ```
   Après :
   ```js
   // Mini-carte : repere deplacable ; la position corrigee part a la publication.
   // BUG-06 : une position deja corrigee (brouillon) est reprise au reaffichage.
   function mountPendingMap(f) {
       if (pendingMap) {
           pendingMap.remove();
           pendingMap = null;
       }
       const el = document.getElementById('admin-pending-map');
       if (!el || typeof L === 'undefined' || !Number.isFinite(Number(f.lat))) return;
       const draft = pendingDraft?.id === f.id && Number.isFinite(pendingDraft.lat) ? pendingDraft : null;
       const start = draft ? [draft.lat, draft.lng] : [f.lat, f.lng];
       if (draft) {
           el.dataset.lat = String(draft.lat);
           el.dataset.lng = String(draft.lng);
       }
       pendingMap = L.map(el, { zoomControl: true, attributionControl: true }).setView(start, 17);
       L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(pendingMap);
       const marker = L.marker(start, { draggable: true, title: 'Position du distributeur' }).addTo(pendingMap);
       marker.on('dragend', () => {
           const { lat, lng } = marker.getLatLng();
           el.dataset.lat = String(lat);
           el.dataset.lng = String(lng);
           updatePendingDraft(f.id, { lat, lng });
       });
       setTimeout(() => pendingMap?.invalidateSize(), 50);
   }
   ```
   `publishPending` ne change pas : il lit toujours `data-lat` / `data-lng` de `#admin-pending-map`,
   que `mountPendingMap` repose désormais depuis le brouillon.

5. **Brouillon vidé après une publication réussie** (`publishPending`).
   Avant :
   ```js
       showToast('Fiche publiée : visible par tous', 'success');
       currentPendingId = null;
       loadAdmin();
   ```
   Après :
   ```js
       showToast('Fiche publiée : visible par tous', 'success');
       currentPendingId = null;
       pendingDraft = null;
       loadAdmin();
   ```

6. **Brouillon vidé après un refus réussi** (`rejectPending`).
   Avant :
   ```js
       showToast('Fiche refusée', 'success');
       currentPendingId = null;
       loadAdmin();
   ```
   Après :
   ```js
       showToast('Fiche refusée', 'success');
       currentPendingId = null;
       pendingDraft = null;
       loadAdmin();
   ```

7. **Brouillon vidé au retour à la liste** (`backToList`).
   Avant :
   ```js
   function backToList() {
       currentId = null;
       currentPendingId = null;
   ```
   Après :
   ```js
   function backToList() {
       currentId = null;
       currentPendingId = null;
       pendingDraft = null;
   ```

8. **Après un message, seul le fil est relu ; saisie mémorisée.**
   a) Juste au-dessus de `async function handleAdminSubmit(e) {`, ajouter :
   ```js
   // BUG-06 : apres un message au membre, seul le fil est relu : le formulaire
   // « Publier » et la mini-carte gardent les corrections en cours
   async function refreshPendingThread(id) {
       const { data: thread } = await supabaseClient.from('distributor_review_messages')
           .select('id, author, body, created_at').eq('distributor_id', id).order('created_at', { ascending: true });
       if (currentPendingId !== id) return;
       const box = document.querySelector('#admin-detail .op-thread');
       if (box) box.innerHTML = renderReviewThread(thread || [], 'admin');
   }

   // BUG-06 : nom ou type saisis dans le formulaire « Publier » -> brouillon
   function handleAdminInput(e) {
       const form = e.target.closest('#admin-pending-form');
       if (!form || !currentPendingId) return;
       updatePendingDraft(currentPendingId, { name: form.name.value, type: form.type.value });
   }

   ```
   b) Dans `handleAdminSubmit`, bloc `admin-review-composer`. Avant :
   ```js
           e.target.body.value = '';
           showPendingDetail(currentPendingId);
           return;
   ```
   Après :
   ```js
           e.target.body.value = '';
           refreshPendingThread(currentPendingId);
           return;
   ```
   (Le bloc `admin-composer` juste en dessous, qui appelle `loadAdmin()`, concerne les demandes
   d'exploitant : ne pas y toucher.)
   c) Dans `initAdmin`. Avant :
   ```js
       view.addEventListener('submit', handleAdminSubmit);
   }
   ```
   Après :
   ```js
       view.addEventListener('submit', handleAdminSubmit);
       view.addEventListener('input', handleAdminInput);
       view.addEventListener('change', handleAdminInput);
   }
   ```

9. **index.html** — un module JS change : monter le `?v=` de **toutes** les entrées de l'import map
   à la même valeur : la valeur courante de `master` trouvée par le contrôle, + 1 (plusieurs
   stories du lot passent avant celle-ci : ne pas supposer 95). Aucun CSS.

## Tests
- **Fichier** : `tests/functional/validation.spec.js`.
- **Où** : a) l'aide `dragPendingPin` juste après la fonction `routeReviewApi` (avant
  `test.describe('37. Validation des nouvelles fiches'`) ; b) les deux tests à la fin du bloc
  `test.describe('37. ...')`, après le test `console : refuser sans motif` (avant le `});` final).
- **Noms** : `console : écrire au membre garde le nom et la position corrigés (BUG-06)` et
  `console : quitter puis rouvrir la page Admin garde les corrections (BUG-06)`.
- **Code à ajouter** :
  a) aide :
  ```js
  // BUG-06 : glisse le repere de la mini-carte de 40 px ; rend la position posee (data-lat / data-lng)
  async function dragPendingPin(page) {
      const pin = page.locator('#admin-pending-map .leaflet-marker-icon');
      await expect(pin).toBeVisible();
      await page.waitForTimeout(300);   // invalidateSize (50 ms) peut encore deplacer le repere
      const box = await pin.boundingBox();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 40, y + 40, { steps: 10 });
      await page.mouse.up();
      const map = page.locator('#admin-pending-map');
      await expect(map).toHaveAttribute('data-lat', /\d/);
      return { lat: Number(await map.getAttribute('data-lat')), lng: Number(await map.getAttribute('data-lng')) };
  }
  ```
  b) tests :
  ```js
      test('console : écrire au membre garde le nom et la position corrigés (BUG-06)', async ({ page }) => {
          const log = await routeReviewApi(page, {
              admin: true,
              pending: [{ id: 'user-new', name: 'Fiche à corriger', type: 'pizza', emoji: '🍕', address: '1 rue Test', city: 'Bayonne', lat: 43.49, lng: -1.47,
                  created_at: minutesAgoIso(60), email: 'membre@example.test', products: [], unread: 0 }]
          });
          // Fil simule : renvoie les messages deja postes (pose apres routeReviewApi, donc prioritaire)
          await page.route(u => u.pathname.endsWith('/rest/v1/distributor_review_messages'), r => r.fulfill(json(
              log.filter(l => l.rpc === 'post_review_message')
                  .map((l, i) => ({ id: i + 1, distributor_id: 'user-new', author: 'admin', body: l.body.p_body, created_at: new Date().toISOString() }))
          )));
          await loginForTest(page);
          await page.evaluate(() => window.switchView('admin'));
          await page.locator('#admin-pending .admin-request').click();
          await page.fill('#admin-pending-form input[name="name"]', 'Pizza corrigée');
          const moved = await dragPendingPin(page);

          await page.fill('#admin-review-input', 'J’ai corrigé la position.');
          await page.click('#admin-review-composer .op-send');
          await expect(page.locator('#admin-detail .op-thread')).toContainText('J’ai corrigé la position.');
          await expect(page.locator('#admin-pending-form input[name="name"]')).toHaveValue('Pizza corrigée');
          await expect(page.locator('#admin-pending-map')).toHaveAttribute('data-lat', String(moved.lat));

          await page.click('#admin-pending-form button[type="submit"]');
          await expect.poll(() => log.find(l => l.rpc === 'admin_review_distributor')?.body).toEqual({
              p_id: 'user-new', p_decision: 'publish', p_name: 'Pizza corrigée', p_type: null, p_emoji: null, p_lat: moved.lat, p_lng: moved.lng
          });
      });

      test('console : quitter puis rouvrir la page Admin garde les corrections (BUG-06)', async ({ page }) => {
          const log = await routeReviewApi(page, {
              admin: true,
              pending: [{ id: 'user-new', name: 'Fiche à corriger', type: 'pizza', emoji: '🍕', address: '1 rue Test', city: 'Bayonne', lat: 43.49, lng: -1.47,
                  created_at: minutesAgoIso(60), email: 'membre@example.test', products: [], unread: 0 }]
          });
          await loginForTest(page);
          await page.evaluate(() => window.switchView('admin'));
          await page.locator('#admin-pending .admin-request').click();
          await page.fill('#admin-pending-form input[name="name"]', 'Pizza corrigée');
          await page.selectOption('#admin-pending-form select[name="type"]', 'bakery');
          const moved = await dragPendingPin(page);

          // Marque l'ancien formulaire : on attend ensuite le formulaire reconstruit par loadAdmin
          await page.evaluate(() => { document.getElementById('admin-pending-form').dataset.old = '1'; });
          await page.evaluate(() => window.switchView('favorites'));
          await page.evaluate(() => window.switchView('admin'));
          await page.waitForSelector('#admin-pending-form:not([data-old])', { timeout: 5000 });
          await expect(page.locator('#admin-pending-form input[name="name"]')).toHaveValue('Pizza corrigée');
          await expect(page.locator('#admin-pending-form select[name="type"]')).toHaveValue('bakery');
          await expect(page.locator('#admin-pending-map')).toHaveAttribute('data-lat', String(moved.lat));

          await page.click('#admin-pending-form button[type="submit"]');
          await expect.poll(() => log.find(l => l.rpc === 'admin_review_distributor')?.body).toEqual({
              p_id: 'user-new', p_decision: 'publish', p_name: 'Pizza corrigée', p_type: 'bakery', p_emoji: '🥖', p_lat: moved.lat, p_lng: moved.lng
          });
      });
  ```
- **Doivent échouer avant la correction** parce que :
  - test 1 : une fois le message affiché dans le fil, le détail a été reconstruit : le champ Nom vaut
    de nouveau `Fiche à corriger` (`toHaveValue('Pizza corrigée')` échoue) ;
  - test 2 : le formulaire reconstruit par `loadAdmin` vaut de nouveau `Fiche à corriger`.
  Si l'un d'eux échoue **avant** la correction sur `toHaveAttribute('data-lat', /\d/)` dans
  `dragPendingPin` (le glisser du repère n'a pas pris), relancer une fois en mode visible
  (`PWDEBUG_HEADED=1 npx playwright test --project=functional -g "BUG-06"`) pour voir où tombe la
  souris ; si le repère ne bouge toujours pas, **s'arrêter et signaler** (ne pas remplacer le glisser
  par une écriture directe de `data-lat`).

## Vérification (dans l'ordre)
```bash
grep -n "refreshPendingThread(currentPendingId);" js/admin.js        # attendu : 1 ligne (handleAdminSubmit)
grep -n '^        showPendingDetail(currentPendingId);' js/admin.js  # attendu : aucune ligne
grep -c "pendingDraft = null;" js/admin.js                           # attendu : 4 (voir la note ci-dessous)
npx playwright test --project=functional -g "BUG-06"                 # 2 passed
npx playwright test --project=functional -g "37. Validation"         # tout vert
npm test                                                             # tout vert, dont « cache-busting »
npm run test:functional                                              # en arrière-plan (~10 min) : tout vert, instables notés
```
Pour `grep -c "pendingDraft = null;"` : la déclaration `let pendingDraft = null;` compte aussi,
d'où **4** au total (1 déclaration + publier + refuser + retour à la liste).

## Hors périmètre
- Le verrou contre le double envoi (« → » ou « Publier » touchés deux fois) : autre constat, autre story.
- Le bloc `admin-composer` (demandes d'exploitant) qui appelle `loadAdmin()` : pas de formulaire de
  correction dans ce détail, ne pas y toucher.
- Garder le brouillon après un rechargement de la page (localStorage) : non, le brouillon vit en mémoire.
- Le message d'erreur générique sur P0002 (fiche déjà traitée) : non.
- `publishPending` : il lit toujours `data-lat` / `data-lng` ; ne pas le réécrire pour lire le brouillon.

## Pièges connus
- `form.name` et `form.type` désignent bien les champs nommés `name` et `type` (accès nommé du
  formulaire, déjà utilisé par `publishPending`) : ne pas les remplacer par `form.getAttribute`.
- Ne vider `pendingDraft` qu'**après** un succès (après le `showToast` de succès) : une publication
  en erreur doit garder les corrections.
- `?? f.name` (et non `|| f.name`) : un brouillon dont `name` vaut `null` retombe sur l'original,
  mais un nom vidé par l'admin (`''`) doit rester vide (`publishPending` l'ignore alors, comme avant).
- Le `waitForSelector('#admin-pending-form:not([data-old])')` du test 2 est indispensable : sans lui,
  l'assertion lit l'ancien formulaire (encore dans la page cachée) et passe à tort avant la correction.
- Le fil simulé du test 1 est déclaré **après** `routeReviewApi` : Playwright donne la priorité à la
  route la plus récente. Ne pas modifier `routeReviewApi` elle-même.
- Bump de **toutes** les entrées de l'import map à la **même** valeur.

## Terminé quand
- [ ] Contrôles passés, tests écrits (échouent avant, passent après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : non (console admin, hors écrans du script)
- [ ] Story cochée dans BACKLOG.md, PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `fix(admin): ecrire au membre ne perd plus les corrections avant « Publier »`

**Corps** : constats corrigés (les deux titres ci-dessus), cause (`showPendingDetail` reconstruisait
tout le détail avec les valeurs d'origine, mini-carte comprise), correction (`refreshPendingThread`
ne relit que le fil ; brouillon `pendingDraft` repris au réaffichage, vidé à la publication, au refus
et au retour), tests ajoutés (les deux tests BUG-06), sorties des commandes de vérification,
éléments non faits (verrou anti double envoi : autre story).
