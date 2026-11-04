# CNX-06 — Liens et QR : adresse nettoyée avant la fiche, origine « QR » limitée au scan

- **Lot** : 4. Connexion, retour et liens · **Gravité** : moyen · **Niveau conseillé** : medium
- **Prérequis** : **CNX-05 fusionnée** dans `master` ; partir de `master` **à jour**. Sinon : s'arrêter.
- **Branche** : `fix/mesure-qr` · **Taille** : 3 fichiers JS (+ `index.html`) + 2 fichiers de tests. **Aucune migration.**
- **Constats couverts** (rapport du 2026-10-21) :
  - Fermer une fiche ouverte par lien ou QR remet `?id=…&src=qr` dans l'URL : un rechargement rouvre la fiche et recompte un scan — `js/app.js:538` (cause dans `js/gmaps-ui.js`, `openModalFromUrlParam`, ligne 416)
  - La source « qr » se perd au retour du lien de connexion : les signaux venus d'un QR comptent comme « organic » — `js/events.js:29`
  - Mesure du pilote : la source « qr » reste attachée à l'onglet, et toute l'activité suivante compte comme venue d'un QR — `js/events.js:45`

## But
Fermer la fiche d'un QR et recharger ne rouvre plus la fiche ni ne recompte un scan ; un signal
compte « via QR » seulement s'il porte sur le distributeur scanné, dans les 2 h, y compris dans
l'onglet ouvert par le lien de connexion. Le taux « scans QR → signal » du tableau de bord devient juste.

## User story
En tant qu'équipe du pilote, je veux que le taux « signaux via QR / scans » compte chaque scan une
fois et chaque signal du bon distributeur, afin de décider du go / no-go sur un chiffre juste.

**Critères d'acceptation**
- [ ] Fiche ouverte par `?id=X&confirm=1&src=qr`, fermée par la croix : l'adresse est la page de base.
      Un rechargement ne rouvre pas la fiche et n'envoie pas de second `qr_scan`.
- [ ] Après un scan de X : `signal_envoye` sur X part en `qr` pendant 2 h, sur Y en `organic`.
- [ ] Plus de 2 h après : tout part en `organic` et l'origine retenue est effacée.
- [ ] L'onglet ouvert par le lien de connexion (nouvelle session d'onglet) garde l'origine `qr` pour X.
- [ ] « Effacer mes données » efface aussi l'origine retenue.

## Ce qui est déjà tranché (ne pas refaire l'analyse)
- **Adresse** : `openModalFromUrlParam` nettoyait l'adresse **après** `openDistributorModal`, donc
  après le `pushLayer('fiche')` : seule l'entrée de la fiche était propre, l'entrée de départ gardait
  `?id=…&src=qr`. Fermer la fiche y revenait. On nettoie **avant** d'ouvrir la fiche, en gardant
  l'état d'historique (`replaceState(window.history.state, …)`). Aucune déduplication côté base.
- **Origine** : `distrimatch_src` passe de `sessionStorage` (chaîne `'qr'`) à `localStorage`
  (`{ src, distributorId, at }`), partagé entre onglets (retour du lien de connexion) et borné à 2 h
  (`ENTRY_SOURCE_TTL`). `getEntrySource(distributorId)` rend `qr` seulement dans les 2 h et, pour un
  événement lié à un distributeur, seulement si c'est celui du scan ; une origine périmée est effacée
  à la lecture. `buildEventArgs` passe le distributeur de l'événement : `availability.js`
  (`signal_envoye`) n'a pas à changer.
- `fiche_ouverte` garde sa source explicite (`modalOpenSource`) : la réouverture au retour du lien
  (adresse sans `src`) compte en `organic`, pas de second `fiche_ouverte` « qr » pour la même visite.
- La clé locale est ajoutée à la liste de « Effacer mes données » (`clearUserData`, `js/app.js`) :
  la page Confidentialité dit que ce qui est sur le téléphone y reste jusqu'à ce bouton. Aucun
  identifiant n'y est stocké (PRIV-05 respectée : rien n'est envoyé de plus).

## Avant de coder
**Lire en entier** : `js/events.js` (89 lignes) ; `js/gmaps-ui.js` lignes 405-460 ; `js/app.js` lignes
19 et 263-285 ; `tests/unit/unit.test.js` lignes 40-45 et 170-260 ; `tests/functional/fiche.spec.js`
lignes 553-600.

