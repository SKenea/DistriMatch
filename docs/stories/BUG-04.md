# BUG-04 — iPhone : l'app de l'écran d'accueil démarre sans les favoris

- **Lot** : 3. Bugs visibles · **Gravité** : moyen · **Niveau conseillé** : medium
- **Prérequis** : BUG-07, BUG-02, BUG-13 et **BUG-05 fusionnées** sur `master` (partir de `master` à jour après la fusion de BUG-05)
- **Ordre** : BUG-07 → BUG-02 → BUG-13 → BUG-05 → **BUG-04** → BUG-14 → …
- **Branche** : `fix/iphone-favoris-ecran-accueil` · **Taille** : 3 fichiers JS (`js/push.js`, `js/utils.js`, `js/app.js`) + 2 fichiers de tests
- **Constats couverts** (rapport du 2026-10-21) :
  - iPhone : après le guide « écran d'accueil », l'app installée repart sans les favoris, et aucune notification n'est mise en place — `js/push.js:84` (aujourd'hui ligne 88, le fichier a bougé)

## But
Sur iPhone, la personne qui installe DistriMatch sur son écran d'accueil sait qu'elle doit y
remettre son distributeur en favori : le guide le dit, et au premier lancement de l'app
installée sans favori, un indice discret le rappelle une seule fois.

## User story
En tant qu'utilisateur d'iPhone qui vient d'ajouter DistriMatch à son écran d'accueil pour
recevoir les notifications, je veux savoir que l'app installée a ses propres favoris, afin d'y
remettre mon distributeur et de recevoir l'invitation aux notifications.

**Critères d'acceptation**
- [ ] Le guide « Ajoute DistriMatch à ton écran d'accueil » dit d'y remettre son distributeur en favori.
- [ ] iPhone, app ouverte depuis l'écran d'accueil (standalone), aucun favori : au premier lancement,
      un message non bloquant « Bienvenue dans l'app ! Touche le cœur… » s'affiche (environ 8 s, bouton « OK »).
- [ ] Au lancement suivant, plus de message (clé `distrimatch_home_screen_seen` = `'1'`).
- [ ] Rien ne s'affiche hors iPhone, dans Safari (non installé), ou s'il y a déjà un favori.
- [ ] L'invitation aux notifications apparaît toujours seulement au premier cœur (jamais à l'ouverture).

## Pourquoi ça arrive (déjà analysé, ne pas refaire)
Sur iPhone, une page web ne reçoit de notifications qu'une fois ajoutée à l'écran d'accueil.
Au premier cœur dans Safari, `maybeOfferPush()` (`js/push.js`) montre donc le guide
`showHomeScreenGuide()` au lieu de la demande de permission. Mais l'app ouverte depuis l'icône a
un **stockage séparé de Safari** : les favoris (`snackmatch_user`) n'y sont pas. Elle démarre
vide, aucun abonnement n'est créé, et rien ne le dit. Dès qu'on remet un cœur **dans l'app
installée**, `distrimatch_push_asked` y est absent : l'invitation aux notifications apparaît
normalement. Il suffit donc de **le dire** (guide + indice au premier lancement).

Décisions déjà prises (ne pas les rediscuter) : pas de synchronisation par compte, pas de
favoris passés dans l'adresse de l'icône, l'invitation aux notifications reste au premier cœur.

## Avant de coder
**Lire en entier** : `js/push.js` (196 lignes) ; `js/utils.js` lignes 61-121 (`showToast`,
`showActionToast`) et 1425-1443 (`needsHomeScreenForPush`) ; `js/app.js` lignes 55-60 et 600-615 ;
`tests/functional/notifications.spec.js` lignes 283-371 ; `tests/functional/helpers.js` lignes 35-69 ;
`tests/unit/unit.test.js` lignes 1822-1890.

**Réutiliser** (ne pas réécrire) : `isStandalone()` (`js/push.js`, exportée par BUG-05, même module), `showActionToast`
(`js/utils.js`), `AppState.subscriptions` (`js/state.js`), `favoriteDemo(page)` et `passWelcome`
(tests).

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :

