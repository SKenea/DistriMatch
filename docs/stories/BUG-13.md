# BUG-13 — Un onglet resté ouvert réécrit favoris et réglages avec une version ancienne

> **Ordre du lot 3 (EPIC-R3)** : BUG-07 → BUG-02 → BUG-13 → BUG-05 → BUG-04 → BUG-14 → BUG-03 → BUG-06 → BUG-11 → BUG-12 → BUG-15 → BUG-08 → BUG-09 → BUG-10. **Prérequis** : BUG-02 fusionnée dans master (sinon s'arrêter).

- **Lot** : 3. Bugs visibles · **Gravité** : moyen · **Niveau conseillé** : medium
- **Branche** : `fix/onglets-memoire-perimee` · **Taille** : 1 fichier JS (+ `index.html` pour les `?v=`) + 2 tests
- **Prérequis** : BUG-07 et BUG-02 fusionnées (partir de `master` à jour après leur fusion).
  Les extraits ci-dessous tiennent compte de leurs changements (BUG-02 modifie l'import de
  `donnees.spec.js` et ajoute un bloc à la fin de ce fichier ; BUG-07 et BUG-02 ajoutent des
  lignes dans `loadDistributors` de `js/app.js`, sans toucher aux zones de cette fiche).
- **Constats couverts** (rapport du 2026-10-21) :
  - Onglet resté ouvert : favoris, produits suivis, heures calmes, interrupteur push et points réécrits depuis une mémoire périmée — `js/favorites-watch.js:105`
  - (même cause, en partie) « Effacer mes données » est défait par l'autre onglet resté ouvert — `js/app.js:237`

## But
Quand DistriMatch est ouvert dans deux onglets (cas courant : le lien de connexion reçu par
e-mail ouvre un deuxième onglet), un favori ajouté ou un réglage changé dans un onglet est
connu de l'autre tout de suite, sans recharger, et l'autre onglet ne l'efface plus à sa
prochaine sauvegarde.

## User story
En tant que membre qui a DistriMatch ouvert dans deux onglets, je veux que mes favoris et mes
réglages restent ceux que je viens de choisir, quel que soit l'onglet, afin de ne pas les
perdre sans m'en rendre compte.

**Critères d'acceptation**
- [ ] Un favori ajouté dans l'onglet 2 est connu de l'onglet 1 sans recharger (pastille Favoris à jour, cœur sur la carte).
- [ ] Une action dans l'onglet 1 (un autre favori, retirer un produit suivi) garde le favori et les produits suivis venus de l'onglet 2.
- [ ] « Effacer mes données » dans l'onglet 2 vide aussi les favoris en mémoire de l'onglet 1 ; un favori ajouté ensuite dans l'onglet 1 ne fait pas revenir les anciens.
- [ ] Le rappel qui relit le stockage n'écrit jamais dans le stockage (pas de ping-pong entre onglets).

## Pourquoi ça arrive (déjà analysé, ne pas refaire)
L'état local (`AppState.subscriptions`, `AppState.points`, `NotificationPrefs`) n'est lu
qu'**une fois**, au démarrage (`js/app.js` vers la ligne 520 : `loadFromLocalStorage`,
`loadNotificationPrefs`). Ensuite chaque sauvegarde réécrit l'objet **entier** depuis la
mémoire de l'onglet (`saveToLocalStorage`, `saveNotificationPrefs` dans `js/utils.js`).
Aucun écouteur `storage` n'existe dans le dépôt. Un onglet resté ouvert garde donc une
mémoire ancienne et l'écrit par-dessus ce que l'autre onglet a enregistré : au prochain
cœur, et surtout au retour sur l'onglet, où `checkFavoriteUpdates`
(`js/favorites-watch.js:105`) appelle toujours `saveNotificationPrefs()`.

Le navigateur envoie l'événement `storage` à **tous les autres** onglets de la même origine
quand une clé de `localStorage` change (jamais à l'onglet qui écrit). La correction : écouter
cet événement et **relire** en mémoire `snackmatch_user` et `snackmatch_notification_prefs`
avec les fonctions de chargement existantes, puis rafraîchir pastille, liste des favoris et
pastilles de la carte. Quand la valeur a été effacée (`newValue === null`, cas de « Effacer
mes données »), on remet les valeurs de départ.

Les valeurs de départ des réglages sont relevées au chargement du module `js/app.js`, avant
toute lecture du stockage (`DEFAULT_NOTIFICATION_PREFS`) : aucun autre module ne modifie
`NotificationPrefs` à l'import (vérifié : les seules affectations sont dans des fonctions,
`notifications.js:418` et `:470`, `push.js:132`).

