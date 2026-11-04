# CNX-02 — Bouton retour : la recherche, la fenêtre de connexion et Échap ferment ce qu'il faut

- **Lot** : 4. Connexion, retour et liens · **Gravité** : moyen · **Niveau conseillé** : medium
- **Prérequis** : **CNX-01 fusionnée** dans `master` ; partir de `master` **à jour**. Sinon : s'arrêter
  (sans CNX-01, toucher un résultat de recherche perdrait l'entrée de la fiche).
- **Branche** : `fix/retour-recherche-connexion` · **Taille** : 3 fichiers JS (+ `index.html`) + 2 fichiers de tests. **Aucune migration.**
- **Constats couverts** (rapport du 2026-10-21) :
  - La modale de connexion n'a pas d'entrée d'historique : « retour » ferme ce qu'il y a dessous ou quitte l'app — `js/auth.js:210` (aujourd'hui `openEmailModal`, ligne 247)
  - Les écouteurs onAuthChange des modales ne sont jamais retirés : la deuxième modale ne se ferme plus à la connexion — `js/auth.js:352` (aujourd'hui ligne 432)
  - La recherche n'est pas une couche d'historique : le bouton retour d'Android ferme l'app au lieu de la recherche — `js/navigation.js:137` (aujourd'hui ligne 164)
  - Échap ferme la liste latérale sans retirer son entrée d'historique — `js/app.js:792` (aujourd'hui ligne 931)
  - Fermer le panneau latéral par Échap laisse une entrée d'historique orpheline et la puce « Tous » allumée — `js/navigation.js:128` (volet Échap ; le volet « croix sous une fiche » est fait par CNX-01)

## But
« Retour » ferme la recherche ou la fenêtre de connexion au lieu de fermer la fiche dessous ou de
quitter l'app ; Échap ferme la liste proprement (puce « Tous » éteinte, aucune entrée d'historique
de trop) ; une fenêtre de connexion rouverte se ferme bien quand la connexion aboutit.

## User story
En tant que visiteur sur téléphone, je veux que « retour » ferme d'abord ce qui est par-dessus
(recherche, fenêtre de connexion), afin de ne pas perdre la fiche que je regardais ni sortir de l'app.

**Critères d'acceptation**
- [ ] Carte, loupe, « retour » : la recherche se ferme, l'app reste.
- [ ] Favoris, loupe, « retour » : la recherche se ferme, Favoris reste ; un second « retour » ramène à la carte.
- [ ] Toucher un résultat de recherche : la fiche s'ouvre avec sa propre entrée ; « retour » la ferme.
- [ ] Fiche ouverte, « Se connecter », « retour » : la fenêtre de connexion se ferme, la fiche reste.
- [ ] Fenêtre de connexion fermée par la croix, Échap ou le fond : aucune entrée d'historique de trop.
- [ ] Fenêtre fermée, puis rouverte par « + » : la connexion ferme la seconde fenêtre et le mode ajout démarre.
- [ ] Liste ouverte par « Tous », Échap : liste fermée, puce « Tous » éteinte, plus aucune couche.

## Ce qui est déjà tranché (ne pas refaire l'analyse)
- **Fenêtre de connexion** : modèle de `js/confirm-dialog.js` (`pushLayer` à l'ouverture,
  `popLayer` à la fermeture). `close()` devient idempotent (drapeau `closed`) : quand « retour »
  ferme la fenêtre, `history.js` a déjà dépilé la couche et ignore le `popLayer('auth')` que fait
  `close()` (garde `closing` de CNX-01).
- **Écouteur par fenêtre** : `onAuthChange` renvoie une fonction qui retire l'écouteur ;
  chaque fenêtre retire le sien à la fermeture et ne regarde plus le drapeau partagé `modalOpen`
  (c'était lui qui faisait fermer la mauvaise fenêtre). `notifyAuthChange` parcourt une copie de la
  liste (un écouteur qui se retire pendant la boucle ne fait pas sauter le suivant).
- **Recherche** : la partie DOM de `closeSearch` devient `hideSearch()`, appelée par « retour » ;
  `closeSearch()` (croix, Échap, résultat touché) ne fait rien si la recherche est déjà fermée,
  sinon cache puis retire la couche. Le résultat touché enchaîne `closeSearch()` puis
  `openDistributorModal()` dans la même tâche : c'est CNX-01 qui garantit que la fiche garde son entrée.
- **Échap** : `closeSidePanel()` (déjà importé dans `js/app.js`) remplace `closeSidebar()`, appelé
  **après** `switchTab('explore')`. Le voile `#sidebar-overlay` n'est jamais rendu actif par le code
  actuel : son écouteur appelle aussi `closeSidePanel`. `closeSidebar` n'est alors plus utilisé dans
  `js/app.js` : on le retire de l'import (il reste exporté, `js/chat.js` l'utilise).
