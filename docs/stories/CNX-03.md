# CNX-03 — Retour du lien de connexion : la fiche revient au bon moment, un lien expiré est annoncé

- **Lot** : 4. Connexion, retour et liens · **Gravité** : faible · **Niveau conseillé** : medium
- **Prérequis** : **CNX-02 fusionnée** dans `master` ; partir de `master` **à jour**. Sinon : s'arrêter.
- **Branche** : `fix/retour-lien-connexion` · **Taille** : 2 fichiers JS (+ `index.html`) + 2 fichiers de tests. **Aucune migration.**
- **Constats couverts** (rapport du 2026-10-21) :
  - Le retour de connexion est consommé au premier chargement venu, même sans connexion — `js/auth.js:138` (aujourd'hui `takeLoginReturn`, ligne 157 ; appel dans `js/app.js` ligne 653)
  - Lien magique expiré ou déjà utilisé : aucun message — `js/auth.js:63`

## But
La fiche retenue au moment de « Se connecter » ne se rouvre qu'au vrai retour du lien (connecté,
ou lien refusé) et jamais par-dessus un lien vers une autre fiche ; un lien expiré ou déjà utilisé
le dit, rouvre la fiche et propose tout de suite un nouvel e-mail.

## User story
En tant que visiteur qui se connecte depuis une fiche, je veux revenir sur cette fiche une fois
connecté, et savoir quand le lien reçu ne marche plus, afin de ne pas tourner en rond.

**Critères d'acceptation**
- [ ] Retour du lien (session ouverte) : la fiche retenue se rouvre et la clé `distrimatch_login_return` disparaît.
- [ ] Un chargement sans connexion (onglet rouvert, rechargement) ne rouvre rien et garde la clé.
- [ ] Un lien `?id=B` ouvre B et garde la clé de la fiche A.
- [ ] Lien refusé (`#error=...&error_code=otp_expired`) : toast « Ce lien de connexion a expiré ou a
      déjà servi : demande un nouveau lien. », fenêtre de connexion ouverte par-dessus la fiche
      retenue, adresse nettoyée (plus de `error`).

## Ce qui est déjà tranché (ne pas refaire l'analyse)
- **Quand rouvrir** : seulement si l'adresse ne porte pas déjà `id` **et** que ce chargement est le
  retour du lien : connecté (`isAuthenticated()`, `initAuth()` est attendu juste avant) ou lien
  refusé. Sinon la clé reste et expire seule (1 h, `LOGIN_RETURN_TTL`).
- **Lien refusé** : Supabase renvoie vers `<site>/#error=access_denied&error_code=otp_expired&error_description=...`
  (parfois dans la query). supabase-js ne le signale pas (`getSession` ne renvoie pas d'erreur). On
  lit ces paramètres **avant** `initSupabase()` avec une fonction pure `parseAuthLinkError(href)`
  (`js/utils.js`, testée en unitaire), on les retire de l'adresse (`history.replaceState`), puis,
  si personne n'est connecté : toast + `promptReconnect()` (fenêtre e-mail, comme une session
  expirée). Le toast et la fenêtre attendent le chargement des distributeurs, **après** la
  réouverture de la fiche (même promesse, rappel enregistré après celui de la fiche) : la fenêtre
  se pose au-dessus. Renvoyer un e-mail depuis cette fenêtre retient de nouveau la fiche.
