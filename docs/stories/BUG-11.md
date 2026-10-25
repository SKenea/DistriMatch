# BUG-11 — « Mes ajouts » : messages perdus et fil qui se replie

- **Lot** : 3. Bugs visibles · **Gravité** : moyen · **Niveau conseillé** : medium
- **Prérequis** : **BUG-06 fusionnée** dans `master` ; partir de `master` **à jour**. Sinon : s'arrêter.
- **Ordre** : après BUG-06, **avant BUG-12** (BUG-12 modifie aussi `js/additions.js`, sur d'autres lignes,
  et insère son test juste sous ceux de cette fiche). BUG-03 et BUG-06 insèrent aussi des tests dans
  `validation.spec.js`, à d'autres repères (autour de `console : refuser sans motif`, et une aide
  après `routeReviewApi`) : le repère de cette fiche (`console : « Nouveaux distributeurs »…`) reste unique.
- **Branche** : `fix/mes-ajouts-echange` · **Taille** : 1 fichier JS (+ `index.html`) + 2 tests
- **Constats couverts** (rapport du 2026-10-21) :
  - « Mes ajouts » : les messages écrits sur une fiche publiée ou refusée n'arrivent jamais à l'équipe, et le fil se replie sans confirmation — `js/additions.js:93`
  - « Mes ajouts » : après l'envoi d'un message, l'échange se replie et cache le message — `js/additions.js:137`
  - Envois sans verrou dans « Mes ajouts » et la console : double toucher = message en double — `js/additions.js:124` (volet « Mes ajouts » seulement, la console est hors périmètre)