Les numéros de ligne « vers … » ont été relevés sur `master` du 2026-10-25 : BUG-07, BUG-02 et
BUG-13 ajoutent des lignes dans `js/app.js` (avant le bloc `initPushSettings`), BUG-02 dans
`js/utils.js` et `tests/unit/unit.test.js`. Un décalage de quelques dizaines de lignes est donc
normal : se fier au **contenu** trouvé par le grep, et au nombre de lignes attendu. Aucune de ces
stories ne modifie les extraits « avant » de cette fiche.
```bash
grep -n 'Ouvre ensuite DistriMatch depuis cette icône.' js/push.js
# attendu : 1 ligne (vers 88), dans showHomeScreenGuide
grep -n "import { showToast, saveNotificationPrefs, urlBase64ToUint8Array, needsHomeScreenForPush } from './utils.js';" js/push.js
# attendu : ligne 10
grep -n '^export function isStandalone() {' js/push.js
# attendu : ligne 24 (exportée par BUG-05). Si on trouve encore « function isStandalone » sans export, BUG-05 n'est pas fusionnée : s'arrêter
grep -n '^export function needsHomeScreenForPush(userAgent, standalone) {' js/utils.js
# attendu : 1 ligne (vers 1441)
grep -n "import { initPushSettings, syncPushSubscription, disablePush } from './push.js';" js/app.js
# attendu : ligne 58
grep -n '    syncPushSubscription();$' js/app.js
# attendu : 2 lignes (vers 215 et 611) ; on vise celle de 611, juste après « initPushSettings(); »
grep -n "import { urlBase64ToUint8Array, needsHomeScreenForPush } from '../../js/utils.js';" tests/unit/unit.test.js
# attendu : 1 ligne (vers 1828)
grep -n "test.describe('40b. Notifications app fermee sur iPhone'" tests/functional/notifications.spec.js
# attendu : 1 ligne (vers 360)
grep -n "import { setupApp, loginForTest, RPC_ROUTE, chooseMachineState } from './helpers.js';" tests/functional/notifications.spec.js
# attendu : ligne 8
grep -n '"./js/app.js": "./js/app.js?v=' index.html
# attendu : la valeur laissée par BUG-05 (95 sur master du 2026-10-25, donc environ 99 après BUG-07, 02, 13 et 05) : la noter
grep -n 'verifyOtp' js/auth.js
# attendu : 1 ligne (preuve que BUG-05 est fusionnée)
grep -rn 'distrimatch_home_screen_seen' js tests
# attendu : rien
```

## Étapes

1. **js/utils.js** — condition pure de l'indice, juste après `needsHomeScreenForPush`.
   Avant :
   ```js
   export function needsHomeScreenForPush(userAgent, standalone) {
       return /iPhone|iPad|iPod/i.test(String(userAgent || '')) && !standalone;
   }
   ```
   Après :
   ```js
   export function needsHomeScreenForPush(userAgent, standalone) {
       return /iPhone|iPad|iPod/i.test(String(userAgent || '')) && !standalone;
   }

   // App de l'ecran d'accueil sur iPhone (BUG-04) : son stockage est separe de Safari,
   // les favoris n'y sont pas. Indice une seule fois, seulement s'il n'y a aucun favori.
   export function shouldHintHomeScreenFavorites(userAgent, standalone, favoritesCount, alreadySeen) {
       return /iPhone|iPad|iPod/i.test(String(userAgent || ''))
           && standalone === true && favoritesCount === 0 && !alreadySeen;
   }
   ```

2. **js/push.js** — import (ligne 10).
   Avant :
   ```js
   import { showToast, saveNotificationPrefs, urlBase64ToUint8Array, needsHomeScreenForPush } from './utils.js';
   ```
   Après :
   ```js
   import { showToast, showActionToast, saveNotificationPrefs, urlBase64ToUint8Array, needsHomeScreenForPush, shouldHintHomeScreenFavorites } from './utils.js';
   ```

