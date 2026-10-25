# BUG-14 — « Effacer mes données » n'efface pas tout

> **Ordre du lot 3 (EPIC-R3)** : BUG-07 → BUG-02 → BUG-13 → BUG-05 → BUG-04 → BUG-14 → BUG-03 → BUG-06 → BUG-11 → BUG-12 → BUG-15 → BUG-08 → BUG-09 → BUG-10. **Prérequis** : BUG-04 fusionnée dans master (sinon s'arrêter).

- **Lot** : 3. Bugs visibles · **Gravité** : faible · **Niveau conseillé** : medium
- **Branche** : `fix/effacer-mes-donnees` · **Taille** : 4 fichiers JS (dont 2 changés d'un seul
  mot : `export`) + `index.html` pour les `?v=` + 1 test complété
- **Prérequis** : BUG-07, BUG-02, BUG-13, BUG-05 et BUG-04 fusionnées (partir de `master` à jour
  après leur fusion). Les extraits ci-dessous sont ceux du code tel qu'elles l'ont laissé :
  BUG-02 allonge l'import de `utils.js` dans `app.js` (`hasValidCoords`) ; BUG-04 allonge l'import
  de `push.js` (`maybeHintHomeScreenFavorites`) et crée la clé `distrimatch_home_screen_seen` ;
  BUG-05 ajoute du code dans `auth.js` (la ligne de `LOGIN_RETURN_KEY` descend vers 137) ;
  BUG-07 et BUG-02 ajoutent des lignes dans `loadDistributors` (les numéros de `app.js` bougent) ;
  BUG-02 et BUG-13 modifient l'import de `donnees.spec.js` et ajoutent des blocs à sa fin, sans
  toucher au test « Effacer mes données ».
- **Constats couverts** (rapport du 2026-10-21) :
  - « Effacer mes données » garde les distributeurs ajoutés sur l'appareil — `js/app.js:232`
  - (doublons) « ne supprime pas les distributeurs ajoutés localement » / « laisse les fiches ajoutées localement et un badge de notifications périmé » — `js/app.js:232`
  - « Effacer mes données » dézoome la carte pour montrer tous les distributeurs — `js/app.js:263`
  - Le test annonce un localStorage vidé mais ne contrôle qu'une clé — `tests/functional/donnees.spec.js:148`

## But
Après « Effacer mes données », plus rien de la personne ne reste sur l'appareil (favoris,
réglages, distributeurs ajoutés sur le téléphone, identifiant d'appareil, traces d'usage), la
pastille des notifications est à jour, et la carte garde son cadrage.

## User story
En tant que personne qui efface ses données de l'appareil, je veux que tout ce que l'app garde
pour moi disparaisse, afin de repartir comme un nouvel utilisateur.

**Critères d'acceptation**
- [ ] Après « Effacer », chacune des 12 clés de la liste ci-dessous vaut `null` dans `localStorage`.
- [ ] `distrimatch_force_auth` (drapeau de test) et la session de connexion restent.
- [ ] Un distributeur enregistré seulement sur ce téléphone (`isLocalOnly`) quitte la carte tout de suite.
- [ ] Un nouvel identifiant d'appareil est tiré au besoin suivant (plus l'ancien, même en mémoire).
- [ ] La pastille du centre de notifications est remise à jour ; le zoom et le centre de la carte ne changent pas.

## Pourquoi ça arrive (déjà analysé, ne pas refaire)
`clearUserData` (`js/app.js`, vers la ligne 235 après BUG-07 et BUG-02) ne retire que 5 clés. Elle appelle
`updateMapMarkers()` sans argument : la valeur par défaut `fitBounds = true` recadre la carte
sur toutes les pastilles. Elle vide `NotificationQueue` sans appeler `updateNotificationsBadge()`.

**Inventaire complet** (`grep -rn "localStorage\|sessionStorage" js/ index.html`, fait le
2026-10-25), décision clé par clé :

