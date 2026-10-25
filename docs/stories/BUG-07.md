# BUG-07 — Fiche refusée : plus de fantôme « seulement sur ton téléphone », plus de faux succès

> **Ordre du lot 3 (EPIC-R3)** : BUG-07 → BUG-02 → BUG-13 → BUG-05 → BUG-04 → BUG-14 → BUG-03 → BUG-06 → BUG-11 → BUG-12 → BUG-15 → BUG-08 → BUG-09 → BUG-10. **Prérequis** : aucun (première story du lot).

- **Ordre** : première story du lot 3 (BUG-07 → BUG-02 → BUG-13 → BUG-05 → BUG-04 → BUG-14 → BUG-03 → BUG-06 → BUG-11 → BUG-12 → BUG-15 → BUG-08 → BUG-09 → BUG-10). Partir de `master` à jour ; les extraits « avant » sont ceux du `master` actuel.
- **Lot** : 3. Bugs visibles · **Gravité** : moyen · **Niveau conseillé** : medium
- **Branche** : `fix/fiche-refusee-copie-locale` · **Taille** : 5 fichiers JS + 3 tests fonctionnels + 1 test unitaire.
  Au-dessus de la limite de 3, **exception acceptée** : même cause (plus de copie locale après un
  envoi), le compteur de Mon profil qui reposait sur ces copies doit suivre dans la même PR.
- **Constats couverts** (rapport du 2026-10-21) :
  - Une fiche refusée réapparaît chez son auteur comme « enregistrée sur ton téléphone » et « Publier » annonce un faux succès — `js/app.js:174`
  - (doublon) Fiche refusée par l'admin : elle réapparaît chez son auteur comme « seulement sur ton téléphone », et « Publier » affiche un faux succès — `js/add-distributor.js:326` (ligne **328** aujourd'hui, SEC-05 a ajouté deux lignes)

## But
Une fiche envoyée puis refusée par l'équipe ne revient plus sur la carte de son auteur comme
« enregistrée seulement sur ton téléphone » ; elle ne se voit plus que dans « Mes ajouts ». Et
« Publier ce distributeur » n'annonce plus « Merci ! » pour une fiche que la base a déjà refusée.

## User story
En tant que membre dont l'ajout a été refusé, je veux que ma carte ne me montre plus ce
distributeur comme s'il était à publier, afin de ne pas croire à tort qu'il est en attente.

**Critères d'acceptation**
- [ ] Copie locale d'une fiche que la base renvoie en « refusée » : au chargement, la copie quitte
      le téléphone ; aucune pastille, aucune fiche, aucun bandeau « seulement sur ton téléphone ».
- [ ] Copie d'une fiche **déjà envoyée** que la base ne renvoie pas (auteur déconnecté : une fiche en
      attente n'est lisible que par lui) : elle n'est pas affichée, et elle reste sur le téléphone
      (la base la renverra une fois l'auteur connecté).
- [ ] Copie **jamais envoyée** : inchangé, bandeau « seulement sur ton téléphone » + « Publier ».
- [ ] « Publier » sur un id que la base connaît déjà en « refusée » : pas de « Merci ! », un message
      renvoie vers Compte, « Mes ajouts » ; la copie quitte le téléphone et la carte, la fiche se ferme.
- [ ] Un ajout envoyé avec succès n'est plus copié sur le téléphone ; un ajout dont l'envoi échoue
      l'est toujours (comme avant).
- [ ] Mon profil, « Distributeurs ajoutés » : compte les copies restées sur le téléphone + les fiches
      de la base dont le membre connecté est l'auteur (en attente ou publiées), sans doublon.

## Pourquoi ça arrive (déjà analysé, ne pas refaire)
1. `confirmAddDistributorImpl` (`js/add-distributor.js:447`) appelle `saveUserDistributor` **même
   après un envoi réussi** : une copie de même id (`user-<ts>`, `reviewStatus: 'pending'`) reste
   dans `snackmatch_user_distributors`.
2. Au chargement, `loadDistributorsFromSupabase` (`js/app.js:103`) retire les fiches refusées
   **avant** la fusion des copies locales : la copie n'a plus de jumelle de même id, elle est ajoutée
   et marquée `isLocalOnly` (`js/app.js:174`). Idem pour un auteur déconnecté (fiche en attente
   illisible en anonyme).
3. « Publier » (`publishCurrentLocalDistributor`, `js/gmaps-ui.js:810`) renvoie l'INSERT, reçoit
   23505 (id déjà en base) que `publishDistributor` (`js/add-distributor.js:328`) compte comme un
   succès.

**Règle de lecture vérifiée** (`supabase/022_distributor_review.sql:36-37`, jamais redéfinie
depuis) : `review_status = 'published' or added_by = auth.uid() or is_admin()`. L'auteur connecté
lit donc **toutes** ses fiches, refusées comprises ; 027 force `added_by := auth.uid()` à l'ajout.
Un visiteur ne lit que les publiées. D'où les règles retenues :
- base qui répond → toute copie dont l'id figure dans **toutes** les lignes lues (refusées
  comprises, avant le filtre) quitte le téléphone ;