3. **js/push.js** — clé de l'indice, juste sous `const ASKED_KEY = 'distrimatch_push_asked';`.
   Ajouter la ligne :
   ```js
   const HOME_SCREEN_SEEN_KEY = 'distrimatch_home_screen_seen';   // BUG-04 : indice deja montre
   ```

4. **js/push.js** — texte du guide (dans `showHomeScreenGuide`). Ne changer **que** la ligne `message:`.
   Avant :
   ```js
           message: 'Sur iPhone, les notifications arrivent seulement depuis l’écran d’accueil : touche Partager, puis « Sur l’écran d’accueil ». Ouvre ensuite DistriMatch depuis cette icône.',
   ```
   Après :
   ```js
           message: 'Sur iPhone, les notifications arrivent seulement depuis l’écran d’accueil : touche Partager, puis « Sur l’écran d’accueil ». Ouvre ensuite DistriMatch depuis cette icône et remets-y ton distributeur en favori : l’app de l’écran d’accueil a ses propres favoris.',
   ```
   Garder les apostrophes typographiques `’` du texte d'origine (pas `'`).

5. **js/push.js** — l'indice, juste après la fin de `maybeOfferPush()` (avant le commentaire
   `// Reglages des notifications : interrupteur « Prévenu même app fermée ».`). Ajouter :
   ```js
   // App de l'ecran d'accueil sur iPhone, premier lancement sans favori (BUG-04) : un
   // indice une seule fois. L'invitation aux notifications vient ensuite au premier coeur
   // (maybeOfferPush), jamais a l'ouverture.
   export function maybeHintHomeScreenFavorites() {
       let seen;
       try { seen = localStorage.getItem(HOME_SCREEN_SEEN_KEY) === '1'; } catch (e) { return; }
       if (!shouldHintHomeScreenFavorites(navigator.userAgent, isStandalone(), AppState.subscriptions.length, seen)) return;
       try { localStorage.setItem(HOME_SCREEN_SEEN_KEY, '1'); } catch (e) { return; }
       showActionToast('Bienvenue dans l’app ! Touche le cœur de ton distributeur préféré pour le retrouver ici et activer ses notifications.', {
           actionLabel: 'OK',
           duration: 8000
       });
   }
   ```
   (`AppState` est déjà importé ligne 8. Stockage bloqué = pas d'indice : sans clé, il
   reviendrait à chaque lancement.)

6. **js/app.js** — import (ligne 58).
   Avant :
   ```js
   import { initPushSettings, syncPushSubscription, disablePush } from './push.js';
   ```
   Après :
   ```js
   import { initPushSettings, syncPushSubscription, disablePush, maybeHintHomeScreenFavorites } from './push.js';
   ```

7. **js/app.js** — appel au démarrage (vers la ligne 610).
   Avant :
   ```js
       // Notifications app fermee (EPIC-T25) : reglages + abonnement a jour
       initPushSettings();
       syncPushSubscription();
   ```
   Après :
   ```js
       // Notifications app fermee (EPIC-T25) : reglages + abonnement a jour
       initPushSettings();
       syncPushSubscription();
       // iPhone, app de l'ecran d'accueil sans favori : indice une seule fois (BUG-04)
       maybeHintHomeScreenFavorites();
   ```
   Ne pas toucher à l'autre `syncPushSubscription();` (vers la ligne 215).

8. **index.html** — trois modules JS changent : monter le `?v=` de **toutes** les entrées de
   l'import map à la même valeur : la valeur notée aux contrôles + 1 (ex. `?v=99` → `?v=100`
   partout). Aucun CSS ne change.

## Tests

### Test 1 — condition de l'indice (unitaire)
- **Fichier** : `tests/unit/unit.test.js`.
- a) Import (vers la ligne 1828), avant / après :
  ```js
  import { urlBase64ToUint8Array, needsHomeScreenForPush } from '../../js/utils.js';
  ```
  ```js
  import { urlBase64ToUint8Array, needsHomeScreenForPush, shouldHintHomeScreenFavorites } from '../../js/utils.js';
  ```