## Avant de coder
**Lire en entier** : `js/app.js` lignes 1-60 (imports), 493-530 (début de l'init) ;
`js/utils.js` lignes 272-325 (`saveToLocalStorage`, `loadFromLocalStorage`,
`loadNotificationPrefs`) ; `js/favorites-watch.js` en entier ; `js/state.js` lignes 5-16 et
48-60 (`AppState`, `NotificationPrefs`) ; `tests/functional/donnees.spec.js` lignes 1-15.

**Réutiliser** (ne pas réécrire) : `loadFromLocalStorage`, `loadNotificationPrefs`
(`js/utils.js`), `updateBadges` (`js/navigation.js`), `updateMapMarkers` (`js/map.js`),
`displaySubscriptions` (`js/distributor.js`). Tous sont **déjà importés** dans `js/app.js`,
ainsi que `AppState`, `NotificationPrefs`, `STORAGE_KEY`, `NOTIFICATION_PREFS_KEY` :
**aucun import à ajouter**.

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
grep -rn "addEventListener('storage'" js/                       # attendu : rien
grep -n '^    loadNotificationQueue();' js/app.js                 # attendu : 1 ligne, vers 535-545
grep -n "^// Resultat ou suggestion de recherche touche" js/app.js  # attendu : 1 ligne, vers 505-515
# (numéros approximatifs : BUG-07 et BUG-02 ont ajouté des lignes plus haut ; un autre numéro
# n'est pas un échec, l'important est de trouver exactement 1 ligne)
grep -n '    STORAGE_KEY, PROFILE_KEY, CONVERSATIONS_KEY,' js/app.js   # attendu : ligne 9
grep -n 'loadFromLocalStorage, loadProfile, loadConversations, loadNotificationPrefs' js/app.js   # attendu : ligne 15
grep -n 'import { initMainMap, updateMapMarkers' js/app.js        # attendu : 1 ligne, vers 18
grep -n 'renderProductsList, toggleSubscription, displaySubscriptions' js/app.js   # attendu : 1 ligne, vers 29
grep -n '^export function loadFromLocalStorage(updateBadgesFn)' js/utils.js         # attendu : 1 ligne, vers 284
grep -n "routeKpi, passWelcome } from './helpers.js';" tests/functional/donnees.spec.js   # attendu : ligne 9 (import après BUG-02)
grep -n "test.describe('Ajout annulé et démarrage robuste (BUG-02)'" tests/functional/donnees.spec.js   # attendu : 1 ligne (dernier bloc du fichier)
grep -n '"./js/app.js": "./js/app.js?v=' index.html               # attendu : ?v=97 ou plus (95 + BUG-07 + BUG-02)
```

## Étapes

1. **js/app.js** — nouvelle section « autre onglet », au niveau du module, juste sous le
   bandeau `INITIALISATION`.
   Avant :
   ```js
   // Resultat ou suggestion de recherche touche -> fiche (l'id est lu avant de vider la liste)
   function handleSearchResultClick(e) {
   ```
   Après :
   ```js
   // Reglages de depart, releves au chargement du module, avant toute lecture du
   // stockage : servent quand un autre onglet efface ses donnees (BUG-13)
   const DEFAULT_NOTIFICATION_PREFS = JSON.parse(JSON.stringify(NotificationPrefs));

   // Un autre onglet de l'app a change les favoris ou les reglages : on relit la memoire
   // de cet onglet, sinon sa prochaine sauvegarde ecraserait ces changements (BUG-13).
   // Lecture seule : ce rappel n'ecrit jamais dans le stockage (pas de ping-pong entre onglets).
   function handleStorageFromOtherTab(e) {
       if (e.storageArea !== localStorage) return;
       const everything = e.key === null;   // localStorage.clear() dans l'autre onglet
       if (everything || e.key === STORAGE_KEY) {
           if (e.newValue === null) {
               AppState.subscriptions = [];
               AppState.reports = 0;
               AppState.points = 0;
           } else {
               loadFromLocalStorage();
           }
           updateBadges();
           updateMapMarkers(false);
           if (document.getElementById('subscriptions-view')?.classList.contains('view-active')) displaySubscriptions();
       }
       if (everything || e.key === NOTIFICATION_PREFS_KEY) {
           if (e.newValue === null) Object.assign(NotificationPrefs, JSON.parse(JSON.stringify(DEFAULT_NOTIFICATION_PREFS)));
           else loadNotificationPrefs();
       }
   }

   // Resultat ou suggestion de recherche touche -> fiche (l'id est lu avant de vider la liste)
   function handleSearchResultClick(e) {
   ```

2. **js/app.js** — brancher l'écouteur juste après le chargement des données locales
   (dans le rappel `DOMContentLoaded`).
   Avant :
   ```js
       loadNotificationPrefs();
       loadNotificationQueue();
   ```
   Après :
   ```js
       loadNotificationPrefs();
       loadNotificationQueue();
       // BUG-13 : un autre onglet change favoris ou reglages -> cet onglet relit sa memoire
       window.addEventListener('storage', handleStorageFromOtherTab);
   ```

3. **index.html** — un module JS change : monter le `?v=` de **toutes** les entrées de
   l'import map à la même valeur, valeur actuelle + 1. Lire d'abord la valeur actuelle
   (`grep -n '"./js/app.js": "./js/app.js?v=' index.html`) ; après BUG-07 et BUG-02 elle
   devrait être `?v=97`, donc `?v=97` → `?v=98` (29 entrées) :
   ```bash
   grep -c 'js?v=97"' index.html                     # attendu : 29
   sed -i 's/\.js?v=97"/.js?v=98"/g' index.html
   grep -c 'js?v=98"' index.html                     # attendu : 29
   ```
   Si la valeur actuelle est différente, remplacer 97 et 98 par la valeur actuelle et la
   suivante. Aucun CSS ne change.

## Tests

- **Fichier** : `tests/functional/donnees.spec.js`.
- a) Ajouter `BASE_URL` à l'import de `./helpers.js` (ligne 9, forme laissée par BUG-02). Avant :
  ```js
  import { captureEvents, setupApp, openDistModal, loginForTest, RPC_ROUTE, openSignalableFiche, signalFirstProduct, chooseMachineState, routeSignals, routeEditWrites, kpiFixture, routeKpi, passWelcome } from './helpers.js';
  ```
  Après :
  ```js
  import { BASE_URL, captureEvents, setupApp, openDistModal, loginForTest, RPC_ROUTE, openSignalableFiche, signalFirstProduct, chooseMachineState, routeSignals, routeEditWrites, kpiFixture, routeKpi, passWelcome } from './helpers.js';
  ```
- b) Ajouter ce bloc **à la toute fin du fichier**, après la dernière ligne `});` du bloc
  `Ajout annulé et démarrage robuste (BUG-02)` (ajouté par BUG-02, dernier bloc du fichier) :
  ```js

  // ============================================
  // 19. DEUX ONGLETS OUVERTS (BUG-13)
  // ============================================
  // L'evenement storage n'est envoye qu'aux AUTRES pages : deux pages du meme contexte
  // (meme localStorage). La page 1 est celle du beforeEach.

  test.describe('19. Deux onglets ouverts (BUG-13)', () => {
      test('un favori ajoute dans l autre onglet est connu ici sans recharger, et une action ici ne l efface pas', async ({ page, context }) => {
          const [idA, idB] = await page.evaluate(() => window.AppState.distributors.slice(0, 2).map(d => d.id));
          // Page 2 : un produit suivi est deja enregistre quand elle demarre (ecrit avant son chargement)
          const page2 = await context.newPage();
          await page2.goto(`${BASE_URL}/manifest.json`);
          await page2.evaluate(() => localStorage.setItem('snackmatch_notification_prefs', JSON.stringify({ followedProducts: ['pain'] })));
          await setupApp(page2, context);
          await page2.evaluate((id) => window.toggleSubscription(id), idA);

          // Page 1 : connait le favori sans recharger
          await expect.poll(() => page.evaluate((id) => window.AppState.subscriptions.includes(id), idA), { timeout: 5000 }).toBe(true);
          await expect(page.locator('#favorites-badge')).toHaveText('1');

          // Page 1 : deux actions qui sauvegardent depuis sa memoire
          await page.evaluate(() => window.unfollowProduct('autre'));
          await page.evaluate((id) => window.toggleSubscription(id), idB);

          const stored = await page.evaluate(() => ({
              subscriptions: JSON.parse(localStorage.getItem('snackmatch_user')).subscriptions,
              followed: JSON.parse(localStorage.getItem('snackmatch_notification_prefs')).followedProducts
          }));
          expect(stored.subscriptions).toEqual(expect.arrayContaining([idA, idB]));
          expect(stored.followed).toEqual(['pain']);
          await page2.close();
      });

      test('« Effacer mes données » dans l autre onglet vide aussi les favoris ici', async ({ page, context }) => {
          const [idA, idB] = await page.evaluate(() => window.AppState.distributors.slice(0, 2).map(d => d.id));
          await page.evaluate((id) => window.toggleSubscription(id), idA);

          const page2 = await context.newPage();
          await setupApp(page2, context);
          await page2.evaluate(() => window.switchView('account'));
          await page2.waitForSelector('#account-view.view-active');
          await page2.click('#clear-data-btn');
          await page2.click('#confirm-ok');
          await expect(page2.locator('#toast-container .toast.success')).toContainText('Données effacées');

          await expect.poll(() => page.evaluate(() => window.AppState.subscriptions.length), { timeout: 5000 }).toBe(0);
          await page.evaluate((id) => window.toggleSubscription(id), idB);
          expect(await page.evaluate(() => JSON.parse(localStorage.getItem('snackmatch_user')).subscriptions)).toEqual([idB]);
          await page2.close();
      });
  });
  ```
- **Noms** : `un favori ajoute dans l autre onglet est connu ici sans recharger, et une action ici ne l efface pas`
  et `« Effacer mes données » dans l autre onglet vide aussi les favoris ici`.
- **Ce qu'ils font** : deux pages du même contexte Playwright (même `localStorage`) ; la page 2
  modifie, la page 1 doit le savoir sans recharger, puis agit.
- **Doivent échouer avant la correction** : les deux `expect.poll` expirent (la page 1 n'a
  aucun écouteur `storage`, `AppState.subscriptions` ne contient pas `idA` / garde `idA`).

## Vérification (dans l'ordre)
```bash
grep -n "addEventListener('storage', handleStorageFromOtherTab)" js/app.js   # 1 ligne
npm test                                                                       # tout vert, dont « cache-busting »
npx playwright test --project=functional -g "BUG-13"                           # 2 passed
npx playwright test --project=functional -g "Favori|favori|Effacer|notification"   # tout vert
npm run test:functional                                                        # en arrière-plan (~10 min) : tout vert, instables notés
```

## Hors périmètre
- La file du centre de notifications (`snackmatch_notification_queue`), le profil implicite
  (`snackmatch_profile`) et les distributeurs ajoutés (`snackmatch_user_distributors`) : pas
  relus dans cette story.
- Relire le stockage au retour sur l'onglet (`visibilitychange`), `BroadcastChannel`, ou une
  écriture « relire puis fusionner » dans `saveStore` : non, l'événement `storage` suffit.
- Ne pas modifier `js/favorites-watch.js` (son `saveNotificationPrefs()` écrit désormais une
  mémoire à jour).
- Une page déjà affichée dans l'onglet 1 (Réglages des notifications, cœur de la fiche ouverte)
  n'est pas redessinée : elle le sera à sa prochaine ouverture.
- Le contenu de « Effacer mes données » (clés effacées, cadrage de la carte) : story BUG-14.

## Pièges connus
- **Ne rien écrire** dans `handleStorageFromOtherTab` : pas de `saveToLocalStorage()`, pas de
  `saveNotificationPrefs()`, pas de `syncPushSubscription()`. Une écriture relancerait
  l'événement dans l'autre onglet (ping-pong), et l'onglet qui a fait le changement a déjà mis
  le serveur à jour.
- `DEFAULT_NOTIFICATION_PREFS` doit rester **au niveau du module** (relevé à l'import, avant
  `loadNotificationPrefs()`) ; le placer dans la fonction relèverait les réglages de l'utilisateur.
- La copie par `JSON.parse(JSON.stringify(...))` à chaque remise à zéro est voulue : sans elle,
  `NotificationPrefs` partagerait ses objets internes avec `DEFAULT_NOTIFICATION_PREFS`.
- `updateMapMarkers(false)` : avec `true` (la valeur par défaut) la carte se recadrerait.
- Le test doit ouvrir la page 2 avec `context.newPage()` (même contexte). Un `browser.newContext()`
  aurait son propre `localStorage` et aucun événement n'arriverait.
- `manifest.json` sert seulement à écrire dans le `localStorage` de la bonne origine avant que
  l'app de la page 2 démarre ; ne pas le remplacer par `BASE_URL` (l'app démarrerait deux fois).
- BUG-14 passe **après** cette story et modifie `clearUserData` et le test « Effacer mes
  données » : ne pas y toucher ici.

## Terminé quand
- [ ] Contrôles passés, tests écrits (échouent avant, passent après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : non (aucun changement visible sur un seul écran)
- [ ] BUG-13 ne figure pas encore dans `BACKLOG.md` : ne pas l'ajouter, le noter dans la PR ; PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `fix(donnees): un onglet reste ouvert relit favoris et reglages changes ailleurs`

**Corps** : constat corrigé (mémoire périmée réécrite par un onglet resté ouvert), cause
(état lu une seule fois au démarrage, sauvegardes de l'objet entier, aucun écouteur `storage`),
correction (écouteur `storage` qui relit `snackmatch_user` et `snackmatch_notification_prefs`,
remise à zéro si la clé est effacée, sans aucune écriture), tests ajoutés (deux pages du même
contexte), sorties des commandes, mention « BUG-13 absent du BACKLOG ».
