# BUG-12 — « Mon activité » et « Mes ajouts » : état vide à tort, erreur affichée comme une liste vide

- **Lot** : 3. Bugs visibles · **Gravité** : moyen · **Niveau conseillé** : medium
- **Prérequis** : **BUG-11 fusionnée** dans `master` ; partir de `master` **à jour**. Sinon : s'arrêter.
- **Ordre** : après BUG-11 (qui modifie aussi `js/additions.js`, sur d'autres lignes : les extraits
  ci-dessous n'en touchent aucune). Le test « Mes ajouts » s'insère juste avant
  `console : « Nouveaux distributeurs »…`, donc sous les deux tests de BUG-11 ; les repères de BUG-03
  et BUG-06 dans `validation.spec.js` sont ailleurs.
- **Branche** : `fix/activite-etat-vide-erreur` · **Taille** : 2 fichiers JS + 1 CSS (+ `index.html`) + 3 tests
- **Constats couverts** (rapport du 2026-10-21) :
  - « Mon activité » : le bloc « Rien pour l'instant » reste affiché sous l'historique d'un membre — `js/my-activity.js:43`
  - Erreur de chargement affichée comme une liste vide (« Mon activité », « Mes ajouts », onglet Avis) — `js/my-activity.js:72`
    (volets « Mon activité » et « Mes ajouts » ; l'onglet Avis est hors périmètre)

## But
Un membre qui a un historique ne voit plus « Rien pour l'instant » en dessous ; et quand le
chargement échoue (réseau, base en pause), « Mon activité » et « Mes ajouts » disent « Impossible
de charger … pour l'instant » avec un bouton « Réessayer », au lieu de faire croire qu'il n'y a rien.

## User story
En tant que membre qui ouvre son activité ou ses ajouts, je veux distinguer « rien à montrer » de
« pas pu charger », afin de ne pas croire que mes contributions ont disparu.

**Critères d'acceptation**
- [ ] « Mon activité » avec au moins une ligne : le bloc « Rien pour l’instant » n'est plus visible.
- [ ] « Mon activité » sans ligne (filtre vide ou compte neuf) : « Rien pour l’instant » s'affiche comme avant.
- [ ] `my_activity` en erreur, aucun historique déjà affiché : titre « Impossible de charger ton historique pour l’instant », bouton « Réessayer » ; le toucher relance le chargement et affiche les lignes.
- [ ] `my_activity` en erreur alors qu'un historique est déjà affiché : l'historique reste affiché.
- [ ] « Mes ajouts » en erreur : la ligne « Mes ajouts » de Compte reste visible ; la page dit « Impossible de charger tes ajouts pour l’instant. » avec « Réessayer » (jamais « Tu n’as pas encore ajouté de distributeur »).

## Pourquoi ça arrive (déjà analysé, ne pas refaire)
1. **« Rien pour l'instant » toujours visible.** `render()` masque le bloc par `empty.hidden = ...`.
   Mais `#activity-empty` porte la classe `.empty-state`, qui impose `display: flex`
   (`css/panels.css` vers la ligne 381) : une règle du site l'emporte toujours sur la règle du
   navigateur `[hidden] { display: none }`. Le projet règle ce cas composant par composant
   (`.account-row[hidden]`, `.reviews-empty[hidden]`… dans `css/overlays.css`) ; il manque
   `.empty-state[hidden]`. Les deux autres `.empty-state` (`#subscriptions-empty`,
   `#notifications-empty`) n'utilisent pas `hidden` : la règle ne les change pas.
2. **Erreur = liste vide.** `renderMyActivity()` vide `items` dans son `catch`, puis `render()`
   affiche l'état vide. Dans `refreshMyAdditions()`, les erreurs Supabase sont **renvoyées**
   (`d.error`, `m.error`), pas levées : elles ne sont jamais lues, `mine` reste `[]`, la ligne de
   Compte se masque et la page dit « Tu n’as pas encore ajouté de distributeur ».
   **Correction** : un drapeau `loadError` par module ; on ne remplace les données qu'en cas de
   succès ; message + « Réessayer » quand l'erreur survient sans rien à montrer.

## Avant de coder
**Lire en entier** : `js/my-activity.js` (102 lignes) ; `js/additions.js` lignes 1-123 ;
`css/panels.css` lignes 380-391 ; `tests/functional/navigation.spec.js` lignes 625-670 (bloc
`38. Mon activité et cohérence`) ; `tests/functional/validation.spec.js` lignes 1-37 (`routeReviewApi`).

**Réutiliser** : classes existantes `btn-primary-clean` (activité, comme `#activity-login`),
`btn-secondary-clean` et `admin-empty` (Mes ajouts) ; `routeReviewApi`, `loginForTest`,
`minutesAgoIso`, `json` (déjà dans `validation.spec.js`). Aucune nouvelle aide.

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
grep -n "empty.hidden = rows.length > 0;" js/my-activity.js                       # attendu : ligne 43
grep -n 'items = \[\];' js/my-activity.js                                         # attendu : lignes 14, 72 et 79
grep -n "#activity-login" js/my-activity.js                                       # attendu : ligne 95
grep -nF "mine = d.data || [];" js/additions.js                                    # attendu : 1 ligne, vers 51
grep -nF "row.hidden = !mine.length;" js/additions.js                              # attendu : 1 ligne, vers 62
grep -nF "Tu n’as pas encore ajouté de distributeur." js/additions.js               # attendu : 1 ligne, vers 75
grep -nF "const open = e.target.closest('[data-open-fiche]');" js/additions.js      # attendu : 1 ligne, vers 119
grep -n "min-height: 50vh;" css/panels.css                                        # attendu : 1 ligne, vers 388
grep -n 'empty-state\[hidden\]' css/*.css                                         # attendu : aucune ligne
grep -n 'css/panels.css?v=' index.html                                            # noter la valeur P (41 au moment de la fiche)
grep -n '"./js/app.js": "./js/app.js?v=' index.html                               # noter la valeur N de master à jour (95 à l'écriture de la fiche ; plus haute après BUG-06 et BUG-11)
grep -c '\.js?v=' index.html                                                      # attendu : 29
```

## Étapes

1. **css/panels.css** — juste après la règle `.empty-state { ... }`.
   Avant :
   ```css
       min-height: 50vh;
       gap: 0.5rem;
   }
   ```
   Après :
   ```css
       min-height: 50vh;
       gap: 0.5rem;
   }

   /* Etat vide masque par l'attribut hidden : le display: flex ci-dessus l'emporterait (BUG-12) */
   .empty-state[hidden] {
       display: none;
   }
   ```

2. **js/my-activity.js** — drapeau d'erreur.
   Avant :
   ```js
   let items = [];
   let filter = 'all';
   ```
   Après :
   ```js
   let items = [];
   let loadError = false;   // dernier chargement en echec (BUG-12)
   let filter = 'all';
   ```

3. **js/my-activity.js**, `render()` — message d'erreur avant l'état vide.
   Avant :
   ```js
       if (count) count.textContent = items.length ? String(items.length) : '';
       empty.hidden = rows.length > 0;
   ```
   Après :
   ```js
       if (count) count.textContent = items.length ? String(items.length) : '';
       // Echec du chargement sans historique deja affiche : le dire, ne pas montrer une liste vide (BUG-12)
       if (loadError && !items.length) {
           list.innerHTML = '';
           empty.hidden = false;
           empty.innerHTML = `<div class="empty-icon" aria-hidden="true">🕘</div>
               <h3>Impossible de charger ton historique pour l’instant</h3>
               <p>Vérifie ta connexion, puis réessaie.</p>
               <button type="button" class="btn-primary-clean activity-retry" id="activity-retry">Réessayer</button>`;
           return;
       }
       empty.hidden = rows.length > 0;
   ```

4. **js/my-activity.js**, `renderMyActivity()` — ne vider l'historique qu'en cas de succès.
   Avant :
   ```js
           items = data || [];
       } catch (e) {
           console.warn('[DistriMatch] Historique indisponible :', e?.message || e);
           items = [];
       }
   ```
   Après :
   ```js
           items = data || [];
           loadError = false;
       } catch (e) {
           console.warn('[DistriMatch] Historique indisponible :', e?.message || e);
           loadError = true;   // l'historique deja affiche reste affiche (BUG-12)
       }
   ```

5. **js/my-activity.js**, `initMyActivity()` — remise à zéro au changement de compte.
   Avant :
   ```js
       onAuthChange(() => {
           items = [];
   ```
   Après :
   ```js
       onAuthChange(() => {
           items = [];
           loadError = false;
   ```

6. **js/my-activity.js**, `initMyActivity()` — bouton « Réessayer ».
   Avant :
   ```js
           if (e.target.closest('#activity-login')) {
               requireAuth();
               return;
           }
   ```
   Après :
   ```js
           if (e.target.closest('#activity-login')) {
               requireAuth();
               return;
           }
           if (e.target.closest('#activity-retry')) {
               renderMyActivity();
               return;
           }
   ```

7. **js/additions.js** — drapeau d'erreur.
   Avant :
   ```js
   let messages = [];      // fil de chacune
   ```
   Après :
   ```js
   let messages = [];      // fil de chacune
   let loadError = false;  // dernier chargement en echec (BUG-12)
   ```

8. **js/additions.js**, `refreshMyAdditions()` — lire les erreurs renvoyées, ne remplacer qu'en cas de succès.
   Avant :
   ```js
   export async function refreshMyAdditions() {
       mine = [];
       messages = [];
       const user = getCurrentUser();
       if (!isAuthenticated() || !supabaseClient || !user?.id) {
           renderAccountRow();
           return;
       }
   ```
   Après :
   ```js
   export async function refreshMyAdditions() {
       const user = getCurrentUser();
       if (!isAuthenticated() || !supabaseClient || !user?.id) {
           mine = [];
           messages = [];
           loadError = false;
           renderAccountRow();
           return;
       }
   ```
   puis, avant :
   ```js
           mine = d.data || [];
           messages = (m.data || []).filter(x => mine.some(f => f.id === x.distributor_id));
       } catch (e) {
           /* hors ligne : rien */
       }
   ```
   après :
   ```js
           // Supabase renvoie ses erreurs sans les lever : les lire (BUG-12)
           if (d.error) throw d.error;
           if (m.error) throw m.error;
           mine = d.data || [];
           messages = (m.data || []).filter(x => mine.some(f => f.id === x.distributor_id));
           loadError = false;
       } catch (e) {
           console.warn('[DistriMatch] Mes ajouts indisponibles :', e?.message || e);
           loadError = true;   // ce qui etait deja charge reste affiche
       }
   ```

9. **js/additions.js**, `renderAccountRow()` — la ligne reste visible en cas d'erreur (elle mène au « Réessayer »).
   Avant :
   ```js
       row.hidden = !mine.length;
   ```
   Après :
   ```js
       row.hidden = !mine.length && !loadError;
   ```

10. **js/additions.js**, `renderAdditionsView()` — erreur ≠ liste vide.
    Avant :
    ```js
            box.innerHTML = '<p class="admin-empty">Tu n’as pas encore ajouté de distributeur.</p>';
    ```
    Après :
    ```js
            box.innerHTML = loadError
                ? `<p class="admin-empty">Impossible de charger tes ajouts pour l’instant.</p>
                   <button type="button" class="btn-secondary-clean" data-additions-retry>Réessayer</button>`
                : '<p class="admin-empty">Tu n’as pas encore ajouté de distributeur.</p>';
    ```

11. **js/additions.js**, `initAdditions()` — bouton « Réessayer ».
    Avant :
    ```js
            const open = e.target.closest('[data-open-fiche]');
    ```
    Après :
    ```js
            if (e.target.closest('[data-additions-retry]')) {
                refreshMyAdditions().then(renderAdditionsView);
                return;
            }
            const open = e.target.closest('[data-open-fiche]');
    ```

12. **index.html** — deux modules JS et un CSS changent :
    - monter le `?v=` de **toutes** les entrées de l'import map à N+1 (29 entrées, même valeur) ;
    - monter le `?v=` du seul `<link>` de `css/panels.css` à P+1 (ex. `?v=41` → `?v=42`).

## Tests

### Test 1 et 2 — « Mon activité » (fonctionnels)
- **Fichier** : `tests/functional/navigation.spec.js`, dans `test.describe('38. Mon activité et cohérence'`,
  juste **avant** le test `visiteur : « Mon activité » invite a se connecter ; accueil sans « sans compte » ni « machine »`.
- **Code à ajouter** :
  ```js
      test('membre : historique affiche, plus de « Rien pour l’instant » dessous (BUG-12)', async ({ page }) => {
          const id = await page.evaluate(() => window.AppState.distributors[0].id);
          await page.route('**/rest/v1/rpc/my_activity', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
              { kind: 'review', at: new Date(Date.now() - 60000).toISOString(), distributor_id: id, distributor_name: 'Test', product_name: null, state: '5', detail: null }
          ]) }));
          await page.evaluate(() => window.__testLogin());
          await page.click('.bottom-nav [data-tab="activity"]');
          await page.waitForSelector('#activity-view.view-active');
          await expect(page.locator('#activity-list .activity-row')).toHaveCount(1);
          await expect(page.locator('#activity-empty')).toBeHidden();
      });

      test('membre : historique indisponible -> message et « Réessayer » (BUG-12)', async ({ page }) => {
          const id = await page.evaluate(() => window.AppState.distributors[0].id);
          let down = true;
          await page.route('**/rest/v1/rpc/my_activity', r => r.fulfill(down
              ? { status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'panne simulee' }) }
              : { status: 200, contentType: 'application/json', body: JSON.stringify([
                  { kind: 'review', at: new Date(Date.now() - 60000).toISOString(), distributor_id: id, distributor_name: 'Test', product_name: null, state: '5', detail: null }
              ]) }));
          await page.evaluate(() => window.__testLogin());
          await page.click('.bottom-nav [data-tab="activity"]');
          await page.waitForSelector('#activity-view.view-active');
          await expect(page.locator('#activity-empty')).toContainText('Impossible de charger ton historique pour l’instant');
          await expect(page.locator('#activity-empty')).not.toContainText('Rien pour l’instant');
          down = false;
          await page.click('#activity-retry');
          await expect(page.locator('#activity-list .activity-row')).toHaveCount(1);
          await expect(page.locator('#activity-empty')).toBeHidden();
      });
  ```
- **Doivent échouer avant la correction** : le 1er parce que `#activity-empty` reste visible
  (`display: flex` l'emporte sur `hidden`) ; le 2e parce que `#activity-empty` affiche
  « Rien pour l’instant » au lieu du message d'erreur.

### Test 3 — « Mes ajouts » (fonctionnel)
- **Fichier** : `tests/functional/validation.spec.js`, dans `test.describe('37. Validation des nouvelles fiches'`,
  juste **avant** le test `console : « Nouveaux distributeurs », doublon signale, publier avec un nom corrige`
  (si BUG-11 est déjà fusionnée, ses deux tests sont juste au-dessus : insérer quand même juste
  avant le test `console : « Nouveaux distributeurs »…`).
- **Code à ajouter** :
  ```js
      test('« Mes ajouts » : chargement en echec -> message et « Réessayer », jamais « pas encore ajouté » (BUG-12)', async ({ page }) => {
          const mine = [{ id: 'user-a', name: 'Pizza de la gare', type: 'pizza', emoji: '🍕', city: 'Bayonne', review_status: 'pending', review_reason: null, author_read_at: minutesAgoIso(10), created_at: minutesAgoIso(200) }];
          await routeReviewApi(page, { mine });
          // Pose apres routeReviewApi : cette route passe en premier
          let down = true;
          await page.route(u => u.pathname.endsWith('/rest/v1/distributors') && u.searchParams.has('added_by'),
              r => r.fulfill(down ? json({ message: 'panne simulee' }, 500) : json(mine)));
          await loginForTest(page);
          await page.evaluate(() => window.switchView('account'));
          await expect(page.locator('#account-additions-row')).toBeVisible();
          await page.click('#account-additions-row');
          await expect(page.locator('#my-additions-content')).toContainText('Impossible de charger tes ajouts pour l’instant.');
          await expect(page.locator('#my-additions-content')).not.toContainText('pas encore ajouté');
          down = false;
          await page.click('#my-additions-content [data-additions-retry]');
          await expect(page.locator('#my-additions-content .addition-card')).toHaveCount(1);
      });
  ```
- **Doit échouer avant la correction** parce que `#account-additions-row` reste masquée
  (l'erreur renvoyée n'est pas lue, `mine` est vide).

## Vérification (dans l'ordre)
```bash
npx playwright test --project=functional -g "BUG-12"                       # 3 passed
npx playwright test --project=functional -g "38. Mon activité|37. Validation"   # tous passent
npm test                                                                   # tout vert, dont « cache-busting »
npm run test:functional                                                    # en arrière-plan (~10 min) : tout vert, instables notés dans la PR
```

## Hors périmètre
- **Onglet Avis** de la fiche (`js/reviews.js`, échec de `fetchPage` sans message) : story séparée.
- Un état « Chargement… » pendant la requête (aujourd'hui « Rien pour l’instant » peut apparaître
  une fraction de seconde avant les lignes) : story séparée.
- Les échecs **après** un premier chargement réussi : on garde l'affichage, sans toast ni bandeau.
- `#subscriptions-empty` et `#notifications-empty` : ne pas les passer à `hidden`.
- L'échange de « Mes ajouts » (fil qui se replie, verrou, fiches publiées / refusées) : c'est **BUG-11**.

## Pièges connus
- Étape 8 : supprimer `mine = []; messages = [];` du **début** de la fonction (sinon un échec
  efface ce qui était affiché) mais les **garder** dans la branche « pas connecté ».
- Supabase ne lève pas ses erreurs HTTP : sans `if (d.error) throw d.error;` le `catch` ne
  voit jamais une réponse 500.
- La règle CSS `.empty-state[hidden]` doit venir **après** `.empty-state` (même fichier) ; sa
  spécificité suffit, pas de `!important`.
- Toucher les deux `?v=` : import map (JS) **et** `css/panels.css`. Oublier le CSS = la règle
  n'arrive pas chez les utilisateurs qui ont l'ancien fichier en cache.
- Fichiers en CRLF : si Edit refuse un bloc, petit script Node dans le scratchpad (voir README).
  Contrôler `git diff --stat` : seuls `js/my-activity.js`, `js/additions.js`, `css/panels.css`,
  `index.html` et les deux fichiers de test bougent.

## Terminé quand
- [ ] Contrôles passés, tests écrits (échouent avant, passent après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : non (aucun écran « Mon activité » / « Mes ajouts » dans le script de capture)
- [ ] Story cochée dans BACKLOG.md si elle y figure (sinon le noter dans la PR), PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `fix(activite): etat vide masque quand il y a des lignes, erreur de chargement avec Reessayer`

**Corps** : constats corrigés (liste ci-dessus), causes (`display: flex` de `.empty-state` plus
fort que `hidden` ; erreurs Supabase renvoyées et jamais lues), correction (règle
`.empty-state[hidden]`, drapeau `loadError`, message « Impossible de charger … pour l’instant » +
« Réessayer » dans « Mon activité » et « Mes ajouts »), tests ajoutés, sorties des commandes,
éléments non faits (onglet Avis, état « Chargement… »).
