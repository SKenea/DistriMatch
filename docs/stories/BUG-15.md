# BUG-15 — « Ma demande » efface la saisie toutes les 30 s, et double envoi du code / SIRET

> **Ordre du lot 3 (EPIC-R3)** : BUG-07 → BUG-02 → BUG-13 → BUG-05 → BUG-04 → BUG-14 → BUG-03 → BUG-06 → BUG-11 → BUG-12 → BUG-15 → BUG-08 → BUG-09 → BUG-10. **Prérequis** : BUG-12 fusionnée dans master (sinon s'arrêter).

- **Lot** : 3. Bugs visibles · **Gravité** : moyen · **Niveau conseillé** : medium
- **Branche** : `fix/ma-demande-saisie` · **Taille** : 1 fichier JS (+ `index.html` pour les `?v=`) + 3 tests
- **Constats couverts** (rapport du 2026-10-21) :
  - « Ma demande » se reconstruit toutes les 30 s et efface le SIRET ou le code en cours de saisie — `js/operators.js:399` (et son doublon « le SIRET ou le code en cours de saisie est effacé toutes les 30 s »)
  - Code d'exploitant ou SIRET envoyé deux fois sur double toucher : essais consommés — `js/operators.js:339`

## But
Sur la page « Ma demande », le SIRET ou le code à 5 chiffres en cours de saisie reste en place
(avec le focus et le clavier) quand la page se relit toute seule ; un double toucher sur
« Valider le code » ou « Envoyer le SIRET » n'envoie qu'une seule fois et ne coûte qu'un essai.

## User story
En tant que membre qui fait vérifier son statut d'exploitant, je veux taper mon SIRET ou mon
code tranquillement et le valider une seule fois, afin de ne pas retaper ma saisie ni perdre
des essais.

**Critères d'acceptation**
- [ ] Saisie partielle du SIRET + relecture automatique : la valeur et le focus restent, un nouveau message de l'équipe apparaît dans le fil.
- [ ] Double toucher sur « Valider le code » : un seul appel `verify_operator_code`, puis « Code incorrect : 4 essais restants. » et le bouton redevient utilisable.
- [ ] Double toucher sur « Envoyer le SIRET » : un seul appel `submit_operator_siret`.
- [ ] Si l'état de la demande change (ex. l'équipe passe au courrier), la page se redessine en entier comme avant.

## Pourquoi ça arrive (déjà analysé, ne pas refaire)
1. **Relecture** : tant que la page est ouverte, `setInterval` (`js/operators.js` vers la ligne
   394) appelle toutes les 30 s `refreshOperatorState().then(renderOperatorRequestView)`.
   `renderOperatorRequestView` remplace **tout** `#operator-request-content` par `innerHTML`,
   y compris les formulaires `#op-siret-form` / `#op-code-form` produits par `renderTodo` : la
   saisie et le focus sont perdus. Correction : retenir l'état affiché (`renderedTodoKey` =
   demande + statut + date d'envoi du code). En relecture (`keepTodo`), si cet état n'a pas
   changé, ne redessiner **que le fil** `#op-thread`. Sinon, rendu complet comme aujourd'hui.
   `code_sent_at` est dans la clé : un nouveau code envoyé par l'équipe redessine la carte.
   `code_attempts` n'y est pas : un mauvais code ne doit pas effacer le message
   « Code incorrect : N essais restants » au passage suivant.