- copie avec `reviewStatus` (posé seulement après un envoi réussi) que la base ne renvoie pas →
  cachée, gardée sur le téléphone, jamais `isLocalOnly` ;
- `isLocalOnly` seulement pour une copie sans `reviewStatus` (jamais envoyée) ;
- 23505 → relire `review_status` de cet id : `rejected` → « refusée » ; `pending` / `published` →
  succès ; illisible → échec.

## Avant de coder
**Lire en entier** : `js/app.js` lignes 86-206 (`loadDistributorsFromSupabase`, `loadDistributors`) ;
`js/add-distributor.js` lignes 296-345 (`publishDistributor`) et 429-450 (fin de
`confirmAddDistributorImpl`) ; `js/gmaps-ui.js` lignes 1-22 (imports), 527-541 (`closeDistModal`),
796-825 (`publishCurrentLocalDistributor`) ; `js/utils.js` lignes 346-365 et 391-402 (stockage des
copies locales) et 938-970 (`mapDistributorRow`, dont `addedById: d.added_by || null` vers la
ligne 965) ; `js/navigation.js` lignes 1-11 (imports) et 314-328 (`updateContributionStats`) ;
`tests/functional/doublons.spec.js` en entier ; `tests/unit/unit.test.js` lignes 1-45 (imports) et
la fin du fichier.

