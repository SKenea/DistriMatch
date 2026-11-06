# NOTIF-04 — Alertes de proximité : à l'arrivée, une seule fois

- **Lot** : 5. Notifications · **Gravité** : moyen · **Niveau conseillé** : medium
- **Prérequis** : **NOTIF-03 fusionnée** dans `master` ; partir de `master` **à jour**. Sinon : s'arrêter.
- **Branche** : `fix/alerte-proximite-arrivee` · **Taille** : 2 fichiers JS (`js/notifications.js`, `js/utils.js`) + `index.html` + 2 fichiers de tests. **Aucune migration.**
- **Constats couverts** (rapport du 2026-10-21) :
  - Alerte de proximité répétée toutes les heures tant qu'on reste dans le rayon (aucune détection d'entrée) — `js/notifications.js:115` (aujourd'hui ligne 115)
  - Alerte de proximité répétée par chaque instance ouverte (délai d'1 h en mémoire, aucun test de visibilité) — `js/notifications.js:87` (aujourd'hui ligne 87).
    **Déjà corrigé en partie par BUG-13** : l'écouteur `storage` d'`js/app.js` (`handleStorageFromOtherTab`) relit les réglages quand un autre onglet les écrit. La marque `lastNotifications` d'un onglet est donc vue par l'autre, et un onglet ne réécrit plus de vieux réglages (étapes 4, 5 et 7 du scénario). **Reste à traiter ici** : le test de visibilité (étapes 3 et 6).
  - Réactiver les alertes de proximité (ou « Effacer mes données ») n'a aucun effet avant redémarrage — `js/notifications.js:82` (aujourd'hui ligne 82)
  - Notifications mises en file pendant les heures calmes délivrées seulement au prochain démarrage — `js/notifications.js:58` (aujourd'hui ligne 58)

## But
Le membre reçoit une alerte de proximité quand il **arrive** près d'un favori, une seule fois,
dans l'onglet qu'il regarde. Un réglage réactivé s'applique sans relancer l'appli, et les
notifications retenues pendant les heures calmes partent à leur fin, sans attendre une
réouverture. Une notification retenue trop longtemps n'est plus perdue.

## User story
En tant que membre qui a des favoris, je veux une alerte de proximité quand j'arrive près de
l'un d'eux, afin d'être prévenu au bon moment, sans rappel toutes les heures.

**Critères d'acceptation**
- [ ] Une alerte au passage « hors du rayon → dans le rayon », jamais toutes les heures tant qu'on reste dans le rayon.
- [ ] Ouvrir l'appli déjà près d'un favori, ou mettre un favori en cœur sur place : aucune alerte (la première mesure sert de référence).
- [ ] Le GPS qui oscille à la limite du rayon ne fait pas d'alertes en rafale : on ne sort du rayon qu'au-delà d'une marge (100 m, ou la précision GPS si elle est plus grande).
- [ ] Une position moins précise que le rayon est ignorée.
- [ ] Onglet caché : la position n'est pas demandée ; au retour, la première mesure sert de référence. Un seul onglet mesure à la fois.
- [ ] « M'alerter quand je suis proche » ou « Notifications activées » réactivé (ou réglages remis par « Effacer mes données ») : les alertes reprennent dans les 30 s, sans redémarrer.
- [ ] Notifications retenues pendant les heures calmes : envoyées dans les 30 s après leur fin, l'appli restant ouverte (onglet visible).
- [ ] Retenue plus de 12 h : rangée non lue dans le centre, sans bandeau ni vibration (avant : perdue). Une alerte de proximité n'est jamais retenue (elle n'a plus de sens après coup).

## Ce qui est déjà tranché (ne pas refaire l'analyse)
- **Une seule minuterie de 30 s, posée au démarrage quels que soient les réglages** (variante (a) du constat).
  Elle relit les réglages à chaque passage. Ni `saveNotificationSettingsFromUI` ni `clearUserData`
  ne changent : la story NOTIF-06 réécrit les réglages juste après celle-ci, et `clearUserData`
  remet déjà `geofence.enabled` à `true`. `startGeofenceMonitoring` reste le seul point d'entrée
  (appelé par `js/app.js`, inchangé) ; une garde `if (notificationTimer) return;` empêche une
  deuxième minuterie.