- `showEditAuthGate` (`js/gmaps-ui.js`) n'est pas touché : il ne sert qu'aux photos, inactives (`FEATURES.photos`).

## Avant de coder
**Lire en entier** : `js/auth.js` lignes 1-60 et 229-437 ; `js/confirm-dialog.js` ; `js/navigation.js`
lignes 160-200 ; `js/app.js` lignes 20-26, 578-586, 760-782, 920-936 ; `js/history.js` (version CNX-01) ;
`tests/functional/auth.spec.js` lignes 1-60 ; `tests/functional/navigation.spec.js` lignes 480-530.

**Réutiliser** : `pushLayer` / `popLayer` (`js/history.js`), `closeSidePanel` (`js/gmaps-ui.js`, déjà
importé dans `js/app.js`), `setupApp`, `openDistModal` (`tests/functional/helpers.js`), `window.__distrimatchLayers`.

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
grep -n "queueMicrotask(sendBack)" js/history.js                       # 1 ligne (CNX-01 fusionnée)
grep -n "^import { isStandalone, forgetPushAccount } from './push.js';" js/auth.js   # 1 ligne (15)
grep -n -A 2 "^export function onAuthChange(fn) {" js/auth.js           # 32-34 : push puis }
grep -n "    authListeners.forEach(fn => {" js/auth.js                   # 1 ligne (37)
grep -n "    const close = (success = false) => {" js/auth.js           # 1 ligne (342)
grep -n "    activateFocusTrap(dialog, () => close(false));" js/auth.js  # 1 ligne (352)
grep -n "if (user && !user.is_anonymous && modalOpen) {" js/auth.js     # 1 ligne (433)
grep -n "pushLayer\|popLayer" js/auth.js                                # aucun résultat
grep -n "^export function openSearch() {" js/navigation.js              # 1 ligne (164)
grep -n "^export function closeSearch() {" js/navigation.js             # 1 ligne (195)
grep -n "closeSidebar" js/app.js                                        # 3 lignes : import (24), sidebar-overlay (781), Échap (931)
grep -n "            closeSidebar();" js/app.js                         # 1 ligne (931)
grep -n "27. FILTRES ET PANNEAU (audit UX-11/12)" tests/functional/navigation.spec.js   # 1 ligne
grep -n "^// RETOUR SUR LA FICHE APRES CONNEXION (2026-10-17)" tests/functional/auth.spec.js   # 1 ligne (149)
grep -o '"./js/app.js": "./js/app.js?v=[0-9]*"' index.html             # noter V (114 attendu après CNX-01)
```

## Étapes

1. **js/auth.js** — import de l'historique. Avant :
   ```js
   import { isStandalone, forgetPushAccount } from './push.js';
   ```
   Après :
   ```js
   import { isStandalone, forgetPushAccount } from './push.js';
   import { pushLayer, popLayer } from './history.js';
   ```

2. **js/auth.js** — un écouteur peut être retiré. Avant :
   ```js
   export function onAuthChange(fn) {
       authListeners.push(fn);
   }

   function notifyAuthChange() {
       authListeners.forEach(fn => {
   ```
   Après :
   ```js
   // Renvoie de quoi retirer l'ecouteur (CNX-02 : une fenetre de connexion fermee ne
   // reagit plus a la connexion suivante)
   export function onAuthChange(fn) {
       authListeners.push(fn);
       return () => {
           const i = authListeners.indexOf(fn);
           if (i !== -1) authListeners.splice(i, 1);
       };
   }

   function notifyAuthChange() {
       // Copie : un ecouteur qui se retire pendant la boucle ne fait pas sauter le suivant
       authListeners.slice().forEach(fn => {
   ```

3. **js/auth.js**, `openEmailModal` — fermeture idempotente, couche d'historique. Avant :
   ```js
       const dialog = overlay.querySelector('.auth-modal');
       const close = (success = false) => {
           modalOpen = false;
           if (captchaWidgetId !== null && window.hcaptcha) {
               try { window.hcaptcha.reset(captchaWidgetId); } catch (e) {}
           }
           deactivateFocusTrap(dialog);
           overlay.remove();
           onClose(success);
       };

       activateFocusTrap(dialog, () => close(false));
   ```
   Après :
   ```js
       const dialog = overlay.querySelector('.auth-modal');
       let closed = false;
       let stopAuthWatch = null;
       const close = (success = false) => {
           if (closed) return;   // CNX-02 : une seule fermeture (croix, Echap, fond, retour, connexion)
           closed = true;
           modalOpen = false;
           stopAuthWatch?.();
           if (captchaWidgetId !== null && window.hcaptcha) {
               try { window.hcaptcha.reset(captchaWidgetId); } catch (e) {}
           }
           deactivateFocusTrap(dialog);
           overlay.remove();
           popLayer('auth');   // fermee par l'UI : retire son entree (sans effet apres « retour »)
           onClose(success);
       };

       activateFocusTrap(dialog, () => close(false));
       pushLayer('auth', () => close(false));   // CNX-02 : « retour » ferme la fenetre, pas la fiche dessous
   ```

4. **js/auth.js**, fin d'`openEmailModal` — l'écouteur de CETTE fenêtre. Avant :
   ```js
       // Si l'user clique deja sur le lien dans son email et revient, on ferme automatiquement
       onAuthChange((user) => {
           if (user && !user.is_anonymous && modalOpen) {
               close(true);
           }
       });
   ```
   Après :
   ```js
       // Connecte (lien ouvert dans un autre onglet, ou code) : CETTE fenetre se ferme.
       // CNX-02 : l'ecouteur est retire a la fermeture ; avant, celui d'une fenetre deja
       // fermee repondait a la place de la fenetre ouverte, qui restait affichee.
       stopAuthWatch = onAuthChange((user) => {
           if (user && !user.is_anonymous) close(true);
       });
   ```

5. **js/navigation.js** — la recherche devient une couche. Avant :
   ```js
   export function openSearch() {
       document.getElementById('search-overlay').classList.add('active');
       renderSearchSuggestions();
       document.getElementById('quick-search').focus();
   }
   ```
   Après :
   ```js
   // CNX-02 : la recherche est une couche d'historique ; « retour » la ferme (hideSearch)
   // au lieu de quitter l'app ou de fermer la page dessous.
   function hideSearch() {
       document.getElementById('search-overlay').classList.remove('active');
       document.getElementById('quick-search').value = '';
       document.getElementById('search-results').innerHTML = '';
   }

   export function openSearch() {
       const overlay = document.getElementById('search-overlay');
       if (!overlay.classList.contains('active')) pushLayer('search', hideSearch);
       overlay.classList.add('active');
       renderSearchSuggestions();
       document.getElementById('quick-search').focus();
   }
   ```

6. **js/navigation.js** — fermer par l'UI retire la couche. Avant :
   ```js
   export function closeSearch() {
       document.getElementById('search-overlay').classList.remove('active');
       document.getElementById('quick-search').value = '';
       document.getElementById('search-results').innerHTML = '';
   }
   ```
   Après :
   ```js
   // Croix, Echap, resultat touche : cache la recherche et retire son entree d'historique
   export function closeSearch() {
       if (!document.getElementById('search-overlay')?.classList.contains('active')) return;
       hideSearch();
       popLayer('search');
   }
   ```

7. **js/app.js** — import : `closeSidebar` n'est plus utilisé. Avant :
   ```js
       switchView, switchTab, goBackToMap, registerViewCallback, updateBadges, updateConversationsBadge, closeSidebar, setFilter, openSearch, closeSearch, performSearch, initFilterChips, updateProfileStats,
   ```
   Après :
   ```js
       switchView, switchTab, goBackToMap, registerViewCallback, updateBadges, updateConversationsBadge, setFilter, openSearch, closeSearch, performSearch, initFilterChips, updateProfileStats,
   ```

8. **js/app.js** — voile de la liste. Avant :
   ```js
       document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);
   ```
   Après :
   ```js
       document.getElementById('sidebar-overlay').addEventListener('click', closeSidePanel);
   ```

9. **js/app.js** — Échap. Avant :
   ```js
           if (e.key === 'Escape') {
               closeSearch();
               closeChatModal();
               closeSidebar();
               closeReportModal();
               switchTab('explore');
           }
   ```
   Après :
   ```js
           if (e.key === 'Escape') {
               closeSearch();
               closeChatModal();
               closeReportModal();
               switchTab('explore');
               // CNX-02 : closeSidePanel retire la couche de la liste et eteint « Tous »
               // (l'ancienne fermeture ne faisait ni l'un ni l'autre)
               if (document.getElementById('sidebar')?.classList.contains('open')) closeSidePanel();
           }
   ```

10. **index.html** — trois modules JS changent : monter le `?v=` de **toutes** les entrées de l'import
    map à la même valeur V+1 (V noté aux contrôles). Aucun CSS ne change.

## Tests

### Test 1 — retour et Échap (fonctionnel)
- **Fichier** : `tests/functional/navigation.spec.js`, **juste avant** ces 3 lignes (uniques ensemble ;
  le bloc `23b` de CNX-01 est donc au-dessus) :
  ```js
  // ============================================
  // 27. FILTRES ET PANNEAU (audit UX-11/12)
  // ============================================
  ```
- **Code à ajouter** :
  ```js
  // ============================================
  // 23c. RETOUR : RECHERCHE, CONNEXION, ECHAP (CNX-02)
  // ============================================

  test.describe('23c. Retour : recherche, connexion, Echap (CNX-02)', () => {
      test.use({ viewport: { width: 390, height: 844 } });
      const layers = (page) => page.evaluate(() => window.__distrimatchLayers());
      const goBack = (page) => page.goBack({ waitUntil: 'commit' }).catch(() => {});

      test('carte, loupe, retour : la recherche se ferme, l’app reste', async ({ page }) => {
          await page.click('#search-toggle');
          await expect(page.locator('#search-overlay')).toHaveClass(/active/);
          expect(await layers(page)).toEqual(['search']);
          await goBack(page);
          await expect(page.locator('#search-overlay')).not.toHaveClass(/active/);
          expect(await layers(page)).toEqual([]);
          expect(await page.evaluate(() => !!window.AppState)).toBe(true);
      });

      test('Favoris, loupe, retour : la recherche se ferme, Favoris reste ; retour encore : la carte', async ({ page }) => {
          await page.evaluate(() => window.switchView('favorites'));
          await expect(page.locator('#subscriptions-view')).toHaveClass(/view-active/);
          await page.click('#search-toggle');
          await expect(page.locator('#search-overlay')).toHaveClass(/active/);
          await goBack(page);
          await expect(page.locator('#search-overlay')).not.toHaveClass(/active/);
          await expect(page.locator('#subscriptions-view')).toHaveClass(/view-active/);
          await goBack(page);
          await expect(page.locator('#subscriptions-view')).not.toHaveClass(/view-active/);
          expect(await layers(page)).toEqual([]);
      });

      test('un resultat de recherche ouvre la fiche avec sa propre entree ; retour la ferme', async ({ page }) => {
          await page.click('#search-toggle');
          await page.locator('#search-results .search-item-clean').first().click();
          await expect(page.locator('#dist-modal-overlay')).toHaveClass(/active/);
          await expect(page.locator('#search-overlay')).not.toHaveClass(/active/);
          expect(await layers(page)).toEqual(['fiche']);
          await expect.poll(() => page.evaluate(() => window.history.state?.layer ?? null)).toBe('fiche');
          await goBack(page);
          await expect(page.locator('#dist-modal-overlay')).not.toHaveClass(/active/);
          expect(await layers(page)).toEqual([]);
      });

      test('fiche, « Se connecter », retour : la fenetre se ferme, la fiche reste', async ({ page }) => {
          await page.evaluate(() => localStorage.setItem('distrimatch_force_auth', '1'));
          await openDistModal(page);
          await page.evaluate(() => document.getElementById('dist-login-invite-btn').click());
          await page.waitForSelector('.auth-modal-overlay');
          expect(await layers(page)).toEqual(['fiche', 'auth']);
          await goBack(page);
          await expect(page.locator('.auth-modal-overlay')).toHaveCount(0);
          await expect(page.locator('#dist-modal-overlay')).toHaveClass(/active/);
          expect(await layers(page)).toEqual(['fiche']);
          // Fermee par Echap : la fenetre retire sa propre entree, la fiche garde la sienne
          await page.evaluate(() => document.getElementById('dist-login-invite-btn').click());
          await page.waitForSelector('.auth-modal-overlay');
          await page.keyboard.press('Escape');
          await expect(page.locator('.auth-modal-overlay')).toHaveCount(0);
          await expect(page.locator('#dist-modal-overlay')).toHaveClass(/active/);
          expect(await layers(page)).toEqual(['fiche']);
      });

      test('« Tous » puis Echap : liste fermee, puce eteinte, plus aucune couche', async ({ page }) => {
          await page.click('.filter-chip[data-type="all"]');
          await expect(page.locator('#sidebar')).toHaveClass(/open/);
          await page.keyboard.press('Escape');
          await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
          await expect(page.locator('.filter-chip[data-type="all"]')).not.toHaveClass(/active/);
          expect(await layers(page)).toEqual([]);
      });
  });
  ```
- **Doivent échouer avant la correction** : test 1, la pile vaut `[]` au lieu de `['search']` ;
  test 2, le premier « retour » ferme Favoris et laisse la recherche ; test 4, la pile vaut
  `['fiche']` au lieu de `['fiche', 'auth']` ; test 5, la puce « Tous » reste allumée.
  Le test 3 **passe déjà** (grâce à CNX-01) : garde-fou, le noter dans la PR.

### Test 2 — fenêtre rouverte (fonctionnel)
- **Fichier** : `tests/functional/auth.spec.js`, **juste avant** ces 3 lignes (uniques ensemble) :
  ```js
  // ============================================
  // RETOUR SUR LA FICHE APRES CONNEXION (2026-10-17)
  // ============================================
  ```
- **Code à ajouter** :
  ```js
  // ============================================
  // FENETRE DE CONNEXION ROUVERTE (CNX-02)
  // ============================================

  test.describe('Fenetre de connexion rouverte (CNX-02)', () => {
      test('fermee puis rouverte par « + » : la connexion ferme la seconde et lance l’ajout', async ({ page }) => {
          await page.evaluate(() => localStorage.setItem('distrimatch_force_auth', '1'));
          await page.click('#btn-add-distributor');
          await page.waitForSelector('.auth-modal-overlay');
          await page.click('.auth-modal-close');
          await expect(page.locator('.auth-modal-overlay')).toHaveCount(0);
          await page.click('#btn-add-distributor');
          await page.waitForSelector('.auth-modal-overlay');
          await page.evaluate(() => window.__testLogin());
          await expect(page.locator('.auth-modal-overlay')).toHaveCount(0);
          await expect(page.locator('#btn-add-distributor')).toHaveClass(/active/);
      });
  });
  ```
- **Doit échouer avant la correction** : la seconde fenêtre reste affichée (`toHaveCount(0)` expire).

## Vérification (dans l'ordre)
```bash
node --check js/auth.js && node --check js/navigation.js && node --check js/app.js   # aucune sortie
grep -n "closeSidebar" js/app.js                                     # aucun résultat
grep -n "modalOpen) {" js/auth.js                                    # aucun résultat
npx playwright test --project=functional -g "CNX-02"                 # 6 passed
npx playwright test --project=functional -g "Bouton retour|CNX-01|Auth wall|Politique d|Connexion par code|Connexion depuis une fiche|Recherche, notifications|SEC-02"   # tout vert
npm test                                                             # tout vert, dont « cache-busting »
npm run test:functional                                              # en arrière-plan (~10 min) : tout vert, instables notés dans la PR
git diff --stat                                                      # auth.js, navigation.js, app.js, index.html, 2 specs (+ BACKLOG.md)
```

## Hors périmètre
- `showEditAuthGate` (fenêtre « Connexion requise » des photos, inactives) : pas de couche.
- Le chat (inactif) et `closeSidebar` dans `js/chat.js` : inchangés.
- Ne pas toucher à `modalOpen` au début d'`openEmailModal` (`if (modalOpen) return;`) : il empêche
  toujours deux fenêtres à la fois.
- Événements de session répétés (`onAuthStateChange`) : **CNX-05**.

## Pièges connus
- Étape 3 : `pushLayer('auth', ...)` **après** `activateFocusTrap` et après la définition de `close`.
- Étape 4 : `stopAuthWatch` est déclaré avec `let` à l'étape 3, **avant** `close` ; ne pas écrire
  `const stopAuthWatch = onAuthChange(...)` (redéclaration : erreur de syntaxe).
- Étape 6 : `closeSearch` sort tout de suite si la recherche est fermée ; c'est voulu (Échap
  l'appelle à chaque fois) : ne pas remettre le vidage du champ avant ce test.
- Le test 4 clique le bouton par `evaluate` : à 390 px, la fiche est une feuille et le bouton peut
  être sous le pli.
- Fichiers en CRLF : outil Edit ; si un bloc refuse, petit script Node dans le scratchpad (voir README).
- Bump de **toutes** les entrées de l'import map à la **même** valeur.

## Terminé quand
- [ ] Contrôles passés, tests écrits (échouent avant pour la raison annoncée, passent après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : non (aucun écran ne change)
- [ ] Story cochée dans BACKLOG.md si elle y figure (sinon le noter dans la PR), PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `fix(retour): recherche et fenetre de connexion fermees par retour, Echap ferme la liste proprement`

**Corps** : constats couverts (liste ci-dessus) ; causes (recherche et fenêtre de connexion sans
couche d'historique ; écouteur d'une fenêtre fermée jamais retiré et drapeau partagé ; Échap
appelait `closeSidebar`) ; correction ; tests ajoutés (le test « résultat de recherche » est un
garde-fou qui passait grâce à CNX-01) ; sorties des commandes de vérification.