**Réutiliser** (ne pas réécrire) : `removeUserDistributors(ids)` et `saveUserDistributor`
(`js/utils.js`, déjà importées), `closeDistModal()` (`js/gmaps-ui.js`, même module),
`updateMapMarkers(false)` (`js/map.js`, comme `rejectPending` dans `js/admin.js`),
`withLocalMachines` et `LOCAL_KEY` (`tests/functional/doublons.spec.js`).

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
grep -n "const distributors = data.map(mapDistributorRow).filter(d => d.reviewStatus !== 'rejected');" js/app.js   # attendu : ligne 103
grep -n '^        return distributors;' js/app.js                                  # attendu : ligne 119
grep -n "const supabaseData = await loadDistributorsFromSupabase();" js/app.js     # attendu : ligne 127
grep -n "let userDistributors = loadUserDistributors();" js/app.js                 # attendu : ligne 149
grep -n "if (supabaseData) newUserDistributors.forEach((d) => { d.isLocalOnly = true; });" js/app.js   # attendu : ligne 174
grep -n "if (error && error.code !== '23505') throw error;" js/add-distributor.js  # attendu : ligne 328
grep -n '^    saveUserDistributor(newDistributor);' js/add-distributor.js          # attendu : ligne 447
grep -n "const res = await publishDistributor(d);" js/gmaps-ui.js                  # attendu : ligne 810
grep -n "import { locateOnMap, setSelectedPin } from './map.js';" js/gmaps-ui.js   # attendu : ligne 20
grep -n 'added_by = auth.uid() or is_admin()' supabase/022_distributor_review.sql  # attendu : ligne 37
grep -rn 'on distributors for select' supabase/                                    # attendu : 1 seule ligne, 022:36
grep -n 'statContribDistributors.textContent = loadUserDistributors().length;' js/navigation.js   # attendu : 1 ligne, 320
grep -n "from './auth.js'" js/navigation.js                                        # attendu : aucune ligne
grep -n 'addedById: d.added_by || null,' js/utils.js                               # attendu : 1 ligne, vers 965
grep -n '^export function removeUserDistributors(ids) {' js/utils.js               # attendu : ligne 357
grep -n '"./js/app.js": "./js/app.js?v=' index.html                                # attendu : ?v=95 (première story du lot)
```
Si `grep -rn 'on distributors for select'` trouve une autre migration que 022 : s'arrêter (la règle
de lecture a changé, la fiche ne vaut plus).

## Étapes

1. **js/app.js** — `loadDistributorsFromSupabase` expose les ids de **toutes** les lignes lues.
   a) Avant :
   ```js
           const distributors = data.map(mapDistributorRow).filter(d => d.reviewStatus !== 'rejected');
   ```
   Après :
   ```js
           const rows = data.map(mapDistributorRow);
           const distributors = rows.filter(d => d.reviewStatus !== 'rejected');
   ```
   b) Avant (ligne 119, la seule `return distributors;` du fichier à 8 espaces) :
   ```js
           return distributors;
   ```
   Après :
   ```js
           // BUG-07 : ids de TOUTES les fiches lues, refusees comprises : une copie locale
           // de meme id doit quitter le telephone (loadDistributors)
           return { distributors, knownIds: new Set(rows.map(d => d.id)) };
   ```
   Les deux `return null;` de la fonction ne changent pas.

2. **js/app.js** — `loadDistributors` lit le nouveau retour.
   Avant :
   ```js
       const supabaseData = await loadDistributorsFromSupabase();
       if (supabaseData) {
   ```
   Après :
   ```js
       const remote = await loadDistributorsFromSupabase();
       const supabaseData = remote ? remote.distributors : null;
       if (supabaseData) {
   ```
   Les autres usages de `supabaseData` (lignes 129, 153, 174, 200) restent tels quels : c'est
   toujours le tableau, ou `null`.

3. **js/app.js** — les copies connues de la base quittent le téléphone.
   Avant :
   ```js
       let userDistributors = loadUserDistributors();
       // EPIC-T9 : quand la base a repondu, une copie locale d'une machine deja
   ```
   Après :
   ```js
       let userDistributors = loadUserDistributors();
       // BUG-07 : une copie locale dont l'id est connu de la base (en attente, publiee ou
       // refusee) quitte le telephone : la base fait foi, une fiche refusee ne se voit
       // plus que dans « Mes ajouts »
       if (supabaseData && userDistributors.length > 0) {
           const sentIds = userDistributors.filter((d) => remote.knownIds.has(d.id)).map((d) => d.id);
           if (sentIds.length > 0) {
               removeUserDistributors(sentIds);
               userDistributors = userDistributors.filter((d) => !sentIds.includes(d.id));
               console.log('[DistriMatch] Copies locales retirees (connues de la base):', sentIds.length);
           }
       }
       // EPIC-T9 : quand la base a repondu, une copie locale d'une machine deja
   ```

4. **js/app.js** — `isLocalOnly` seulement pour une copie jamais envoyée.
   Avant :
   ```js
           if (supabaseData) newUserDistributors.forEach((d) => { d.isLocalOnly = true; });
           AppState.distributors = [...AppState.distributors, ...newUserDistributors];
   ```
   Après :
   ```js
           // BUG-07 : une copie deja envoyee (reviewStatus pose a l'envoi) que la base ne
           // renvoie pas (auteur deconnecte : fiche en attente illisible) reste cachee et
           // gardee ; seule une copie jamais envoyee est « seulement sur ton telephone »
           const shownUserDistributors = supabaseData
               ? newUserDistributors.filter((d) => !d.reviewStatus)
               : newUserDistributors;
           if (supabaseData) shownUserDistributors.forEach((d) => { d.isLocalOnly = true; });
           AppState.distributors = [...AppState.distributors, ...shownUserDistributors];
   ```
   La ligne `console.log('[DistriMatch] Distributeurs utilisateur:', ...)` juste après ne change pas.

5. **js/add-distributor.js** — relire l'état d'une fiche déjà en base (23505).
   a) Juste au-dessus de la ligne
   `// Garde anti double-soumission : le bouton "Ajouter" est async et reste` (ligne 298), ajouter :
   ```js
   // BUG-07 : fiche deja en base sous cet id (23505 : envoi precedent dont la reponse
   // s'est perdue). Son auteur la relit (regle 022). En attente ou publiee = deja
   // envoyee : ok. Refusee = { rejected: true }. Illisible = id pris par une autre : echec.
   async function existingDistributorOutcome(id) {
       const { data, error } = await supabaseClient.from('distributors').select('review_status').eq('id', id).limit(1);
       if (error) throw error;
       const status = data?.[0]?.review_status;
       if (status === 'rejected') return { ok: false, rejected: true, error: null };
       if (status) return { ok: true, error: null };
       return { ok: false, error: { code: '23505', message: 'Identifiant deja pris' } };
   }

   ```
   b) Commentaire de `publishDistributor`. Avant :
   ```js
   // Envoie une machine (et ses produits) a la base. Retour : { ok, error }.
   // Deja presente (meme id, 23505) = deja publiee : ok. Reutilise par la fiche
   // d'une machine locale (« Publier cette machine », EPIC-T9).
   ```
   Après :
   ```js
   // Envoie une machine (et ses produits) a la base. Retour : { ok, error, rejected? }.
   // Deja presente (meme id, 23505) : son etat est relu (existingDistributorOutcome, BUG-07).
   // Reutilise par la fiche d'une machine locale (« Publier cette machine », EPIC-T9).
   ```
   c) Avant :
   ```js
           if (error && error.code !== '23505') throw error;
   ```
   Après :
   ```js
           if (error && error.code !== '23505') throw error;
           if (error) return await existingDistributorOutcome(distributor.id);
   ```
   (`return await` dans le `try` : une erreur de relecture tombe dans le `catch` existant, qui rend
   `{ ok: false, error }`.)