- **Le passage de la minuterie** (`notificationTick`, exportée pour les tests) fait deux choses :
  1. **File des heures calmes** : `processQueuedNotifications()`, seulement si l'onglet est visible.
     La file n'est pas partagée entre onglets : deux onglets la videraient chacun. Le passage
     de 30 s **est** la « minuterie » de fin des heures calmes. Pas de `setTimeout` calé sur
     l'heure de fin : un réglage d'heures calmes changé entre-temps le rendrait faux.
  2. **Proximité** : la position n'est demandée que si `NotificationPrefs.enabled`,
     `geofence.enabled`, hors heures calmes, onglet visible et `navigator.geolocation` existe.
     Sinon, la référence est effacée (`geofenceInside = null`).
- **Entrée dans le rayon = fonction pure `diffGeofence(previous, distributors, coords, radiusM)`**
  dans `js/utils.js`, testée en unitaire :
  - `previous` vaut `{ [id]: true | false }` au passage d'avant, ou `null` (aucune référence) ;
  - alerte si `previous[id] === false` et distance <= rayon ;
  - un id absent de `previous` (favori ajouté depuis) ou `previous === null` : référence sans alerte ;
  - sortie seulement au-delà de `rayon + max(précision, 100 m)` ; entre les deux, l'état d'avant est gardé ;
  - précision > rayon, ou coordonnées non numériques : position ignorée (on renvoie `previous` tel quel) ;
  - distance renvoyée arrondie au mètre.
- **Rayon changé dans les réglages = nouvelle référence**. Sinon, agrandir le rayon alerterait
  tout de suite pour un favori déjà dans la nouvelle zone.
- **`canNotify(id)` reste** devant l'alerte. C'est le garde-fou entre deux fenêtres visibles :
  la marque de l'autre onglet arrive par l'écouteur `storage` de BUG-13. La marque est posée
  par `sendNotification` (inchangé). Les délais propres à chaque type d'alerte relèvent de
  NOTIF-03 et ne changent pas ici.
- **Heures calmes et proximité** : `triggerProximityNotification` ne met plus en file. Une
  arrivée signalée à 8 h pour 23 h n'a pas de sens. En pratique les passages sont déjà
  sautés pendant les heures calmes ; ce cas ne reste possible que si les heures calmes
  commencent pendant la demande de position.
- **Plus de 12 h en file** : les alertes de favoris sont rangées dans le centre, non lues, sans
  `sendNotification`, donc sans bandeau, notification système ni vibration. La proximité est
  jetée. On garde 12 h pour le seuil.
- **Pas de test fonctionnel Playwright** : il faudrait attendre au moins deux passages de 30 s
  avec une géolocalisation qui change. Le test DOM appelle `notificationTick()` directement,
  avec une position simulée, et couvre tous les critères. La suite fonctionnelle existante
  sert de non-régression.
- Le texte de l'alerte (« … est a 300m de toi ») ne change pas ici : vocabulaire = NOTIF-06.

## Avant de coder
**Lire en entier** : `js/notifications.js` lignes 1-180 ; `js/app.js` la fonction
`handleStorageFromOtherTab` (BUG-13, vers la ligne 560) et les appels `startGeofenceMonitoring()` /
`processQueuedNotifications()` (vers la ligne 767) ; `js/favorites-watch.js` `startFavoritesWatch`
(même test de visibilité) ; `js/utils.js` `isNearDistributor` (vers la ligne 1264, même style) ;
`tests/integration/dom.test.js` lignes 165-240 (mise en place jsdom, `describe('checkFavoriteUpdates …')`).