- **Tests du vrai retour** : le lien magique ne peut pas aboutir en local. Le test ouvre un onglet
  avec une **fausse session au format supabase-js** (`fakeSession`, déjà dans `auth.spec.js` pour
  BUG-05) posée dans `localStorage` avant le chargement ; les lectures de la base partent en
  anonyme (l'en-tête `Authorization` est remplacé par la clé publique `apikey`), sinon le faux
  jeton serait refusé et l'app retomberait sur le JSON.

## Avant de coder
**Lire en entier** : `js/auth.js` lignes 130-167 et 235-245 (`promptReconnect`) ; `js/app.js` lignes
10-20, 55, 612-665 ; `js/utils.js` lignes 205-222 ; `tests/functional/auth.spec.js` lignes 1-15 et 149-237 ;
fin de `tests/unit/unit.test.js`.

**Réutiliser** : `takeLoginReturn`, `promptReconnect` (`js/auth.js`), `showToast` (déjà importé dans
`js/app.js`), `fakeSession` (`tests/functional/auth.spec.js`, déclarée plus bas dans le fichier :
une `function`, utilisable plus haut), `captureEvents`, `BASE_URL` (`tests/functional/helpers.js`).

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
grep -n "pushLayer('auth'" js/auth.js                                              # 1 ligne (CNX-02 fusionnée)
grep -n "^export function takeLoginReturn(now = Date.now()) {" js/auth.js          # 1 ligne (157)
grep -n "^export function promptReconnect() {" js/auth.js                          # 1 ligne (238)
grep -n "resetDeviceId, DISTRIBUTOR_PUBLIC_COLUMNS, PRODUCT_PUBLIC_COLUMNS$" js/app.js   # 1 ligne (15)
grep -n "^import { initAuth, getCurrentUser, isAuthenticated, requireAuth, signOut, onAuthChange, takeLoginReturn, LOGIN_RETURN_KEY } from './auth.js';" js/app.js   # 1 ligne (55)
grep -n "^    initSupabase();" js/app.js                                           # 1 ligne (616)
grep -n "    const loginReturnId = takeLoginReturn();" js/app.js                   # 1 ligne (653)
grep -n "parseAuthLinkError\|otp_expired\|error_code" js/ -r                       # aucun résultat
grep -n -A 2 "    const code = error?.code || status || '?';" js/utils.js          # 1 bloc (fin de describeSignalError, vers 220)
grep -n "^import { setupApp, openDistModal, loginForTest } from './helpers.js';" tests/functional/auth.spec.js   # 1 ligne (8)
grep -n "^test.describe('Connexion depuis une fiche', () => {" tests/functional/auth.spec.js   # 1 ligne
grep -c "await back.goto('http://localhost:8080/');" tests/functional/auth.spec.js # 2
grep -n "^function fakeSession(email) {" tests/functional/auth.spec.js             # 1 ligne
grep -o '"./js/app.js": "./js/app.js?v=[0-9]*"' index.html                         # noter V (115 attendu après CNX-02)
```

## Étapes

1. **js/utils.js** — lire un lien de connexion refusé. Juste après la fin de `describeSignalError`. Avant :
   ```js
       const code = error?.code || status || '?';
       return `Signal non envoyé, réessaie plus tard (code ${code})`;
   }
   ```
   Après :
   ```js
       const code = error?.code || status || '?';
       return `Signal non envoyé, réessaie plus tard (code ${code})`;
   }

   // Retour d'un lien de connexion refuse par Supabase (expire, deja utilise) (CNX-03) :
   // #error=access_denied&error_code=otp_expired&error_description=... (ou dans la query).
   // Renvoie { code, cleanUrl } (adresse sans ces parametres), ou null.
   const AUTH_LINK_ERROR_PARAMS = ['error', 'error_code', 'error_description'];

   export function parseAuthLinkError(href) {
       let url;
       try {
           url = new URL(href);
       } catch (e) {
           return null;
       }
       const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
       const isError = (params) => !!(params.get('error') || params.get('error_code'));
       const from = isError(hash) ? hash : (isError(url.searchParams) ? url.searchParams : null);
       if (!from) return null;
       const code = from.get('error_code') || from.get('error');
       if (from === hash) url.hash = '';
       else AUTH_LINK_ERROR_PARAMS.forEach((key) => url.searchParams.delete(key));
       return { code, cleanUrl: url.toString() };
   }
   ```

2. **js/app.js** — import de la fonction. Avant :
   ```js
   resetDeviceId, DISTRIBUTOR_PUBLIC_COLUMNS, PRODUCT_PUBLIC_COLUMNS
   ```
   Après :
   ```js
   resetDeviceId, DISTRIBUTOR_PUBLIC_COLUMNS, PRODUCT_PUBLIC_COLUMNS, parseAuthLinkError
   ```
   (C'est la fin de la ligne 15 : seule la fin change, le début de la ligne reste identique.)

3. **js/app.js** — import de `promptReconnect`. Avant :
   ```js
   import { initAuth, getCurrentUser, isAuthenticated, requireAuth, signOut, onAuthChange, takeLoginReturn, LOGIN_RETURN_KEY } from './auth.js';
   ```
   Après :
   ```js
   import { initAuth, getCurrentUser, isAuthenticated, requireAuth, signOut, onAuthChange, takeLoginReturn, LOGIN_RETURN_KEY, promptReconnect } from './auth.js';
   ```

4. **js/app.js** — lire le lien refusé avant supabase-js. Avant :
   ```js
       // Initialiser Supabase
       initSupabase();
   ```
   Après :
   ```js
       // CNX-03 : lien de connexion refuse par Supabase (expire, deja utilise) : lu et retire
       // de l'adresse AVANT supabase-js, qui le taisait ; message et nouvelle demande plus bas
       const authLinkError = parseAuthLinkError(window.location.href);
       if (authLinkError) window.history.replaceState(window.history.state, '', authLinkError.cleanUrl);

       // Initialiser Supabase
       initSupabase();
   ```

5. **js/app.js** — rouvrir la fiche seulement au vrai retour du lien. Avant :
   ```js
       // Retour du lien de connexion : la fiche ouverte a la demande est rouverte
       // (auth.js, takeLoginReturn), par le meme chemin qu'un lien partage
       const loginReturnId = takeLoginReturn();
       if (loginReturnId && !new URLSearchParams(window.location.search).get('id')) {
           const url = new URL(window.location.href);
           url.searchParams.set('id', loginReturnId);
           window.history.replaceState(window.history.state, '', url);
       }
       const deepLinkId = new URLSearchParams(window.location.search).get('id');
       if (deepLinkId) {
           distributorsPromise.then(() => openModalFromUrlParam()).catch(() => {});
       }
   ```
   Après :
   ```js
       // Retour du lien de connexion : la fiche ouverte a la demande est rouverte
       // (auth.js, takeLoginReturn), par le meme chemin qu'un lien partage.
       // CNX-03 : seulement si ce chargement EST le retour du lien (connecte, ou lien
       // refuse) et que l'adresse ne vise pas deja une fiche ; sinon la cle attend.
       const urlId = new URLSearchParams(window.location.search).get('id');
       const loginReturnId = (!urlId && (isAuthenticated() || authLinkError)) ? takeLoginReturn() : null;
       if (loginReturnId) {
           const url = new URL(window.location.href);
           url.searchParams.set('id', loginReturnId);
           window.history.replaceState(window.history.state, '', url);
       }
       const deepLinkId = new URLSearchParams(window.location.search).get('id');
       if (deepLinkId) {
           distributorsPromise.then(() => openModalFromUrlParam()).catch(() => {});
       }
       // CNX-03 : lien refuse et personne de connecte : on le dit et on propose un nouvel
       // e-mail, apres la reouverture de la fiche (rappel enregistre apres le sien)
       if (authLinkError && !isAuthenticated()) {
           distributorsPromise.catch(() => {}).then(() => {
               showToast('Ce lien de connexion a expiré ou a déjà servi : demande un nouveau lien.', 'warning');
               promptReconnect();
           });
       }
   ```

6. **index.html** — `js/utils.js` et `js/app.js` changent : monter le `?v=` de **toutes** les entrées
   de l'import map à la même valeur V+1 (V noté aux contrôles). Aucun CSS ne change.

## Tests

### Test 1 — `parseAuthLinkError` (unitaire)
- **Fichier** : `tests/unit/unit.test.js`, **à la toute fin du fichier** (après sa dernière ligne `});`).
- **Code à ajouter** :
  ```js

  // ============================================
  // LIEN DE CONNEXION REFUSE (CNX-03)
  // ============================================

  const { parseAuthLinkError } = await import('../../js/utils.js');

  describe('parseAuthLinkError (lien de connexion expire ou deja utilise, CNX-03)', () => {
      it('erreur dans le fragment : code lu, fragment retire', () => {
          assert.deepEqual(
              parseAuthLinkError('https://exemple.test/DistriMatch/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'),
              { code: 'otp_expired', cleanUrl: 'https://exemple.test/DistriMatch/' }
          );
      });

      it('erreur dans la query : seuls ses parametres sont retires', () => {
          assert.deepEqual(
              parseAuthLinkError('https://exemple.test/?id=dist-1&error=access_denied&error_code=otp_expired&error_description=x'),
              { code: 'otp_expired', cleanUrl: 'https://exemple.test/?id=dist-1' }
          );
          assert.equal(parseAuthLinkError('https://exemple.test/?error=server_error').code, 'server_error');
      });

      it('retour normal du lien, adresse simple ou invalide : null', () => {
          assert.equal(parseAuthLinkError('https://exemple.test/#access_token=abc&type=magiclink'), null);
          assert.equal(parseAuthLinkError('https://exemple.test/?id=dist-1'), null);
          assert.equal(parseAuthLinkError('pas une adresse'), null);
      });
  });
  ```
- **Doit échouer avant l'étape 1** : `parseAuthLinkError` n'existe pas (`is not a function`).

### Test 2 — retour du lien (fonctionnel)
- **Fichier** : `tests/functional/auth.spec.js`.

  a) Imports. Avant :
  ```js
  import { setupApp, openDistModal, loginForTest } from './helpers.js';
  ```
  Après :
  ```js
  import { readFileSync } from 'node:fs';
  import { setupApp, openDistModal, loginForTest, captureEvents, BASE_URL } from './helpers.js';
  ```

  b) Aide, **juste avant** la ligne `test.describe('Connexion depuis une fiche', () => {`. Code à ajouter :
  ```js
  // CNX-03 : le vrai retour du lien = l'app s'ouvre AVEC une session. Fausse session au
  // format supabase-js (fakeSession, plus bas) posee avant le chargement ; les lectures de
  // la base partent en anonyme (le faux jeton serait refuse et l'app retomberait sur le JSON).
  const SUPABASE_URL = readFileSync(new URL('../../js/config.js', import.meta.url), 'utf8').match(/SUPABASE_URL = '([^']+)'/)[1];
  const SESSION_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

  async function openWithSession(context, path = '/') {
      const page = await context.newPage();
      await page.route('**/rest/v1/**', route => {
          const headers = { ...route.request().headers() };
          if (headers.apikey) headers.authorization = `Bearer ${headers.apikey}`;
          return route.continue({ headers });
      });
      await captureEvents(page);   // apres la route generale : elle passe avant pour log_event
      await page.route('**/auth/v1/user**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeSession('test@exemple.fr').user) }));
      await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [SESSION_KEY, JSON.stringify(fakeSession('test@exemple.fr'))]);
      await page.goto(`${BASE_URL}${path}`);
      return page;
  }

  ```

  c) Les deux tests existants simulent le retour par un simple chargement : ils passent par
  `openWithSession`. Remplacer **les deux** occurrences (`grep -c` = 2 aux contrôles). Avant :
  ```js
          const back = await context.newPage();
          await back.goto('http://localhost:8080/');
  ```
  Après :
  ```js
          const back = await openWithSession(context);
  ```

  d) Nouveaux tests, dans `test.describe('Connexion depuis une fiche'`, **juste après** le test
  `sans fiche ouverte, rien n est retenu` : son bloc se termine par ces lignes (uniques ensemble). Avant :
  ```js
          await page.evaluate(async () => { await (await import('./js/auth.js')).sendMagicLink('test@exemple.fr', 'jeton'); });
          expect(await page.evaluate(() => localStorage.getItem('distrimatch_login_return'))).toBeNull();
      });
  ```
  Après :
  ```js
          await page.evaluate(async () => { await (await import('./js/auth.js')).sendMagicLink('test@exemple.fr', 'jeton'); });
          expect(await page.evaluate(() => localStorage.getItem('distrimatch_login_return'))).toBeNull();
      });

      test('chargement sans connexion : la fiche ne se rouvre pas, elle attend le vrai retour (CNX-03)', async ({ page, context }) => {
          await page.evaluate(() => localStorage.setItem('distrimatch_login_return', JSON.stringify({ id: 'dist-007', at: Date.now() })));
          const other = await context.newPage();
          await captureEvents(other);
          await other.goto(BASE_URL);
          await other.waitForFunction(() => window.AppState?.mapInitialized === true, null, { timeout: 50000 });
          await other.waitForTimeout(1000);
          await expect(other.locator('#dist-modal-overlay')).not.toHaveClass(/active/);
          expect(JSON.parse(await other.evaluate(() => localStorage.getItem('distrimatch_login_return')))?.id).toBe('dist-007');
      });

      test('lien vers une autre fiche (?id=) : elle s’ouvre, la fiche retenue attend (CNX-03)', async ({ page, context }) => {
          await page.evaluate(() => localStorage.setItem('distrimatch_login_return', JSON.stringify({ id: 'dist-007', at: Date.now() })));
          const other = await openWithSession(context, '/?id=dist-005');
          await other.waitForSelector('#dist-modal-overlay.active', { timeout: 30000 });
          await expect(other.locator('#dist-modal-name')).toHaveText('Plats Cuisinés Bayonne');
          expect(JSON.parse(await other.evaluate(() => localStorage.getItem('distrimatch_login_return')))?.id).toBe('dist-007');
      });

      test('lien expire ou deja utilise : message, fenetre de connexion, fiche rouverte, adresse nettoyee (CNX-03)', async ({ page, context }) => {
          await page.evaluate(() => {
              localStorage.setItem('distrimatch_force_auth', '1');
              localStorage.setItem('distrimatch_login_return', JSON.stringify({ id: 'dist-007', at: Date.now() }));
          });
          const back = await context.newPage();
          await captureEvents(back);
          await back.goto(`${BASE_URL}/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
          await expect(back.locator('#toast-container .toast.warning')).toContainText('Ce lien de connexion a expiré ou a déjà servi', { timeout: 30000 });
          await expect(back.locator('.auth-modal-overlay')).toBeVisible();
          await expect(back.locator('#dist-modal-name')).toHaveText('Légumes Bio Cambo');
          expect(back.url()).not.toContain('error');
      });
  ```
- **Doivent échouer avant les étapes 4-5** : « chargement sans connexion », la fiche s'ouvre et la clé
  est effacée ; « autre fiche », la clé est effacée ; « lien expiré », aucun toast. Les deux tests
  existants modifiés passent avant **et** après.

## Vérification (dans l'ordre)
```bash
node --check js/utils.js && node --check js/app.js                          # aucune sortie
npm test                                                                    # tout vert, dont « parseAuthLinkError » et « cache-busting »
npx playwright test --project=functional -g "Connexion depuis une fiche"    # 6 passed (2 existants modifiés + 3 nouveaux + menu du profil)
npx playwright test --project=functional -g "Connexion par code|CNX-02|Auth wall|Politique d|Deep link"   # tout vert
npm run test:functional                                                     # en arrière-plan (~10 min) : tout vert, instables notés dans la PR
git diff --stat                                                             # utils.js, app.js, index.html, unit.test.js, auth.spec.js (+ BACKLOG.md)
```

## Hors périmètre
- Remplacer le lien par un code seul contre les antivirus de messagerie : le code existe déjà
  (BUG-05) ; changer le modèle d'e-mail Supabase est une action de Stéphane.
- Faire suivre l'origine « QR » au retour du lien : **CNX-06**.
- Le texte de la fenêtre de connexion et les erreurs d'envoi en anglais : **CNX-07**.
- Le coup de pouce sur place à la réouverture de la fiche : **CNX-04**.

## Pièges connus
- Étape 4 : l'appel à `parseAuthLinkError` **avant** `initSupabase()`, pas après `initAuth()` :
  supabase-js lit l'adresse dès sa création.
- Étape 5 : `.catch(() => {}).then(...)` dans cet ordre (le rappel tourne même si le chargement a
  échoué). Ne pas mettre ce bloc avant celui de `deepLinkId` : la fenêtre passerait sous la fiche
  dans la pile d'historique.
- `showToast(..., 'warning')` : le type `warning` existe déjà (`gmaps-ui.js`).
- Test 2 b) : `SUPABASE_URL` et `SESSION_KEY` sont de nouveaux noms dans `auth.spec.js`
  (`grep -n "SUPABASE_URL\|SESSION_KEY" tests/functional/auth.spec.js` ne doit rien trouver avant).
  Si l'un existe déjà : s'arrêter et signaler.
- `openWithSession` enregistre la route générale **avant** `captureEvents` : Playwright essaie les
  routes de la plus récente à la plus ancienne ; dans l'autre ordre, la mesure partirait au vrai serveur.
- Fichiers en CRLF : outil Edit ; si un bloc refuse, petit script Node dans le scratchpad (voir README).
- Bump de **toutes** les entrées de l'import map à la **même** valeur.

## Terminé quand
- [ ] Contrôles passés, tests écrits (échouent avant, passent après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : non (le parcours passe par un e-mail ; couvert par les tests)
- [ ] Story cochée dans BACKLOG.md si elle y figure (sinon le noter dans la PR), PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `fix(connexion): la fiche revient au vrai retour du lien, un lien expire est annonce`

**Corps** : constats couverts ; causes (clé consommée à chaque chargement, même sans connexion ou
avec `?id=` ; erreur du lien jamais lue) ; correction (condition de consommation ; lecture de
`#error=...` avant supabase-js, toast + fenêtre de connexion) ; texte nouveau montré aux membres
(le toast) ; tests ajoutés et adaptés (les deux tests existants ouvrent désormais un onglet avec
session) ; sorties des commandes de vérification.