6. **js/add-distributor.js** — plus de copie locale après un envoi réussi.
   Avant :
   ```js
       } else {
           newDistributor.isLocalOnly = true;
           showToast('Enregistrée sur ton téléphone seulement : publie-la depuis sa fiche quand le réseau revient', 'warning');
       }

       AddMode.photos = null;

       saveUserDistributor(newDistributor);

       AppState.distributors.push(newDistributor);
   ```
   Après :
   ```js
       } else {
           newDistributor.isLocalOnly = true;
           // BUG-07 : seule une fiche non envoyee est gardee sur le telephone ; une fiche
           // envoyee est relue depuis la base (son auteur la lit, regle 022)
           saveUserDistributor(newDistributor);
           showToast('Enregistrée sur ton téléphone seulement : publie-la depuis sa fiche quand le réseau revient', 'warning');
       }

       AddMode.photos = null;

       AppState.distributors.push(newDistributor);
   ```

7. **js/gmaps-ui.js** — « Publier » sur une fiche déjà refusée.
   a) Import, avant :
   ```js
   import { locateOnMap, setSelectedPin } from './map.js';
   ```
   après :
   ```js
   import { locateOnMap, setSelectedPin, updateMapMarkers } from './map.js';
   ```
   b) Dans `publishCurrentLocalDistributor`, avant :
   ```js
           const res = await publishDistributor(d);
           if (!res.ok) {
   ```
   après :
   ```js
           const res = await publishDistributor(d);
           if (res.rejected) {
               // BUG-07 : deja envoyee puis refusee par l'equipe : la copie quitte le
               // telephone et la carte, le motif est dans « Mes ajouts »
               removeUserDistributors([d.id]);
               AppState.distributors = AppState.distributors.filter((x) => x.id !== d.id);
               closeDistModal();
               updateMapMarkers(false);
               showToast('L’équipe n’a pas retenu ce distributeur : le détail est dans Compte, « Mes ajouts ».', 'warning');
               return;
           }
           if (!res.ok) {
   ```
   Le `finally` existant remet `isPublishing` et le bouton : ne rien changer d'autre.