- b) Nouveau bloc juste après la fin du `describe('Notifications app fermee : quel evenement (EPIC-T25)'`
  (avant le commentaire `// SEC-04 : abonnements push sans abus ni blocage`) :
  ```js
  describe('App de l’écran d’accueil sans favori : indice (BUG-04)', () => {
      it('seulement sur iPhone, dans l’app installée, sans favori, une seule fois', () => {
          const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
          assert.equal(shouldHintHomeScreenFavorites(iphone, true, 0, false), true);
          assert.equal(shouldHintHomeScreenFavorites(iphone, true, 0, true), false);
          assert.equal(shouldHintHomeScreenFavorites(iphone, true, 2, false), false);
          assert.equal(shouldHintHomeScreenFavorites(iphone, false, 0, false), false);
          assert.equal(shouldHintHomeScreenFavorites('Mozilla/5.0 (Linux; Android 14) Chrome/120', true, 0, false), false);
      });
  });
  ```
- **Doit échouer avant** : `shouldHintHomeScreenFavorites` n'existe pas, l'import casse tout le
  fichier (`does not provide an export named 'shouldHintHomeScreenFavorites'`). C'est la raison attendue.

### Test 2 — guide, indice, invitation (fonctionnel)
- **Fichier** : `tests/functional/notifications.spec.js`.
- a) Import ligne 8, avant / après :
  ```js
  import { setupApp, loginForTest, RPC_ROUTE, chooseMachineState } from './helpers.js';
  ```
  ```js
  import { setupApp, loginForTest, RPC_ROUTE, chooseMachineState, passWelcome } from './helpers.js';
  ```
- b) Remplacer **tout** le bloc `test.describe('40b. Notifications app fermee sur iPhone', ...)`
  (de sa première ligne à la fin du fichier) par :
  ```js
  test.describe('40b. Notifications app fermee sur iPhone', () => {
      test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1' });

      test('hors ecran d’accueil : guide « Ajoute DistriMatch à ton écran d’accueil » au lieu de la demande', async ({ page }) => {
          await page.evaluate(() => localStorage.removeItem('distrimatch_push_asked'));
          await favoriteDemo(page);
          const modal = page.locator('#confirm-modal');
          await expect(modal).toHaveClass(/active/);
          await expect(modal).toContainText('Ajoute DistriMatch à ton écran d’accueil');
          await expect(modal).toContainText('Sur l’écran d’accueil');
          // BUG-04 : l'app de l'ecran d'accueil a ses propres favoris, le guide le dit
          await expect(modal).toContainText('remets-y ton distributeur en favori');
      });

      // BUG-04 : app ouverte depuis l'icone (navigator.standalone simule), aucun favori
      test('app de l’écran d’accueil sans favori : un indice au premier lancement, pas au suivant', async ({ page }) => {
          await page.addInitScript(() => {
              Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => true });
          });
          await page.evaluate(() => localStorage.removeItem('distrimatch_home_screen_seen'));
          const hint = page.locator('#toast-container .toast-action', { hasText: 'Touche le cœur de ton distributeur préféré' });

          await page.reload();
          await passWelcome(page);
          await page.waitForSelector('#push-enabled[data-wired="1"]', { state: 'attached', timeout: 50000 });
          await expect(hint).toBeVisible();
          expect(await page.evaluate(() => localStorage.getItem('distrimatch_home_screen_seen'))).toBe('1');

          await page.reload();
          await passWelcome(page);
          await page.waitForSelector('#push-enabled[data-wired="1"]', { state: 'attached', timeout: 50000 });
          await expect(hint).toHaveCount(0);
      });

      test('app de l’écran d’accueil : au premier cœur, l’invitation aux notifications', async ({ page }) => {
          await page.evaluate(() => {
              Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => true });
              localStorage.removeItem('distrimatch_push_asked');
              // Chromium sans affichage repond « denied » : on simule « pas encore demande »
              Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'default' });
          });
          await favoriteDemo(page);
          const modal = page.locator('#confirm-modal');
          await expect(modal).toHaveClass(/active/);
          await expect(modal).toContainText('Être prévenu même app fermée ?');
      });
  });
  ```
