# SEC-02 — Plus aucune donnée dans un `onclick` (fiche piégée)

- **Lot** : 1. Sécurité · **Gravité** : élevé · **Niveau conseillé** : medium
- **Branche** : `fix/xss-onclick` · **Taille** : 6 fichiers JS + 2 tests. Au-dessus de la limite de 3,
  **exception acceptée** : la même modification mécanique répétée, à garder dans une seule PR.
- **Constats couverts** (rapport du 2026-10-21) :
  - XSS stocké via l'id d'un distributeur dans le onclick de la recherche — `js/navigation.js:145`
  - (même cause) lignes de favoris et bouton « retirer » — `js/distributor.js:287` et `:290`
  - (même cause) bouton « Voir » du bandeau de notification — `js/notifications.js:376`
  - Produit suivi avec apostrophe : le bouton « retirer » est cassé (et auto-XSS) — `js/notifications.js:435`
  - XSS latent dans le code inactif (chat, photos) — `js/chat.js:338`, `js/gmaps-ui.js:56`

## But
Un identifiant ou un nom piégé (par exemple `x');fetch(...);//`) ne s'exécute plus jamais dans
le navigateur d'un membre ou de l'admin : les clics passent par un attribut `data-...` lu par un
écouteur, comme le reste de l'app.

## User story
En tant que membre (ou admin) qui ouvre une fiche depuis la recherche, ses favoris ou une
notification, je veux que rien de ce qu'un autre membre a saisi ne puisse s'exécuter sur mon
téléphone, afin que ma session ne puisse pas être volée.

**Critères d'acceptation**
- [ ] Plus aucun gabarit de `js/` ne contient `${...}` dans un attribut `on...=` (sauf les deux
      numéros internes autorisés de `add-distributor.js`, voir Tests).
- [ ] Une fiche dont l'id vaut `x');window.__pwned=1;//` s'ouvre normalement depuis la recherche et
      depuis Favoris, et `window.__pwned` reste `undefined`.
