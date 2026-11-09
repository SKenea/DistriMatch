# NOTIF-05 — Abonnement app fermée fiable

- **Lot** : 5. Notifications · **Gravité** : faible · **Niveau conseillé** : medium, **relecture par un modèle plus fort avant fusion**
  (envois enchaînés et nouvel essai : une erreur d'ordre ne se voit pas à l'écran)
- **Prérequis** : **NOTIF-04 fusionnée** dans `master` ; partir de `master` **à jour**. Sinon : s'arrêter.
- **Branche** : `fix/abonnement-app-fermee-fiable` · **Taille** : 3 fichiers JS + `index.html` + 2 fichiers de tests. **Aucune migration, aucun SQL.**
- **Constats couverts** (rapport du 2026-10-21) :
  - Abonnement aux notifications disparu dans le navigateur : l'app ne le recrée jamais — `js/push.js:75` (aujourd'hui ligne 80)
  - Abonnement serveur pas resynchronisé après un échec réseau, et interrupteur allumé malgré le message d'erreur — `js/push.js:115` (aujourd'hui lignes 68 et 160)
  - « Notifications activées » coupé : activer « Prévenu même app fermée » répond « C'est noté » mais désabonne le serveur — `js/push.js:64` (aujourd'hui ligne 69)
  - Permission de notification demandée hors geste utilisateur, malgré « Plus tard » — `js/notifications.js:217` (toujours ligne 217)
  - iPad : ni invitation ni guide « écran d'accueil », mais « Pas disponible sur ce navigateur » — `js/push.js:26` (aujourd'hui ligne 31)
  - Notifications app fermée : iPad (iPadOS 13 et plus) non reconnu — `js/utils.js:1442` (aujourd'hui ligne 1506)
  - Aucun constat n'était déjà corrigé (vérifié le 2026-11-06 sur `master` b970d4d : PRIV-06 a seulement
    ajouté `forgetPushAccount` / `retryPendingUnsubscribe`, BUG-04 l'indice de l'écran d'accueil).

## But
Une fois « Prévenu même app fermée » activé, le téléphone reste vraiment abonné : l'abonnement
disparu est recréé, un envoi raté est renvoyé, l'interrupteur dit toujours la vérité, l'app ne
demande jamais la permission toute seule, et l'iPad reçoit le guide « écran d'accueil ».

## User story
En tant que membre qui a mis un distributeur en favori, je veux un abonnement app fermée fiable,
afin de rester prévenu même quand le réseau ou le navigateur m'a fait perdre l'abonnement.

**Critères d'acceptation**
- [ ] `push` actif, permission accordée, abonnement du navigateur disparu : la synchronisation
      suivante le recrée (`pushManager.subscribe`) puis l'envoie (`push_subscribe`), sans rien demander.
- [ ] Synchronisation ratée (réseau, projet en pause, client Supabase absent) : nouvel essai à
      l'événement `online` et au retour sur l'onglet ; deux appels rapprochés ne se croisent pas.
- [ ] Activation ratée (serveur ou navigateur) : message « Impossible d’activer… » **et** interrupteur
      éteint, `NotificationPrefs.push` à `false`. Sans client Supabase : plus de « C’est noté ».
- [ ] « Notifications activées » coupé : activer « Prévenu même app fermée » rallume aussi
      « Notifications activées » et envoie `push_subscribe` (jamais `push_unsubscribe` + « C’est noté ») ;
      au premier cœur, aucune invitation ; dans les réglages, l'interrupteur app fermée est éteint
      avec « Notifications coupées : activer cet interrupteur les rallume. ».
- [ ] Une notification de l'app (favori, proximité, file des heures calmes) ne demande **jamais** la
      permission : bandeau si elle n'est pas déjà accordée.
- [ ] iPad sous iPadOS 13+ (Safari se présente comme un Mac, écran tactile) : guide « Ajoute DistriMatch
      à ton écran d’accueil » au premier cœur, aide « Sur iPhone et iPad : … » dans les réglages,
      indice BUG-04 dans l'app de l'écran d'accueil. Un vrai Mac (0 point tactile) n'est pas concerné.

## Ce qui est déjà tranché (ne pas refaire l'analyse)
- **Recréer l'abonnement** : une seule fonction `ensureSubscription()` (sortie d'`enablePush`) sert à
  l'activation et à chaque synchronisation. Elle reprend l'enregistrement existant
  (`getRegistration()`), n'enregistre `sw.js` (puis attend `ready`) que s'il n'y en a pas, puis
  `getSubscription() || subscribe(...)`. Ne pas appeler `register` à chaque synchronisation (chaque appel
  relance une vérification réseau de `sw.js`). Ne pas attendre `ready` quand l'enregistrement existe :
  les tests PRIV-06 (`fakePush`) ne simulent pas `ready` et resteraient bloqués.
- **Pas de `pushsubscriptionchange` dans `sw.js`** : `sw.js` est dans le périmètre de NOTIF-07, et la
  réouverture de l'app suffit désormais à recréer l'abonnement. Hors périmètre.
- **Envois enchaînés** : même schéma que `favorites-watch.js` (`isChecking` / `rerunRequested`) : un
  envoi à la fois ; un appel pendant un envoi en relance un après lui (le dernier état gagne).
  `syncPushSubscription` n'est plus `async` mais rend toujours une promesse (`true` = serveur à jour).
  Les appelants actuels (sans `await`) ne changent pas.