## But
Dans Compte → « Mes ajouts », un membre ne peut écrire à l'équipe que tant que sa fiche est en
attente (là où l'équipe lit les messages) ; après l'envoi, l'échange reste ouvert, montre son
message et confirme « Message envoyé à l’équipe » ; un double toucher n'envoie qu'un message.

## User story
En tant que membre qui a ajouté un distributeur, je veux voir que mon message est bien parti et
ne pouvoir écrire que là où l'équipe me lit, afin de ne pas attendre une réponse qui ne viendra pas.

**Critères d'acceptation**
- [ ] Fiche « En attente » : le champ « Écrire à l’équipe… » est là, comme avant.
- [ ] Fiche « Publiée » : pas de champ ; à la place « Ta fiche est publiée : cet échange est terminé. Tu peux la compléter directement depuis la fiche. »
- [ ] Fiche « Refusée » : pas de champ ; à la place « Cet échange est terminé. » (le motif reste affiché).
- [ ] Après un envoi réussi : toast « Message envoyé à l’équipe », l'échange reste ouvert et le message envoyé y est visible.
- [ ] Deux envois coup sur coup (double toucher) = **un seul** appel `post_review_message`.

## Pourquoi ça arrive (déjà analysé, ne pas refaire)
1. **Messages perdus.** `post_review_message` (`supabase/022_distributor_review.sql`, l. 119-143)
   accepte le message de l'auteur quel que soit le statut de la fiche. Mais la console ne lit que
   `admin_pending_distributors()`, qui filtre `where d.review_status = 'pending'` (022 l. 169,
   redéfinie à l'identique sur ce point dans 025). Une fiche publiée ou refusée n'apparaît donc
   nulle part côté admin : son fil n'est jamais lu. Aucune migration postérieure ne redéfinit
   `post_review_message` (vérifié).
   **Décision (sans migration)** : ne proposer le champ que sur une fiche `pending`, et dire
   clairement que l'échange est terminé sur les autres. Le refus côté base (lever une erreur dans
   `post_review_message` si la fiche n'est plus en attente) est **hors périmètre** (voir plus bas).
2. **Fil qui se replie.** Après l'envoi, `renderAdditionsView()` reconstruit tout le HTML ; le
   `<details>` n'a `open` que s'il reste des non-lus. Le message du membre ne compte pas comme non
   lu (`countUnreadMessages` exclut l'auteur) et la base remet `author_read_at` à maintenant :
   l'échange se referme, le message est caché, aucun toast.
   **Correction** : relever les échanges ouverts avant le rendu et les rouvrir ; toast de succès.
3. **Double envoi.** Le bouton reste actif pendant l'appel ; un second toucher relit le même texte.
   **Correction** : modèle d'`operators.js` (`sendMemberMessage`, vers la ligne 365) : bouton
   désactivé pendant l'appel, et sortie immédiate si le bouton est déjà désactivé.

## Avant de coder
**Lire en entier** : `js/additions.js` (139 lignes) ; `tests/functional/validation.spec.js`
lignes 1-86 (`routeReviewApi` et le test « Mes ajouts » existant).

**Réutiliser** : `showToast(message, 'success')` et `describeOperatorRequestError` (déjà importées
dans `js/additions.js`), `routeReviewApi`, `loginForTest`, `minutesAgoIso` (déjà dans le test).

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
grep -nF 'box.innerHTML = mine.map(d => {' js/additions.js                # attendu : 1 ligne, vers 78
grep -nF '<details class="addition-thread"${unread' js/additions.js        # attendu : 1 ligne, vers 90
grep -nF '<form class="op-composer addition-composer"' js/additions.js     # attendu : 1 ligne, vers 93
grep -nF "form.body.value = '';" js/additions.js                           # attendu : 1 ligne, vers 135
grep -n "post_review_message" supabase/*.sql | grep "function"             # attendu : seulement 022 (create or replace, revoke, grant)
grep -n "where d.review_status = 'pending'" supabase/*.sql                 # attendu : 022 et 025
grep -c '\.js?v=' index.html                                               # attendu : 29 (entrées de l'import map)
grep -n '"./js/app.js": "./js/app.js?v=' index.html                        # noter la valeur N de master à jour (95 à l'écriture de la fiche ; plus haute après BUG-06)
```

## Étapes

1. **js/additions.js**, `renderAdditionsView` — relever les échanges ouverts avant de redessiner.
   Avant :
   ```js
       box.innerHTML = mine.map(d => {
   ```
   Après :
   ```js
       // Echanges ouverts a la main : ils restent ouverts apres un nouveau rendu (BUG-11)
       const openIds = new Set([...box.querySelectorAll('details.addition-thread[open]')]
           .map(el => el.closest('.addition-card')?.dataset.distributorId));
       box.innerHTML = mine.map(d => {
   ```

2. **js/additions.js**, même fonction — rouvrir ces échanges.
   Avant :
   ```js
               <details class="addition-thread"${unread ? ' open' : ''}>
   ```
   Après :
   ```js
               <details class="addition-thread"${unread || openIds.has(d.id) ? ' open' : ''}>
   ```

3. **js/additions.js**, même fonction — le champ seulement sur une fiche en attente.
   Avant :
   ```js
                   <form class="op-composer addition-composer" data-distributor-id="${escapeHTML(d.id)}">
                       <label class="sr-only" for="addition-input-${escapeHTML(d.id)}">Écrire à l’équipe</label>
                       <textarea id="addition-input-${escapeHTML(d.id)}" name="body" rows="1" maxlength="1000" placeholder="Écrire à l’équipe…"></textarea>
                       <button type="submit" class="op-send" aria-label="Envoyer">→</button>
                   </form>
   ```
   Après :
   ```js
                   ${d.review_status === 'pending' ? `<form class="op-composer addition-composer" data-distributor-id="${escapeHTML(d.id)}">
                       <label class="sr-only" for="addition-input-${escapeHTML(d.id)}">Écrire à l’équipe</label>
                       <textarea id="addition-input-${escapeHTML(d.id)}" name="body" rows="1" maxlength="1000" placeholder="Écrire à l’équipe…"></textarea>
                       <button type="submit" class="op-send" aria-label="Envoyer">→</button>
                   </form>` : `<p class="admin-request-meta addition-thread-closed">${d.review_status === 'published'
                       ? 'Ta fiche est publiée : cet échange est terminé. Tu peux la compléter directement depuis la fiche.'
                       : 'Cet échange est terminé.'}</p>`}
   ```
   (L'équipe ne lit les messages que des fiches en attente : BUG-11. `admin-request-meta` existe
   déjà, aucun CSS à ajouter.)

4. **js/additions.js**, `initAdditions` — verrou + toast. Remplacer tout le gestionnaire `submit`.
   Avant :
   ```js
       view?.addEventListener('submit', async (e) => {
           e.preventDefault();
           const form = e.target.closest('.addition-composer');
           if (!form) return;
           const body = form.body.value.trim();
           if (!body) return;
           const { error } = await supabaseClient.rpc('post_review_message', { p_distributor_id: form.dataset.distributorId, p_body: body });
           if (error) {
               showToast(describeOperatorRequestError(error), 'error');
               return;
           }
           form.body.value = '';
           await refreshMyAdditions();
           renderAdditionsView();
       });
   ```
   Après :
   ```js
       view?.addEventListener('submit', async (e) => {
           e.preventDefault();
           const form = e.target.closest('.addition-composer');
           if (!form) return;
           const btn = form.querySelector('button[type="submit"]');
           // Verrou : un double toucher n'envoie qu'un message (BUG-11, modele d'operators.js)
           if (btn.disabled) return;
           const body = form.body.value.trim();
           if (!body) return;
           btn.disabled = true;
           try {
               const { error } = await supabaseClient.rpc('post_review_message', { p_distributor_id: form.dataset.distributorId, p_body: body });
               if (error) {
                   showToast(describeOperatorRequestError(error), 'error');
                   return;
               }
               form.body.value = '';
               showToast('Message envoyé à l’équipe', 'success');
               await refreshMyAdditions();
               renderAdditionsView();
           } finally {
               btn.disabled = false;
           }
       });
   ```

5. **index.html** — `js/additions.js` change : monter le `?v=` de **toutes** les entrées de
   l'import map à la même valeur, N+1 (N relevé dans les contrôles ; ex. `?v=95` → `?v=96` partout,
   29 entrées). Aucun CSS ne change.

## Tests
- **Fichier** : `tests/functional/validation.spec.js`, dans `test.describe('37. Validation des nouvelles fiches'`,
  juste **avant** le test `console : « Nouveaux distributeurs », doublon signale, publier avec un nom corrige`.
- **Code à ajouter** (deux tests) :
  ```js
      test('« Mes ajouts » : apres l’envoi, l’echange reste ouvert, montre le message, un seul envoi (BUG-11)', async ({ page }) => {
          const messages = [{ id: 1, distributor_id: 'user-a', author: 'admin', body: 'Merci, on regarde.', created_at: minutesAgoIso(30) }];
          await routeReviewApi(page, {
              mine: [{ id: 'user-a', name: 'Pizza de la gare', type: 'pizza', emoji: '🍕', city: 'Bayonne', review_status: 'pending', review_reason: null, author_read_at: minutesAgoIso(10), created_at: minutesAgoIso(200) }],
              messages
          });
          // Pose apres routeReviewApi : cette route passe en premier. Reponse lente (laisse le temps
          // d'un second envoi) ; le message est ajoute au fil que le faux serveur renvoie ensuite.
          const posts = [];
          await page.route('**/rest/v1/rpc/post_review_message', async r => {
              const body = r.request().postDataJSON();
              posts.push(body);
              await new Promise(res => setTimeout(res, 300));
              messages.push({ id: messages.length + 1, distributor_id: body.p_distributor_id, author: 'member', body: body.p_body, created_at: new Date().toISOString() });
              await r.fulfill(json(null));
          });
          await loginForTest(page);
          await page.evaluate(() => window.switchView('account'));
          // Ligne visible = relecture de la connexion terminee : la reponse attendue ci-dessous est
          // bien celle de l'ouverture de la page
          await expect(page.locator('#account-additions-row')).toBeVisible();
          // Attendre la relecture de « Mes ajouts » lancee a l'ouverture de la page : sinon le champ
          // peut etre rempli puis remplace par ce nouveau rendu (test instable)
          const reloaded = page.waitForResponse(r => r.url().includes('/rest/v1/distributors') && r.url().includes('added_by'));
          await page.click('#account-additions-row');
          await reloaded;
          const card = page.locator('#my-additions-content .addition-card').first();
          const thread = card.locator('details.addition-thread');
          expect(await thread.getAttribute('open')).toBeNull();   // rien de non lu : replie
          await thread.locator('summary').click();
          await card.locator('textarea').fill('12 rue de la gare.');
          // Double toucher : deux envois coup sur coup
          await card.locator('form.addition-composer').evaluate(f => { f.requestSubmit(); f.requestSubmit(); });
          await expect(page.locator('#toast-container .toast.success')).toContainText('Message envoyé à l’équipe');
          const after = page.locator('#my-additions-content .addition-card').first();
          await expect(after.locator('details.addition-thread')).toHaveAttribute('open', '');
          await expect(after.locator('.op-msg.is-mine')).toBeVisible();
          await expect(after.locator('.op-msg.is-mine')).toContainText('12 rue de la gare.');
          expect(posts).toHaveLength(1);
      });

      test('« Mes ajouts » : fiche publiee ou refusee, echange termine, pas de champ (BUG-11)', async ({ page }) => {
          await routeReviewApi(page, {
              mine: [
                  { id: 'user-b', name: 'Boulangerie test', type: 'bakery', emoji: '🥖', city: 'Anglet', review_status: 'rejected', review_reason: 'Doublon', author_read_at: minutesAgoIso(10), created_at: minutesAgoIso(3000) },
                  { id: 'user-c', name: 'Frites test', type: 'fries', emoji: '🍟', city: 'Biarritz', review_status: 'published', review_reason: null, author_read_at: minutesAgoIso(10), created_at: minutesAgoIso(4000) }
              ]
          });
          await loginForTest(page);
          await page.evaluate(() => window.switchView('account'));
          await page.click('#account-additions-row');
          const cards = page.locator('#my-additions-content .addition-card');
          await expect(cards).toHaveCount(2);
          await expect(page.locator('#my-additions-content form.addition-composer')).toHaveCount(0);
          await expect(cards.nth(0)).toContainText('Motif : Doublon');
          await expect(cards.nth(0).locator('.addition-thread-closed')).toHaveText('Cet échange est terminé.');
          await expect(cards.nth(1).locator('.addition-thread-closed')).toHaveText('Ta fiche est publiée : cet échange est terminé. Tu peux la compléter directement depuis la fiche.');
      });
  ```
- **Doivent échouer avant la correction** : le 1er parce que l'attente du toast
  « Message envoyé à l’équipe » expire (aucun toast de succès aujourd'hui) ; le 2e parce que
  `form.addition-composer` est compté 2 fois au lieu de 0.
- Le test existant `« Mes ajouts » : statuts, motif d’un refus, message a l’equipe` doit rester
  vert sans modification (il écrit sur la fiche **en attente** `user-a`).

## Vérification (dans l'ordre)
```bash
npx playwright test --project=functional -g "BUG-11"          # 2 passed
npx playwright test --project=functional -g "37. Validation"   # tous passent
npm test                                                      # tout vert, dont « cache-busting »
npm run test:functional                                       # en arrière-plan (~10 min) : tout vert, instables notés dans la PR
```

## Hors périmètre
- **Base** : faire refuser par `post_review_message` le message d'un membre sur une fiche qui
  n'est plus en attente (nouvelle migration). Aujourd'hui l'interface ne le propose plus ; le
  noter dans la PR comme suite possible. Aucun SQL dans cette story.
- **Console admin** (`js/admin.js`) : verrous de « Écrire au membre », du formulaire « Publier »
  (double clic = toast d'erreur après une publication réussie) et du refus. Story séparée.
- Demandes d'exploitant closes depuis plus de 30 jours (`admin_operator_requests`, 021) : story séparée.
- Style visuel du bouton désactivé (`.op-send:disabled`) : pas de CSS dans cette story.
- Les erreurs de chargement de « Mes ajouts » (liste vide affichée à tort) : c'est **BUG-12**.

## Pièges connus
- Relever `openIds` **avant** `box.innerHTML = ...` : après, les anciens `<details>` n'existent plus.
- Étape 3 : le gabarit imbrique des accolades et des accents graves ; recopier l'extrait « Après »
  tel quel, puis vérifier avec `node --check js/additions.js` (aucune sortie = syntaxe correcte).
- Ne pas mettre `btn.disabled = true` avant le test `if (!body) return;` : un envoi vide
  laisserait le bouton bloqué.
- `requestSubmit()` sans argument déclenche `submit` même si le bouton est désactivé : c'est
  exprès, le test vérifie que le verrou du gestionnaire tient.
- Fichier en CRLF : si Edit refuse le bloc de l'étape 4, passer par un petit script Node dans le
  scratchpad (voir README). Contrôler `git diff --stat` : seul `js/additions.js` (et `index.html`) bouge.
- Bump de **toutes** les entrées de l'import map à la **même** valeur.

## Terminé quand
- [ ] Contrôles passés, tests écrits (échouent avant, passent après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : non (aucun écran « Mes ajouts » dans le script de capture)
- [ ] Story cochée dans BACKLOG.md si elle y figure (sinon le noter dans la PR), PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `fix(mes-ajouts): echange reserve aux fiches en attente, fil ouvert apres envoi, un seul envoi`

**Corps** : constats corrigés (liste ci-dessus), cause (la console ne lit que les fiches en
attente ; re-rendu qui referme le `<details>` ; aucun verrou), correction (champ seulement si
`pending` + texte « échange terminé », échanges ouverts conservés, toast, bouton désactivé pendant
l'envoi), tests ajoutés, sorties des commandes, éléments non faits (refus côté base, console admin).