- [ ] Le bouton « retirer » d'un produit suivi nommé `huile d'olive` le retire bien.
- [ ] Recherche, favoris (ouvrir, retirer), bandeau « Voir » fonctionnent comme avant.

## Pourquoi ça arrive (déjà analysé, ne pas refaire)
`escapeHTML()` transforme `'` en `&#39;`. Mais dans un attribut `onclick="..."`, le navigateur
**décode les entités avant d'exécuter le JavaScript** : `&#39;` redevient `'` et ferme la chaîne
de `openDistributorModal('...')`. `escapeHTML` protège le texte et les attributs ordinaires, **pas**
le code d'un attribut `on...`. L'id d'une fiche est choisi par le membre qui l'ajoute (aucune
contrainte de format en base aujourd'hui ; la contrainte SQL est faite dans une autre story SEC).

La correction suit le modèle déjà utilisé par la liste latérale (`handleSidePanelClick`,
`js/gmaps-ui.js` vers la ligne 89) : la donnée va dans `data-...="${escapeHTML(...)}"` (sûr dans un
attribut ordinaire), un écouteur lit `element.dataset...` (le navigateur rend la valeur d'origine).

## Avant de coder
**Lire en entier** : `js/navigation.js` lignes 136-201 ; `js/distributor.js` lignes 224-305 ;
`js/notifications.js` lignes 365-439 ; `js/chat.js` lignes 325-354 ; `js/gmaps-ui.js` lignes 45-117 ;
`js/app.js` lignes 20-55 et 740-751 (section « Recherche » de la mise en place des écouteurs).

**Réutiliser** : `escapeHTML` (`js/utils.js`), `openDistributorModal` (exportée par `js/gmaps-ui.js`),
`toggleSubscription(id, event)` (`js/distributor.js`, appelle déjà `event.stopPropagation()`),
`unfollowProduct(nom)` (`js/notifications.js`), `openConversation(id)` (`js/chat.js`).

**Contrôles** :
```bash
grep -nE "\son[a-z]+=\"[^\"]*\\$\{" js/*.js
# attendu exactement 8 lignes : chat.js:338, gmaps-ui.js:56, distributor.js:287, distributor.js:290,
# navigation.js:145, notifications.js:376, notifications.js:435, add-distributor.js:133 et :168
# (add-distributor : numéros internes, on n'y touche pas)
grep -n "import { renderSidePanelItem } from './gmaps-ui.js';" js/distributor.js     # 1 ligne
grep -n "addEventListener('input'" js/app.js                                       # quick-search, vers 748
grep -n '"./js/app.js": "./js/app.js?v=' index.html                                 # ?v=91 ou plus
```
Le `\s` devant `on` compte : sans lui, `aria-controls="..."` serait compté à tort.

## Étapes

1. **js/navigation.js** — `searchItemHTML` : l'id passe dans `data-dist-id`.
   Avant :
   ```js
               <div class="search-item-clean" onclick="closeSearch(); openDistributorModal('${escapeHTML(d.id)}');">
   ```
   Après :
   ```js
               <div class="search-item-clean" data-dist-id="${escapeHTML(d.id)}">
   ```

2. **js/app.js** — écouteur unique sur les résultats de recherche.
   a) Juste après le bloc existant (vers la ligne 748) :
   ```js
       document.getElementById('quick-search').addEventListener('input', (e) => {
           performSearch(e.target.value);
       });
   ```
   ajouter :
   ```js
       // Un seul ecouteur sur les resultats (SEC-02 : plus aucun identifiant dans un onclick)
       document.getElementById('search-results').addEventListener('click', handleSearchResultClick);
   ```
   b) Ajouter cette fonction au niveau du module, juste au-dessus de la fonction qui contient
   ce bloc d'écouteurs :
   ```js
   // Resultat ou suggestion de recherche touche -> fiche (l'id est lu avant de vider la liste)
   function handleSearchResultClick(e) {
       const item = e.target.closest('.search-item-clean[data-dist-id]');
       if (!item) return;
       const id = item.dataset.distId;
       closeSearch();
       openDistributorModal(id);
   }
   ```
   `closeSearch` et `openDistributorModal` sont déjà importées dans app.js (lignes 24 et 52).

3. **js/distributor.js** — favoris : attributs `data-dist-id` + écouteur unique.
   a) Ligne 17, avant / après :
   ```js
   import { renderSidePanelItem } from './gmaps-ui.js';
   ```
   ```js
   import { renderSidePanelItem, openDistributorModal, removeBrokenThumb } from './gmaps-ui.js';
   ```
   b) Dans `displaySubscriptions`, avant :
   ```js
               <div class="favorite-row" onclick="openDistributorModal('${escapeHTML(d.id)}')">
   ```
   après :
   ```js
               <div class="favorite-row" data-dist-id="${escapeHTML(d.id)}">
   ```
   et avant :
   ```js
                   <button class="btn-unsubscribe" aria-label="Retirer des favoris" onclick="toggleSubscription('${escapeHTML(d.id)}', event)" title="Retirer des favoris">
   ```
   après :
   ```js
                   <button class="btn-unsubscribe" aria-label="Retirer des favoris" data-dist-id="${escapeHTML(d.id)}" title="Retirer des favoris">
   ```
   c) Juste après la fin de `displaySubscriptions` (avant le commentaire « Etats et stocks arrives »),
   ajouter :
   ```js
   // Clics sur la liste des favoris : un seul ecouteur pose une fois sur le conteneur, qui
   // survit aux re-rendus (SEC-02 : plus aucun identifiant dans un onclick)
   function handleSubscriptionsClick(e) {
       const unsubscribe = e.target.closest('.btn-unsubscribe[data-dist-id]');
       if (unsubscribe) {
           toggleSubscription(unsubscribe.dataset.distId, e);
           return;
       }
       const row = e.target.closest('.favorite-row[data-dist-id]');
       if (row) openDistributorModal(row.dataset.distId);
   }

   export function initSubscriptionsList() {
       const list = document.getElementById('subscriptions-list');
       if (!list) return;
       list.addEventListener('click', handleSubscriptionsClick);
       list.addEventListener('error', removeBrokenThumb, true);
   }
   ```

4. **js/app.js** — brancher la liste des favoris.
   a) Import, avant / après :
   ```js
       renderProductsList, toggleSubscription, displaySubscriptions, loadPhotoThumbnails
   ```
   ```js
       renderProductsList, toggleSubscription, displaySubscriptions, loadPhotoThumbnails, initSubscriptionsList
   ```
   b) Juste après la ligne ajoutée à l'étape 2a :
   ```js
       initSubscriptionsList();
   ```

5. **js/gmaps-ui.js** — vignette photo sans `onerror` (code inactif tant que `FEATURES.photos` est faux).
   a) Avant :
   ```js
           ? `<img src="${escapeHTML(thumb)}" alt="" loading="lazy" onerror="this.parentNode.textContent='${emoji}'"><span class="side-panel-item-cat" aria-hidden="true">${emoji}</span>`
   ```
   après :
   ```js
           ? `<img src="${escapeHTML(thumb)}" alt="" loading="lazy"><span class="side-panel-item-cat" aria-hidden="true">${emoji}</span>`
   ```
   b) Mettre à jour le commentaire au-dessus (« onerror : si l'image casse... ») en :
   `// Image cassee : removeBrokenThumb la retire, la pastille emoji reste (SEC-02).`
   c) Juste avant `export function initSidePanel() {`, ajouter :
   ```js
   // Vignette qui ne charge pas : on la retire, la pastille emoji reste visible.
   // Ecouteur en capture (l'evenement error ne remonte pas). Remplace un onerror en ligne (SEC-02).
   export function removeBrokenThumb(e) {
       if (e.target.tagName === 'IMG' && e.target.closest('.side-panel-item-photo')) e.target.remove();
   }
   ```
   d) Dans `initSidePanel`, juste après la ligne
   `document.getElementById('side-panel-list')?.addEventListener('click', handleSidePanelClick);`
   ajouter :
   ```js
       document.getElementById('side-panel-list')?.addEventListener('error', removeBrokenThumb, true);
   ```

6. **js/notifications.js** — bandeau : le bouton « Voir » reçoit un écouteur, pas de code en ligne.
   a) Avant :
   ```js
           <button class="notif-action" onclick="openDistributorModal('${escapeHTML(String(notif.distributorId))}'); this.closest('.notification-banner').remove();">
   ```
   après :
   ```js
           <button class="notif-action">
   ```
   (garder la ligne suivante `Voir` et `</button>` ; ne pas toucher à `notif-close`, qui ne
   contient aucune donnée.)
   b) Juste après `document.body.appendChild(banner);` ajouter :
   ```js
       const distributorId = String(notif.distributorId);
       banner.querySelector('.notif-action').addEventListener('click', function openFromBanner() {
           window.openDistributorModal(distributorId);
           banner.remove();
       });
   ```
   `window.openDistributorModal` (et non un import) : c'est la fonction que l'ancien `onclick`
   appelait déjà, et importer `gmaps-ui.js` ici créerait un import circulaire de plus.

7. **js/notifications.js** — produits suivis : `data-product` + écouteur par bouton.
   Remplacer tout le bloc, avant :
   ```js
       container.innerHTML = NotificationPrefs.followedProducts.map(product => {
           const safeAttr = escapeHTML(product).replace(/'/g, '&#39;');
           return `
           <span class="followed-product-chip">
               ${escapeHTML(product)}
               <button class="remove-btn" aria-label="Retirer ${escapeHTML(product)} des produits suivis" onclick="unfollowProduct('${safeAttr}')">&times;</button>
           </span>
       `;
       }).join('');
   ```
   après :
   ```js
       container.innerHTML = NotificationPrefs.followedProducts.map(product => `
           <span class="followed-product-chip">
               ${escapeHTML(product)}
               <button class="remove-btn" aria-label="Retirer ${escapeHTML(product)} des produits suivis" data-product="${escapeHTML(product)}">&times;</button>
           </span>
       `).join('');
       // Boutons neufs a chaque rendu : un ecouteur chacun, sans cumul (SEC-02 : plus de onclick)
       container.querySelectorAll('.remove-btn[data-product]').forEach(function bindRemove(btn) {
           btn.addEventListener('click', function removeFollowed() { unfollowProduct(btn.dataset.product); });
       });
   ```

8. **js/chat.js** — liste des conversations (code inactif, `FEATURES.chat` faux).
   a) Avant :
   ```js
               <div class="conversation-item ${isActive ? 'active' : ''} ${isSubscribed ? 'subscribed' : ''}" onclick="openConversation('${id}')">
                   <div class="conversation-avatar">${d.emoji}</div>
   ```
   après :
   ```js
               <div class="conversation-item ${isActive ? 'active' : ''} ${isSubscribed ? 'subscribed' : ''}" data-conv-id="${escapeHTML(id)}">
                   <div class="conversation-avatar">${escapeHTML(d.emoji || '')}</div>
   ```
   b) Juste après la fin de `list.innerHTML = sortedList.map(...).join('');` ajouter :
   ```js
       // Lignes neuves a chaque rendu : un ecouteur chacune (SEC-02 : plus d'identifiant dans un onclick)
       list.querySelectorAll('.conversation-item[data-conv-id]').forEach(function bindConversation(item) {
           item.addEventListener('click', function openFromList() { openConversation(item.dataset.convId); });
       });
   ```

9. **index.html** — six modules JS changent : monter le `?v=` de **toutes** les entrées de
   l'import map à la même valeur (ex. `?v=91` → `?v=92` partout). Aucun CSS ne change.

## Tests

### Test 1 — garde-fou (unitaire, empêche le retour du défaut)
- **Fichier** : `tests/unit/unit.test.js`, juste après le bloc `describe('fiche : jamais le mot « machine » (EPIC-T10)'`.
- **Code** :
  ```js
  // SEC-02 : une donnee dans un attribut on...= s'execute meme echappee (&#39; est decode avant le JS)
  describe('XSS : aucune donnee dans un attribut on...= (SEC-02)', () => {
      it('aucun gabarit de js/ ne place ${...} dans un onclick / onerror...', () => {
          const root = new URL('../../', import.meta.url);
          // Numeros internes generes par l'app, jamais saisis par un membre
          const ALLOWED = ['removeProductRow(${id})', 'removeAddPhoto(${i})'];
          const offenders = [];
          for (const f of readdirSync(new URL('js/', root)).filter(name => name.endsWith('.js'))) {
              const src = readFileSync(new URL(`js/${f}`, root), 'utf8');
              for (const m of src.matchAll(/\son[a-z]+="[^"]*\$\{[^"]*"/g)) {
                  if (!ALLOWED.some(a => m[0].includes(a))) offenders.push(`js/${f} : ${m[0].trim()}`);
              }
          }
          assert.deepEqual(offenders, [], `donnee dans un attribut on...= :\n${offenders.join('\n')}`);
      });
  });
  ```
- **Doit échouer avant** : il liste les 7 lignes des constats.

### Test 2 — identifiant piégé (fonctionnel)
- **Fichier** : `tests/functional/navigation.spec.js`, nouveau bloc à la fin du fichier.
- **Code** :
  ```js
  // ============================================
  // SECURITE : IDENTIFIANT PIEGE (SEC-02)
  // ============================================

  test.describe('Sécurité : identifiant piégé (SEC-02)', () => {
      const EVIL = "x');window.__pwned=1;//";

      test.beforeEach(async ({ page }) => {
          await page.evaluate((id) => {
              const base = window.AppState.distributors[0];
              window.AppState.distributors.push({ ...base, id, name: 'Piege Test', products: [] });
              window.AppState.subscriptions.push(id);
          }, EVIL);
      });

      test('recherche : la fiche s ouvre et rien ne s execute', async ({ page }) => {
          await page.click('#search-toggle');
          await page.fill('#quick-search', 'Piege Test');
          await page.click('#search-results .search-item-clean');
          await page.waitForSelector('#dist-modal-overlay.active', { timeout: 5000 });
          expect(await page.evaluate(() => [window.__pwned, window.AppState.currentDistributor?.id])).toEqual([undefined, EVIL]);
      });

      test('favoris : ouvrir puis retirer, rien ne s execute', async ({ page }) => {
          await page.click('.bottom-nav [data-tab="favorites"]');
          await page.waitForSelector('#subscriptions-view.view-active', { timeout: 3000 });
          const row = page.locator('#subscriptions-list .favorite-row', { hasText: 'Piege Test' });
          await row.locator('.side-panel-item').click();
          await page.waitForSelector('#dist-modal-overlay.active', { timeout: 5000 });
          expect(await page.evaluate(() => [window.__pwned, window.AppState.currentDistributor?.id])).toEqual([undefined, EVIL]);
          await page.click('#dist-modal-close');
          await page.click('.bottom-nav [data-tab="favorites"]');
          await page.locator('#subscriptions-list .favorite-row', { hasText: 'Piege Test' }).locator('.btn-unsubscribe').click();
          expect(await page.evaluate((id) => [window.__pwned, window.AppState.subscriptions.includes(id)], EVIL)).toEqual([undefined, false]);
      });
  });
  ```
- **Doit échouer avant** : le clic exécute `openDistributorModal('x');window.__pwned=1;//')`,
  aucune fiche « x » n'existe, donc l'attente de `#dist-modal-overlay.active` expire.
- Les tests fonctionnels tournent en `Desktop Chrome` (`playwright.config.js`) : la croix
  `#dist-modal-close` y est cliquable. Si elle ne l'est pas, s'arrêter et signaler
  (`closeDistModal` n'est pas exposée sur `window`, ne pas l'ajouter dans cette story).

## Vérification (dans l'ordre)
```bash
grep -nE "\son[a-z]+=\"[^\"]*\\$\{" js/*.js        # attendu : seulement add-distributor.js:133 et :168
npm test                                           # tout vert, dont « XSS : aucune donnee » et « cache-busting »
npx playwright test --project=functional -g "SEC-02"                   # 2 passed
npx playwright test --project=functional -g "Favori|favori|recherche|Recherche|notification"   # tout vert
npm run test:functional                            # en arrière-plan (~10 min) : tout vert, instables notés dans la PR
```

## Hors périmètre
- La contrainte de format de l'id en base (`check (id ~ '^[A-Za-z0-9_-]{1,64}$')`) : story SEC « ajout de fiche ».
- Transformer les lignes en `<button>` pour le clavier : story A11Y (ne pas le faire ici, ça change le CSS).
- `add-distributor.js:133` et `:168` (numéros internes) et `notif-close` (aucune donnée).
- Les autres `onclick` en ligne sans donnée, ni `window.*` dans app.js : ne pas toucher.

## Pièges connus
- Lire `dataset.distId` **avant** `closeSearch()` : `closeSearch` vide la liste.
- Dans les favoris, tester le bouton « retirer » **avant** la ligne : il est dans la ligne,
  sinon le clic sur le cœur ouvrirait aussi la fiche.
- `data-dist-id` → `dataset.distId` (le tiret devient une majuscule). Idem `data-conv-id` → `convId`.
- Ne pas supprimer `window.toggleSubscription`, `window.unfollowProduct`, `window.openConversation`
  dans app.js : d'autres gabarits peuvent encore les appeler.
- Bump de **toutes** les entrées de l'import map à la **même** valeur, sinon le test `cache-busting` échoue.

## Terminé quand
- [ ] Contrôles passés, tests écrits (échouent avant, passent après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : oui, écrans `recherche` et `favoris` (`SEC-02-avant-recherche`, `SEC-02-apres-recherche`, idem `favoris`) ; avant et après doivent être identiques à l'œil
- [ ] Story cochée dans BACKLOG.md, PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `fix(securite): plus aucune donnee dans un onclick (fiche piegee)`

**Corps** : constats corrigés (liste ci-dessus), cause (`&#39;` décodé avant le JavaScript des
attributs `on...`), correction (attributs `data-...` + écouteurs, modèle de la liste latérale),
tests ajoutés (garde-fou unitaire, identifiant piégé en fonctionnel), sorties des commandes,
captures iPhone. Rappeler que la contrainte de format en base suit dans une autre story.
