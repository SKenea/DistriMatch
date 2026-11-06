# NOTIF-07 — Notifications bien affichées

- **Lot** : 5. Notifications · **Gravité** : faible · **Niveau conseillé** : medium, **relecture par un modèle plus fort avant fusion**
  (`sw.js` ne tourne pas en local : il est vérifié par un test qui l'exécute avec un faux navigateur, puis sur téléphone après déploiement)
- **Prérequis** : **NOTIF-06 fusionnée** dans `master` ; partir de `master` **à jour**. Sinon : s'arrêter
  (NOTIF-02 à NOTIF-06 modifient `js/notifications.js`, `js/app.js` et `index.html` juste avant celle-ci).
- **Branche** : `fix/notifications-affichage` · **Taille** : 4 fichiers de code (`sw.js`, `js/notifications.js`,
  `js/app.js`, `css/feed-and-nav.css`) + `index.html` + `CLAUDE.md` (une phrase) + 3 fichiers de tests. **Aucune migration, aucun SQL.**
- **Constats couverts** (rapport du 2026-10-21 ; tous revérifiés le 2026-11-06 sur `master` b970d4d : **aucun n'est déjà corrigé**,
  `sw.js` n'a pas changé depuis EPIC-T25) :
  - Une nouvelle notification d'un même favori remplace l'ancienne sans son ni vibration — `sw.js:26` (aujourd'hui lignes 22-28)
  - Le service worker efface tous les caches de l'origine, y compris ceux des autres projets de skenea.github.io — `sw.js:11` (inchangé, lignes 11-12)
  - Bandeau de notification in-app muet pour les lecteurs d'écran et retiré au bout de 5 s — `js/notifications.js:368` (aujourd'hui lignes 365-399)
  - Notifications non lues indiscernables : même fond que la page — `css/feed-and-nav.css:418` (inchangé, lignes 418-421)
  - Toucher une notification recharge l'onglet ouvert : avis, ajout ou message en cours de saisie perdus — `sw.js:40` (aujourd'hui lignes 31-44)

## But
Une nouvelle alerte d'un favori sonne même si la précédente est encore affichée, toucher une notification
ouvre la fiche sans recharger l'app (la saisie en cours est gardée), le bandeau est lu par les lecteurs
d'écran et reste le temps de l'atteindre, les notifications non lues se voient, et DistriMatch ne vide plus
les caches des autres projets hébergés sur skenea.github.io.

## User story
En tant que membre qui suit des favoris, je veux des notifications bien affichées, afin de ne rien rater ni perdre.

**Critères d'acceptation**
- [ ] À l'activation de `sw.js`, seuls les caches dont le nom commence par `distrimatch` ou `snackmatch` sont effacés.
- [ ] Une notification app fermée qui remplace celle du même favori (même `tag`) sonne / vibre (`renotify: true`) ;
      sans `tag` (contenu illisible), elle s'affiche quand même, sans `renotify`.
- [ ] La notification système de l'app ouverte porte le même tag que celle du serveur (`distrimatch-<id>`) et `renotify`.
- [ ] Toucher une notification alors qu'un onglet DistriMatch est ouvert : l'onglet passe au premier plan et ouvre
      la fiche **sans se recharger** ; aucun onglet : une nouvelle fenêtre s'ouvre sur la fiche.
- [ ] Distributeur inconnu de l'onglet : toast « Distributeur introuvable » (même texte que le lien direct).
- [ ] Le bandeau est posé dans une zone `role="status"` présente dès le chargement ; son émoji est masqué
      aux lecteurs d'écran ; ses boutons sont `type="button"` ; plus d'`onclick` en ligne.
- [ ] Le bandeau reste 7 s, et tant qu'il est survolé ou qu'il a le focus ; s'il part en ayant le focus,
      le focus revient où il était.
- [ ] Une ligne non lue du centre de notifications a un fond blanc (la page est grise) et une pastille avant
      le titre ; son nom accessible commence par « Nouveau : ».

## Ce qui est déjà tranché (ne pas refaire l'analyse)
- **Caches** : l'historique de `sw.js` (`git log -- sw.js` : af354c4 puis 6106ec6) montre que DistriMatch n'a
  **jamais créé de cache** (l'ancien `sw.js` se désinstallait, aucun `caches.open` dans tout l'historique).
  On garde une purge par prudence, limitée à `/^(distrimatch|snackmatch)/i`. `sw.js` reste **sans cache ni
  gestionnaire `fetch`** (CLAUDE.md) : ne rien y ajouter d'autre.
- **Alerte au remplacement** : `renotify: Boolean(data.tag)` dans `sw.js`. La garde est indispensable :
  `renotify: true` avec un tag vide lève une `TypeError` (notification perdue), cas du contenu illisible.
  Firefox et Safari ignorent `renotify` : normal. Côté app, le tag de `new Notification` passe de `<id>`
  à `distrimatch-<id>` (celui du serveur, `supabase/functions/push-notify/index.ts:142`) avec la même garde :
  c'est le « tag aligné » renvoyé ici par NOTIF-03.
- **Toucher une notification** : `sw.js` cherche un onglet **contrôlé** (`matchAll({ type: 'window' })`, sans
  `includeUncontrolled` : `client.navigate` échoue sur un onglet non contrôlé), de premier niveau
  (`frameType !== 'nested'`) et dans la portée ; il le met au premier plan (`focus` dans un try/catch) et lui
  poste `{ type: 'distrimatch:open', id }` (id lu dans `?id=` de l'URL envoyée par le serveur). Plus de
  `client.navigate`. Aucun onglet trouvé : `openWindow(url)` comme avant (couvre l'onglet non contrôlé
  après Ctrl+Maj+R : une nouvelle fenêtre s'ouvre, accepté).
- **Côté app** : écouteur `navigator.serviceWorker` `message` dans `js/app.js` (fonction module
  `listenNotificationClicks`, branchée juste après `initDistModal()`). Il attend `distributorsPromise`
  (onglet tout juste ouvert) puis ouvre la fiche avec `openDistributorModal(id)` ; id inconnu : toast
  « Distributeur introuvable » (texte déjà utilisé par `openModalFromUrlParam`, `js/gmaps-ui.js`). Le message
  ne passe pas par `?id=` : la mesure `qr_scan` / `fiche_ouverte` reste celle d'une ouverture normale.
- **Bandeau** : zone permanente `<div id="notification-banner-region" role="status" aria-live="polite" aria-atomic="true"></div>`
  dans `index.html`, juste après `#toast-container` (une zone créée en même temps que son contenu n'est pas
  annoncée de façon fiable). Le bandeau garde sa classe et son style (`position: fixed`) : la zone n'a besoin
  d'aucun CSS. Repli sur `document.body` si la zone manque. Durée 7 s (comme `showActionToast`, `js/utils.js`),
  réarmée tant que `:hover` ou focus dedans. `showNotificationBanner` devient **exportée** (pour le test DOM).
- **Non lues** : fond `var(--white)` (la page `.view-page` est en `var(--light)`, `css/panels.css:291`) +
  pastille `::before` avant le titre en `var(--primary-text)` (repère qui ne repose pas que sur le fond) +
  « Nouveau : » en tête de l'`aria-label` (il remplace le contenu du bouton : un `<span class="sr-only">` ne
  serait pas lu). Tokens existants seulement (`css/base.css`).
- **Garder « Nouveau » pendant toute la visite** (option du constat : la liste re-rendue après une suppression
  perd le repère, tout étant marqué lu à l'ouverture) : **non retenu** (voir Hors périmètre).
- **CLAUDE.md** : la phrase « et efface les anciens caches » devient fausse ; on la corrige (étape 9).
- **Tests de `sw.js`** : le fichier est exécuté dans `node:vm` avec un faux `self` / `caches` / `clients`.
  Vérifié avant d'écrire la fiche : 4 des 5 tests échouent avec le `sw.js` actuel, les 5 passent avec les étapes 1 à 4.

## Avant de coder
**Lire en entier** : `sw.js` (45 lignes) ; `js/notifications.js` fonctions `sendNotification`,
`renderNotificationsList`, `openNotificationsView`, `showNotificationBanner` ; `js/app.js` lignes 600-660
(`handlePrivacyLinkClick`, début du `DOMContentLoaded`) ; `css/feed-and-nav.css` lignes 316-470 ;
`js/utils.js` `showActionToast` (motif `arm()`) ; `tests/integration/dom.test.js` describe « Centre de notifications ».

**Réutiliser** (ne pas réécrire) : motif `arm()` de `showActionToast` (`js/utils.js`) ; `openDistributorModal`
et `showToast` (déjà importés dans `js/app.js`) ; `escapeHTML` ; classe CSS existante `.notification-banner`.

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter ; un numéro de ligne différent n'est pas un échec) :
```bash
grep -c 'await Promise.all(keys.map(key => caches.delete(key)));' sw.js                      # 1
grep -c "(versionnes a la main, ?v=N). L'ancien service worker a cache est efface." sw.js    # 1
grep -c '        tag: data.tag,' sw.js                                                       # 1
grep -c 'return client.navigate(target);' sw.js                                              # 1
grep -c '// Toucher la notification ouvre la fiche (reutilise un onglet deja ouvert).' sw.js # 1
grep -c "addEventListener('fetch'\|caches.open" sw.js                                        # 0
grep -c '^function showNotificationBanner(notif) {' js/notifications.js                      # 1
grep -cF "onclick=\"this.closest('.notification-banner').remove();\"" js/notifications.js     # 1
grep -c '                tag: notif.distributorId' js/notifications.js                       # 1
grep -cF "<div class=\"notif-item \${n.read ? '' : 'unread'}\">" js/notifications.js           # 1
grep -c '^\.notif-item\.unread {' css/feed-and-nav.css                                       # 1
grep -c 'serviceWorker' js/app.js                                                            # 0
grep -c '^    initDistModal();' js/app.js                                                    # 1
grep -c '^function handlePrivacyLinkClick(e) {' js/app.js                                    # 1
grep -c "showToast('Distributeur introuvable', 'error');" js/gmaps-ui.js                     # 1
grep -rc 'notification-banner-region' index.html js/ css/ | grep -vc ':0$'                  # 0
grep -c 'id="toast-container" class="toast-container" role="status" aria-live="polite" aria-atomic="true"></div>' index.html   # 1
grep -c 'efface les anciens caches' CLAUDE.md                                                # 1
grep -n "^import .* from 'node:test';" tests/integration/dom.test.js   # noter les noms importés (le 2026-11-06 : describe, it, beforeEach, after)
grep -c '^import vm from' tests/unit/unit.test.js                                            # 0 (sinon : ne pas rajouter la ligne, voir Tests)
grep -c 'notif07' tests/integration/dom.test.js                                              # 0
grep -o '"./js/app.js": "./js/app.js?v=[0-9]*"' index.html      # noter V (123 le 2026-11-06, plus après NOTIF-01..06)
grep -o 'feed-and-nav.css?v=[0-9]*' index.html                   # noter W (32 attendu : aucune story précédente ne le touche)
```

## Étapes

1. **sw.js** — en-tête et préfixe des caches de DistriMatch. Avant :
   ```js
   // DistriMatch - Service worker LIMITE AUX NOTIFICATIONS (EPIC-T25).
   // Aucun cache, aucun gestionnaire fetch : le reseau sert toujours les fichiers
   // (versionnes a la main, ?v=N). L'ancien service worker a cache est efface.
   ```
   Après :
   ```js
   // DistriMatch - Service worker LIMITE AUX NOTIFICATIONS (EPIC-T25).
   // Aucun cache, aucun gestionnaire fetch : le reseau sert toujours les fichiers
   // (versionnes a la main, ?v=N). NOTIF-07 : seuls d'eventuels caches DistriMatch sont effaces.

   // NOTIF-07 : le stockage des caches est partage par tous les projets de skenea.github.io
   // (meme origine) : on ne touche qu'aux caches nommes distrimatch... ou snackmatch...
   // (DistriMatch n'en a jamais cree : purge gardee par prudence).
   const OWN_CACHE_PREFIX = /^(distrimatch|snackmatch)/i;
   ```

2. **sw.js**, `activate` — ne purger que ces caches. Avant :
   ```js
           await Promise.all(keys.map(key => caches.delete(key)));
   ```
   Après :
   ```js
           await Promise.all(keys.filter(key => OWN_CACHE_PREFIX.test(key)).map(key => caches.delete(key)));
   ```

3. **sw.js**, `push` — le remplacement sonne. Avant :
   ```js
           tag: data.tag,
           data: { url: data.url || './' }
   ```
   Après :
   ```js
           tag: data.tag,
           // NOTIF-07 : une nouvelle notification du meme favori remplace l'ancienne ET sonne / vibre.
           // Jamais sans tag : renotify avec un tag vide leve une erreur (notification perdue).
           renotify: Boolean(data.tag),
           data: { url: data.url || './' }
   ```

4. **sw.js**, `notificationclick` — message à l'onglet ouvert au lieu de le recharger. Avant :
   ```js
   // Toucher la notification ouvre la fiche (reutilise un onglet deja ouvert).
   self.addEventListener('notificationclick', (event) => {
       event.notification.close();
       const target = new URL(event.notification.data?.url || './', self.registration.scope).href;
       event.waitUntil((async () => {
           const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
           for (const client of windows) {
               if (client.url.startsWith(self.registration.scope) && 'navigate' in client) {
                   await client.focus();
                   return client.navigate(target);
               }
           }
           return self.clients.openWindow(target);
       })());
   });
   ```
   Après :
   ```js
   // Toucher la notification ouvre la fiche. NOTIF-07 : un onglet DistriMatch deja ouvert passe
   // au premier plan et recoit un message (app.js ouvre la fiche), SANS etre recharge : une saisie
   // en cours (ajout, avis, message) est gardee. Aucun onglet controle : nouvelle fenetre.
   self.addEventListener('notificationclick', (event) => {
       event.notification.close();
       const target = new URL(event.notification.data?.url || './', self.registration.scope);
       const distributorId = target.searchParams.get('id');
       event.waitUntil((async () => {
           const windows = await self.clients.matchAll({ type: 'window' });
           const client = windows.find(c => c.url.startsWith(self.registration.scope) && c.frameType !== 'nested');
           if (client) {
               try { await client.focus(); } catch (e) { /* focus refuse : le message part quand meme */ }
               if (distributorId) client.postMessage({ type: 'distrimatch:open', id: distributorId });
               return;
           }
           return self.clients.openWindow(target.href);
       })());
   });
   ```

5. **js/notifications.js**, `sendNotification` — même tag que le serveur, et le remplacement sonne. Avant :
   ```js
               const n = new Notification(typeInfo.title, {
                   body: notif.message,
                   icon: 'images/icon-192.png',
                   tag: notif.distributorId
               });
   ```
   Après :
   ```js
               // NOTIF-07 : meme tag que la notification du serveur (distrimatch-<id>) ; une notification
               // qui remplace celle du meme favori sonne / vibre aussi (renotify, jamais sans tag)
               const tag = notif.distributorId ? `distrimatch-${notif.distributorId}` : '';
               const n = new Notification(typeInfo.title, {
                   body: notif.message,
                   icon: 'images/icon-192.png',
                   tag,
                   renotify: Boolean(tag)
               });
   ```

6. **js/notifications.js**, `renderNotificationsList` — « Nouveau : » pour une ligne non lue. Avant :
   ```js
           const typeInfo = NOTIFICATION_TYPES[n.type] || NOTIFICATION_TYPES.proximity;
           return `
               <div class="notif-item ${n.read ? '' : 'unread'}">
                   <button type="button" class="notif-item-open" data-distributor-id="${escapeHTML(String(n.distributorId ?? ''))}" aria-label="${escapeHTML(`${typeInfo.title} : ${n.message || ''}. Ouvrir la fiche`)}">
   ```
   Après :
   ```js
           const typeInfo = NOTIFICATION_TYPES[n.type] || NOTIFICATION_TYPES.proximity;
           // NOTIF-07 : une ligne non lue se voit (fond blanc + pastille, css) et s'entend (« Nouveau : »)
           const unreadLabel = n.read ? '' : 'Nouveau : ';
           return `
               <div class="notif-item ${n.read ? '' : 'unread'}">
                   <button type="button" class="notif-item-open" data-distributor-id="${escapeHTML(String(n.distributorId ?? ''))}" aria-label="${escapeHTML(`${unreadLabel}${typeInfo.title} : ${n.message || ''}. Ouvrir la fiche`)}">
   ```

7. **js/notifications.js** — bandeau annoncé, gardé tant qu'on s'en sert. Remplacer **toute** la fonction. Avant :
   ```js
   function showNotificationBanner(notif) {
       const typeInfo = NOTIFICATION_TYPES[notif.type] || NOTIFICATION_TYPES.proximity;

       const banner = document.createElement('div');
       banner.className = 'notification-banner';
       banner.innerHTML = `
           <span class="notif-icon">${typeInfo.icon}</span>
           <div class="notif-content">
               <strong>${typeInfo.title}</strong>
               <p>${escapeHTML(notif.message)}</p>
           </div>
           <button class="notif-action">
               Voir
           </button>
           <button class="notif-close" aria-label="Fermer la notification" onclick="this.closest('.notification-banner').remove();">&times;</button>
       `;

       document.body.appendChild(banner);
       const distributorId = String(notif.distributorId);
       banner.querySelector('.notif-action').addEventListener('click', function openFromBanner() {
           window.openDistributorModal(distributorId);
           banner.remove();
       });

       setTimeout(() => banner.classList.add('show'), 10);

       setTimeout(() => {
           if (banner.parentNode) {
               banner.classList.remove('show');
               setTimeout(() => {
                   if (banner.parentNode) banner.remove();
               }, 300);
           }
       }, 5000);
   }
   ```
   Après :
   ```js
   // NOTIF-07 : le bandeau (repli sans notification systeme) est pose dans la zone
   // #notification-banner-region (role="status", index.html) pour etre annonce aux lecteurs
   // d'ecran ; il reste 7 s, et tant qu'il est survole ou qu'il a le focus (motif de
   // showActionToast, utils.js). Retire alors qu'il avait le focus : le focus revient ou il etait.
   export const BANNER_DURATION = 7000;

   export function showNotificationBanner(notif) {
       const typeInfo = NOTIFICATION_TYPES[notif.type] || NOTIFICATION_TYPES.proximity;
       const region = document.getElementById('notification-banner-region') || document.body;
       const previousFocus = document.activeElement;

       const banner = document.createElement('div');
       banner.className = 'notification-banner';
       banner.innerHTML = `
           <span class="notif-icon" aria-hidden="true">${typeInfo.icon}</span>
           <div class="notif-content">
               <strong>${escapeHTML(typeInfo.title)}</strong>
               <p>${escapeHTML(notif.message)}</p>
           </div>
           <button type="button" class="notif-action">
               Voir
           </button>
           <button type="button" class="notif-close" aria-label="Fermer la notification">&times;</button>
       `;

       region.appendChild(banner);
       const distributorId = String(notif.distributorId);
       let removed = false;
       let timer = null;

       function removeBanner() {
           if (removed) return;
           removed = true;
           clearTimeout(timer);
           const hadFocus = banner.contains(document.activeElement);
           banner.remove();
           if (hadFocus && previousFocus && previousFocus.isConnected && typeof previousFocus.focus === 'function') {
               previousFocus.focus();
           }
       }

       function armBanner() {
           clearTimeout(timer);
           timer = setTimeout(function expireBanner() {
               if (banner.matches(':hover') || banner.contains(document.activeElement)) {
                   armBanner();
                   return;
               }
               banner.classList.remove('show');
               setTimeout(removeBanner, 300);
           }, BANNER_DURATION);
       }

       banner.querySelector('.notif-action').addEventListener('click', function openFromBanner() {
           window.openDistributorModal(distributorId);
           removeBanner();
       });
       banner.querySelector('.notif-close').addEventListener('click', removeBanner);

       setTimeout(() => banner.classList.add('show'), 10);
       armBanner();
   }
   ```

8. **js/app.js** — écouter le message du service worker.
   a. Fonction au niveau du module, juste au-dessus du commentaire de `handlePrivacyLinkClick`. Avant :
   ```js
   // Lien « Confidentialité » touche, ou qu'il soit : accueil, fenetre de connexion,
   // formulaire d'exploitant, Compte (PRIV-04)
   function handlePrivacyLinkClick(e) {
   ```
   Après :
   ```js
   // NOTIF-07 : notification app fermee touchee alors que l'app est deja ouverte : sw.js poste
   // { type: 'distrimatch:open', id } au lieu de recharger l'onglet (une saisie en cours est
   // gardee). On attend les distributeurs (onglet tout juste ouvert), comme un lien direct.
   function listenNotificationClicks(distributorsReady) {
       if (!('serviceWorker' in navigator)) return;
       navigator.serviceWorker.addEventListener('message', function openFicheFromNotification(event) {
           const data = event.data;
           if (!data || data.type !== 'distrimatch:open' || typeof data.id !== 'string') return;
           distributorsReady.catch(() => {}).then(function openWhenReady() {
               if (!AppState.distributors.some((d) => d.id === data.id)) {
                   showToast('Distributeur introuvable', 'error');
                   return;
               }
               openDistributorModal(data.id);
           });
       });
   }

   // Lien « Confidentialité » touche, ou qu'il soit : accueil, fenetre de connexion,
   // formulaire d'exploitant, Compte (PRIV-04)
   function handlePrivacyLinkClick(e) {
   ```
   b. Branchement dans le `DOMContentLoaded`. Avant :
   ```js
       // Initialiser la modal des maintenant pour le deep link
       initDistModal();
   ```
   Après :
   ```js
       // Initialiser la modal des maintenant pour le deep link
       initDistModal();
       listenNotificationClicks(distributorsPromise);   // NOTIF-07
   ```

9. **CLAUDE.md** (section « Points d'attention », ligne 179 environ) — la phrase sur les caches. Avant :
   ```
   - `sw.js` ne sert QU'aux notifications app fermee (EPIC-T25) et efface les anciens caches : ne jamais
   ```
   (début de la ligne seulement ; le reste de la ligne ne change pas) Après :
   ```
   - `sw.js` ne sert QU'aux notifications app fermee (EPIC-T25) et n'efface que d'eventuels caches `distrimatch*` / `snackmatch*` (NOTIF-07 : l'origine skenea.github.io est partagee avec d'autres projets) ; toucher une notification, app deja ouverte = message `distrimatch:open` a l'onglet (app.js), sans le recharger : ne jamais
   ```

10. **css/feed-and-nav.css** — ligne non lue visible. Avant :
    ```css
    .notif-item.unread {
        background: var(--light);
        border-radius: 8px;
    }
    ```
    Après :
    ```css
    /* NOTIF-07 : la page a deja le fond var(--light) ; une ligne non lue ressort en blanc,
       avec une pastille avant le titre (pas seulement une couleur de fond) */
    .notif-item.unread {
        background: var(--white);
        border-radius: 8px;
    }

    .notif-item.unread .notif-item-body strong::before {
        content: '';
        display: inline-block;
        width: 8px;
        height: 8px;
        margin-right: 6px;
        border-radius: 50%;
        background: var(--primary-text);
        vertical-align: middle;
    }
    ```

11. **index.html** — zone annoncée du bandeau. Avant :
    ```html
        <div id="toast-container" class="toast-container" role="status" aria-live="polite" aria-atomic="true"></div>
    ```
    Après :
    ```html
        <div id="toast-container" class="toast-container" role="status" aria-live="polite" aria-atomic="true"></div>
        <!-- NOTIF-07 : bandeau de notification in-app (js/notifications.js) annonce aux lecteurs d'ecran.
             Zone presente des le chargement : une zone creee avec son contenu n'est pas annoncee. -->
        <div id="notification-banner-region" role="status" aria-live="polite" aria-atomic="true"></div>
    ```

12. **index.html** — versions : `js/notifications.js` et `js/app.js` changent : monter le `?v=` de **toutes**
    les entrées de l'import map à la même valeur **V+1** ; `css/feed-and-nav.css` change : son `<link>` passe
    à **W+1** (seul `<link>` modifié). `sw.js` n'a pas de `?v=` (le navigateur le revérifie seul) : rien à faire.

## Tests

### Test 1 — `sw.js` exécuté avec un faux navigateur (unitaire)
- **Fichier** : `tests/unit/unit.test.js`, **à la toute fin du fichier** (après sa dernière ligne `});`).
  `readFileSync` est déjà importé en tête. Si le contrôle `^import vm from` a trouvé 1, **ne pas** recopier la ligne `import vm from 'node:vm';`.
- **Code à ajouter** :
  ```js

  // ============================================
  // SERVICE WORKER ET AFFICHAGE DES NOTIFICATIONS (NOTIF-07)
  // ============================================
  // sw.js tourne dans un contexte isole (node:vm) avec un faux navigateur : caches de
  // l'origine partages par tous les projets de skenea.github.io, alerte au remplacement
  // (renotify), toucher sans recharger l'onglet ouvert.

  import vm from 'node:vm';

  describe('Service worker : caches, alerte et toucher (NOTIF-07)', () => {
      const SCOPE = 'https://skenea.github.io/DistriMatch/';
      const source = readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');

      function loadServiceWorker({ cacheKeys = [], windows = [] } = {}) {
          const handlers = {};
          const calls = { deleted: [], shown: [], opened: [] };
          const self = {
              addEventListener(type, fn) { handlers[type] = fn; },
              skipWaiting() {},
              registration: {
                  scope: SCOPE,
                  showNotification(title, options) { calls.shown.push({ title, options }); return Promise.resolve(); }
              },
              clients: {
                  claim: () => Promise.resolve(),
                  matchAll: () => Promise.resolve(windows),
                  openWindow(url) { calls.opened.push(url); return Promise.resolve(null); }
              }
          };
          const caches = {
              keys: () => Promise.resolve([...cacheKeys]),
              delete(key) { calls.deleted.push(key); return Promise.resolve(true); }
          };
          vm.runInNewContext(source, { self, caches, URL });
          function dispatch(type, event) {
              let done = Promise.resolve();
              handlers[type]({ ...event, waitUntil(p) { done = p; } });
              return done;
          }
          return { dispatch, calls };
      }

      function fakeTab(url) {
          return {
              url, frameType: 'top-level', focused: false, messages: [], navigated: [],
              focus() { this.focused = true; return Promise.resolve(this); },
              postMessage(msg) { this.messages.push({ ...msg }); },
              navigate(to) { this.navigated.push(to); return Promise.resolve(this); }
          };
      }

      function clickEvent(url) {
          return { notification: { close() {}, data: { url } } };
      }

      it('activation : seuls les caches DistriMatch sont effaces, pas ceux des autres projets', async () => {
          const sw = loadServiceWorker({ cacheKeys: ['autre-projet-v1', 'workbox-precache-v2', 'distrimatch-v1', 'snackmatch-static'] });
          await sw.dispatch('activate', {});
          assert.deepEqual(sw.calls.deleted, ['distrimatch-v1', 'snackmatch-static']);
      });

      it('notification du meme favori : elle remplace l’ancienne et sonne de nouveau (renotify)', async () => {
          const sw = loadServiceWorker();
          const payload = { title: 'DistriMatch', body: 'Pain du Coin a été signalée vide', url: './?id=dist-007', tag: 'distrimatch-dist-007' };
          await sw.dispatch('push', { data: { json: () => payload, text: () => JSON.stringify(payload) } });
          assert.equal(sw.calls.shown[0].options.tag, 'distrimatch-dist-007');
          assert.equal(sw.calls.shown[0].options.renotify, true);
      });

      it('contenu illisible : notification affichee sans tag et sans renotify (pas d’erreur)', async () => {
          const sw = loadServiceWorker();
          await sw.dispatch('push', { data: { json: () => { throw new SyntaxError('x'); }, text: () => 'texte brut' } });
          assert.equal(sw.calls.shown.length, 1);
          assert.equal(sw.calls.shown[0].options.body, 'texte brut');
          assert.equal(sw.calls.shown[0].options.tag, undefined);
          assert.equal(sw.calls.shown[0].options.renotify, false);
      });

      it('toucher une notification, onglet DistriMatch ouvert : premier plan + message, sans rechargement', async () => {
          const tab = fakeTab(`${SCOPE}?x=1`);
          const sw = loadServiceWorker({ windows: [tab] });
          await sw.dispatch('notificationclick', clickEvent('./?id=dist-007'));
          assert.equal(tab.focused, true);
          assert.deepEqual(tab.navigated, [], 'aucune navigation = aucun rechargement');
          assert.deepEqual(tab.messages, [{ type: 'distrimatch:open', id: 'dist-007' }]);
          assert.deepEqual(sw.calls.opened, []);
      });

      it('toucher une notification, aucun onglet DistriMatch : nouvelle fenetre sur la fiche', async () => {
          const other = fakeTab('https://skenea.github.io/AutreProjet/');
          const sw = loadServiceWorker({ windows: [other] });
          await sw.dispatch('notificationclick', clickEvent('./?id=dist-007'));
          assert.deepEqual(sw.calls.opened, [`${SCOPE}?id=dist-007`]);
          assert.equal(other.focused, false);
          assert.deepEqual(other.messages, []);
      });
  });

  describe('Bandeau annonce et lignes non lues visibles (NOTIF-07)', () => {
      const root = new URL('../../', import.meta.url);

      it('index.html : zone role="status" du bandeau presente des le chargement', () => {
          const html = readFileSync(new URL('index.html', root), 'utf8');
          assert.ok(html.includes('<div id="notification-banner-region" role="status" aria-live="polite" aria-atomic="true"></div>'));
      });

      it('css : une ligne non lue n’a pas le fond de la page (var(--light))', () => {
          const css = readFileSync(new URL('css/feed-and-nav.css', root), 'utf8');
          const block = css.match(/\.notif-item\.unread\s*\{([^}]*)\}/);
          assert.ok(block, 'regle .notif-item.unread presente');
          assert.ok(!block[1].includes('var(--light)'), 'meme fond que la page');
          assert.ok(block[1].includes('var(--white)'));
          assert.ok(css.includes('.notif-item.unread .notif-item-body strong::before'), 'pastille avant le titre');
      });
  });
  ```
- **Doit échouer avant la correction** (vérifié) : 6 tests sur 7 échouent — les 4 caches/renotify/toucher
  (tous les caches effacés ; `renotify` absent ; `navigate` appelé, aucun message), la zone absente
  d'`index.html`, et la règle `.notif-item.unread` en `var(--light)`. « Aucun onglet DistriMatch » passe déjà
  (garde-fou : il doit **rester** vert).

### Test 2 — bandeau, notification système de l'app, lignes non lues (DOM)
- **Fichier** : `tests/integration/dom.test.js`, **à la toute fin du fichier** (après sa dernière ligne `});`).
- **Import** : la ligne `import { mock, afterEach } from 'node:test';` ne doit importer que des noms **absents**
  de l'import `node:test` noté aux contrôles (une story voisine a pu ajouter `afterEach` ou `mock` en tête) :
  retirer de cette ligne ceux qui y sont déjà ; si les deux y sont, supprimer la ligne. Sinon : `SyntaxError` (déclaration en double).
- **Code à ajouter** :
  ```js

  // ============================================
  // NOTIFICATIONS BIEN AFFICHEES (NOTIF-07)
  // ============================================
  // Bandeau in-app (repli sans notification systeme) : annonce par une zone role="status",
  // garde tant qu'il est survole ou qu'il a le focus. Lignes non lues : repere visible et
  // « Nouveau : » dans le nom accessible.

  import { mock, afterEach } from 'node:test';
  const notif07 = await import('../../js/notifications.js');

  describe('Notifications bien affichées (NOTIF-07)', () => {
      beforeEach(() => {
          document.querySelectorAll('.notification-banner').forEach((b) => b.remove());
          if (!document.getElementById('notification-banner-region')) {
              // Meme zone que dans index.html (presente des le chargement)
              const region = document.createElement('div');
              region.id = 'notification-banner-region';
              region.setAttribute('role', 'status');
              region.setAttribute('aria-live', 'polite');
              region.setAttribute('aria-atomic', 'true');
              document.body.appendChild(region);
          }
      });
      afterEach(() => mock.timers.reset());

      it('le bandeau est pose dans la zone annoncee, icone masquee, boutons sans envoi de formulaire', () => {
          notif07.showNotificationBanner({ type: 'empty', distributorId: 'dist-x', message: 'Pain du Coin a été signalée vide' });
          const banner = document.querySelector('#notification-banner-region .notification-banner');
          assert.ok(banner, 'bandeau dans la zone role="status"');
          assert.equal(banner.querySelector('.notif-icon').getAttribute('aria-hidden'), 'true');
          assert.equal(banner.querySelector('.notif-action').type, 'button');
          assert.equal(banner.querySelector('.notif-close').type, 'button');
          assert.equal(banner.querySelector('.notif-close').getAttribute('onclick'), null);
          banner.querySelector('.notif-close').click();
          assert.equal(banner.isConnected, false, 'la croix retire le bandeau');
      });

      it('le bandeau reste affiché tant qu’il a le focus, puis part', () => {
          mock.timers.enable({ apis: ['setTimeout'] });
          notif07.showNotificationBanner({ type: 'empty', distributorId: 'dist-x', message: 'Pain du Coin a été signalée vide' });
          const banner = document.querySelector('.notification-banner');
          banner.querySelector('.notif-action').focus();
          mock.timers.tick(20000);
          assert.ok(banner.isConnected && banner.classList.contains('show'), 'toujours affiché tant que le focus est dedans');
          banner.querySelector('.notif-action').blur();
          // Deux pas de 7 s : expiration, puis retrait 300 ms plus tard (minuterie posee pendant le pas)
          mock.timers.tick(7000);
          mock.timers.tick(7000);
          assert.equal(banner.isConnected, false, 'retiré une fois le focus parti');
      });

      it('notification système de l’app : même tag que le serveur et renotify', () => {
          const created = [];
          class FakeNotification {
              constructor(title, options) { created.push({ title, options }); }
              close() {}
          }
          FakeNotification.permission = 'granted';
          globalThis.Notification = FakeNotification;
          window.Notification = FakeNotification;
          NotificationPrefs.enabled = true;
          NotificationPrefs.quietHours.enabled = false;
          NotificationPrefs.lastNotifications = {};
          try {
              notif07.notifyFavoriteEvent({ id: 'dist-x', name: 'Pain du Coin' }, { type: 'empty', at: Date.now() });
          } finally {
              delete globalThis.Notification;
              delete window.Notification;
          }
          assert.equal(created.length, 1);
          assert.equal(created[0].options.tag, 'distrimatch-dist-x');
          assert.equal(created[0].options.renotify, true);
          NotificationQueue.history = [];
      });

      it('une ligne non lue se distingue : classe unread et « Nouveau : » en tête du nom accessible', () => {
          NotificationQueue.history = [
              { id: 'n-new', type: 'empty', distributorId: 'dist-x', message: 'A vide', read: false, timestamp: Date.now() },
              { id: 'n-old', type: 'empty', distributorId: 'dist-y', message: 'B vide', read: true, timestamp: Date.now() }
          ];
          openNotificationsView();
          const rows = document.querySelectorAll('#notifications-list .notif-item');
          assert.ok(rows[0].classList.contains('unread'));
          assert.match(rows[0].querySelector('.notif-item-open').getAttribute('aria-label'), /^Nouveau : /);
          assert.ok(!rows[1].classList.contains('unread'));
          assert.doesNotMatch(rows[1].querySelector('.notif-item-open').getAttribute('aria-label'), /Nouveau/);
          NotificationQueue.history = [];
      });
  });
  ```
- **Doit échouer avant la correction** (vérifié) : les 4 tests. Les deux du bandeau d'abord par
  `showNotificationBanner is not a function` (pas encore exportée), puis, une fois exportée seule, parce que le
  bandeau est hors de la zone / a perdu `show` à 5 s ; tag `dist-x` et `renotify` absent ; `aria-label` sans « Nouveau : ».
  (`NotificationPrefs`, `NotificationQueue`, `openNotificationsView`, `beforeEach` sont déjà importés dans ce fichier.)

### Test 3 — message du service worker dans le vrai navigateur (fonctionnel)
- **Fichier** : `tests/functional/notifications.spec.js`, **à la toute fin du fichier**.
- **Code à ajouter** :
  ```js

  // ============================================
  // NOTIF-07. TOUCHER UNE NOTIFICATION APP FERMEE, APP DEJA OUVERTE
  // ============================================
  // sw.js ne recharge plus l'onglet ouvert : il le met au premier plan et lui poste
  // { type: 'distrimatch:open', id }. On simule ce message (aucun service worker en local).

  test.describe('NOTIF-07. Notification touchée, app déjà ouverte', () => {
      test('le message du service worker ouvre la fiche sans recharger la page', async ({ page }) => {
          const dist = await page.evaluate(() => {
              const d = window.AppState.distributors[0];
              return { id: d.id, name: d.name };
          });
          await page.evaluate(() => { window.__notif07SamePage = true; });   // perdu si la page se recharge
          await page.evaluate((id) => navigator.serviceWorker.dispatchEvent(
              new MessageEvent('message', { data: { type: 'distrimatch:open', id } })), dist.id);
          await page.waitForSelector('#dist-modal-overlay.active', { timeout: 5000 });
          await expect(page.locator('#dist-modal-name')).toHaveText(dist.name);
          expect(await page.evaluate(() => window.__notif07SamePage === true)).toBe(true);
      });

      test('distributeur inconnu : message « Distributeur introuvable », aucune fiche', async ({ page }) => {
          await page.evaluate(() => navigator.serviceWorker.dispatchEvent(
              new MessageEvent('message', { data: { type: 'distrimatch:open', id: 'dist-inconnu-notif07' } })));
          await expect(page.locator('#toast-container')).toContainText('Distributeur introuvable');
          await expect(page.locator('#dist-modal-overlay')).not.toHaveClass(/active/);
      });
  });
  ```
- Le `beforeEach` du fichier (`setupApp`) prépare l'app : rien d'autre à importer.
- **Doit échouer avant la correction** (vérifié) : aucun écouteur `message` → `waitForSelector` expire (5 s),
  et aucun toast. Après les étapes : 2 passed, et le fichier entier reste vert (22 passed le 2026-11-06 sur la copie corrigée).

## Vérification (dans l'ordre)
```bash
node --check sw.js && node --check js/notifications.js && node --check js/app.js     # aucune sortie
grep -c "includeUncontrolled\|client.navigate\|addEventListener('fetch'\|caches.open" sw.js   # 0
grep -c 'onclick=' js/notifications.js                                                # 0
npm test                                    # tout vert, dont les describe « NOTIF-07 » et « cache-busting »
npx playwright test --project=functional -g "NOTIF-07|signalee vide : cloche|Centre de notifications"   # tout vert
npx playwright test --project=functional tests/functional/notifications.spec.js       # tout vert
npm run test:functional                     # en arrière-plan (~10 min) : tout vert, instables notés dans la PR
git diff --stat                             # sw.js, js/notifications.js, js/app.js, css/feed-and-nav.css, index.html, CLAUDE.md, 3 fichiers de tests (+ BACKLOG.md)
```
Le serveur local doit répondre sur le port 8080 (voir README).
**Après fusion et déploiement (Claude, modèle principal)** : demander à Stéphane, sur son Android avec un favori
et les notifications app fermée actives, de (1) laisser une notification dans le volet puis en recevoir une
seconde du même favori plus de 30 min après : elle doit sonner ; (2) commencer un avis sur une fiche, passer sur
une autre app, toucher une notification : l'app revient sur la fiche notifiée, sans recharger.

## Hors périmètre
- Garder le repère « Nouveau » sur toute la visite de la page (la liste re-rendue après une suppression ou une
  arrivée en direct le perd, car tout est marqué lu à l'ouverture) : story à part si Stéphane le souhaite.
- Compteur de non lues dans l'`aria-label` de la cloche, piège à focus de la fiche qui empêche d'atteindre
  « Voir » au clavier : lot 6 (accessibilité).
- Brouillon d'avis gardé en `sessionStorage`, `loadReviewsForDistributor` qui écrase le texte en rouvrant la fiche.
- Remplacer `new Notification` par `registration.showNotification` (Android, où `new Notification` lève une
  erreur et l'app retombe sur le bandeau) : story à part (comme le note NOTIF-05).
- Écouteur `pushsubscriptionchange` dans `sw.js` : écarté par NOTIF-05 (l'app recrée l'abonnement à l'ouverture).
- `supabase/functions/push-notify/` (tag et URL inchangés), cache ou gestionnaire `fetch` dans `sw.js` : jamais ici.
- Textes de `NOTIFICATION_TYPES` (« Machine signalée vide »…) : NOTIF-06.

## Pièges connus
- **Stories voisines sur les mêmes extraits** : l'étape 5 est dans `sendNotification`, que NOTIF-03 (bloc
  `if (options.silent) … else if (supported && …)` juste au-dessus du `try`), NOTIF-04 et NOTIF-05 (retrait de
  la « Demande paresseuse au 1er envoi ») modifient **autour** : seul l'objet passé à `new Notification` doit
  correspondre à l'extrait « Avant ». Si ces 5 lignes ont changé : s'arrêter. Les étapes 6 et 7
  (`renderNotificationsList`, `showNotificationBanner`) et 8 (`js/app.js`, NOTIF-06 y retire un import) ne sont
  touchées par aucune autre fiche connue ; tout écart = s'arrêter.
- Les tests DOM de NOTIF-03/04 nettoient avec `document.querySelectorAll('.notification-banner')` : ils
  marchent toujours (le bandeau garde sa classe, seulement dans la zone).
- Test 1 : `sw.js` tourne dans un **autre contexte** (`node:vm`) : ses objets n'ont pas le même prototype que
  ceux du test, d'où les copies `{ ...msg }` et les comparaisons champ par champ. Ne pas « simplifier » en
  `deepEqual(sw.calls.shown[0].options, {...})` (échec garanti).
- Test 2 : `mock.timers` de Node lance les minuteries posées **pendant** un `tick` au pas suivant seulement :
  garder les deux `tick(7000)` (un seul `tick(7300)` ou `runAll()` ne retire pas le bandeau).
- Étape 3 : jamais `renotify: true` en dur (contenu illisible = tag vide = `TypeError`, notification perdue).
- Étape 4 : ne pas remettre `includeUncontrolled: true` ni `client.navigate` « en secours » : c'est le rechargement corrigé ici.
- Étape 7 : dans `openFromBanner`, ouvrir la fiche **avant** `removeBanner()` (le piège à focus de la fiche
  prend le focus, et le bandeau ne le rend pas à l'élément d'avant).
- Étape 8 : `AppState`, `showToast` et `openDistributorModal` sont déjà importés dans `js/app.js` : n'ajouter aucun import.
- Fichiers en CRLF (`sw.js`, `js/*.js`, `css/*.css`, `index.html`, `CLAUDE.md`, tests) : outil Edit ; si un bloc
  refuse, petit script Node dans le scratchpad (voir README). **Pas de `sed -i`** sous Git Bash pour les `?v=` :
  il convertit tout `index.html` en LF (vu en préparant la fiche). Contrôler `git diff --stat`.
- Bump de **toutes** les entrées de l'import map à la **même** valeur ; un seul `<link>` CSS change.
- Textes UI : seuls « Nouveau : » (lu par les lecteurs d'écran) et « Distributeur introuvable » (déjà existant) ;
  ni « machine », ni « tap ». Commentaires sans accents.

## Terminé quand
- [ ] Contrôles passés, tests écrits (échouent avant, passent après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : non (le script n'a pas d'écran Notifications ; le service worker ne tourne pas en local)
- [ ] Story cochée dans BACKLOG.md, PR ouverte (non fusionnée), avec la mention « à relire par un modèle plus fort ;
      vérification sur téléphone après déploiement »

## Modèle de PR
**Titre** : `fix(notifications): alerte au remplacement, toucher sans rechargement, bandeau annonce, non lues visibles`

**Corps** : constats couverts (5) ; ce qui change pour l'utilisateur (une nouvelle alerte d'un favori sonne,
toucher une notification garde la saisie en cours, bandeau lu et gardé tant qu'on s'en sert, non lues visibles,
caches des autres projets de skenea.github.io préservés) ; tests ajoutés (unitaires `sw.js` en `node:vm`,
DOM, fonctionnels) ; sorties des commandes de vérification ; éléments non faits (hors périmètre) ;
**à relire par un modèle plus fort avant fusion** ; vérification sur téléphone après déploiement.