- **Nouvel essai** : marque en mémoire (`syncPending`), pas dans localStorage : chaque lancement de
  l'app synchronise déjà (`app.js`). Écouteurs `online` et `visibilitychange` posés une seule fois dans
  `initPushSettings` (garde `dataset.wired` existante) ; `js/app.js` **ne change pas**.
- **Activation ratée** : on remet `push` à `false` (l'interrupteur dit la même chose que le message).
  Écarté : garder `push = true` avec « on termine dès que le réseau revient » (promesse, et deux états
  à expliquer). Le premier cœur ne reproposera pas l'invitation (déjà marquée) : l'interrupteur des
  réglages reste la voie, c'est voulu.
- **Interrupteur général coupé** : on garde le verrou de `sendToServer` (`enabled` faux = désabonné),
  mais demander « Prévenu même app fermée » rallume « Notifications activées » (case cochée, préférence
  enregistrée), **seulement si l'envoi réussit**. `maybeOfferPush` ne propose rien tant que les
  notifications sont coupées (et ne marque pas l'invitation comme faite). `refreshPushSettings` est
  rappelée à la fin de `saveNotificationSettingsFromUI` et de chaque synchronisation.
- **Permission** : le bloc « Demande paresseuse au 1er envoi » de `sendNotification` et la fonction
  `requestNotificationPermission` (aucun autre appelant, ni dans `js/`, ni dans `tests/`, ni dans
  `index.html`) sont supprimés. La permission ne se demande plus que dans `enablePush` (toucher de
  « Oui, préviens-moi » ou de l'interrupteur). `new Notification` reste tel quel (le passer par
  `registration.showNotification` est hors périmètre).
- **iPad** : aide pure `isAppleMobile(userAgent, maxTouchPoints)` dans `utils.js` (non exportée),
  utilisée par `needsHomeScreenForPush` **et** `shouldHintHomeScreenFavorites` (BUG-04 : même défaut sur
  iPad), avec un dernier paramètre `maxTouchPoints = 0` (appels existants inchangés). `push.js` passe
  `navigator.maxTouchPoints || 0`. Textes « Sur iPhone » → « Sur iPhone et iPad ». L'aide géoloc
  (`app.js`) et `isLikelyDesktop` (`utils.js`) ne changent pas.
- **Textes nouveaux** (tutoiement, sans « machine », sans « tap ») :
  « Notifications coupées : activer cet interrupteur les rallume. » et
  « Pas encore enregistré : nouvel essai au retour du réseau. »

## Avant de coder
**Lire en entier** : `js/push.js` (256 lignes environ) ; `js/notifications.js` lignes 195-265 et 448-484 ;
`js/utils.js` lignes 1500-1516 ; `tests/functional/notifications.spec.js` lignes 285-462 (sections 40,
40b, 40c : leurs simulations de `Notification` et de `navigator.serviceWorker` sont réutilisées) ;
`tests/unit/unit.test.js` lignes 2013-2033.

**Réutiliser** (ne pas réécrire) : `favoriteDemo` (`tests/functional/notifications.spec.js`),
`setupApp` (déjà appelé par le `beforeEach` du fichier), `urlBase64ToUint8Array`, `confirmDialog`,
le schéma `isChecking` / `rerunRequested` de `js/favorites-watch.js`.

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter ; un numéro de ligne
différent n'est pas un échec) :
```bash
grep -c "diffGeofence" js/notifications.js                                      # 1 ou plus (NOTIF-04 fusionnée)
grep -c "if (subscription) await sendToServer(subscription);" js/push.js         # 1 (ligne 80)
grep -c "if (!supabaseClient) return;" js/push.js                               # 1 (ligne 68, sendToServer)
grep -c "const registration = await navigator.serviceWorker.register('./sw.js');" js/push.js   # 1 (ligne 153, enablePush)
grep -c "needsHomeScreenForPush(navigator.userAgent, isStandalone())" js/push.js # 1 (ligne 31)
grep -c "AppState.subscriptions.length, seen)) return;" js/push.js              # 1 (ligne 220)
grep -c "toggle.checked = Boolean(NotificationPrefs.push) && perm === 'granted';" js/push.js   # 1 (ligne 234)
grep -c "if (readAsked()) return;" js/push.js                                    # 1 (ligne 196)
grep -c "Sur iPhone" js/push.js                                                  # 2 (lignes 129 et 237)
grep -rn "requestNotificationPermission" js/ tests/ index.html                   # 2 lignes, toutes deux dans js/notifications.js (217, 258)
grep -c "// Demande paresseuse au 1er envoi" js/notifications.js                 # 1
grep -c "showToast('Paramètres sauvegardés', 'success');" js/notifications.js    # 1 (ligne 483)
grep -c "/iPhone|iPad|iPod/i.test" js/utils.js                                   # 2 (lignes 1507 et 1514)
grep -rn "isAppleMobile\|maxTouchPoints\|ensureSubscription\|syncPending\|retryPendingSync" js/ tests/   # aucun résultat
grep -c "pushsubscriptionchange" sw.js                                           # 0
grep -c "^test.describe('40c. Notifications app fermee et compte (PRIV-06)'" tests/functional/notifications.spec.js   # 1
grep -c "^async function favoriteDemo(page) {" tests/functional/notifications.spec.js   # 1
grep -o '"./js/app.js": "./js/app.js?v=[0-9]*"' index.html                      # noter V (123 le 2026-11-06, plus après NOTIF-01..04)
```
Si NOTIF-02/03/04 ont changé un des extraits « Avant » ci-dessous (voir « Pièges connus »), les
contrôles ci-dessus passent peut-être quand même : l'étape échouera sur l'extrait. **S'arrêter** alors.

## Étapes

1. **js/utils.js** — reconnaître l'iPad qui se présente comme un Mac (constats iPad). Avant :
   ```js
   // Sur iPhone / iPad, une page web ne recoit de notifications qu'une fois ajoutee
   // a l'ecran d'accueil (app « standalone »).
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
   Après :
   ```js
   // iPhone / iPad. NOTIF-05 : depuis iPadOS 13, Safari se presente comme un Mac ;
   // l'ecran tactile le trahit (maxTouchPoints > 1, un vrai Mac renvoie 0).
   function isAppleMobile(userAgent, maxTouchPoints) {
       const ua = String(userAgent || '');
       return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1);
   }

   // Sur iPhone / iPad, une page web ne recoit de notifications qu'une fois ajoutee
   // a l'ecran d'accueil (app « standalone »).
   export function needsHomeScreenForPush(userAgent, standalone, maxTouchPoints = 0) {
       return isAppleMobile(userAgent, maxTouchPoints) && !standalone;
   }

   // App de l'ecran d'accueil sur iPhone (BUG-04) : son stockage est separe de Safari,
   // les favoris n'y sont pas. Indice une seule fois, seulement s'il n'y a aucun favori.
   export function shouldHintHomeScreenFavorites(userAgent, standalone, favoritesCount, alreadySeen, maxTouchPoints = 0) {
       return isAppleMobile(userAgent, maxTouchPoints)
           && standalone === true && favoritesCount === 0 && !alreadySeen;
   }
   ```

2. **js/push.js** — passer le nombre de points tactiles (iPad). Avant :
   ```js
   export function pushNeedsHomeScreen() {
       return needsHomeScreenForPush(navigator.userAgent, isStandalone());
   }
   ```
   Après :
   ```js
   // NOTIF-05 : maxTouchPoints distingue l'iPad (Safari s'y presente comme un Mac)
   function touchPoints() {
       return navigator.maxTouchPoints || 0;
   }

   export function pushNeedsHomeScreen() {
       return needsHomeScreenForPush(navigator.userAgent, isStandalone(), touchPoints());
   }
   ```

3. **js/push.js** — envoi sans client = échec ; abonnement recréé ; envois enchaînés et nouvel essai
   (constats « abonnement disparu » et « pas resynchronisé »). Avant :
   ```js
   async function sendToServer(subscription) {
       if (!supabaseClient) return;
       const { error } = NotificationPrefs.enabled
           ? await supabaseClient.rpc('push_subscribe', subscriptionParams(subscription))
           : await supabaseClient.rpc('push_unsubscribe', { p_endpoint: subscription.endpoint });
       if (error) throw error;
   }

   // Favoris, produits suivis, heures calmes ou compte changes : le serveur suit.
   export async function syncPushSubscription() {
       if (!isPushSupported() || !NotificationPrefs.push || permission() !== 'granted') return;
       try {
           const subscription = await currentSubscription();
           if (subscription) await sendToServer(subscription);
       } catch (e) {
           console.warn('[DistriMatch] Abonnement aux notifications non mis a jour :', e?.message || e);
       }
   }
   ```
   Après :
   ```js
   async function sendToServer(subscription) {
       // NOTIF-05 : sans client (CDN bloque), rien n'est envoye : c'est un echec, pas un succes
       if (!supabaseClient) throw new Error('Supabase indisponible');
       const { error } = NotificationPrefs.enabled
           ? await supabaseClient.rpc('push_subscribe', subscriptionParams(subscription))
           : await supabaseClient.rpc('push_unsubscribe', { p_endpoint: subscription.endpoint });
       if (error) throw error;
   }

   // NOTIF-05 : abonnement du navigateur, recree s'il a disparu (expire, permission
   // retiree puis rendue). La permission doit deja etre accordee.
   async function ensureSubscription() {
       let registration = await navigator.serviceWorker.getRegistration();
       if (!registration) {
           registration = await navigator.serviceWorker.register('./sw.js');
           await navigator.serviceWorker.ready;
       }
       return await registration.pushManager.getSubscription()
           || await registration.pushManager.subscribe({
               userVisibleOnly: true,
               applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
           });
   }

   // NOTIF-05 : un envoi a la fois ; un appel pendant un envoi en relance un apres lui
   // (le dernier etat gagne). Un echec est retente au retour du reseau ou de l'onglet.
   let syncRunning = null;
   let syncAgain = false;
   let syncPending = false;

   // Favoris, produits suivis, heures calmes ou compte changes : le serveur suit.
   // Rend une promesse : true une fois le serveur a jour.
   export function syncPushSubscription() {
       if (!isPushSupported() || !NotificationPrefs.push || permission() !== 'granted') return Promise.resolve(false);
       if (syncRunning) {
           syncAgain = true;
           return syncRunning;
       }
       syncRunning = runPushSync();
       return syncRunning;
   }

   async function runPushSync() {
       await Promise.resolve();   // toujours asynchrone : syncRunning est pose avant la fin
       let ok = false;
       do {
           syncAgain = false;
           if (!NotificationPrefs.push || permission() !== 'granted') {
               ok = true;   // coupe entre-temps : plus rien a envoyer
               break;
           }
           try {
               await sendToServer(await ensureSubscription());
               ok = true;
           } catch (e) {
               ok = false;
               console.warn('[DistriMatch] Abonnement aux notifications non mis a jour :', e?.message || e);
           }
       } while (syncAgain);
       syncPending = !ok;
       syncRunning = null;
       refreshPushSettings();
       return ok;
   }

   // Retour du reseau ou de l'onglet : renvoie une synchronisation qui a echoue
   function retryPendingSync() {
       if (syncPending && document.visibilityState === 'visible') syncPushSubscription();
   }
   ```

4. **js/push.js**, `showHomeScreenGuide` — l'iPad aussi. Avant :
   ```js
           message: 'Sur iPhone, les notifications arrivent seulement depuis l’écran d’accueil : touche Partager, puis « Sur l’écran d’accueil ». Ouvre ensuite DistriMatch depuis cette icône et remets-y ton distributeur en favori : l’app de l’écran d’accueil a ses propres favoris.',
   ```
   Après :
   ```js
           message: 'Sur iPhone et iPad, les notifications arrivent seulement depuis l’écran d’accueil : touche Partager, puis « Sur l’écran d’accueil ». Ouvre ensuite DistriMatch depuis cette icône et remets-y ton distributeur en favori : l’app de l’écran d’accueil a ses propres favoris.',
   ```

5. **js/push.js**, `enablePush` — abonnement partagé, interrupteur général rallumé, `push` remis à
   `false` sur échec (constats « interrupteur allumé malgré l'erreur » et « C'est noté mais désabonne »). Avant :
   ```js
           const registration = await navigator.serviceWorker.register('./sw.js');
           await navigator.serviceWorker.ready;
           const subscription = await registration.pushManager.getSubscription()
               || await registration.pushManager.subscribe({
                   userVisibleOnly: true,
                   applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
               });
           NotificationPrefs.push = true;
           saveNotificationPrefs();
           await sendToServer(subscription);
           showToast('C’est noté : tu seras prévenu même app fermée', 'success');
           return true;
       } catch (e) {
           console.warn('[DistriMatch] Activation des notifications impossible :', e?.message || e);
           showToast('Impossible d’activer les notifications pour le moment', 'error');
           return false;
       }
   ```
   Après :
   ```js
           const subscription = await ensureSubscription();
           // NOTIF-05 : demander a etre prevenu rallume les notifications coupees (sinon
           // sendToServer desabonnerait) ; rien ne change si l'envoi echoue
           const wasEnabled = NotificationPrefs.enabled;
           NotificationPrefs.enabled = true;
           try {
               await sendToServer(subscription);
           } catch (err) {
               NotificationPrefs.enabled = wasEnabled;
               throw err;
           }
           NotificationPrefs.push = true;
           saveNotificationPrefs();
           syncPending = false;
           const general = document.getElementById('notif-enabled');
           if (general) general.checked = true;
           showToast('C’est noté : tu seras prévenu même app fermée', 'success');
           return true;
       } catch (e) {
           // NOTIF-05 : l'interrupteur dit la meme chose que le message
           NotificationPrefs.push = false;
           saveNotificationPrefs();
           console.warn('[DistriMatch] Activation des notifications impossible :', e?.message || e);
           showToast('Impossible d’activer les notifications pour le moment', 'error');
           return false;
       }
   ```

6. **js/push.js**, `disablePush` — l'effacement part après un envoi en cours, plus de nouvel essai. Avant :
   ```js
   export async function disablePush() {
       NotificationPrefs.push = false;
       saveNotificationPrefs();
       try {
           const subscription = await currentSubscription();
   ```
   Après :
   ```js
   export async function disablePush() {
       NotificationPrefs.push = false;
       saveNotificationPrefs();
       syncPending = false;
       try {
           if (syncRunning) await syncRunning;   // NOTIF-05 : l'effacement part apres un envoi en cours
           const subscription = await currentSubscription();
   ```

7. **js/push.js**, `maybeOfferPush` — pas d'invitation quand les notifications sont coupées. Avant :
   ```js
           syncPushSubscription();
           return;
       }
       if (readAsked()) return;
   ```
   Après :
   ```js
           syncPushSubscription();
           return;
       }
       if (!NotificationPrefs.enabled) return;   // NOTIF-05 : notifications coupees = pas d'invitation
       if (readAsked()) return;
   ```

8. **js/push.js**, `maybeHintHomeScreenFavorites` — l'iPad aussi (BUG-04). Avant :
   ```js
       if (!shouldHintHomeScreenFavorites(navigator.userAgent, isStandalone(), AppState.subscriptions.length, seen)) return;
   ```
   Après :
   ```js
       if (!shouldHintHomeScreenFavorites(navigator.userAgent, isStandalone(), AppState.subscriptions.length, seen, touchPoints())) return;
   ```

9. **js/push.js**, `refreshPushSettings` — interrupteur cohérent avec « Notifications activées » et
   avec un envoi en attente. Avant :
   ```js
       toggle.checked = Boolean(NotificationPrefs.push) && perm === 'granted';
       toggle.disabled = perm === 'denied' || (perm === 'unsupported' && !pushNeedsHomeScreen());
       if (pushNeedsHomeScreen()) {
           hint.textContent = 'Sur iPhone : ajoute d’abord DistriMatch à ton écran d’accueil (Partager, puis « Sur l’écran d’accueil »).';
       } else if (perm === 'unsupported') {
           hint.textContent = 'Pas disponible sur ce navigateur.';
       } else if (perm === 'denied') {
           hint.textContent = 'Bloquées dans le navigateur : à réactiver dans ses réglages.';
       } else {
   ```
   Après :
   ```js
       // NOTIF-05 : notifications coupees = interrupteur eteint (le serveur est desabonne)
       toggle.checked = Boolean(NotificationPrefs.push) && NotificationPrefs.enabled && perm === 'granted';
       toggle.disabled = perm === 'denied' || (perm === 'unsupported' && !pushNeedsHomeScreen());
       if (pushNeedsHomeScreen()) {
           hint.textContent = 'Sur iPhone et iPad : ajoute d’abord DistriMatch à ton écran d’accueil (Partager, puis « Sur l’écran d’accueil »).';
       } else if (perm === 'unsupported') {
           hint.textContent = 'Pas disponible sur ce navigateur.';
       } else if (perm === 'denied') {
           hint.textContent = 'Bloquées dans le navigateur : à réactiver dans ses réglages.';
       } else if (!NotificationPrefs.enabled) {
           hint.textContent = 'Notifications coupées : activer cet interrupteur les rallume.';
       } else if (toggle.checked && syncPending) {
           hint.textContent = 'Pas encore enregistré : nouvel essai au retour du réseau.';
       } else {
   ```

10. **js/push.js**, `initPushSettings` — écouteurs du nouvel essai, posés une seule fois. Avant :
    ```js
        toggle.addEventListener('change', async () => {
            if (toggle.checked) await enablePush();
            else await disablePush();
            refreshPushSettings();
        });
    }
    ```
    Après :
    ```js
        toggle.addEventListener('change', async () => {
            if (toggle.checked) await enablePush();
            else await disablePush();
            refreshPushSettings();
        });
        // NOTIF-05 : une synchronisation ratee (hors ligne, projet en pause) est renvoyee
        window.addEventListener('online', retryPendingSync);
        document.addEventListener('visibilitychange', retryPendingSync);
    }
    ```

11. **js/notifications.js**, `sendNotification` — plus jamais de demande de permission depuis une
    notification (minuterie, sans toucher). Avant :
    ```js
        // Vraie notification navigateur si permission accordee, sinon bandeau
        // in-app (fallback : zero regression si refus / non supporte).
        const supported = typeof window !== 'undefined' && 'Notification' in window;
        if (supported && Notification.permission === 'default'
            && NotificationPrefs.enabled) {
            // Demande paresseuse au 1er envoi
            requestNotificationPermission();
        }
        if (options.silent) {
    ```
    Après :
    ```js
        // Vraie notification navigateur si la permission est DEJA accordee (reglages ou
        // invitation du premier favori), sinon bandeau in-app. NOTIF-05 : jamais de
        // demande de permission ici (minuterie, sans toucher de l'utilisateur).
        const supported = typeof window !== 'undefined' && 'Notification' in window;
        if (options.silent) {
    ```
    (NOTIF-03 : la suite `// Rien a afficher ...` puis `} else if (supported && Notification.permission === 'granted') {`
    reste telle quelle.)

12. **js/notifications.js** — supprimer `requestNotificationPermission`, devenue sans appelant. Avant :
    ```js
    // CENTRE DE NOTIFICATIONS (cloche)
    // ============================================

    export function requestNotificationPermission() {
        if (typeof window === 'undefined' || !('Notification' in window)) return;
        if (Notification.permission !== 'default') return;
        try {
            Notification.requestPermission();
        } catch (e) { /* Safari ancien : API callback only, ignore */ }
    }

    export function getUnreadCount() {
    ```
    Après :
    ```js
    // CENTRE DE NOTIFICATIONS (cloche)
    // ============================================

    export function getUnreadCount() {
    ```

13. **js/notifications.js**, `saveNotificationSettingsFromUI` — l'interrupteur app fermée suit
    « Notifications activées ». Avant :
    ```js
        saveNotificationPrefs();
        syncPushSubscription();
        showToast('Paramètres sauvegardés', 'success');
    ```
    Après :
    ```js
        saveNotificationPrefs();
        syncPushSubscription();
        refreshPushSettings();   // NOTIF-05 : « Notifications activées » coupe aussi l'app fermee
        showToast('Paramètres sauvegardés', 'success');
    ```

14. **index.html** — trois modules de `js/` changent : monter le `?v=` de **toutes** les entrées de
    l'import map à la même valeur V+1. Aucun CSS ne change.

## Tests

### Test 1 — iPad reconnu (unitaire)
- **Fichier** : `tests/unit/unit.test.js`, **à la toute fin du fichier** (après sa dernière ligne `});`).
  `needsHomeScreenForPush` et `shouldHintHomeScreenFavorites` sont déjà importés (ligne 1962 environ).
- **Code à ajouter** :
  ```js

  // ============================================
  // IPAD RECONNU POUR LES NOTIFICATIONS APP FERMEE (NOTIF-05)
  // ============================================
  // Depuis iPadOS 13, Safari se presente comme un Mac : seul l'ecran tactile
  // (maxTouchPoints > 1) le distingue d'un vrai Mac (0).

  describe('iPad reconnu : guide écran d’accueil et indice (NOTIF-05)', () => {
      const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

      it('iPad qui se presente comme un Mac : guide hors ecran d’accueil ; un vrai Mac, non', () => {
          assert.equal(needsHomeScreenForPush(IPAD_AS_MAC, false, 5), true);
          assert.equal(needsHomeScreenForPush(IPAD_AS_MAC, true, 5), false);
          assert.equal(needsHomeScreenForPush(IPAD_AS_MAC, false, 0), false);
          assert.equal(needsHomeScreenForPush(IPAD_AS_MAC, false), false);
      });

      it('app de l’ecran d’accueil sur iPad, sans favori : indice ; sur un Mac, non', () => {
          assert.equal(shouldHintHomeScreenFavorites(IPAD_AS_MAC, true, 0, false, 5), true);
          assert.equal(shouldHintHomeScreenFavorites(IPAD_AS_MAC, true, 0, false, 0), false);
      });
  });
  ```
- **Doit échouer avant l'étape 1** : `needsHomeScreenForPush(IPAD_AS_MAC, false, 5)` rend `false`
  (la regex ne voit pas « iPad » dans un user-agent de Mac, le 3e argument est ignoré).

### Test 2 — abonnement fiable (fonctionnel)
- **Fichier** : `tests/functional/notifications.spec.js`, **à la toute fin du fichier** (après la
  dernière ligne `});` de la section 40c).
- **Ce qu'il fait** : permission simulée « accordée », `navigator.serviceWorker` simulé (abonnement
  présent ou disparu), RPC `push_subscribe` / `push_unsubscribe` interceptées (réponse 200 ou 500).
  Une page réelle (`setupApp` du `beforeEach` du fichier), aucun accès au vrai serveur.
- **Code à ajouter** :
  ```js

  // ============================================
  // 40d. ABONNEMENT APP FERMEE FIABLE (NOTIF-05)
  // ============================================

  test.describe('40d. Abonnement app fermee fiable (NOTIF-05)', () => {
      const ENDPOINT = 'https://push.test/notif05';

      // Permission accordee, navigateur simule (abonnement present ou disparu), RPC push interceptees
      async function fakeBrowserPush(page, { existing }) {
          const state = { calls: [], failSubscribe: false };
          for (const fn of ['push_subscribe', 'push_unsubscribe']) {
              await page.route(`**/rest/v1/rpc/${fn}`, async route => {
                  state.calls.push(fn);
                  if (fn === 'push_subscribe' && state.failSubscribe) {
                      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'indisponible' }) });
                  }
                  return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
              });
          }
          // initPushSettings a tourne (ecouteurs du nouvel essai poses)
          await page.waitForSelector('#push-enabled[data-wired="1"]', { state: 'attached', timeout: 50000 });
          await page.evaluate(({ endpoint, existing }) => {
              window.__subscribeCalls = 0;
              Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'granted' });
              Notification.requestPermission = async () => 'granted';
              const fakeSub = { endpoint, toJSON: () => ({ endpoint, keys: { p256dh: 'p256', auth: 'auth' } }), unsubscribe: async () => true };
              let current = existing ? fakeSub : null;
              const fakeReg = { pushManager: {
                  getSubscription: async () => current,
                  subscribe: async () => { window.__subscribeCalls++; current = fakeSub; return fakeSub; }
              } };
              navigator.serviceWorker.getRegistration = async () => fakeReg;
              navigator.serviceWorker.register = async () => fakeReg;
              Object.defineProperty(navigator.serviceWorker, 'ready', { configurable: true, value: Promise.resolve(fakeReg) });
          }, { endpoint: ENDPOINT, existing });
          return state;
      }

      async function turnOnPushToggle(page) {
          await page.evaluate(() => {
              const toggle = document.getElementById('push-enabled');
              toggle.checked = true;
              toggle.dispatchEvent(new Event('change'));
          });
      }

      test('abonnement disparu dans le navigateur : recree puis envoye au serveur', async ({ page }) => {
          const push = await fakeBrowserPush(page, { existing: false });
          await page.evaluate(async () => {
              const { NotificationPrefs } = await import('./js/state.js');
              NotificationPrefs.push = true;
              await (await import('./js/push.js')).syncPushSubscription();
          });
          expect(await page.evaluate(() => window.__subscribeCalls)).toBe(1);
          expect(push.calls).toEqual(['push_subscribe']);
      });

      test('synchronisation ratee : nouvel essai au retour du reseau', async ({ page }) => {
          const push = await fakeBrowserPush(page, { existing: true });
          push.failSubscribe = true;
          await page.evaluate(async () => {
              const { NotificationPrefs } = await import('./js/state.js');
              NotificationPrefs.push = true;
              await (await import('./js/push.js')).syncPushSubscription();
          });
          expect(push.calls).toEqual(['push_subscribe']);
          push.failSubscribe = false;
          await page.evaluate(() => window.dispatchEvent(new Event('online')));
          await expect.poll(() => push.calls.length).toBe(2);
          expect(push.calls).toEqual(['push_subscribe', 'push_subscribe']);
      });

      test('activation refusee par le serveur : l’interrupteur reste eteint, comme le message', async ({ page }) => {
          const push = await fakeBrowserPush(page, { existing: false });
          push.failSubscribe = true;
          await page.evaluate(async () => (await import('./js/notifications.js')).openNotificationSettings());
          await page.waitForSelector('#notification-settings.view-active');
          await turnOnPushToggle(page);
          await expect(page.locator('.toast').last()).toContainText('Impossible d’activer les notifications');
          await expect(page.locator('#push-enabled')).not.toBeChecked();
          expect(await page.evaluate(async () => (await import('./js/state.js')).NotificationPrefs.push)).toBe(false);
      });

      test('notifications coupees : « Prévenu même app fermée » les rallume et abonne', async ({ page }) => {
          const push = await fakeBrowserPush(page, { existing: false });
          await page.evaluate(async () => {
              const { NotificationPrefs } = await import('./js/state.js');
              NotificationPrefs.enabled = false;
              (await import('./js/notifications.js')).openNotificationSettings();
          });
          await page.waitForSelector('#notification-settings.view-active');
          await expect(page.locator('#notif-enabled')).not.toBeChecked();
          await expect(page.locator('#push-state')).toHaveText('Notifications coupées : activer cet interrupteur les rallume.');
          await turnOnPushToggle(page);
          await expect(page.locator('.toast').last()).toContainText('tu seras prévenu même app fermée');
          expect(push.calls).toEqual(['push_subscribe']);
          await expect(page.locator('#notif-enabled')).toBeChecked();
          await expect(page.locator('#push-enabled')).toBeChecked();
      });

      test('notifications coupees : pas d’invitation au premier coeur', async ({ page }) => {
          await page.evaluate(async () => {
              localStorage.removeItem('distrimatch_push_asked');
              // Chromium sans affichage repond « denied » : on simule « pas encore demande »
              Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'default' });
              const { NotificationPrefs } = await import('./js/state.js');
              NotificationPrefs.enabled = false;
          });
          await favoriteDemo(page);
          await page.waitForTimeout(500);
          await expect(page.locator('#confirm-modal')).not.toHaveClass(/active/);
          expect(await page.evaluate(() => localStorage.getItem('distrimatch_push_asked'))).toBeNull();
      });

      test('une notification de l’app ne demande jamais la permission : bandeau a la place', async ({ page }) => {
          await page.evaluate(async () => {
              window.__permissionAsks = 0;
              Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'default' });
              Notification.requestPermission = async () => { window.__permissionAsks++; return 'default'; };
              const { NotificationPrefs, AppState } = await import('./js/state.js');
              NotificationPrefs.enabled = true;
              NotificationPrefs.quietHours.enabled = false;   // le test doit passer aussi la nuit
              const { notifyFavoriteEvent } = await import('./js/notifications.js');
              notifyFavoriteEvent(AppState.distributors[0], { type: 'empty', at: Date.now() });
          });
          await expect(page.locator('.notification-banner').first()).toBeVisible();
          expect(await page.evaluate(() => window.__permissionAsks)).toBe(0);
      });
  });
  ```
- **Assertions et pourquoi chacune échoue avant la correction** :
  - « abonnement disparu » : `__subscribeCalls` vaut 0 (l'ancienne synchronisation ne fait rien quand
    `getSubscription()` rend `null`).
  - « synchronisation ratée » : le `poll` reste à 1 appel (aucun écouteur `online` ne renvoie).
  - « activation refusée » : `#push-enabled` reste coché (`push = true` enregistré avant l'envoi raté).
  - « notifications coupées… rallume » : l'aide est l'ancienne (« Tes favoris te préviennent… ») ;
    sans cette ligne, `push.calls` vaudrait `['push_unsubscribe']`.
  - « pas d'invitation » : la fenêtre « Être prévenu même app fermée ? » s'ouvre.
  - « jamais la permission » : `__permissionAsks` vaut 1 (demande paresseuse de `sendNotification`).
  (Playwright relance un échec une fois : deux échecs pour la bonne raison = normal.)
- Vérifié avant d'écrire la fiche (copie de `master` b970d4d, étapes appliquées telles qu'écrites) :
  `npm test` 346 passed ; `npm run test:functional` 253 passed ; sans les étapes, les 2 tests unitaires
  et les 6 tests 40d échouent exactement pour les raisons ci-dessus.

## Vérification (dans l'ordre)
```bash
node --check js/push.js && node --check js/notifications.js && node --check js/utils.js   # aucune sortie
grep -rn "requestNotificationPermission\|Demande paresseuse" js/ tests/ index.html        # aucun résultat
grep -c "Sur iPhone et iPad" js/push.js                                                   # 2
npm test                                                     # tout vert, dont « NOTIF-05 » et « cache-busting »
npx playwright test --project=functional -g "Notifications app fermee|NOTIF-05|Centre de notifications"   # tout vert (40, 40b, 40c, 40d, 5ter, 6bis)
npm run test:functional                                      # en arrière-plan (~10 min) : tout vert, instables notés dans la PR
git diff --stat                                              # push.js, notifications.js, utils.js, index.html, unit.test.js, notifications.spec.js (+ BACKLOG.md)
```
Le serveur local doit répondre sur le port 8080 (voir README). Les sections 40c (PRIV-06) doivent
rester vertes : elles ne simulent pas `ready`, d'où le choix de `getRegistration()` d'abord.

## Hors périmètre
- `sw.js` (écouteur `pushsubscriptionchange`, effacement des caches, clic sur la notification) : NOTIF-07.
- Enregistrement des réglages sans « Sauvegarder », minutes des heures calmes, textes « Vide / En
  panne » : NOTIF-06. Ici on ajoute seulement `refreshPushSettings()` dans `saveNotificationSettingsFromUI`.
- Doublon push serveur + veille de l'app (`isPushActive`, NOTIF-03), géorepérage (NOTIF-04) : rallumer
  « Notifications activées » par l'interrupteur app fermée ne relance pas le géorepérage ; s'il
  existe une fonction de relance depuis NOTIF-04, **ne pas** l'appeler ici (le noter dans la PR).
- Remplacer `new Notification` par `registration.showNotification` (Android) : story à part.
- Aide géoloc « sur iPhone » (`js/app.js`) et `isLikelyDesktop` (`js/utils.js`) : inchangées.
- `js/app.js` : ne change pas (les écouteurs du nouvel essai sont dans `initPushSettings`).
- Garder la marque « envoi en attente » entre deux lancements : inutile, chaque lancement synchronise.

## Pièges connus
- **Stories voisines** : NOTIF-02/03/04 touchent aussi `js/push.js` et `js/notifications.js`.
  Extraits les plus exposés : l'étape 11 (`sendNotification`, que NOTIF-03 peut modifier pour ne pas
  réalerter quand la push est active, et NOTIF-07 plus tard pour le bandeau), l'étape 3
  (`syncPushSubscription` ; NOTIF-03 peut exporter un `isPushActive()` juste à côté) et l'étape 13
  (`saveNotificationSettingsFromUI`, si NOTIF-04 y relance le géorepérage). Si un extrait « Avant »
  ne correspond plus : **s'arrêter et signaler**, ne pas fusionner les deux versions au jugé.
- Étape 3 : `syncPushSubscription` perd son `async` mais rend toujours une promesse (copier tel quel).
  `await Promise.resolve()` en tête de `runPushSync` est voulu : sans lui, une sortie immédiate
  remettrait `syncRunning` à `null` **avant** qu'il soit posé, et il resterait posé pour toujours.
- Étape 3 : `refreshPushSettings` et `retryPendingSync` sont des déclarations de fonction : leur
  position dans le fichier ne compte pas. `syncPending` / `syncRunning` sont déclarés à l'étape 3,
  **au-dessus** d'`enablePush` et de `disablePush` qui les utilisent (étapes 5 et 6).
- Étape 5 : le `try` interne remet `enabled` comme avant si l'envoi échoue, puis relance l'erreur vers
  le `catch` externe, qui remet `push` à `false`. Ne pas enregistrer (`saveNotificationPrefs`) avant
  la réussite de l'envoi.
- Étape 12 : garder les deux lignes d'en-tête `// CENTRE DE NOTIFICATIONS (cloche)` et `// ====` ;
  une seule ligne vide avant `export function getUnreadCount()`.
- Test 2 : simuler l'interrupteur par `checked = true` + événement `change` (pas de clic : le libellé
  `setting-toggle` peut masquer la case). `fakeBrowserPush` attend `#push-enabled[data-wired="1"]`
  (sinon l'écouteur `online` n'existe pas encore).