| Clé | Où | Contenu | Décision |
|---|---|---|---|
| `snackmatch_user` | `STORAGE_KEY`, state.js | favoris, points | effacée (déjà) |
| `snackmatch_profile` | `PROFILE_KEY` | profil implicite | effacée (déjà) |
| `snackmatch_conversations` | `CONVERSATIONS_KEY` | conversations du bot | effacée (déjà) |
| `snackmatch_notification_prefs` | `NOTIFICATION_PREFS_KEY` | réglages, produits suivis | effacée (déjà) |
| `snackmatch_notification_queue` | `NOTIFICATION_QUEUE_KEY` | centre de notifications | effacée (déjà) |
| `snackmatch_user_distributors` | `USER_DISTRIBUTORS_KEY`, state.js | distributeurs ajoutés sur le téléphone (« contributions ») | **à effacer** |
| `snackmatch_device` | `DEVICE_ID_KEY`, utils.js | identifiant d'appareil (mesure, signaux) | **à effacer** + oublier la copie en mémoire (`memoDeviceId`) |
| `distrimatch_push_asked` | `ASKED_KEY`, push.js | invitation « même app fermée » déjà montrée | **à effacer** (nouvel utilisateur = nouvelle invitation) |
| `distrimatch_home_screen_seen` | `HOME_SCREEN_SEEN_KEY`, push.js (créée par BUG-04) | indice « écran d'accueil » déjà montré | **à effacer** (repartir comme un nouvel utilisateur) |
| `distrimatch_login_return` | `LOGIN_RETURN_KEY`, auth.js | fiche à rouvrir au retour du lien de connexion | **à effacer** (trace de navigation) |
| `distrimatch_edit_hint_seen` | `EDIT_HINT_KEY`, fiche-edit.js | indice de premier usage vu | **à effacer** |
| `distrimatch_geo_ok` | `GEO_OK_KEY`, app.js | localisation déjà autorisée (évite un flash de l'accueil) | **à effacer** (reposée au lancement suivant si la localisation est toujours autorisée) |
| `distrimatch_force_auth` | auth.js | drapeau des tests (mur de connexion en local) | **garder** : pas une donnée de la personne |
| `snackmatch_activity` | activity.js | ancien fil, déjà effacé à chaque démarrage | rien à faire |
| `distrimatch_src` (sessionStorage) | events.js | origine de la session (QR ou non) | **garder** : disparaît avec l'onglet |
| session Supabase (`sb-...`) | supabase-js | connexion | **garder** : c'est « Se déconnecter » |

Les distributeurs déjà envoyés à la base (en attente ou publiés) ne sont pas `isLocalOnly` :
ils restent sur la carte (ils sont dans la base, l'auteur les relit). Seuls les `isLocalOnly`
quittent `AppState.distributors`.

## Avant de coder
**Lire en entier** : `js/app.js` lignes 1-62 (imports), la fonction `clearUserData` en entier (vers 230-280) et la déclaration de `GEO_OK_KEY` (vers 390) ;
`js/utils.js` lignes 176-194 (`getDeviceId`) ; `js/push.js` lignes 10-16 ;
`js/auth.js` lignes 130-165 (autour de `LOGIN_RETURN_KEY`) ; `tests/functional/donnees.spec.js` lignes 118-155.

**Réutiliser** : les constantes de clés existantes (ne pas réécrire les chaînes dans `app.js`),
`updateNotificationsBadge` (déjà importée dans `app.js`), `updateMapMarkers(false)`.

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter ; les numéros de
ligne sont approximatifs, les stories précédentes ont ajouté des lignes : un autre numéro n'est
pas un échec, l'important est le texte exact et le nombre de lignes trouvées) :
```bash
grep -n '    localStorage.removeItem(NOTIFICATION_QUEUE_KEY);' js/app.js   # attendu : 1 ligne (dans clearUserData)
grep -n '^    updateMapMarkers();' js/app.js                                 # attendu : 1 ligne (dans clearUserData)
grep -n '    NOTIFICATION_PREFS_KEY, NOTIFICATION_QUEUE_KEY,' js/app.js       # attendu : ligne 10
grep -n 'findLocalDuplicates, removeUserDistributors, saveToLocalStorage, hasValidCoords$' js/app.js   # attendu : ligne 15 (forme laissée par BUG-02)
grep -n "^import { initAuth, getCurrentUser, isAuthenticated, requireAuth, signOut, onAuthChange, takeLoginReturn } from './auth.js';" js/app.js   # ligne 54
grep -n "^import { initPushSettings, syncPushSubscription, disablePush, maybeHintHomeScreenFavorites } from './push.js';" js/app.js   # vers 58 (forme laissée par BUG-04)
grep -n 'updateNotificationsBadge' js/app.js | head -1                      # attendu : dans l'import de notifications.js
grep -n "^const GEO_OK_KEY = 'distrimatch_geo_ok';" js/app.js               # attendu : 1 ligne, vers 390
grep -n "^export const DEVICE_ID_KEY = 'snackmatch_device';" js/utils.js     # attendu : ligne 179
grep -n '^    memoDeviceId = id;' js/utils.js                               # attendu : ligne 192
grep -n "^const ASKED_KEY = 'distrimatch_push_asked';" js/push.js            # attendu : ligne 13
grep -n "^const HOME_SCREEN_SEEN_KEY = 'distrimatch_home_screen_seen';   // BUG-04 : indice deja montre" js/push.js   # attendu : ligne 14 (ajoutée par BUG-04)
grep -n "^const LOGIN_RETURN_KEY = 'distrimatch_login_return';" js/auth.js   # attendu : 1 ligne, vers 137 (après BUG-05)
grep -n "^export const EDIT_HINT_KEY = 'distrimatch_edit_hint_seen';" js/fiche-edit.js   # attendu : ligne 32
grep -n "^export const USER_DISTRIBUTORS_KEY" js/state.js                   # attendu : ligne 108
grep -rn "localStorage\.\(get\|set\|remove\)Item('[a-z_]*'" js/ | grep -o "'[a-z_]*'" | sort -u
# attendu exactement : 'distrimatch_force_auth' 'snackmatch_activity' (sinon une nouvelle clé
# est apparue depuis la fiche : s'arrêter et signaler)
grep -rn "_KEY = '\(snackmatch\|distrimatch\)_" js/ | wc -l
# attendu : 13 (les 12 clés du tableau + distrimatch_src, sessionStorage). Plus de 13 : nouvelle
# clé, s'arrêter et signaler
grep -n '"./js/app.js": "./js/app.js?v=' index.html                         # attendu : ?v=100 (95 + 5 stories) ou plus
```

## Étapes

1. **js/push.js** lignes 13-14 — exporter les deux clés (un mot chacune).
   Avant :
   ```js
   const ASKED_KEY = 'distrimatch_push_asked';
   const HOME_SCREEN_SEEN_KEY = 'distrimatch_home_screen_seen';   // BUG-04 : indice deja montre
   ```
   Après :
   ```js
   export const ASKED_KEY = 'distrimatch_push_asked';
   export const HOME_SCREEN_SEEN_KEY = 'distrimatch_home_screen_seen';   // BUG-04 : indice deja montre
   ```

2. **js/auth.js** vers la ligne 137 — exporter la clé (un mot).
   Avant :
   ```js
   const LOGIN_RETURN_KEY = 'distrimatch_login_return';
   ```
   Après :
   ```js
   export const LOGIN_RETURN_KEY = 'distrimatch_login_return';
   ```

3. **js/utils.js** — oublier l'identifiant d'appareil, juste après la fin de `getDeviceId`.
   Avant :
   ```js
       memoDeviceId = id;
       return id;
   }
   ```
   Après :
   ```js
       memoDeviceId = id;
       return id;
   }

   // « Effacer mes données » (BUG-14) : l'identifiant d'appareil repart de zero,
   // un nouveau est tire au prochain besoin (getDeviceId)
   export function resetDeviceId() {
       memoDeviceId = null;
       try { localStorage.removeItem(DEVICE_ID_KEY); } catch (e) { /* localStorage indisponible */ }
   }
   ```

4. **js/app.js** — imports.
   a) Ligne 10, avant / après :
   ```js
       NOTIFICATION_PREFS_KEY, NOTIFICATION_QUEUE_KEY,
   ```
   ```js
       NOTIFICATION_PREFS_KEY, NOTIFICATION_QUEUE_KEY, USER_DISTRIBUTORS_KEY,
   ```
   b) Ligne 15 (forme laissée par BUG-02), avant / après (seule la fin de la ligne change) :
   ```js
       showToast, getUserLocation, sortByDistance, loadFromLocalStorage, loadProfile, loadConversations, loadNotificationPrefs, loadNotificationQueue, loadUserDistributors, saveUserDistributor, mapDistributorRow, findLocalDuplicates, removeUserDistributors, saveToLocalStorage, hasValidCoords
   ```
   ```js
       showToast, getUserLocation, sortByDistance, loadFromLocalStorage, loadProfile, loadConversations, loadNotificationPrefs, loadNotificationQueue, loadUserDistributors, saveUserDistributor, mapDistributorRow, findLocalDuplicates, removeUserDistributors, saveToLocalStorage, hasValidCoords, resetDeviceId
   ```
   c) Ligne 54, avant / après :
   ```js
   import { initAuth, getCurrentUser, isAuthenticated, requireAuth, signOut, onAuthChange, takeLoginReturn } from './auth.js';
   ```
   ```js
   import { initAuth, getCurrentUser, isAuthenticated, requireAuth, signOut, onAuthChange, takeLoginReturn, LOGIN_RETURN_KEY } from './auth.js';
   ```
   d) Vers la ligne 58 (forme laissée par BUG-04), avant / après (une ligne devient deux) :
   ```js
   import { initPushSettings, syncPushSubscription, disablePush, maybeHintHomeScreenFavorites } from './push.js';
   ```
   ```js
   import { initPushSettings, syncPushSubscription, disablePush, maybeHintHomeScreenFavorites, ASKED_KEY as PUSH_ASKED_KEY, HOME_SCREEN_SEEN_KEY } from './push.js';
   import { EDIT_HINT_KEY } from './fiche-edit.js';
   ```