**Réutiliser** : `rememberEntrySource`, `getEntrySource`, `buildEventArgs` (`js/events.js`),
`captureEvents`, `EVENTS_ROUTE`, `BASE_URL` (déjà importés dans `fiche.spec.js`).

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
grep -n "branche plus haut, apres initDistModal (CNX-05)" js/app.js               # 1 ligne (CNX-05 fusionnée)
grep -n -A 7 "^export function rememberEntrySource(search) {" js/events.js       # 28-37 : identique à l'étape 1
grep -n "        p_source: source || getEntrySource()" js/events.js             # 1 ligne (77)
grep -n "getEntrySource" js/ -r                                                 # seulement js/events.js
grep -n "        window.history.replaceState(null, '', window.location.pathname);" js/gmaps-ui.js   # 1 ligne (438)
grep -n "^import { logEvent, rememberEntrySource } from './events.js';" js/app.js   # 1 ligne (19)
grep -n "        USER_DISTRIBUTORS_KEY, PUSH_ASKED_KEY, HOME_SCREEN_SEEN_KEY, LOGIN_RETURN_KEY, EDIT_HINT_KEY, GEO_OK_KEY" js/app.js   # 1 ligne (278)
grep -n "^import { buildEventArgs, logEvent, rememberEntrySource, getEntrySource, EVENT_TYPES, ENTRY_SOURCE_KEY, getSessionId, SESSION_ID_KEY } from '../../js/events.js';" tests/unit/unit.test.js   # 1 ligne (42)
grep -n "    beforeEach(() => { sessionStorage.clear(); setSupabaseClient(null); });" tests/unit/unit.test.js   # 1 ligne (177)
grep -n "        assert.equal(sessionStorage.getItem(ENTRY_SOURCE_KEY), 'qr');" tests/unit/unit.test.js   # 1 ligne (234)
grep -n "        const src = await page.evaluate(() => sessionStorage.getItem('distrimatch_src'));" tests/functional/fiche.spec.js   # 1 ligne (573)
grep -n "        await expect(page.locator('#dist-machine-choices')).toBeHidden();" tests/functional/fiche.spec.js   # 8 lignes ; seule celle de 13bis (vers 595) est suivie de « await context.close(); » puis de la fin du describe : le bloc de 4 lignes du test 2 b) est unique
grep -o '"./js/app.js": "./js/app.js?v=[0-9]*"' index.html                     # noter V (118 attendu après CNX-05)
```

## Étapes

1. **js/events.js** — origine retenue pour le distributeur scanné, 2 h, entre onglets. Avant :
   ```js
   // Memorise l'origine de la visite (&src=qr) pour la session, avant tout
   // nettoyage d'URL. Retourne la source lue, ou null si l'URL n'en porte pas.
   export function rememberEntrySource(search) {
       const src = new URLSearchParams(search || '').get('src');
       if (!src) return null;
       try { sessionStorage.setItem(ENTRY_SOURCE_KEY, src); } catch (e) { /* sessionStorage indisponible */ }
       return src;
   }

   export function getEntrySource() {
       try { return sessionStorage.getItem(ENTRY_SOURCE_KEY) || DEFAULT_SOURCE; } catch (e) { return DEFAULT_SOURCE; }
   }
   ```
   Après :
   ```js
   // CNX-06 : une arrivee par QR (&src=qr) vaut pour le distributeur scanne et pendant 2 h,
   // y compris dans l'onglet ouvert par le lien de connexion (localStorage, partage entre
   // onglets). Avant : la session de l'onglet entier, donc tout signal ulterieur, sur
   // n'importe quel distributeur, comptait « via QR » ; et l'onglet du lien la perdait.
   export const ENTRY_SOURCE_TTL = 2 * 60 * 60 * 1000;

   // Memorise l'origine de la visite avant tout nettoyage d'URL. Retourne la source
   // lue, ou null si l'URL n'en porte pas.
   export function rememberEntrySource(search, now = Date.now()) {
       const params = new URLSearchParams(search || '');
       const src = params.get('src');
       if (!src) return null;
       try {
           localStorage.setItem(ENTRY_SOURCE_KEY, JSON.stringify({ src, distributorId: params.get('id') || null, at: now }));
       } catch (e) { /* stockage indisponible */ }
       return src;
   }

   // Source d'un evenement : celle de l'arrivee si elle date de moins de 2 h et, pour un
   // evenement lie a un distributeur, si c'est celui du scan ; sinon 'organic'.
   export function getEntrySource(distributorId = null, now = Date.now()) {
       try {
           const entry = JSON.parse(localStorage.getItem(ENTRY_SOURCE_KEY) || 'null');
           if (!entry?.src) return DEFAULT_SOURCE;
           if (!(now - entry.at < ENTRY_SOURCE_TTL)) {
               localStorage.removeItem(ENTRY_SOURCE_KEY);   // perimee : rien ne reste sur le telephone
               return DEFAULT_SOURCE;
           }
           if (distributorId && entry.distributorId && distributorId !== entry.distributorId) return DEFAULT_SOURCE;
           return entry.src;
       } catch (e) {
           return DEFAULT_SOURCE;
       }
   }
   ```

2. **js/events.js**, `buildEventArgs` — la source suit le distributeur de l'événement. Avant :
   ```js
           p_source: source || getEntrySource()
   ```
   Après :
   ```js
           p_source: source || getEntrySource(distributorId)
   ```

3. **js/gmaps-ui.js**, `openModalFromUrlParam` — nettoyer l'adresse AVANT d'ouvrir la fiche. Avant :
   ```js
       const src = rememberEntrySource(window.location.search);

       if (AppState.distributors.find(d => d.id === id)) {
           modalOpenSource = src || 'organic';
           openDistributorModal(id);
           // &confirm=1 : le QR colle sur la machine mene a la liste « Il reste
           // quoi ? » (ou a l'etat de la machine si elle n'a pas de produit).
           if (params.get('confirm') === '1') focusSignalFromQr();
       } else {
           showToast('Distributeur introuvable', 'error');
       }

       // Nettoyer l'URL pour eviter une re-ouverture au rafraichissement
       if (window.history && window.history.replaceState) {
           window.history.replaceState(null, '', window.location.pathname);
       }
   }
   ```
   Après :
   ```js
       const src = rememberEntrySource(window.location.search);

       // Nettoyer l'URL pour eviter une re-ouverture au rafraichissement. CNX-06 : AVANT
       // d'ouvrir la fiche, qui pousse sa propre entree d'historique avec l'adresse du
       // moment ; nettoyee apres, l'entree de depart gardait ?id=...&src=qr, et fermer la
       // fiche (retour a cette entree) puis recharger rouvrait la fiche et recomptait un scan.
       if (window.history && window.history.replaceState) {
           window.history.replaceState(window.history.state, '', window.location.pathname);
       }

       if (AppState.distributors.find(d => d.id === id)) {
           modalOpenSource = src || 'organic';
           openDistributorModal(id);
           // &confirm=1 : le QR colle sur la machine mene a la liste « Il reste
           // quoi ? » (ou a l'etat de la machine si elle n'a pas de produit).
           if (params.get('confirm') === '1') focusSignalFromQr();
       } else {
           showToast('Distributeur introuvable', 'error');
       }
   }
   ```

4. **js/app.js** — import de la clé. Avant :
   ```js
   import { logEvent, rememberEntrySource } from './events.js';
   ```
   Après :
   ```js
   import { logEvent, rememberEntrySource, ENTRY_SOURCE_KEY } from './events.js';
   ```

5. **js/app.js**, `clearUserData` — « Effacer mes données » efface l'origine retenue. Avant :
   ```js
           USER_DISTRIBUTORS_KEY, PUSH_ASKED_KEY, HOME_SCREEN_SEEN_KEY, LOGIN_RETURN_KEY, EDIT_HINT_KEY, GEO_OK_KEY
   ```
   Après :
   ```js
           USER_DISTRIBUTORS_KEY, PUSH_ASKED_KEY, HOME_SCREEN_SEEN_KEY, LOGIN_RETURN_KEY, EDIT_HINT_KEY, GEO_OK_KEY, ENTRY_SOURCE_KEY
   ```

6. **index.html** — trois modules JS changent : monter le `?v=` de **toutes** les entrées de l'import
   map à la même valeur V+1. Aucun CSS ne change.

## Tests

### Test 1 — origine « QR » (unitaire)
- **Fichier** : `tests/unit/unit.test.js`.

  a) Import. Avant :
  ```js
  import { buildEventArgs, logEvent, rememberEntrySource, getEntrySource, EVENT_TYPES, ENTRY_SOURCE_KEY, getSessionId, SESSION_ID_KEY } from '../../js/events.js';
  ```
  Après :
  ```js
  import { buildEventArgs, logEvent, rememberEntrySource, getEntrySource, EVENT_TYPES, ENTRY_SOURCE_KEY, ENTRY_SOURCE_TTL, getSessionId, SESSION_ID_KEY } from '../../js/events.js';
  ```

  b) Remise à zéro entre deux tests. Avant :
  ```js
      beforeEach(() => { sessionStorage.clear(); setSupabaseClient(null); });
  ```
  Après :
  ```js
      beforeEach(() => { sessionStorage.clear(); localStorage.removeItem(ENTRY_SOURCE_KEY); setSupabaseClient(null); });
  ```

  c) Test existant « la source suit l'origine… » : l'origine est désormais en `localStorage`. Avant :
  ```js
          assert.equal(sessionStorage.getItem(ENTRY_SOURCE_KEY), 'qr');
  ```
  Après :
  ```js
          assert.equal(JSON.parse(localStorage.getItem(ENTRY_SOURCE_KEY)).src, 'qr');
  ```

  d) Nouveau test, **juste après** le test existant `logEvent sans client Supabase : no-op silencieux`.
  Avant (fin de ce test, 3 lignes uniques ensemble) :
  ```js
      it('logEvent sans client Supabase : no-op silencieux', () => {
          assert.doesNotThrow(() => logEvent('app_ouverte'));
      });
  ```
  Après :
  ```js
      it('logEvent sans client Supabase : no-op silencieux', () => {
          assert.doesNotThrow(() => logEvent('app_ouverte'));
      });

      it('CNX-06 : « qr » vaut pour le distributeur scanne, 2 h, et dans l’onglet du lien de connexion', () => {
          const t0 = Date.now();
          assert.equal(rememberEntrySource('?id=dist-001&confirm=1&src=qr', t0), 'qr');
          assert.equal(JSON.parse(localStorage.getItem(ENTRY_SOURCE_KEY)).distributorId, 'dist-001');
          assert.equal(getEntrySource(null, t0 + 1000), 'qr');                 // app_ouverte de la meme visite
          assert.equal(getEntrySource('dist-001', t0 + 1000), 'qr');
          assert.equal(getEntrySource('dist-002', t0 + 1000), 'organic');      // autre distributeur
          assert.equal(buildEventArgs('signal_envoye', { distributorId: 'dist-002' }).p_source, 'organic');
          assert.equal(buildEventArgs('signal_envoye', { distributorId: 'dist-001' }).p_source, 'qr');
          sessionStorage.clear();                                               // onglet ouvert par le lien de connexion
          assert.equal(getEntrySource('dist-001', t0 + 1000), 'qr');
          assert.equal(getEntrySource('dist-001', t0 + ENTRY_SOURCE_TTL + 1), 'organic');   // plus de 2 h
          assert.equal(localStorage.getItem(ENTRY_SOURCE_KEY), null);           // perimee : effacee
      });
  ```
- **Doit échouer avant l'étape 1** : tout le fichier `unit.test.js` est refusé au chargement
  (« does not provide an export named 'ENTRY_SOURCE_TTL' ») : c'est l'échec attendu. Une fois
  l'étape 1 faite, le test d) et le test c) modifié passent.

### Test 2 — fermer puis recharger (fonctionnel)
- **Fichier** : `tests/functional/fiche.spec.js`, `test.describe('13bis. Deep link QR (&confirm=1&src=qr)'`.

  a) Test existant « visiteur : ouvre la fiche… ». Avant :
  ```js
          const src = await page.evaluate(() => sessionStorage.getItem('distrimatch_src'));
          expect(src).toBe('qr');
  ```
  Après :
  ```js
          const src = await page.evaluate(() => JSON.parse(localStorage.getItem('distrimatch_src') || 'null'));
          expect(src).toMatchObject({ src: 'qr', distributorId: firstId });
  ```

  b) Nouveau test, **juste après** le test `QR en visiteur sur une machine sans produit…`. Avant
  (fin de ce test, 4 lignes uniques ensemble) :
  ```js
          await expect(page.locator('#dist-machine-choices')).toBeHidden();
          await context.close();
      });
  });
  ```
  Après :
  ```js
          await expect(page.locator('#dist-machine-choices')).toBeHidden();
          await context.close();
      });

      test('fermer la fiche du QR puis recharger : adresse propre, la fiche ne revient pas, un seul scan (CNX-06)', async ({ browser }) => {
          const context = await browser.newContext();
          await context.route(EVENTS_ROUTE, route => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
          const page = await context.newPage();
          const events = await captureEvents(page);
          await page.goto(`${BASE_URL}/?id=dist-007&confirm=1&src=qr`);
          await page.waitForSelector('#dist-modal-overlay.active', { timeout: 50000 });
          await page.click('#dist-modal-close');
          await expect(page.locator('#dist-modal-overlay')).not.toHaveClass(/active/);
          await expect.poll(() => page.url()).toBe(`${BASE_URL}/`);
          await page.reload();
          await page.waitForFunction(() => window.AppState?.distributors?.length > 0, null, { timeout: 50000 });
          await page.waitForTimeout(1500);
          await expect(page.locator('#dist-modal-overlay')).not.toHaveClass(/active/);
          expect(events.filter(e => e.type === 'qr_scan')).toHaveLength(1);
          await context.close();
      });
  });
  ```
- **Doit échouer avant l'étape 3** : après la croix, l'adresse redevient `/?id=dist-007&confirm=1&src=qr`.

## Vérification (dans l'ordre)
```bash
node --check js/events.js && node --check js/gmaps-ui.js && node --check js/app.js   # aucune sortie
grep -n "sessionStorage" js/events.js                       # seulement getSessionId (identifiant de session, PRIV-05)
npm test                                                    # tout vert, dont « CNX-06 » et « cache-busting »
npx playwright test --project=functional -g "13bis|Deep link|CNX-03|Mesure|mesure"   # tout vert
npm run test:functional                                     # en arrière-plan (~10 min) : tout vert, instables notés dans la PR
git diff --stat                                             # events.js, gmaps-ui.js, app.js, index.html, unit.test.js, fiche.spec.js (+ BACKLOG.md)
```

## Hors périmètre
- Déduplication côté base (`log_event` : un seul `qr_scan` par session et par distributeur) :
  pas de migration dans ce lot. À proposer si le tableau de bord montre encore des doublons.
- Remettre la mise en avant « QR » (`&confirm=1`) au retour du lien de connexion : la fiche se
  rouvre en mode membre, la liste est directement touchable.
- La page Confidentialité : son texte (« Sur ton téléphone : jusqu'à Effacer mes données ») reste exact.

## Pièges connus
- Étape 1 : `!(now - entry.at < ENTRY_SOURCE_TTL)` couvre aussi un `at` absent ou illisible (`NaN`).
- Étape 3 : `replaceState(window.history.state, …)` et non `null` : l'état de l'entrée est gardé.
  Le bloc de nettoyage **monte** au-dessus du `if` ; il n'en reste qu'un dans la fonction.
- Test 1 b) : sans la remise à zéro de `localStorage`, le test « arguments nommés… source organic
  par défaut » lirait l'origine laissée par un autre test.
- Fichiers en CRLF : outil Edit ; si un bloc refuse, petit script Node dans le scratchpad (voir README).
- Bump de **toutes** les entrées de l'import map à la **même** valeur.

## Terminé quand
- [ ] Contrôles passés, tests écrits (échouent avant, passent après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : non (aucun écran ne change)
- [ ] Story cochée dans BACKLOG.md si elle y figure (sinon le noter dans la PR), PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `fix(mesure): adresse du QR nettoyee avant la fiche, origine QR limitee au distributeur scanne`

**Corps** : constats couverts ; causes (adresse nettoyée après le `pushState` de la fiche ; origine
gardée pour tout l'onglet et perdue par l'onglet du lien de connexion) ; correction ; effet sur le
tableau de bord (scans et signaux via QR comptés juste ; les chiffres passés ne sont pas corrigés) ;
tests ajoutés et adaptés ; sorties des commandes de vérification.
