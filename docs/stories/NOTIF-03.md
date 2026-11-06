# NOTIF-03 — Une seule alerte par changement

- **Lot** : 5. Notifications · **Gravité** : faible · **Niveau conseillé** : medium
- **Prérequis** : **NOTIF-02 fusionnée** dans `master` ; partir de `master` **à jour**. Sinon : s'arrêter
  (NOTIF-02 modifie aussi `js/favorites-watch.js` et les tests de la veille des favoris).
- **Branche** : `fix/une-alerte-par-changement` · **Taille** : 3 fichiers JS (+ `index.html`) + 2 fichiers de tests. **Aucune migration.**
- **Constats couverts** (rapport du 2026-10-21) :
  - Notifications app fermée actives : chaque changement de favori alerte deux fois (push du serveur, puis veille de l'app) — `js/notifications.js:225` (aujourd'hui lignes 219-241, `sendNotification`)
  - Le délai d'1 h partagé avec les alertes de proximité retarde ou fait perdre les notifications de favoris — `js/favorites-watch.js:92` (aujourd'hui `js/notifications.js:32-43` et `:116`)
  - Deux instances : son propre signal est notifié par l'autre onglet, et chaque changement de favori est notifié deux fois — `js/favorites-watch.js:86`. **En grande partie déjà corrigé par BUG-13** : l'écouteur `storage` de `js/app.js` (`handleStorageFromOtherTab`) relit `NotificationPrefs` quand un autre onglet écrit. Reste à traiter ici : le contrôle qui part avant que l'événement `storage` de l'autre onglet soit arrivé (onglet gelé puis réveillé, deux fenêtres visibles qui contrôlent en même temps).

## But
Un changement sur un favori (vide, en panne, produit dispo) ne fait plus sonner le téléphone deux
fois, et une alerte de proximité ne retarde plus d'une heure l'alerte d'un favori.

## User story
En tant que membre qui suit un favori, je veux une seule alerte par changement, afin de ne pas être
dérangé deux fois pour la même chose.

**Critères d'acceptation**
- [ ] Notifications app fermée actives (réglage accepté + permission accordée) : un changement de
      favori vu par l'app ouverte ajoute **une ligne non lue** au centre et la pastille, **sans**
      notification système, ni bandeau, ni vibration, ni mise en file pendant les heures calmes.
- [ ] Notifications app fermée inactives : comportement inchangé (notification système ou bandeau).
- [ ] Une alerte de proximité envoyée à l'instant n'empêche plus l'alerte d'un changement du même
      favori, et inversement.
- [ ] Deux onglets : un changement déjà enregistré par l'autre onglet n'est pas notifié une seconde
      fois, même si l'événement `storage` n'est pas encore arrivé.