5. **js/app.js** — `clearUserData` : toutes les clés, l'identifiant, les distributeurs locaux.
   Avant :
   ```js
       await disablePush();   // EPIC-T25 : l'abonnement serveur part avec les donnees
       localStorage.removeItem(STORAGE_KEY);
       localStorage.removeItem(PROFILE_KEY);
       localStorage.removeItem(CONVERSATIONS_KEY);
       localStorage.removeItem(NOTIFICATION_PREFS_KEY);
       localStorage.removeItem(NOTIFICATION_QUEUE_KEY);
       AppState.subscriptions = [];
   ```
   Après :
   ```js
       await disablePush();   // EPIC-T25 : l'abonnement serveur part avec les donnees
       // Tout ce que l'app garde pour la personne sur cet appareil (BUG-14, inventaire dans
       // docs/stories/BUG-14.md). Restent : la session (« Se déconnecter » s'en charge) et le
       // drapeau de test distrimatch_force_auth.
       const userKeys = [
           STORAGE_KEY, PROFILE_KEY, CONVERSATIONS_KEY, NOTIFICATION_PREFS_KEY, NOTIFICATION_QUEUE_KEY,
           USER_DISTRIBUTORS_KEY, PUSH_ASKED_KEY, HOME_SCREEN_SEEN_KEY, LOGIN_RETURN_KEY, EDIT_HINT_KEY, GEO_OK_KEY
       ];
       try {
           userKeys.forEach((key) => localStorage.removeItem(key));
       } catch (e) {
           console.warn('[DistriMatch] Stockage local indisponible :', e?.message || e);
       }
       resetDeviceId();
       // Distributeurs restes seulement sur ce telephone : ils quittent aussi la carte
       // (ceux envoyes a la base, en attente ou publies, restent)
       AppState.distributors = AppState.distributors.filter((d) => !d.isLocalOnly);
       AppState.subscriptions = [];
   ```