2. **Double envoi** : `submitSiret` et `submitCode` n'ont ni verrou ni bouton désactivé
   pendant l'appel ; chaque toucher (ou Entrée + toucher) envoie un appel, et
   `verify_operator_code` compte un essai par appel. Correction : le motif déjà utilisé par
   `submitClaim` et `sendMemberMessage` du même fichier (bouton `disabled` pendant l'appel,
   réactivé en cas d'échec). Un bouton submit désactivé bloque aussi la validation par Entrée.

La relecture est sortie dans une fonction exportée `pollOperatorRequest()` : le minuteur
l'appelle, et le test aussi (pas besoin d'attendre 30 s ni de simuler l'horloge).

## Avant de coder
**Lire en entier** : `js/operators.js` lignes 16-30, 225-460 ; `tests/functional/exploitants.spec.js`
lignes 1-155 (`routeOperatorApi`, `request`, tests du bloc 33).

**Réutiliser** : `refreshOperatorState`, `renderOperatorThread`, `loadOperatorMessages`
(même fichier) ; dans les tests, `routeOperatorApi`, `request`, `firstSignalableId`, `json`
(déjà définis en haut de `exploitants.spec.js`).

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
grep -n '^async function renderOperatorRequestView() {' js/operators.js            # attendu : ligne 285
grep -n '            refreshOperatorState().then(renderOperatorRequestView);' js/operators.js   # attendu : ligne 399
grep -n "const { error } = await supabaseClient.rpc('submit_operator_siret'" js/operators.js     # attendu : ligne 320
grep -n "const { data, error } = await supabaseClient.rpc('verify_operator_code'" js/operators.js   # attendu : ligne 339
grep -n '^    renderOperatorRequestView();' js/operators.js                      # attendu : 3 lignes (328, 359, 374)
grep -n '^export function initOperators() {' js/operators.js                    # attendu : 1 ligne, vers 389
grep -n 'pollOperatorRequest\|renderedTodoKey' js/operators.js                  # attendu : rien
grep -n "test('visiteur : le lien ouvre la connexion, rien n’est envoye'" tests/functional/exploitants.spec.js   # ligne 156
grep -n '"./js/app.js": "./js/app.js?v=' index.html                             # attendu : ?v=95 (ou plus)
```

## Étapes

1. **js/operators.js** — clé de l'état affiché + option `keepTodo`.
   Avant :
   ```js
   async function renderOperatorRequestView() {
   ```
   Après :
   ```js
   // Demande + etat affiches dans « Ma demande » : une relecture ne reconstruit la carte
   // « Ce qu'il te reste à faire » (et ses champs SIRET / code) que s'ils changent (BUG-15).
   // code_attempts n'y est pas : le message « Code incorrect » reste affiche.
   let renderedTodoKey = null;

   function todoKey(req) {
       return `${req.id}|${req.status}|${req.code_sent_at || ''}`;
   }

   // options.keepTodo : relecture (minuteur, message envoye) qui garde la saisie si l'etat
   // n'a pas change
   async function renderOperatorRequestView(options = {}) {
   ```

2. **js/operators.js** — dans `renderOperatorRequestView`, ne redessiner que le fil si l'état
   est le même.
   Avant :
   ```js
       if (openRequestId !== req.id) return;
       view.innerHTML = `
   ```
   Après :
   ```js
       if (openRequestId !== req.id) return;
       // Meme etat qu'a l'ecran : seul le fil change, la saisie et le focus restent (BUG-15)
       const thread = document.getElementById('op-thread');
       if (options.keepTodo && thread && renderedTodoKey === todoKey(req)) thread.innerHTML = renderOperatorThread(req, messages, 'member');
       else view.innerHTML = `
   ```
   Ne **pas** toucher aux lignes du gabarit qui suivent (de `<div class="op-head">` à la ligne
   `<div class="op-thread" ...`).

3. **js/operators.js** — retenir l'état affiché, juste après le gabarit.
   Avant :
   ```js
           <div class="op-thread" id="op-thread" aria-live="polite">${renderOperatorThread(req, messages, 'member')}</div>`;
       document.getElementById('op-composer')?.removeAttribute('hidden');
   ```
   Après :
   ```js
           <div class="op-thread" id="op-thread" aria-live="polite">${renderOperatorThread(req, messages, 'member')}</div>`;
       renderedTodoKey = todoKey(req);
       document.getElementById('op-composer')?.removeAttribute('hidden');
   ```

4. **js/operators.js** — `submitSiret` : verrou + bouton désactivé. Remplacer toute la fonction.
   Avant :
   ```js
   async function submitSiret(form) {
       const errorEl = document.getElementById('op-siret-error');
       const value = form.siret.value;
       if (!isValidSiret(value)) {
           errorEl.textContent = 'SIRET invalide : vérifie les 14 chiffres.';
           errorEl.hidden = false;
           return;
       }
       const { error } = await supabaseClient.rpc('submit_operator_siret', { p_request_id: openRequestId, p_siret: value });
       if (error) {
           errorEl.textContent = describeOperatorRequestError(error);
           errorEl.hidden = false;
           return;
       }
   ```
   Après :
   ```js
   async function submitSiret(form) {
       const errorEl = document.getElementById('op-siret-error');
       const btn = form.querySelector('button[type="submit"]');
       if (btn.disabled) return;   // envoi deja en cours (double toucher, Entree + bouton) : BUG-15
       const value = form.siret.value;
       if (!isValidSiret(value)) {
           errorEl.textContent = 'SIRET invalide : vérifie les 14 chiffres.';
           errorEl.hidden = false;
           return;
       }
       btn.disabled = true;
       let error = null;
       try {
           ({ error } = await supabaseClient.rpc('submit_operator_siret', { p_request_id: openRequestId, p_siret: value }));
       } catch (e) {
           error = e;
       }
       if (error) {
           btn.disabled = false;
           errorEl.textContent = describeOperatorRequestError(error);
           errorEl.hidden = false;
           return;
       }
   ```
   La suite de la fonction (`showToast('SIRET envoyé'...` jusqu'à `}`) ne change pas : en cas
   de succès, la page est redessinée avec un bouton neuf.

5. **js/operators.js** — `submitCode` : même verrou (un double toucher ne coûte plus deux essais).
   Avant :
   ```js
   async function submitCode(form) {
       const errorEl = document.getElementById('op-code-error');
       const code = form.code.value.replace(/\D/g, '');
       if (code.length !== 5) {
           errorEl.textContent = 'Le code a 5 chiffres.';
           errorEl.hidden = false;
           return;
       }
       const { data, error } = await supabaseClient.rpc('verify_operator_code', { p_request_id: openRequestId, p_code: code });
       if (error) {
           errorEl.textContent = describeOperatorRequestError(error);
           errorEl.hidden = false;
           return;
       }
       if (!data?.ok) {
           errorEl.textContent = describeCodeResult(data);
   ```
   Après :
   ```js
   async function submitCode(form) {
       const errorEl = document.getElementById('op-code-error');
       const btn = form.querySelector('button[type="submit"]');
       if (btn.disabled) return;   // essai deja en cours : un double toucher ne coute pas deux essais (BUG-15)
       const code = form.code.value.replace(/\D/g, '');
       if (code.length !== 5) {
           errorEl.textContent = 'Le code a 5 chiffres.';
           errorEl.hidden = false;
           return;
       }
       btn.disabled = true;
       let data = null;
       let error = null;
       try {
           ({ data, error } = await supabaseClient.rpc('verify_operator_code', { p_request_id: openRequestId, p_code: code }));
       } catch (e) {
           error = e;
       }
       if (error) {
           btn.disabled = false;
           errorEl.textContent = describeOperatorRequestError(error);
           errorEl.hidden = false;
           return;
       }
       if (!data?.ok) {
           btn.disabled = false;
           errorEl.textContent = describeCodeResult(data);
   ```
   La suite (`errorEl.hidden = false; form.code.value = ''; ...`) ne change pas.

6. **js/operators.js** — `sendMemberMessage` : après un message envoyé, le fil seul.
   Avant :
   ```js
       form.body.value = '';
       renderOperatorRequestView();
   ```
   Après :
   ```js
       form.body.value = '';
       renderOperatorRequestView({ keepTodo: true });
   ```

7. **js/operators.js** — la relecture devient une fonction exportée.
   a) Juste avant `export function initOperators() {`, ajouter :
   ```js
   // Relecture de « Ma demande » (minuteur des 30 s ; exportee pour les tests) : l'etat du
   // compte, puis le fil seul si l'etat de la demande n'a pas change (BUG-15)
   export function pollOperatorRequest() {
       return refreshOperatorState().then(() => renderOperatorRequestView({ keepTodo: true }));
   }

   ```
   b) Dans le minuteur, avant / après :
   ```js
               refreshOperatorState().then(renderOperatorRequestView);
   ```
   ```js
               pollOperatorRequest();
   ```

8. **index.html** — un module JS change : monter le `?v=` de **toutes** les entrées de
   l'import map à la même valeur, valeur actuelle + 1 (sur `master` au 2026-10-25 : `?v=95` →
   `?v=96`, 29 entrées) :
   ```bash
   grep -c 'js?v=95"' index.html                     # attendu : 29
   sed -i 's/\.js?v=95"/.js?v=96"/g' index.html
   grep -c 'js?v=96"' index.html                     # attendu : 29
   ```
   Si la valeur actuelle n'est plus 95 (une autre story fusionnée avant), remplacer 95 et 96
   par la valeur actuelle et la suivante. Aucun CSS ne change.

## Tests
- **Fichier** : `tests/functional/exploitants.spec.js`, bloc `33. Demande d’exploitant, cote membre`,
  juste **avant** le test `visiteur : le lien ouvre la connexion, rien n’est envoye`.
- **Code à ajouter** :
  ```js
      test('relecture de « Ma demande » : la saisie du SIRET et le focus restent, le fil se met a jour (BUG-15)', async ({ page }) => {
          const id = await firstSignalableId(page);
          await routeOperatorApi(page, { requests: [request(id, { status: 'siret_requested' })] });
          await loginForTest(page);
          await page.evaluate(async () => { const m = await import('./js/operators.js'); await m.refreshOperatorState(); m.openOperatorRequest(7); });
          const input = page.locator('#op-siret-form input[name="siret"]');
          await input.fill('418166');
          await expect(input).toHaveValue('418 166');
          // Un message de l'equipe arrive entre-temps (le dernier route enregistre gagne)
          await page.route(u => u.pathname.endsWith('/rest/v1/operator_request_messages'), r => r.fulfill(json([
              { id: 3, request_id: 7, author: 'admin', body: 'Merci, on attend ton SIRET.', created_at: minutesAgoIso(1) }
          ])));
          await page.evaluate(async () => { const m = await import('./js/operators.js'); await m.pollOperatorRequest(); });
          await expect(page.locator('#op-thread')).toContainText('Merci, on attend ton SIRET.');
          await expect(input).toHaveValue('418 166');
          expect(await page.evaluate(() => document.activeElement?.name)).toBe('siret');
      });

      test('double toucher sur « Valider le code » : un seul essai part, le bouton revient (BUG-15)', async ({ page }) => {
          const id = await firstSignalableId(page);
          await routeOperatorApi(page, { requests: [request(id, { status: 'code_sent', siret: '41816609600069', code_sent_at: minutesAgoIso(2000), code_expires_at: new Date(Date.now() + 20 * 86400000).toISOString() })] });
          // Reponse lente : le second toucher arrive pendant l'appel (le dernier route enregistre gagne)
          const calls = [];
          await page.route('**/rest/v1/rpc/verify_operator_code', async r => {
              calls.push(r.request().postDataJSON());
              await new Promise(res => setTimeout(res, 500));
              await r.fulfill(json({ ok: false, reason: 'wrong', left: 4 }));
          });
          await loginForTest(page);
          await page.evaluate(async () => { const m = await import('./js/operators.js'); await m.refreshOperatorState(); m.openOperatorRequest(7); });
          await page.locator('#op-code-input').fill('00000');
          await page.locator('#op-code-form button[type="submit"]').dblclick();
          await expect(page.locator('#op-code-error')).toHaveText('Code incorrect : 4 essais restants.');
          await expect(page.locator('#op-code-form button[type="submit"]')).toBeEnabled();
          await page.waitForTimeout(700);
          expect(calls).toHaveLength(1);
      });

      test('double toucher sur « Envoyer le SIRET » : un seul envoi (BUG-15)', async ({ page }) => {
          const id = await firstSignalableId(page);
          await routeOperatorApi(page, { requests: [request(id, { status: 'siret_requested' })] });
          const calls = [];
          await page.route('**/rest/v1/rpc/submit_operator_siret', async r => {
              calls.push(r.request().postDataJSON());
              await new Promise(res => setTimeout(res, 500));
              await r.fulfill(json(null));
          });
          await loginForTest(page);
          await page.evaluate(async () => { const m = await import('./js/operators.js'); await m.refreshOperatorState(); m.openOperatorRequest(7); });
          await page.locator('#op-siret-form input[name="siret"]').fill('41816609600069');
          await page.locator('#op-siret-form button[type="submit"]').dblclick();
          await expect(page.locator('#toast-container .toast.success')).toContainText('SIRET envoyé');
          await page.waitForTimeout(700);
          expect(calls).toHaveLength(1);
      });
  ```
  `json`, `request`, `firstSignalableId`, `routeOperatorApi` sont définis en haut du fichier ;
  `minutesAgoIso` et `loginForTest` sont déjà importés de `./helpers.js`. Aucun import à ajouter.
- **Noms** : les trois titres ci-dessus (tous contiennent `BUG-15`).
- **Doivent échouer avant la correction** :
  - test 1 : `m.pollOperatorRequest is not a function` (la relecture n'est pas encore une
    fonction à part ; c'est l'échec attendu) ;
  - test 2 : `calls` a 2 éléments au lieu de 1 ;
  - test 3 : `calls` a 2 éléments au lieu de 1.

## Vérification (dans l'ordre)
```bash
grep -n 'pollOperatorRequest' js/operators.js                                  # 2 lignes : la fonction et le minuteur
npm test                                                                       # tout vert, dont « cache-busting »
npx playwright test --project=functional -g "BUG-15"                           # 3 passed
npx playwright test --project=functional -g "33\. Demande|34\. Console"        # tout vert (tests exploitants existants)
npm run test:functional                                                        # en arrière-plan (~10 min) : tout vert, instables notés
```

## Hors périmètre
- Le texte « code reçu par courrier » quand l'équipe a dicté le code par téléphone : autre constat.
- Vider la page « Ma demande » à la déconnexion : autre constat (NAV / vie privée).
- `code_attempts` dans la clé, ou mettre à jour la ligne « N essais restants » après un mauvais
  code : non (le message d'erreur donne déjà le bon nombre).
- La console admin (`js/admin.js`) et la demande depuis « À propos » (`submitClaim`, déjà verrouillée).
- Une indication « Vérification… » sur le bouton : non, le bouton désactivé suffit.

## Pièges connus
- Désactiver le bouton **après** la validation locale (SIRET invalide, code trop court) : sinon
  le bouton resterait bloqué sur une erreur de saisie.
- Réactiver le bouton dans **chaque** branche d'échec (`error` et `!data?.ok`) ; en cas de succès
  la page est redessinée, le bouton est neuf.
- `({ error } = await ...)` : les parenthèses autour de l'affectation par décomposition sont
  obligatoires (sinon erreur de syntaxe), comme dans `submitClaim`.
- Garder le `if (openRequestId !== req.id) return;` **avant** la nouvelle condition.
- `renderedTodoKey = todoKey(req);` après le `view.innerHTML` : dans la branche « fil seul » la
  clé ne change pas, la réécrire est sans effet ; ne pas la mettre dans une autre fonction.
- Les deux appels `renderOperatorRequestView()` restants (après succès de `submitSiret` et de
  `submitCode`) et celui d'`openOperatorRequest` restent **sans** option : ce sont des rendus complets.
- Dans le test 1, `fill('418166')` est reformaté en `418 166` par l'écouteur `input` existant :
  c'est la valeur attendue.

## Terminé quand
- [ ] Contrôles passés, tests écrits (échouent avant, passent après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : non
- [ ] BUG-15 ne figure pas encore dans `BACKLOG.md` : ne pas l'ajouter, le noter dans la PR ; PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `fix(exploitant): « Ma demande » garde la saisie, un seul envoi du code ou du SIRET`

**Corps** : constats corrigés (liste ci-dessus), causes (relecture de 30 s qui remplace toute la
page ; aucun verrou pendant l'appel), corrections (clé de l'état affiché, fil seul si l'état ne
change pas, `pollOperatorRequest` exportée ; bouton désactivé pendant `submitSiret` /
`submitCode`), tests ajoutés, sorties des commandes, mention « BUG-15 absent du BACKLOG ».