- Test 2 « jamais la permission » : `notifyFavoriteEvent` est appelée sans `await` (fonction
  synchrone) ; si NOTIF-03 lui a ajouté une condition sur la push active, `push` vaut `false` ici,
  le bandeau doit s'afficher.
- Fichiers en CRLF : outil Edit ; si un bloc refuse, petit script Node dans le scratchpad (voir README).
- Bump de **toutes** les entrées de l'import map à la **même** valeur.

## Terminé quand
- [ ] Contrôles passés, tests écrits (échouent avant, passent après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : non (réglages des notifications absents du script de capture ; l'iPad ne se
      simule pas de façon fiable, le test unitaire couvre la détection)
- [ ] Story cochée dans BACKLOG.md (NOTIF-05), PR ouverte (non fusionnée), avec la mention
      « à relire par un modèle plus fort avant fusion »

## Modèle de PR
**Titre** : `fix(notifications): abonnement app fermee recree, resynchronise, interrupteurs coherents (NOTIF-05)`

**Corps** : constats couverts (six, voir la fiche) ; causes (abonnement disparu jamais recréé, aucun
nouvel essai, `push` enregistré avant l'envoi, verrou « Notifications activées » ignoré par
l'activation, demande de permission depuis une minuterie, iPad vu comme un Mac) ; corrections ;
textes nouveaux (« Notifications coupées : activer cet interrupteur les rallume. », « Pas encore
enregistré : nouvel essai au retour du réseau. », « Sur iPhone et iPad ») ; tests ajoutés (unitaire
iPad, 6 fonctionnels 40d) ; sorties des commandes de vérification ; tests instables éventuels ;
**à relire par un modèle plus fort avant fusion**.