7b. **Compteur « Distributeurs ajoutés » de Mon profil** — il comptait les copies locales
   (`loadUserDistributors().length`) ; après l'étape 6 il ne compterait plus les fiches envoyées.
   a) **js/utils.js** — juste après la fin de la fonction `removeUserDistributors` (son `}` de
   fermeture, avant le commentaire `// Nom compare sans casse, accents ni espaces superflus ...`),
   ajouter :
   ```js

   // Distributeurs ajoutes par ce membre (Mon profil, BUG-07) : copies restees sur le
   // telephone + fiches de la base dont il est l'auteur (en attente ou publiees), sans doublon
   export function countMyAdditions(localCopies, distributors, userId) {
       const ids = new Set((localCopies || []).map((d) => d.id));
       if (userId) (distributors || []).forEach((d) => { if (d.addedById === userId) ids.add(d.id); });
       return ids.size;
   }
   ```
   b) **js/navigation.js** — imports. Avant :
   ```js
   import {
       escapeHTML, formatDistance, updateImplicitProfile, getTopPreferredTypes, loadUserDistributors, getLevelInfo
   } from './utils.js';
   ```
   Après :
   ```js
   import {
       escapeHTML, formatDistance, updateImplicitProfile, getTopPreferredTypes, loadUserDistributors, getLevelInfo, countMyAdditions
   } from './utils.js';
   import { getCurrentUser } from './auth.js';
   ```
   (Pas de cycle : `js/auth.js` n'importe que `state.js`, `utils.js`, `config.js`, `focus-trap.js`.)
   c) **js/navigation.js** — `updateContributionStats`. Avant :
   ```js
           statContribDistributors.textContent = loadUserDistributors().length;
   ```
   Après :
   ```js
           // BUG-07 : une fiche envoyee n'est plus copiee sur le telephone : on compte aussi
           // les fiches de la base dont le membre connecte est l'auteur
           statContribDistributors.textContent = countMyAdditions(loadUserDistributors(), AppState.distributors, getCurrentUser()?.id);
   ```
   `AppState` est déjà importé dans navigation.js (ligne 5). `addedById` vient de
   `mapDistributorRow` (`js/utils.js`, vers la ligne 965). Les fiches refusées ne sont pas dans
   `AppState.distributors` : elles ne sont pas comptées (limite acceptée, à noter dans la PR).

8. **index.html** — cinq modules JS changent (`app.js`, `add-distributor.js`, `gmaps-ui.js`,
   `utils.js`, `navigation.js`) : monter le `?v=` de **toutes** les entrées de l'import map à la même
   valeur, celle trouvée par le contrôle + 1 (au moment de la fiche : `?v=95` → `?v=96` partout).
   Aucun CSS.

## Tests
- **Fichier** : `tests/functional/doublons.spec.js`, à la fin du bloc
  `test.describe('33. Machines seulement locales'`, après le test
  `visiteur sur une machine locale : le bouton propose de se connecter pour la publier`
  (avant le `});` final du fichier).
- **Noms** :
  1. `copie locale d’une fiche refusée : quitte le téléphone, ni pastille ni bandeau (BUG-07)`
  2. `copie d’une fiche déjà envoyée que la base ne renvoie pas : cachée, gardée (BUG-07)`
  3. `« Publier » sur un id déjà refusé : pas de faux succès, la copie s’en va (BUG-07)`