6. **js/app.js** — fin de `clearUserData` : pastille des notifications, carte sans recadrage.
   Avant :
   ```js
       updateBadges();
       updateProfileStats();
       updateMapMarkers();
       updateConversationsList();
   ```
   Après :
   ```js
       updateBadges();
       updateNotificationsBadge();
       updateProfileStats();
       updateMapMarkers(false);   // la carte garde son cadrage (BUG-14)
       updateConversationsList();
   ```

7. **index.html** — quatre modules JS changent : monter le `?v=` de **toutes** les entrées de
   l'import map à la même valeur, valeur actuelle + 1. Lire d'abord la valeur actuelle
   (`grep -n '"./js/app.js": "./js/app.js?v=' index.html`) ; après les 5 stories prérequises elle
   devrait être `?v=100`, donc `?v=100` → `?v=101` (29 entrées) :
   ```bash
   grep -c 'js?v=100"' index.html                    # attendu : 29
   sed -i 's/\.js?v=100"/.js?v=101"/g' index.html
   grep -c 'js?v=101"' index.html                    # attendu : 29
   ```
   Si la valeur actuelle est différente, remplacer 100 et 101 par la valeur actuelle et la
   suivante. Aucun CSS ne change.

## Tests
- **Fichier** : `tests/functional/donnees.spec.js`, bloc `15. Confirmation maison`.
- **Nom** (inchangé) : `Effacer mes données : modale maison, Annuler conserve, Effacer vide le localStorage, aucun dialogue natif`
- **Code** : remplacer **tout** le test existant (de sa ligne `test('Effacer mes données : ...`
  jusqu'à son `});` de fin, juste avant le commentaire `// EPIC-T12 : retirer un produit...`) par :
  ```js
      test('Effacer mes données : modale maison, Annuler conserve, Effacer vide le localStorage, aucun dialogue natif', async ({ page }) => {
          let nativeDialog = false;
          page.on('dialog', async (d) => { nativeDialog = true; await d.dismiss().catch(() => {}); });

          // BUG-14 : toutes les donnees de la personne sur cet appareil (inventaire : docs/stories/BUG-14.md)
          const USER_KEYS = [
              'snackmatch_user', 'snackmatch_profile', 'snackmatch_conversations', 'snackmatch_notification_prefs',
              'snackmatch_notification_queue', 'snackmatch_user_distributors', 'snackmatch_device',
              'distrimatch_push_asked', 'distrimatch_home_screen_seen', 'distrimatch_login_return', 'distrimatch_edit_hint_seen', 'distrimatch_geo_ok'
          ];
          const before = await page.evaluate(async (keys) => {
              for (const k of keys) localStorage.setItem(k, JSON.stringify({ marker: 'e2e-confirm' }));
              localStorage.setItem('distrimatch_force_auth', '0');
              const base = window.AppState.distributors[0];
              window.AppState.distributors.push({ ...base, id: 'user-bug14-local', name: 'Local BUG-14', isLocalOnly: true, products: [] });
              const { mainMap } = await import('./js/state.js');
              window.switchView('account');
              return { zoom: mainMap.getZoom(), center: mainMap.getCenter() };
          }, USER_KEYS);
          await page.waitForSelector('#account-view.view-active');
          await page.click('#clear-data-btn');

          const modal = page.locator('#confirm-modal');
          await expect(modal).toHaveClass(/active/);
          await expect(modal).toHaveAttribute('role', 'alertdialog');
          // L'action destructrice n'est jamais le defaut : le focus est sur Annuler
          expect(await page.evaluate(() => document.activeElement?.id)).toBe('confirm-cancel');

          await page.click('#confirm-cancel');
          await expect(modal).not.toHaveClass(/active/);
          expect(await page.evaluate(() => localStorage.getItem('snackmatch_profile'))).toContain('e2e-confirm');

          await page.click('#clear-data-btn');
          await expect(modal).toHaveClass(/active/);
          await page.click('#confirm-ok');
          await expect(modal).not.toHaveClass(/active/);
          await expect(page.locator('#toast-container .toast.success')).toContainText('Données effacées');

          const after = await page.evaluate(async (keys) => {
              const { mainMap } = await import('./js/state.js');
              return {
                  left: keys.filter(k => localStorage.getItem(k) !== null),
                  forceAuth: localStorage.getItem('distrimatch_force_auth'),
                  localStill: window.AppState.distributors.some(d => d.id === 'user-bug14-local'),
                  zoom: mainMap.getZoom(),
                  center: mainMap.getCenter()
              };
          }, USER_KEYS);
          expect(after.left).toEqual([]);
          expect(after.forceAuth).toBe('0');
          expect(after.localStill).toBe(false);
          expect(after.zoom).toBe(before.zoom);
          expect(after.center.lat).toBeCloseTo(before.center.lat, 4);
          expect(after.center.lng).toBeCloseTo(before.center.lng, 4);
          expect(nativeDialog).toBe(false);
      });
  ```
- **Ce qu'il fait** : pose les 12 clés + le drapeau de test, ajoute un distributeur local en
  mémoire, note le zoom et le centre de la carte, efface, puis contrôle chaque clé, le drapeau,
  la carte et le distributeur local.
- **Doit échouer avant la correction** : `after.left` vaut
  `['snackmatch_user_distributors', 'snackmatch_device', 'distrimatch_push_asked', 'distrimatch_home_screen_seen', 'distrimatch_login_return', 'distrimatch_edit_hint_seen', 'distrimatch_geo_ok']`
  au lieu de `[]`.

## Vérification (dans l'ordre)
```bash
npm test                                                                   # tout vert, dont « cache-busting »
npx playwright test --project=functional -g "Effacer mes données"          # 1 passed
npx playwright test --project=functional -g "15. Confirmation maison|Dedup|push|Push"   # tout vert
npm run test:functional                                                    # en arrière-plan (~10 min) : tout vert, instables notés
```

## Hors périmètre
- Le texte de la modale et de la page Compte (« Favoris, contributions, conversations et
  réglages… ») : il devient exact, ne pas le changer.
- Se déconnecter dans « Effacer mes données » : non, c'est une action à part.
- Fermer la fiche ouverte : impossible d'effacer avec une fiche ouverte (le bouton est dans Compte).
- Passer la valeur par défaut de `updateMapMarkers` à `false` dans `js/map.js` : non (autre fichier).
- Relancer la surveillance de proximité après l'effacement : autre constat (notifications).
- Un deuxième onglet resté ouvert : story BUG-13.

## Pièges connus
- `GEO_OK_KEY` est déclarée **plus bas** dans `app.js` (vers la ligne 390) : c'est normal,
  `clearUserData` ne s'exécute qu'au clic, bien après le chargement du module. Ne pas déplacer
  la constante.
- Ne pas remplacer les constantes par des chaînes en dur dans `app.js` : si une clé est
  renommée dans son module, l'effacement suivra.
- `resetDeviceId()` doit remettre `memoDeviceId` à `null` : sinon `getDeviceId()` rendrait
  l'ancien identifiant (gardé en mémoire) et le réécrirait.
- Le test lit les clés **après** le toast « Données effacées » : `clearUserData` attend
  `disablePush()` avant d'effacer. Si `snackmatch_device` revient quand même dans `after.left`,
  un appel à `getDeviceId()` le recrée juste après : s'arrêter et signaler (ne pas retirer la
  clé de la liste du test).
- `setupApp` repose `distrimatch_push_asked` à chaque **chargement** de page : le test ne
  recharge pas, la clé reste bien effacée.
- Garder la ligne `import { EDIT_HINT_KEY } from './fiche-edit.js';` à part (pas fusionnée
  dans l'import de `push.js`).

## Terminé quand
- [ ] Contrôles passés, test complété (échoue avant, passe après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : non
- [ ] BUG-14 ne figure pas encore dans `BACKLOG.md` : ne pas l'ajouter, le noter dans la PR ; PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `fix(donnees): « Effacer mes données » efface tout et garde le cadrage de la carte`

**Corps** : constats corrigés (liste ci-dessus), inventaire des clés avec la décision pour
chacune (recopier le tableau), ce qui change (7 clés de plus, identifiant d'appareil oublié,
distributeurs restés sur le téléphone retirés de la carte, pastille des notifications à jour,
carte non recadrée), test complété, sorties des commandes, mention « BUG-14 absent du BACKLOG ».