## Ce qui est déjà tranché (ne pas refaire l'analyse)
- **Doublon push serveur + veille de l'app** : nouvelle fonction `isPushActive()` dans `js/push.js`
  (`isPushSupported() && NotificationPrefs.push === true && permission() === 'granted'`). Quand elle
  est vraie, `notifyFavoriteEvent` appelle `sendNotification(notification, { silent: true })` :
  historique + pastille (ou liste rafraîchie si la page Notifications est ouverte) + délai noté, mais
  ni `new Notification`, ni bandeau, ni `navigator.vibrate`. Les heures calmes ne mettent plus en file
  dans ce cas : le serveur les applique déjà (`p_quiet_start` / `p_quiet_end` envoyés par
  `subscriptionParams`). Pas de vérification asynchrone `pushManager.getSubscription()` : un
  abonnement disparu est le sujet de NOTIF-05 (recréation). Les alertes de **proximité** ne sont pas
  concernées (le serveur n'en envoie pas) : elles alertent comme avant.
- **Délais séparés** : on garde un seul objet `NotificationPrefs.lastNotifications` (déjà remis à zéro
  par « Effacer mes données » et relu par BUG-13 : aucun autre fichier à toucher). Clé `<id>` pour un
  changement (comme avant : données enregistrées et tests existants restent valables), clé
  `proximity:<id>` pour la proximité. `canNotify(id, kind = 'change')` / `markNotified(id, kind = 'change')` ;
  `sendNotification` passe `'proximity'` si `notif.type === 'proximity'`, sinon `'change'`.
  `js/favorites-watch.js` garde `canNotify(id)` (défaut `'change'`) : rien à y changer pour ce point.
- **Deux onglets** : ni BroadcastChannel ni verrou dédié. Le plus simple : l'état vu partagé est déjà
  dans `localStorage` (`snackmatch_notification_prefs`, enregistré à chaque contrôle). Dans
  `checkFavoriteUpdates`, **juste avant de comparer** (après la lecture réseau), on relit
  `lastSeenSignals` du stockage et on le fusionne dans la mémoire (`Object.assign` : l'enregistré
  gagne, les entrées seulement en mémoire restent). Relecture et comparaison se font dans la même
  tâche synchrone : l'autre onglet ne peut plus se glisser entre les deux. Le silence après son
  propre signal passe aussi, puisque l'onglet émetteur enregistre l'état sans notifier. Hors
  d'atteinte (accepté) : l'app de l'écran d'accueil iPhone et Safari n'ont pas le même stockage.
- Aucun texte d'interface ajouté ou modifié.

## Avant de coder
**Lire en entier** : `js/notifications.js` lignes 1-260 ; `js/favorites-watch.js` ; `js/push.js`
lignes 1-90 ; `js/app.js` `handleStorageFromOtherTab` (vers la ligne 559, BUG-13, à ne pas modifier) ;
`tests/integration/dom.test.js` bloc `checkFavoriteUpdates (un favori notifie quand sa machine change)`
(vers la ligne 641) ; `tests/functional/notifications.spec.js` lignes 1-12 et 96-160.

**Réutiliser** (ne pas réécrire) : `isPushSupported`, `permission` (`js/push.js`) ; `loadStore`
(`js/utils.js`) ; `NOTIFICATION_PREFS_KEY` (`js/state.js`) ; `processQueuedNotifications`, `canNotify`
(`js/notifications.js`, pour les tests) ; `setupApp` (`tests/functional/helpers.js`, déjà importé).

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
grep -n "^export function canNotify(distributorId) {" js/notifications.js                 # 1 ligne (32 environ)
grep -n "^export function markNotified(distributorId) {" js/notifications.js              # 1 ligne (40 environ)
grep -n "            if (canNotify(id)) {" js/notifications.js                             # 1 ligne (116 environ, checkNearbySubscriptions)
grep -n "    if (event.product) notification.product = event.product;" js/notifications.js  # 1 ligne (167 environ)
grep -n "^function sendNotification(notif) {" js/notifications.js                         # 1 ligne
grep -n "    if (supported && Notification.permission === 'granted') {" js/notifications.js  # 1 ligne
grep -n "    if (navigator.vibrate) {" js/notifications.js                                   # 1 ligne
grep -n "    markNotified(notif.distributorId);" js/notifications.js                         # 1 ligne
grep -n "^import { syncPushSubscription, refreshPushSettings } from './push.js';" js/notifications.js   # 1 ligne
grep -n "^function permission() {" js/push.js                                               # 1 ligne
grep -rn "isPushActive\|cooldownKey" js tests                                              # aucun résultat
grep -n "^import { AppState, NotificationPrefs, supabaseClient } from './state.js';" js/favorites-watch.js   # 1 ligne (voir Pièges si NOTIF-02 l'a complétée)
grep -n "^import { diffFavoriteSignals, saveNotificationPrefs } from './utils.js';" js/favorites-watch.js    # 1 ligne (idem)
grep -n "        if (!NotificationPrefs.lastSeenSignals) NotificationPrefs.lastSeenSignals = {};" js/favorites-watch.js   # 1 ligne
grep -n "        const seen = NotificationPrefs.lastSeenSignals;" js/favorites-watch.js     # 1 ligne, juste sous la précédente
grep -n "            if (event && !canNotify(id)) continue;" js/favorites-watch.js          # 1 ligne (inchangée par cette story)
grep -n "window.addEventListener('storage', handleStorageFromOtherTab);" js/app.js          # 1 ligne (BUG-13 présent)
grep -n "^describe('checkFavoriteUpdates (un favori notifie quand sa machine change)'" tests/integration/dom.test.js   # 1 ligne
grep -n "processQueuedNotifications" tests/integration/dom.test.js                          # aucun résultat
grep -n "NOTIF-03" tests/functional/notifications.spec.js tests/integration/dom.test.js     # aucun résultat
grep -o '"./js/app.js": "./js/app.js?v=[0-9]*"' index.html                                 # noter V (123 avant NOTIF-01/02 ; plus grand ensuite)
```

## Étapes

1. **js/notifications.js** — deux délais distincts. Avant :
   ```js
   export function canNotify(distributorId) {
       const lastNotif = NotificationPrefs.lastNotifications[distributorId];
       if (!lastNotif) return true;

       const hoursSince = (Date.now() - lastNotif) / (1000 * 60 * 60);
       return hoursSince >= 1;
   }

   export function markNotified(distributorId) {
       NotificationPrefs.lastNotifications[distributorId] = Date.now();
       saveNotificationPrefs();
   }
   ```
   Après :
   ```js
   // NOTIF-03 : deux delais d'1 h distincts par distributeur. 'change' (vide, en panne,
   // produit dispo : cle = id, comme avant) et 'proximity' (cle 'proximity:<id>').
   // L'alerte de proximite, repetitive, ne retarde plus un changement de favori.
   function cooldownKey(distributorId, kind) {
       return kind === 'proximity' ? `proximity:${distributorId}` : distributorId;
   }

   export function canNotify(distributorId, kind = 'change') {
       const lastNotif = NotificationPrefs.lastNotifications[cooldownKey(distributorId, kind)];
       if (!lastNotif) return true;

       const hoursSince = (Date.now() - lastNotif) / (1000 * 60 * 60);
       return hoursSince >= 1;
   }

   export function markNotified(distributorId, kind = 'change') {
       NotificationPrefs.lastNotifications[cooldownKey(distributorId, kind)] = Date.now();
       saveNotificationPrefs();
   }
   ```

2. **js/notifications.js**, `checkNearbySubscriptions` — la proximité lit son propre délai. Avant :
   ```js
               if (canNotify(id)) {
   ```
   Après :
   ```js
               if (canNotify(id, 'proximity')) {
   ```

3. **js/notifications.js**, `notifyFavoriteEvent` — pas de seconde alerte quand le serveur a prévenu. Avant :
   ```js
       if (event.product) notification.product = event.product;

       if (isQuietHours()) {
   ```
   Après :
   ```js
       if (event.product) notification.product = event.product;

       // NOTIF-03 : notifications app fermee en service sur cet appareil : le serveur
       // (push-notify) a deja alerte, heures calmes comprises. L'app garde la ligne du
       // centre et la pastille, sans seconde alerte et sans file d'attente.
       if (isPushActive()) {
           sendNotification(notification, { silent: true });
           return;
       }

       if (isQuietHours()) {
   ```

4. **js/notifications.js**, signature de `sendNotification`. Avant :
   ```js
   function sendNotification(notif) {
   ```
   Après :
   ```js
   // options.silent (NOTIF-03) : centre et pastille seulement, sans notification systeme,
   // ni bandeau, ni vibration (la notification app fermee du serveur est deja arrivee).
   function sendNotification(notif, options = {}) {
   ```

5. **js/notifications.js**, `sendNotification` — rien à afficher en mode silencieux. Avant :
   ```js
       if (supported && Notification.permission === 'granted') {
           try {
   ```
   Après :
   ```js
       if (options.silent) {
           // Rien a afficher : une seule alerte par changement
       } else if (supported && Notification.permission === 'granted') {
           try {
   ```
   (Le reste du bloc, `catch` et `else { showNotificationBanner(notif); }`, ne change pas.)

6. **js/notifications.js**, fin de `sendNotification` — pas de vibration en silencieux, délai du bon type. Avant :
   ```js
       if (navigator.vibrate) {
           navigator.vibrate(200);
       }

       markNotified(notif.distributorId);
   ```
   Après :
   ```js
       if (navigator.vibrate && !options.silent) {
           navigator.vibrate(200);
       }

       markNotified(notif.distributorId, notif.type === 'proximity' ? 'proximity' : 'change');
   ```

7. **js/notifications.js**, import. Avant :
   ```js
   import { syncPushSubscription, refreshPushSettings } from './push.js';
   ```
   Après :
   ```js
   import { syncPushSubscription, refreshPushSettings, isPushActive } from './push.js';
   ```

8. **js/push.js** — nouvelle fonction, juste sous `permission()`. Avant :
   ```js
   function permission() {
       return 'Notification' in window ? Notification.permission : 'unsupported';
   }
   ```
   Après :
   ```js
   function permission() {
       return 'Notification' in window ? Notification.permission : 'unsupported';
   }

   // NOTIF-03 : notifications app fermee en service sur cet appareil. Le serveur previent
   // alors des changements de favoris : la veille de l'app (notifications.js) ne realerte pas.
   export function isPushActive() {
       return isPushSupported() && NotificationPrefs.push === true && permission() === 'granted';
   }
   ```

9. **js/favorites-watch.js**, imports. Avant :
   ```js
   import { AppState, NotificationPrefs, supabaseClient } from './state.js';
   import { diffFavoriteSignals, saveNotificationPrefs } from './utils.js';
   ```
   Après :
   ```js
   import { AppState, NotificationPrefs, supabaseClient, NOTIFICATION_PREFS_KEY } from './state.js';
   import { diffFavoriteSignals, saveNotificationPrefs, loadStore } from './utils.js';
   ```

10. **js/favorites-watch.js**, `checkFavoriteUpdates` — relire l'état partagé juste avant de comparer. Avant :
    ```js
            if (!NotificationPrefs.lastSeenSignals) NotificationPrefs.lastSeenSignals = {};
            const seen = NotificationPrefs.lastSeenSignals;
    ```
    Après :
    ```js
            if (!NotificationPrefs.lastSeenSignals) NotificationPrefs.lastSeenSignals = {};
            // NOTIF-03 : un autre onglet de l'app a pu voir (et notifier, ou taire : son
            // propre signal) ce changement pendant la lecture, avant que son evenement
            // storage arrive ici (app.js, BUG-13). On repart de l'etat enregistre, juste
            // avant de comparer : un changement = une seule notification.
            const stored = loadStore(NOTIFICATION_PREFS_KEY);
            if (stored && stored.lastSeenSignals && typeof stored.lastSeenSignals === 'object') {
                Object.assign(NotificationPrefs.lastSeenSignals, stored.lastSeenSignals);
            }
            const seen = NotificationPrefs.lastSeenSignals;
    ```

11. **index.html** — trois modules JS changent : monter le `?v=` de **toutes** les entrées de l'import
    map à la même valeur V+1. Aucun CSS ne change.

## Tests

### Test 1 — intégration DOM (jsdom) : quatre cas
- **Fichier** : `tests/integration/dom.test.js`.
- **a) Isoler les tests existants de la veille** (l'état vu se relit désormais du stockage, que les
  tests précédents remplissent). Dans le `beforeEach` du bloc
  `checkFavoriteUpdates (un favori notifie quand sa machine change)`. Avant :
  ```js
          NotificationPrefs.lastNotifications = {};
          NotificationPrefs.lastSeenSignals = {};
          NotificationQueue.pending = [];
  ```
  Après :
  ```js
          NotificationPrefs.lastNotifications = {};
          NotificationPrefs.lastSeenSignals = {};
          localStorage.removeItem('snackmatch_notification_prefs');   // NOTIF-03 : l'etat vu se relit du stockage
          NotificationQueue.pending = [];
  ```
- **b) Code à ajouter à la toute fin du fichier** (après sa dernière ligne `});`) :
  ```js
  // ============================================
  // UNE SEULE ALERTE PAR CHANGEMENT (NOTIF-03)
  // ============================================

  const { processQueuedNotifications, canNotify } = await import('../../js/notifications.js');

  describe('Une seule alerte par changement (NOTIF-03)', () => {
      let tables;
      let created;
      let vibrations;
      const fakeClient = {
          from(table) {
              return { select() { return { in() { return Promise.resolve({ data: tables[table] || [], error: null }); } }; } };
          }
      };
      const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();
      const emptySignal = () => [{ distributor_id: 'dist-fav', state: 'empty', created_at: minutesAgo(2) }];
      // Notification systeme simulee : compte les alertes affichees
      class FakeNotification {
          constructor() { created += 1; }
      }
      FakeNotification.permission = 'granted';

      // Notifications app fermee en service : permission accordee, push accepte, navigateur compatible
      function setPushActive() {
          window.Notification = FakeNotification;
          globalThis.Notification = FakeNotification;
          window.PushManager = function PushManager() {};
          Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true });
          NotificationPrefs.push = true;
      }

      // Retour au navigateur simule de depart (sans notification ni push)
      function resetBrowser() {
          delete window.Notification;
          delete globalThis.Notification;
          delete window.PushManager;
          delete navigator.serviceWorker;
          delete navigator.vibrate;
      }

      beforeEach(() => {
          resetBrowser();
          tables = { distributor_status: [], product_availability: [] };
          created = 0;
          vibrations = 0;
          Object.defineProperty(navigator, 'vibrate', { value: () => { vibrations += 1; return true; }, configurable: true });
          setSupabaseClient(fakeClient);
          AppState.subscriptions = ['dist-fav'];
          AppState.distributors = [
              { id: 'dist-fav', name: 'Pain du Coin', type: 'bakery', emoji: '🥖', address: 'Addr', products: [{ id: 7, name: 'Baguette', price: 1, available: true }] }
          ];
          NotificationPrefs.enabled = true;
          NotificationPrefs.push = false;
          NotificationPrefs.quietHours = { enabled: false, start: 22, end: 8 };
          NotificationPrefs.followedProducts = [];
          NotificationPrefs.lastNotifications = {};
          NotificationPrefs.lastSeenSignals = {};
          localStorage.removeItem('snackmatch_notification_prefs');
          NotificationQueue.pending = [];
          NotificationQueue.history = [];
          document.getElementById('notifications-view').classList.remove('view-active');
          document.querySelectorAll('.notification-banner').forEach((b) => b.remove());
      });

      after(() => { resetBrowser(); setSupabaseClient(null); AppState.subscriptions = []; });

      it('app fermee deja prevenue : le changement va au centre, sans seconde alerte', async () => {
          setPushActive();
          await checkFavoriteUpdates();
          tables.distributor_status = emptySignal();
          const sent = await checkFavoriteUpdates();
          assert.equal(sent.length, 1);
          assert.equal(NotificationQueue.history.length, 1);
          assert.equal(NotificationQueue.history[0].read, false);
          assert.equal(document.getElementById('notifications-badge').textContent, '1');
          assert.equal(created, 0, 'aucune notification systeme : le serveur l a deja envoyee');
          assert.equal(document.querySelectorAll('.notification-banner').length, 0);
          assert.equal(vibrations, 0);
      });

      it('app fermee deja prevenue pendant les heures calmes : rien en file, la ligne est au centre', async () => {
          setPushActive();
          NotificationPrefs.quietHours = { enabled: true, start: 0, end: 24 };
          await checkFavoriteUpdates();
          tables.distributor_status = emptySignal();
          await checkFavoriteUpdates();
          assert.equal(NotificationQueue.pending.length, 0);
          assert.equal(NotificationQueue.history.length, 1);
          assert.equal(created, 0);
      });

      it('alerte de proximite toute recente : le changement du favori part quand meme', async () => {
          await checkFavoriteUpdates();
          NotificationQueue.pending = [{ type: 'proximity', distributorId: 'dist-fav', distributorName: 'Pain du Coin', message: 'Pain du Coin est a 400m de toi', timestamp: Date.now(), queuedAt: Date.now() }];
          processQueuedNotifications();
          assert.equal(NotificationQueue.history[0].type, 'proximity');
          tables.distributor_status = emptySignal();
          const sent = await checkFavoriteUpdates();
          assert.equal(sent.length, 1);
          assert.equal(NotificationQueue.history[0].type, 'empty');
          // Et l'inverse : un changement tout recent ne bloque pas la proximite
          NotificationPrefs.lastNotifications = { 'dist-fav': Date.now() };
          assert.equal(canNotify('dist-fav', 'proximity'), true);
          assert.equal(canNotify('dist-fav'), false);
      });

      it('autre onglet : un changement deja traite n\'est pas notifie une seconde fois', async () => {
          await checkFavoriteUpdates();
          const stale = JSON.parse(JSON.stringify(NotificationPrefs.lastSeenSignals));
          tables.distributor_status = emptySignal();
          // L'autre onglet voit le changement, le notifie et l'enregistre
          assert.equal((await checkFavoriteUpdates()).length, 1);
          // Cet onglet a encore l'ancien etat en memoire (l'evenement storage n'est pas passe)
          NotificationPrefs.lastSeenSignals = stale;
          NotificationPrefs.lastNotifications = {};
          NotificationQueue.history = [];
          assert.deepEqual(await checkFavoriteUpdates(), []);
          assert.equal(NotificationQueue.history.length, 0);
      });
  });
  ```
- **Doit échouer avant les étapes** (vérifié sur le code actuel) :
  - « app fermee deja prevenue : le changement va au centre… » : `created` vaut 1 (notification système créée) ;
  - « …pendant les heures calmes… » : `NotificationQueue.pending.length` vaut 1 (mis en file) ;
  - « alerte de proximite toute recente… » : `sent.length` vaut 0 (délai d'1 h partagé) ;
  - « autre onglet… » : `checkFavoriteUpdates()` renvoie un événement `empty`.
  Les tests existants de la veille restent verts (avant comme après la correction).

### Test 2 — fonctionnel (navigateur)
- **Fichier** : `tests/functional/notifications.spec.js`, **à la toute fin du fichier** (après sa dernière ligne `});`).
- **Code à ajouter** :
  ```js
  // ============================================
  // UNE SEULE ALERTE PAR CHANGEMENT (NOTIF-03)
  // ============================================

  test.describe('Une seule alerte par changement (NOTIF-03)', () => {
      test('notifications app fermée actives : le changement d’un favori arrive au centre, sans seconde alerte', async ({ page, context }) => {
          const signals = { status: [] };
          await page.route(url => url.pathname.endsWith('/rest/v1/distributor_status'), route =>
              route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(signals.status) }));
          await page.route(url => url.pathname.endsWith('/rest/v1/product_availability'), route =>
              route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
          // Permission accordee ; chaque notification systeme creee par l'app est comptee
          await page.addInitScript(() => {
              window.__systemNotifications = 0;
              class CountingNotification {
                  constructor() { window.__systemNotifications += 1; }
                  close() {}
              }
              CountingNotification.permission = 'granted';
              CountingNotification.requestPermission = () => Promise.resolve('granted');
              window.Notification = CountingNotification;
          });
          // Notifications app fermee acceptees, heures calmes coupees (le test passe aussi la nuit)
          await page.evaluate(() => localStorage.setItem('snackmatch_notification_prefs', JSON.stringify({
              enabled: true, push: true, quietHours: { enabled: false, start: 22, end: 8 }
          })));
          await setupApp(page, context);

          // NOTIF-02 : une fiche de demo ne notifie pas ; on prend la premiere comme vraie fiche
          const id = await page.evaluate(() => {
              const d = window.AppState.distributors[0];
              d.isDemo = false;
              return d.id;
          });
          await page.evaluate((distId) => window.toggleSubscription(distId), id);
          await expect.poll(() => page.evaluate((distId) =>
              !!JSON.parse(localStorage.getItem('snackmatch_notification_prefs')).lastSeenSignals?.[distId], id)).toBe(true);

          // Quelqu'un signale le distributeur vide : le serveur a deja envoye la notification
          signals.status = [{
              distributor_id: id, state: 'empty', source: 'anon', weight: 0.5,
              created_at: new Date(Date.now() - 5 * 60000).toISOString(), age_seconds: 300
          }];
          await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
          await expect(page.locator('#notifications-badge')).toHaveText('1');
          expect(await page.evaluate(() => window.__systemNotifications)).toBe(0);
          await expect(page.locator('.notification-banner')).toHaveCount(0);
      });
  });
  ```
- **Doit échouer avant les étapes** : `window.__systemNotifications` vaut 1 (`Expected: 0, Received: 1`),
  vérifié sur le code actuel. Avec la correction, toute la suite `notifications.spec.js` passe.

## Vérification (dans l'ordre)
```bash
node --check js/notifications.js && node --check js/push.js && node --check js/favorites-watch.js   # aucune sortie
grep -c "cooldownKey" js/notifications.js                                     # 3
grep -c "isPushActive" js/notifications.js js/push.js                          # notifications.js:2, push.js:1
npm test                                                                      # tout vert, dont « Une seule alerte par changement (NOTIF-03) », « checkFavoriteUpdates », « canNotify » et « cache-busting »
npx playwright test --project=functional -g "NOTIF-03"                        # 1 passed
npx playwright test --project=functional tests/functional/notifications.spec.js   # tout vert
npm run test:functional                                                       # en arrière-plan (~10 min) : tout vert, instables notés dans la PR
git diff --stat                                                               # notifications.js, push.js, favorites-watch.js, index.html, dom.test.js, notifications.spec.js (+ BACKLOG.md)
```

## Hors périmètre
- Alerte de proximité à l'entrée dans le rayon, une seule par appareil, réglage appliqué tout de suite,
  file des heures calmes délivrée à leur fin : **NOTIF-04**.
- Abonnement disparu recréé, resynchronisation après coupure, permission demandée seulement après un
  toucher (bloc « Demande paresseuse au 1er envoi » de `sendNotification`) : **NOTIF-05**.
- Son, bandeau lu par les lecteurs d'écran, `onclick` du bandeau, `registration.showNotification`
  à la place de `new Notification`, tag aligné sur `distrimatch-<id>` : **NOTIF-07**.
- Relire aussi l'historique (`NotificationQueue`) quand un autre onglet écrit : l'écouteur `storage` de
  `js/app.js` (BUG-13) ne le fait pas ; ne pas toucher `js/app.js` ici.
- Libellés « Machine signalée vide… » de `NOTIFICATION_TYPES` : **NOTIF-06**.
- `CLAUDE.md` (description de `favorites-watch.js` / `push.js`) : Claude (modèle principal) la met à jour.

## Pièges connus
- **Stories voisines sur les mêmes fichiers** : NOTIF-02 (avant celle-ci) modifie `js/favorites-watch.js`
  (signal propre, fiches de démo, noms des produits) et peut avoir **complété les deux lignes d'import**
  de l'étape 9. Dans ce cas seulement, ne pas s'arrêter : ajouter `NOTIFICATION_PREFS_KEY` à l'import
  de `./state.js` et `loadStore` à celui de `./utils.js`, sans rien retirer. Tout autre écart avec un
  extrait « Avant » = s'arrêter.
- NOTIF-04 (après) réécrira `checkNearbySubscriptions` (étape 2) et le délai de proximité entre
  instances ; NOTIF-05 (après) retire le bloc de demande de permission juste au-dessus de l'étape 5 et
  touche `js/push.js` ; NOTIF-07 (après) modifie l'affichage dans `sendNotification` (étapes 4 à 6).
  Ne rien anticiper de ces stories.
- Étape 5 : garder intacts le `try { ... new Notification(...) ... } catch` et le `else` final ; seule
  la ligne `if (supported && ...)` devient `} else if (supported && ...)`, précédée du bloc
  `if (options.silent)`.
- Étape 10 : la relecture doit rester **après** le `await Promise.all(...)` et **avant** la boucle
  `for (const id of ids)` ; fusionner dans l'objet existant (`Object.assign`), ne pas le remplacer.
- Test 1 : `afterEach` n'est pas importé dans `dom.test.js` ; le bloc nettoie dans `beforeEach` et
  `after` (fonction `resetBrowser`). Ne pas modifier la ligne d'import de `node:test`.
- Test 1 : `push.js` lit `Notification` comme variable globale : le faux est posé sur `window` **et**
  sur `globalThis`.
- Test 2 : `d.isDemo = false` est voulu (depuis NOTIF-02, une fiche de démo ne notifie plus).
- Fichiers en CRLF : outil Edit ; si un bloc refuse, petit script Node dans le scratchpad (voir README).
- Bump de **toutes** les entrées de l'import map à la **même** valeur.

## Terminé quand
- [ ] Contrôles passés, tests écrits (échouent avant, passent après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : non (aucun écran ne change)
- [ ] Story cochée dans BACKLOG.md (EPIC-R5, NOTIF-03), PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `fix(notifications): une seule alerte par changement`

**Corps** : constats couverts (dont le constat « deux instances », en grande partie déjà corrigé par
BUG-13, complété ici) ; causes (la veille de l'app réalertait après la notification du serveur ;
proximité et changements partageaient le même délai d'1 h ; un contrôle pouvait partir avant
l'événement `storage` de l'autre onglet) ; correction ; tests ajoutés ; sorties des commandes de
vérification ; aucun texte d'interface modifié.