- **Code à ajouter** :
  ```js
      // BUG-07 : une copie locale d'une fiche deja envoyee ne revient jamais
      // « seulement sur ton telephone » ; un id deja refuse n'est pas un succes
      const REJECTED_ID = 'user-bug07-refusee';

      test('copie locale d’une fiche refusée : quitte le téléphone, ni pastille ni bandeau (BUG-07)', async ({ page, context }) => {
          // Base simulee : la vraie reponse + la fiche refusee (son auteur la lit, regle 022)
          await page.route(u => u.pathname.endsWith('/rest/v1/distributors') && (u.searchParams.get('select') || '').startsWith('*'), async route => {
              if (route.request().method() !== 'GET') return route.continue();
              const res = await route.fetch();
              const rows = await res.json();
              rows.push({ ...rows[0], id: REJECTED_ID, name: 'ZZ BUG-07 fiche refusee', lat: 43.3901, lng: -1.2901, review_status: 'rejected', products: [] });
              return route.fulfill({ response: res, json: rows });
          });
          await page.evaluate((key) => {
              localStorage.setItem(key, JSON.stringify([
                  // Copie gardee apres un envoi reussi (avant BUG-07), meme id que la ligne refusee
                  { id: 'user-bug07-refusee', name: 'ZZ BUG-07 fiche refusee', lat: 43.3901, lng: -1.2901, type: 'other', emoji: '📦', address: 'Rue du test', products: [], reviewStatus: 'pending', isUserAdded: true }
              ]));
          }, LOCAL_KEY);
          await setupApp(page, context);   // rechargement : le nettoyage se fait au chargement
          const r = await page.evaluate(([key, id]) => ({
              inApp: window.AppState.distributors.some(d => d.id === id),
              stored: JSON.parse(localStorage.getItem(key) || '[]').map(d => d.id)
          }), [LOCAL_KEY, REJECTED_ID]);
          expect(r).toEqual({ inApp: false, stored: [] });
          await page.evaluate((id) => window.openDistributorModal(id), REJECTED_ID);
          await expect(page.locator('#dist-modal-overlay.active')).toHaveCount(0);
          await expect(page.locator('#dist-local-only')).toBeHidden();
      });

      test('copie d’une fiche déjà envoyée que la base ne renvoie pas : cachée, gardée (BUG-07)', async ({ page, context }) => {
          // Visiteur : sa fiche en attente est illisible en anonyme, la vraie base ne la renvoie pas
          await page.evaluate((key) => {
              localStorage.setItem(key, JSON.stringify([
                  { id: 'user-bug07-envoyee', name: 'ZZ BUG-07 fiche envoyee', lat: 43.3801, lng: -1.2801, type: 'other', emoji: '📦', address: 'Rue du test', products: [], reviewStatus: 'pending', isUserAdded: true }
              ]));
          }, LOCAL_KEY);
          await setupApp(page, context);
          const r = await page.evaluate((key) => ({
              inApp: window.AppState.distributors.some(d => d.id === 'user-bug07-envoyee'),
              stored: JSON.parse(localStorage.getItem(key) || '[]').map(d => d.id)
          }), LOCAL_KEY);
          expect(r).toEqual({ inApp: false, stored: ['user-bug07-envoyee'] });
      });

      test('« Publier » sur un id déjà refusé : pas de faux succès, la copie s’en va (BUG-07)', async ({ page, context }) => {
          await withLocalMachines(page, context);   // user-local-only : jamais envoyee, isLocalOnly
          const posted = [];
          await page.route(u => u.pathname.endsWith('/rest/v1/distributors'), route => {
              const req = route.request();
              if (req.method() === 'POST') {
                  posted.push(req.postDataJSON());
                  return route.fulfill({ status: 409, contentType: 'application/json',
                      body: JSON.stringify({ code: '23505', message: 'duplicate key value violates unique constraint "distributors_pkey"', details: null, hint: null }) });
              }
              if (new URL(req.url()).searchParams.get('select') === 'review_status') {
                  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ review_status: 'rejected' }]) });
              }
              return route.continue();
          });
          await loginForTest(page);
          await page.evaluate(() => window.openDistributorModal('user-local-only'));
          await page.waitForSelector('#dist-modal-overlay.active');
          await page.click('#dist-local-publish');

          await expect(page.locator('#toast-container .toast.warning')).toContainText('Mes ajouts');
          await expect(page.locator('#toast-container .toast.success')).toHaveCount(0);
          expect(posted).toHaveLength(1);
          const r = await page.evaluate((key) => ({
              inApp: window.AppState.distributors.some(d => d.id === 'user-local-only'),
              stored: JSON.parse(localStorage.getItem(key) || '[]').map(d => d.id)
          }), LOCAL_KEY);
          expect(r).toEqual({ inApp: false, stored: [] });
          await expect(page.locator('#dist-modal-overlay.active')).toHaveCount(0);
      });
  ```