**Réutiliser** (ne pas réécrire) : `calculateDistance`, `hasValidCoords` (`js/utils.js`) ;
`canNotify`, `sendNotification`, `ensureNotificationId`, `isNotificationsViewOpen`,
`openNotificationsView`, `updateNotificationsBadge`, `isQuietHours` (`js/notifications.js`).

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
grep -n "^export function startGeofenceMonitoring() {" js/notifications.js          # 1 ligne (76 environ)
grep -n "^function checkNearbySubscriptions(position) {" js/notifications.js        # 1 ligne (101 environ)
grep -n "if (Date.now() - notif.queuedAt < 12 \* 60 \* 60 \* 1000) {" js/notifications.js   # 1 ligne (64 environ)
grep -n "    if (isQuietHours()) return;" js/notifications.js                       # 2 lignes (58 et 89 environ)
grep -n "        queueNotification(notification);" js/notifications.js              # 2 lignes (proximite et favori)
grep -n "    console.log('Surveillance geofence demarree');" js/notifications.js    # 1 ligne
grep -c "calculateDistance" js/notifications.js                                     # 2 (import + checkNearbySubscriptions)
grep -c "visibilityState\|notificationTick\|diffGeofence\|geofenceInside\|archiveNotification" js/notifications.js js/utils.js tests/unit/unit.test.js tests/integration/dom.test.js   # 0 partout
grep -n "^// DEMANDE DE STATUT D'EXPLOITANT (EPIC-T18 / T20)" js/utils.js           # 1 ligne (1285 environ)
grep -n "    if (machineStale) return 'Tu es sur place : touche son état pour dire s’il est en service.';" js/utils.js   # 1 ligne
grep -n "function handleStorageFromOtherTab(e) {" js/app.js                          # 1 ligne (BUG-13 present)
grep -n "    startGeofenceMonitoring();" js/app.js                                    # 1 ligne
grep -n "    processQueuedNotifications();" js/app.js                                 # 1 ligne
grep -o '"./js/app.js": "./js/app.js?v=[0-9]*"' index.html                          # noter V (123 avant le lot NOTIF ; plus haut apres NOTIF-01..03)
```
Vérifiés le 2026-11-06 sur `master` (avant NOTIF-01..03). NOTIF-03 peut changer une seule ligne
citée ici, `if (canNotify(id)) {`, voir « Pièges connus ». Tout autre écart : s'arrêter.

## Étapes

1. **js/utils.js** — fonction pure d'entrée dans le rayon, juste avant la section « DEMANDE DE STATUT D'EXPLOITANT ». Avant :
   ```js
       if (machineStale) return 'Tu es sur place : touche son état pour dire s’il est en service.';
       return '';
   }
   ```
   Après :
   ```js
       if (machineStale) return 'Tu es sur place : touche son état pour dire s’il est en service.';
       return '';
   }

   // ============================================
   // ALERTE DE PROXIMITE A L'ARRIVEE (NOTIF-04)
   // ============================================
   // previous : { [id]: true si dans le rayon, false sinon } au passage d'avant, ou null
   // (aucune reference : demarrage, onglet cache, reglage coupe). Un distributeur absent
   // de previous (favori ajoute depuis) sert de reference, sans alerte. On n'alerte qu'au
   // passage dehors -> dedans ; on ne ressort qu'au-dela du rayon + une marge (GPS qui
   // oscille a la limite). Une position moins precise que le rayon ne compte pas.
   export const GEOFENCE_EXIT_MARGIN_M = 100;

   export function diffGeofence(previous, distributors, coords, radiusM) {
       const accuracy = Number.isFinite(coords?.accuracy) ? coords.accuracy : 0;
       if (!coords || ![coords.latitude, coords.longitude].every(Number.isFinite) || accuracy > radiusM) {
           return { inside: previous, entered: [] };
       }
       const exitM = radiusM + Math.max(accuracy, GEOFENCE_EXIT_MARGIN_M);
       const inside = {};
       const entered = [];
       for (const d of distributors) {
           if (!hasValidCoords(d)) continue;
           const meters = Math.round(calculateDistance(coords.latitude, coords.longitude, Number(d.lat), Number(d.lng)) * 1000);
           const before = previous ? previous[d.id] : undefined;
           if (meters <= radiusM) {
               inside[d.id] = true;
               if (before === false) entered.push({ distributor: d, distanceMeters: meters });
           } else {
               inside[d.id] = meters > exitM ? false : before === true;
           }
       }
       return { inside, entered };
   }
   ```

2. **js/notifications.js** — import : `diffGeofence` remplace `calculateDistance`, qui ne sert plus que dans `checkNearbySubscriptions`, réécrite à l'étape 5. Avant :
   ```js
   import {
       calculateDistance, escapeHTML, showToast, timeAgo,
       saveNotificationPrefs, saveNotificationQueue
   } from './utils.js';
   ```
   Après :
   ```js
   import {
       diffGeofence, escapeHTML, showToast, timeAgo,
       saveNotificationPrefs, saveNotificationQueue
   } from './utils.js';
   ```

3. **js/notifications.js** — file des heures calmes : rien de perdu après 12 h. Avant :
   ```js
   export function processQueuedNotifications() {
       if (isQuietHours()) return;

       const pending = [...NotificationQueue.pending];
       NotificationQueue.pending = [];

       pending.forEach(notif => {
           if (Date.now() - notif.queuedAt < 12 * 60 * 60 * 1000) {
               sendNotification(notif);
           }
       });

       saveNotificationQueue();
   }
   ```
   Après :
   ```js
   // NOTIF-04 : au-dela de 12 h, une notification retenue ne sonne plus ; elle est rangee
   // non lue dans le centre (avant : perdue). Une alerte de proximite perimee est jetee.
   const QUEUE_ALERT_MAX_MS = 12 * 60 * 60 * 1000;

   export function processQueuedNotifications() {
       if (isQuietHours() || !NotificationQueue.pending.length) return;

       const pending = [...NotificationQueue.pending];
       NotificationQueue.pending = [];

       let archived = false;
       pending.forEach(notif => {
           if (Date.now() - notif.queuedAt < QUEUE_ALERT_MAX_MS) {
               sendNotification(notif);
           } else if (notif.type !== 'proximity' && NotificationPrefs.enabled) {
               archiveNotification(notif);
               archived = true;
           }
       });

       saveNotificationQueue();
       if (!archived) return;
       if (isNotificationsViewOpen()) openNotificationsView();
       else updateNotificationsBadge();
   }

   // Rangee dans le centre, sans bandeau, son ni vibration
   function archiveNotification(notif) {
       notif.read = false;
       ensureNotificationId(notif);
       NotificationQueue.history.unshift(notif);
       if (NotificationQueue.history.length > 50) NotificationQueue.history.pop();
   }
   ```

4. **js/notifications.js** — une minuterie unique, posée quels que soient les réglages. Avant :
   ```js
   // ============================================
   // GEOFENCING
   // ============================================

   export function startGeofenceMonitoring() {
       if (!navigator.geolocation) {
           console.log('Géolocalisation non supportée');
           return;
       }

       if (!NotificationPrefs.enabled || !NotificationPrefs.geofence.enabled) {
           console.log('Geofencing désactivé');
           return;
       }

       setInterval(() => {
           if (!NotificationPrefs.enabled || !NotificationPrefs.geofence.enabled) return;
           if (isQuietHours()) return;

           navigator.geolocation.getCurrentPosition(
               checkNearbySubscriptions,
               (err) => console.log('Erreur géoloc pour geofence:', err.message),
               { enableHighAccuracy: false, timeout: 10000 }
           );
       }, 30000);

       console.log('Surveillance geofence demarree');
   }
   ```
   Après :
   ```js
   // ============================================
   // MINUTERIE : GEOFENCING ET FILE DES HEURES CALMES (NOTIF-04)
   // ============================================

   const NOTIFICATION_TICK_MS = 30000;
   let notificationTimer = null;
   // Dans le rayon ou non, par favori, au dernier passage ; null = pas de reference
   // (demarrage, onglet cache, reglage coupe, heures calmes) : la mesure suivante sert
   // de reference, sans alerte. Un rayon change dans les reglages = nouvelle reference.
   let geofenceInside = null;
   let geofenceRadius = null;

   // Une seule minuterie, posee au demarrage quels que soient les reglages : ils sont
   // relus a chaque passage (reactives, ou remis par "Effacer mes donnees", ils
   // s'appliquent sans redemarrer)
   export function startGeofenceMonitoring() {
       if (notificationTimer) return;
       notificationTimer = setInterval(notificationTick, NOTIFICATION_TICK_MS);
   }

   // Un passage, dans l'onglet visible seulement (un seul onglet agit) : la file des
   // heures calmes part si elles sont finies, puis la position est relue si l'alerte
   // de proximite est active
   export function notificationTick() {
       const visible = document.visibilityState === 'visible';
       if (visible) processQueuedNotifications();
       const active = NotificationPrefs.enabled && NotificationPrefs.geofence.enabled && !isQuietHours();
       if (!active || !visible || !navigator.geolocation) {
           geofenceInside = null;
           return;
       }
       navigator.geolocation.getCurrentPosition(
           checkNearbySubscriptions,
           (err) => console.log('Erreur géoloc pour geofence:', err.message),
           { enableHighAccuracy: false, timeout: 10000 }
       );
   }
   ```

5. **js/notifications.js** — alerte à l'entrée dans le rayon seulement. Avant :
   ```js
   function checkNearbySubscriptions(position) {
       const userLat = position.coords.latitude;
       const userLng = position.coords.longitude;

       AppState.subscriptions.forEach(id => {
           const dist = AppState.distributors.find(d => d.id === id);
           if (!dist) return;

           const prefs = NotificationPrefs.perDistributor[id];
           if (prefs && prefs.proximity === false) return;

           const distance = calculateDistance(userLat, userLng, dist.lat, dist.lng);
           const distanceMeters = distance * 1000;

           if (distanceMeters <= NotificationPrefs.geofence.radius) {
               if (canNotify(id)) {
                   triggerProximityNotification(dist, Math.round(distanceMeters));
               }
           }
       });
   }
   ```
   Après :
   ```js
   // Alerte a l'arrivee seulement (diffGeofence, utils.js). canNotify reste le garde-fou
   // entre deux fenetres visibles : la marque de l'autre onglet arrive par l'ecouteur
   // storage d'app.js (BUG-13)
   function checkNearbySubscriptions(position) {
       const radius = NotificationPrefs.geofence.radius;
       if (radius !== geofenceRadius) {
           geofenceInside = null;
           geofenceRadius = radius;
       }
       const favorites = AppState.subscriptions
           .filter(id => NotificationPrefs.perDistributor[id]?.proximity !== false)
           .map(id => AppState.distributors.find(d => d.id === id))
           .filter(Boolean);
       const { inside, entered } = diffGeofence(geofenceInside, favorites, position.coords, radius);
       geofenceInside = inside;
       entered.forEach(({ distributor, distanceMeters }) => {
           if (canNotify(distributor.id)) {
               triggerProximityNotification(distributor, distanceMeters);
           }
       });
   }
   ```

6. **js/notifications.js** — `triggerProximityNotification` : plus de mise en file. Avant :
   ```js
           message: `${distributor.name} est a ${distanceMeters}m de toi`,
           timestamp: Date.now()
       };

       if (isQuietHours()) {
           queueNotification(notification);
           return;
       }
   ```
   Après :
   ```js
           message: `${distributor.name} est a ${distanceMeters}m de toi`,
           timestamp: Date.now()
       };

       // NOTIF-04 : une arrivee ne se signale pas apres coup (plus de mise en file)
       if (isQuietHours()) return;
   ```

7. **index.html** — `js/notifications.js` et `js/utils.js` changent : monter le `?v=` de
   **toutes** les entrées de l'import map à la même valeur V+1 (V noté aux contrôles).
   Aucun CSS ne change. `js/app.js` ne change pas.

## Tests

### Test 1 — fonction pure (unitaire)
- **Fichier** : `tests/unit/unit.test.js`, **à la toute fin du fichier** (après sa dernière ligne `});`).
- **Code à ajouter** :
  ```js

  // ============================================
  // ALERTE DE PROXIMITE A L'ARRIVEE (NOTIF-04)
  // ============================================

  const { diffGeofence } = await import('../../js/utils.js');

  describe('diffGeofence : alerte de proximite a l’arrivee seulement (NOTIF-04)', () => {
      const X = { id: 'x', name: 'Pain du Coin', lat: 43.4929, lng: -1.4748 };
      function at(meters, accuracy = 20) {
          return { latitude: 43.4929 + meters / 111195, longitude: -1.4748, accuracy };
      }

      it('sans reference (demarrage) : aucune alerte, la mesure devient la reference', () => {
          const r = diffGeofence(null, [X], at(300), 1000);
          assert.deepEqual(r.entered, []);
          assert.deepEqual(r.inside, { x: true });
      });

      it('dehors puis dedans : une alerte, distance arrondie en metres', () => {
          const r = diffGeofence({ x: false }, [X], at(300), 1000);
          assert.equal(r.entered.length, 1);
          assert.equal(r.entered[0].distributor.id, 'x');
          assert.ok(Math.abs(r.entered[0].distanceMeters - 300) <= 1, `distance ${r.entered[0].distanceMeters}`);
      });

      it('deja dedans : pas de nouvelle alerte', () => {
          assert.deepEqual(diffGeofence({ x: true }, [X], at(200), 1000).entered, []);
      });

      it('favori ajoute depuis la reference : pas d’alerte', () => {
          const r = diffGeofence({}, [X], at(300), 1000);
          assert.deepEqual(r.entered, []);
          assert.deepEqual(r.inside, { x: true });
      });

      it('marge de sortie : a 1050 m l’etat d’avant est garde, a 1150 m on est sorti', () => {
          assert.deepEqual(diffGeofence({ x: true }, [X], at(1050), 1000).inside, { x: true });
          assert.deepEqual(diffGeofence({ x: false }, [X], at(1050), 1000).inside, { x: false });
          assert.deepEqual(diffGeofence({ x: true }, [X], at(1150), 1000).inside, { x: false });
      });

      it('position moins precise que le rayon : ignoree, reference gardee', () => {
          const previous = { x: false };
          const r = diffGeofence(previous, [X], at(300, 1500), 1000);
          assert.deepEqual(r.entered, []);
          assert.equal(r.inside, previous);
      });
  });
  ```
- **Doit échouer avant l'étape 1** : `diffGeofence` n'existe pas (`TypeError: diffGeofence is not a function`).

### Test 2 — minuterie, entrée dans le rayon, file des heures calmes (DOM)
- **Fichier** : `tests/integration/dom.test.js`, **à la toute fin du fichier** (après sa dernière ligne `});`).
  `after`, `beforeEach`, `AppState`, `NotificationPrefs`, `NotificationQueue` sont déjà importés en tête.
- **Ce qu'il fait** : remplace `navigator` par une géolocalisation simulée (position choisie par le
  test), force `document.visibilityState` (jsdom renvoie `'prerender'`), appelle `notificationTick()`
  à la main (un passage de minuterie). En début de test, un passage avec le réglage coupé efface
  la référence du test précédent.
- **Code à ajouter** :
  ```js

  // ============================================
  // ALERTES DE PROXIMITE ET FILE DES HEURES CALMES (NOTIF-04)
  // ============================================
  // Minuterie posee meme reglage coupe ; chaque passage relit les reglages, vide la file
  // a la fin des heures calmes et n'alerte qu'a l'entree dans le rayon (onglet visible).

  const { notificationTick, startGeofenceMonitoring, processQueuedNotifications, notifyFavoriteEvent } = await import('../../js/notifications.js');

  describe('Alertes de proximite a l’arrivee et file des heures calmes (NOTIF-04)', () => {
      const realNavigator = globalThis.navigator;
      let position = null;
      let visibility = 'visible';
      let asked = 0;
      function at(meters) {
          return { coords: { latitude: 43.4929 + meters / 111195, longitude: -1.4748, accuracy: 20 } };
      }
      function tickAt(meters) {
          position = at(meters);
          notificationTick();
      }
      function proximityCount() {
          return NotificationQueue.history.filter(function isProximity(n) { return n.type === 'proximity'; }).length;
      }

      beforeEach(() => {
          asked = 0;
          position = at(3000);
          visibility = 'visible';
          Object.defineProperty(globalThis, 'navigator', {
              value: { geolocation: { getCurrentPosition(ok) { asked += 1; ok(position); } } },
              writable: true, configurable: true
          });
          Object.defineProperty(document, 'visibilityState', { get: () => visibility, configurable: true });
          AppState.subscriptions = ['dist-near'];
          AppState.distributors = [{ id: 'dist-near', name: 'Pain du Coin', type: 'bakery', lat: 43.4929, lng: -1.4748, products: [] }];
          NotificationPrefs.enabled = true;
          NotificationPrefs.quietHours = { enabled: false, start: 22, end: 8 };
          NotificationPrefs.geofence = { enabled: false, radius: 1000 };
          NotificationPrefs.perDistributor = {};
          NotificationPrefs.lastNotifications = {};
          NotificationQueue.pending = [];
          NotificationQueue.history = [];
          notificationTick();   // reglage coupe : efface la reference du test precedent
          NotificationPrefs.geofence.enabled = true;
      });

      after(() => {
          Object.defineProperty(globalThis, 'navigator', { value: realNavigator, writable: true, configurable: true });
          delete document.visibilityState;
          AppState.subscriptions = [];
          document.querySelectorAll('.notification-banner').forEach(function removeBanner(b) { b.remove(); });
      });

      it('minuterie posee meme avec le reglage coupe au demarrage, une seule fois', () => {
          const realSetInterval = globalThis.setInterval;
          const delays = [];
          globalThis.setInterval = function fakeSetInterval(fn, ms) { delays.push(ms); return 1; };
          try {
              NotificationPrefs.geofence.enabled = false;
              startGeofenceMonitoring();
              startGeofenceMonitoring();
          } finally {
              globalThis.setInterval = realSetInterval;
          }
          assert.deepEqual(delays, [30000]);
      });

      it('reglage reactive : alerte a l’arrivee, sans redemarrer', () => {
          tickAt(3000);   // loin : reference
          assert.equal(proximityCount(), 0);
          tickAt(300);    // arrivee
          assert.equal(proximityCount(), 1);
          assert.equal(NotificationQueue.history[0].distributorId, 'dist-near');
      });

      it('deja dans le rayon : une seule alerte, pas une par heure', () => {
          tickAt(3000);
          tickAt(300);
          NotificationPrefs.lastNotifications = {};   // delai d'1 h ecoule : seule l'entree compte
          tickAt(250);
          tickAt(200);
          assert.equal(proximityCount(), 1);
      });

      it('sortir puis revenir : nouvelle alerte ; la limite du rayon ne fait pas de rafale', () => {
          tickAt(3000);
          tickAt(300);
          tickAt(1050);   // dans la marge : toujours dedans
          NotificationPrefs.lastNotifications = {};
          tickAt(300);
          assert.equal(proximityCount(), 1);
          tickAt(1500);   // vraiment sorti
          tickAt(300);
          assert.equal(proximityCount(), 2);
      });

      it('ouverture deja pres du favori : aucune alerte', () => {
          tickAt(300);
          tickAt(300);
          assert.equal(proximityCount(), 0);
      });

      it('onglet cache : position non demandee ; au retour, la premiere mesure sert de reference', () => {
          tickAt(3000);
          assert.equal(asked, 1);
          visibility = 'hidden';
          tickAt(300);
          assert.equal(asked, 1);
          visibility = 'visible';
          tickAt(300);
          assert.equal(asked, 2);
          assert.equal(proximityCount(), 0);
      });

      it('heures calmes : la file part au passage qui suit leur fin, sans redemarrer', () => {
          const hour = new Date().getHours();
          NotificationPrefs.quietHours = { enabled: true, start: hour, end: (hour + 1) % 24 };
          notifyFavoriteEvent(AppState.distributors[0], { type: 'empty', at: Date.now() });
          assert.equal(NotificationQueue.pending.length, 1);
          notificationTick();   // toujours en heures calmes : rien ne part
          assert.equal(NotificationQueue.history.length, 0);
          NotificationPrefs.quietHours.enabled = false;   // fin des heures calmes
          notificationTick();
          assert.equal(NotificationQueue.pending.length, 0);
          assert.equal(NotificationQueue.history[0].type, 'empty');
      });
  });

  describe('File des heures calmes : rien de perdu apres 12 h (NOTIF-04)', () => {
      beforeEach(() => {
          NotificationPrefs.enabled = true;
          NotificationPrefs.quietHours = { enabled: false, start: 22, end: 8 };
          NotificationQueue.pending = [];
          NotificationQueue.history = [];
          document.querySelectorAll('.notification-banner').forEach(function removeBanner(b) { b.remove(); });
      });

      it('retenue plus de 12 h : rangee non lue dans le centre, sans bandeau ; proximite jetee', () => {
          const old = Date.now() - 13 * 60 * 60 * 1000;
          NotificationQueue.pending = [
              { type: 'empty', distributorId: 'dist-near', distributorName: 'Pain du Coin', message: 'Pain du Coin vide', timestamp: old, queuedAt: old },
              { type: 'proximity', distributorId: 'dist-near', distributorName: 'Pain du Coin', message: 'Pain du Coin proche', timestamp: old, queuedAt: old }
          ];
          processQueuedNotifications();
          assert.equal(NotificationQueue.pending.length, 0);
          assert.equal(NotificationQueue.history.length, 1);
          assert.equal(NotificationQueue.history[0].type, 'empty');
          assert.equal(NotificationQueue.history[0].read, false);
          assert.equal(document.querySelectorAll('.notification-banner').length, 0);
          assert.equal(document.getElementById('notifications-badge').textContent, '1');
      });
  });
  ```
- **Doit échouer avant les étapes** :
  - le premier `describe` échoue dans `beforeEach`, avec `TypeError: notificationTick is not a function` ;
  - le second échoue sur `assert.equal(NotificationQueue.history.length, 1)` : il obtient 0, car la notification de plus de 12 h est jetée.

## Vérification (dans l'ordre)
```bash
node --check js/notifications.js && node --check js/utils.js   # aucune sortie
grep -c "calculateDistance" js/notifications.js                # 0
grep -c "queueNotification(notification);" js/notifications.js # 1 (favori seulement)
npm test                                                       # tout vert, dont « NOTIF-04 » et « cache-busting »
npx playwright test --project=functional tests/functional/notifications.spec.js   # tout vert
npm run test:functional                                        # en arrière-plan (~10 min) : tout vert, instables notés dans la PR
git diff --stat                                                # js/notifications.js, js/utils.js, index.html, tests/unit/unit.test.js, tests/integration/dom.test.js (+ BACKLOG.md)
```

## Hors périmètre
- `saveNotificationSettingsFromUI`, les heures calmes en minutes, l'enregistrement sans « Sauvegarder » : NOTIF-06.
- Le texte de l'alerte (« est a 300m », sans accent) : NOTIF-06.
- Délais séparés proximité / favoris, doublons push + appli, doublons de favoris entre onglets : NOTIF-03 (prérequis).
- `sendNotification`, demande de permission, `requestNotificationPermission` : NOTIF-05.
- `js/app.js` (`clearUserData`, écouteur `storage` de BUG-13), `js/favorites-watch.js`, `js/push.js` : aucun changement.
- Alerte de proximité app fermée (géorepérage en arrière-plan) : nouvelle fonctionnalité, hors lot.
- Réglage de proximité par distributeur (`perDistributor`, jamais rempli par l'interface) : gardé tel quel.

## Pièges connus
- **Extraits partagés avec d'autres stories du lot** :
  - Import de `js/notifications.js` (étape 2) : NOTIF-02 ou NOTIF-03 ont pu y ajouter des noms.
    Seule la règle compte : remplacer `calculateDistance` par `diffGeofence` et garder tout le reste.
    Après l'étape 5, `grep -c "calculateDistance" js/notifications.js` doit valoir 0.
  - Ligne `if (canNotify(id)) {` de `checkNearbySubscriptions` (étape 5) : NOTIF-03 a pu lui ajouter
    un argument, par exemple `canNotify(id, 'proximity')`. Accepter cet écart, remplacer quand même
    toute la fonction, et **recopier l'appel de NOTIF-03** dans l'Après avec `distributor.id` à la
    place de `id`. Tout autre écart dans la fonction : s'arrêter.
  - Même cause dans le test DOM : si NOTIF-03 range la marque de proximité dans un autre champ que
    `NotificationPrefs.lastNotifications`, remettre **aussi** ce champ à `{}` partout où le test fait
    `NotificationPrefs.lastNotifications = {}` (`beforeEach` et deux tests).
  - `processQueuedNotifications` (étape 3) et `triggerProximityNotification` (étape 6) : si NOTIF-03
    les a modifiés, l'extrait Avant ne correspondra pas : s'arrêter.
- `notificationTick` est déclarée **après** son usage dans `startGeofenceMonitoring` : c'est une
  déclaration de fonction, remontée en tête par JavaScript. Ne pas la transformer en `const`.
- `QUEUE_ALERT_MAX_MS` se pose juste au-dessus de `processQueuedNotifications`, comme dans
  l'étape 3 : ne pas la déplacer ailleurs dans le fichier.
- jsdom : `document.visibilityState` vaut `'prerender'`. Le test le redéfinit, puis le supprime dans
  `after` (`delete document.visibilityState`).
- Le premier test DOM remplace `setInterval` puis le **remet** dans le `finally`. La minuterie du
  module garde la valeur factice `1` : aucun vrai passage ne tourne pendant les tests (voulu).
- Commentaires du code sans accents (`"Effacer mes donnees"` dans le commentaire de l'étape 4) ;
  les chaînes existantes (`'Erreur géoloc pour geofence:'`) sont recopiées telles quelles.
- Fichiers en CRLF (`js/*.js`, `index.html`, tests) : outil Edit ; si un bloc de plusieurs lignes est
  refusé, petit script Node dans le scratchpad (voir README).
- Monter **toutes** les entrées de l'import map à la **même** valeur.

## Terminé quand
- [ ] Contrôles passés, tests écrits (échouent avant pour la raison annoncée, passent après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : non (aucun écran ne change)
- [ ] Story NOTIF-04 cochée dans BACKLOG.md, PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `fix(notifications): alerte de proximite a l'arrivee, une seule fois, file des heures calmes videe a leur fin`

**Corps** :
- **Constats couverts** : les quatre de la fiche. Pour les instances multiples, la part déjà traitée par BUG-13 (écouteur `storage`) est rappelée.
- **Cause** :
  - minuterie posée seulement si le réglage est actif au démarrage ;
  - alerte à chaque passage dans le rayon, sous le seul délai d'1 h ;
  - aucun test de visibilité ;
  - file des heures calmes vidée au démarrage seulement, puis jetée après 12 h.
- **Correction** :
  - minuterie unique de 30 s ;
  - `diffGeofence` : entrée dans le rayon, marge de sortie, référence muette ;
  - onglet visible seulement ;
  - file vidée au passage qui suit la fin des heures calmes ;
  - au-delà de 12 h, rangement non lu dans le centre.
- **Tests ajoutés** : unitaires `diffGeofence`, DOM NOTIF-04.
- **Vérifications** : sorties des commandes.
- **Captures** : aucune.