- **Doivent échouer avant la correction** : le 1er test sur `remets-y ton distributeur en favori`
  (texte absent du guide) ; le 2e sur `toBeVisible` (aucun indice). Le 3e **passe déjà avant** :
  c'est un garde-fou (l'invitation reste au premier cœur), c'est normal.
- `#push-enabled[data-wired="1"]` est posé par `initPushSettings()` juste avant l'appel de
  l'indice (étape 7) : l'attendre garantit que le démarrage est arrivé à ce point.

## Vérification (dans l'ordre)
```bash
grep -n 'remets-y ton distributeur en favori' js/push.js          # 1 ligne
grep -n 'maybeHintHomeScreenFavorites' js/push.js js/app.js        # push.js : 1 (export) ; app.js : 2 (import + appel)
npm test                                                          # tout vert, dont « BUG-04 » et « cache-busting »
npx playwright test --project=functional -g "40b"                 # 3 passed
npx playwright test --project=functional -g "40. Notifications app fermee"   # tout vert
npm run test:functional                                           # en arrière-plan (~10 min) : tout vert, instables notés dans la PR
```

## Hors périmètre
- Le toast « Ajouté à tes favoris : tu seras prévenu si ça change » (`js/distributor.js`) :
  ne pas le toucher ici, même s'il promet.
- La connexion dans l'app installée (code reçu par e-mail) : story BUG-05.
- Toute synchronisation des favoris par compte ou par l'adresse de l'icône (décision : non).
- `needsHomeScreenForPush` et `isStandalone` : ne pas les modifier, ne pas les déplacer.
- L'écran Favoris vide : ne pas le changer (l'indice est le toast).

## Pièges connus
- Le test 2 a besoin de `page.addInitScript` **avant** `page.reload()` : `navigator.standalone`
  doit exister quand l'app démarre. Le `setupApp` du `beforeEach` a fait le premier chargement
  en mode « Safari » : aucune clé d'indice n'y a été posée (normal).
- `passWelcome` après chaque `reload` : sans lui, si l'écran de géolocalisation revient, le
  démarrage s'arrête avant l'indice.
- `showToast` disparaît en 3 s, trop court pour ce texte : utiliser `showActionToast` (8 s, « OK »),
  comme écrit. Sa classe est `.toast-action`.
- Marquer la clé **seulement** quand l'indice s'affiche (pas quand il y a déjà des favoris).
- L'invitation aux notifications ne doit **jamais** partir de `maybeHintHomeScreenFavorites` :
  pas d'appel à `maybeOfferPush` ni à `enablePush` dedans.
- Bump de **toutes** les entrées de l'import map à la **même** valeur, en partant de celle de
  `master` à jour (BUG-05 et les stories d'avant l'ont déjà montée).
- `isStandalone` est déjà exportée par BUG-05 : ne pas toucher à cette ligne, l'appeler telle quelle.

## Terminé quand
- [ ] Contrôles passés, tests écrits (échouent avant pour la raison annoncée, passent après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : non (le guide et l'indice ne sont pas des écrans du script de capture)
- [ ] Story cochée dans BACKLOG.md si elle y figure (sinon le noter dans la PR), PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `fix(notifications): iPhone, remettre son favori dans l'app de l'ecran d'accueil`

**Corps** : constat corrigé (l'app de l'écran d'accueil démarre sans les favoris, sans le dire),
cause (stockage séparé de Safari), correction (texte du guide + indice une seule fois au premier
lancement sans favori, clé `distrimatch_home_screen_seen`), tests ajoutés (unitaire de la
condition, 40b complété), sorties des commandes, rappel : à vérifier par Stéphane sur un vrai
iPhone après fusion (installer depuis Safari, ouvrir l'icône, voir l'indice, remettre le cœur,
accepter l'invitation).