- **Doivent échouer avant la correction** parce que :
  1. la ligne refusée est retirée avant la fusion : la copie est ajoutée (`inApp: true`), et reste
     stockée ;
  2. la copie est ajoutée avec `isLocalOnly` (`inApp: true`) ;
  3. 23505 est compté comme un succès : toast `success` « Merci ! … », aucun toast `warning`
     contenant « Mes ajouts ».
- **Test unitaire du compteur** (étape 7b) : `tests/unit/unit.test.js`, **à la fin du fichier**,
  avec son propre import (une déclaration `import` est valable n'importe où au niveau du module) :
  ```js

  // BUG-07 : compteur « Distributeurs ajoutes » (copies locales + fiches de la base du membre)
  import { countMyAdditions } from '../../js/utils.js';

  describe('countMyAdditions (BUG-07)', () => {
      const local = [{ id: 'user-1' }, { id: 'user-2' }];
      const base = [
          { id: 'user-2', addedById: 'u1' },
          { id: 'user-3', addedById: 'u1' },
          { id: 'd-9', addedById: 'u2' },
          { id: 'd-10' }
      ];
      it('copies locales + fiches du membre, sans doublon', () => {
          assert.equal(countMyAdditions(local, base, 'u1'), 3);
      });
      it('deconnecte : seulement les copies locales', () => {
          assert.equal(countMyAdditions(local, base, null), 2);
      });
      it('rien : 0', () => {
          assert.equal(countMyAdditions([], [], 'u1'), 0);
          assert.equal(countMyAdditions(undefined, undefined, undefined), 0);
      });
  });
  ```
  **Doit échouer avant** : `countMyAdditions` n'existe pas (erreur d'import, tout le fichier échoue).
- Ces tests s'appuient sur la vraie base pour la liste (comme le reste de `doublons.spec.js`) : si
  le projet Supabase est en pause, **tous** les tests du fichier échouent ; vérifier le tableau de
  bord avant de chercher un bug (cf. CLAUDE.md).

## Vérification (dans l'ordre)
```bash
grep -n "remote.knownIds.has(d.id)" js/app.js                        # attendu : 1 ligne
grep -n "existingDistributorOutcome" js/add-distributor.js           # attendu : 3 lignes (commentaire, definition, appel)
grep -n "saveUserDistributor(newDistributor);" js/add-distributor.js # attendu : 1 ligne, dans le else (12 espaces d'indentation)
grep -n "if (res.rejected)" js/gmaps-ui.js                           # attendu : 1 ligne
grep -n "countMyAdditions(loadUserDistributors(), AppState.distributors, getCurrentUser()?.id)" js/navigation.js   # attendu : 1 ligne
grep -n 'loadUserDistributors().length' js/navigation.js             # attendu : aucune ligne
node --test --test-name-pattern="countMyAdditions" tests/unit/unit.test.js   # 3 tests passent
npx playwright test --project=functional -g "BUG-07"                 # 3 passed
npx playwright test --project=functional -g "33. Machines seulement locales"   # tout vert (7 tests)
npx playwright test --project=functional -g "9. Dedup distributeurs" # tout vert (donnees.spec.js)
npm test                                                             # tout vert, dont « cache-busting »
npm run test:functional                                              # en arrière-plan (~10 min) : tout vert, instables notés
```

## Hors périmètre
- Compter aussi les fiches refusées dans « Distributeurs ajoutés » (il faudrait relire « Mes
  ajouts ») : non, limite notée dans la PR.
- « Effacer mes données » qui ne vide pas `snackmatch_user_distributors` : non.
- Le filet par contenu (signature nom + coordonnées) et `findLocalDuplicates` : inchangés.
- `js/additions.js` (« Mes ajouts ») : rien à changer, il lit déjà la base.
- Aucune migration SQL : la règle de lecture 022 suffit.

## Pièges connus
- `loadDistributorsFromSupabase` rend désormais `{ distributors, knownIds }` ou `null` : ne pas
  oublier l'étape 2, sinon `AppState.distributors` devient un objet et la carte est vide.
- `knownIds` est construit **avant** le filtre des refusées (`rows`, pas `distributors`) : c'est tout
  l'objet de la story.
- Étape 4 : filtrer avec `!d.reviewStatus` **seulement quand la base a répondu** ; en repli (JSON /
  données embarquées), garder l'ancien comportement (toutes les copies affichées, sans `isLocalOnly`).
- Étape 6 : déplacer `saveUserDistributor` **dans** le `else`, ne pas le dupliquer ; il ne doit plus
  rester qu'un seul appel dans la fonction.
- Étape 7 : `closeDistModal()` **avant** `updateMapMarkers(false)`, et `return` avant le `if (!res.ok)`.
  `closeDistModal` est dans le même module : pas d'import.
- Texte du toast : pas le mot « machine », ton positif, apostrophes typographiques `’` comme les
  autres textes du fichier.
- Test 3 : la route de la relecture répond à `select=review_status` ; la requête d'origine utilise
  `.limit(1)` (paramètre `limit=1`), ne pas la changer en `.single()` (qui demande un autre en-tête).
- Étape 7b : le test `updateProfileStats - contributions` de `tests/integration/dom.test.js` doit
  rester vert (aucun compte connecté, ses distributeurs n'ont pas d'`addedById` : seules les copies
  locales comptent, comme avant). S'il échoue, s'arrêter et signaler.
- Étape 7b : importer `getCurrentUser` dans navigation.js, ne pas lire `window.__testLogin` ni
  `supabaseClient.auth` (asynchrone).
- Bump de **toutes** les entrées de l'import map à la **même** valeur.

## Terminé quand
- [ ] Contrôles passés, tests écrits (échouent avant, passent après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : non (le défaut demande une fiche refusée en base)
- [ ] Story cochée dans BACKLOG.md, PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `fix(ajout): une fiche refusee ne revient plus « seulement sur ton telephone »`

**Corps** : constats corrigés (les deux titres ci-dessus), cause (copie locale gardée après un envoi
réussi + fiches refusées retirées avant la fusion + 23505 compté comme un succès), correction (plus
de copie après succès ; copies connues de la base retirées au chargement ; `isLocalOnly` réservé
aux copies jamais envoyées ; 23505 → relecture de `review_status`, refusée → message vers « Mes
ajouts » ; compteur « Distributeurs ajoutés » = copies locales + fiches du membre dans la base,
`countMyAdditions`), tests ajoutés (les trois tests fonctionnels BUG-07 + le test unitaire
`countMyAdditions`), sorties des commandes de vérification. Limite à écrire : les fiches refusées ne
sont pas comptées dans « Distributeurs ajoutés » (absentes de la carte) ; taille au-dessus de
3 fichiers justifiée par la même cause.
