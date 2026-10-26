# PRIV-06 — Se déconnecter efface vraiment ce qui relève du compte

- **Lot** : 2. Vie privée · **Gravité** : faible · **Niveau conseillé** : medium
- **Prérequis** : **PRIV-05 fusionnée** sur master. Branche créée à partir de `master` **à jour**
  (`git switch master && git pull` d'abord). Ordre du lot 2 :
  PRIV-01 → PRIV-02 → PRIV-03 → PRIV-05 → **PRIV-06** → PRIV-07 → PRIV-04.
  Les extraits « avant » ont été relevés sur master avant PRIV-01..05 : si une de ces stories a
  modifié un des blocs cités (contrôles), **s'arrêter** et signaler (ne pas adapter au jugé).
- **Branche** : `fix/deconnexion-propre` · **Taille** : 6 fichiers JS + `index.html` + `CLAUDE.md` + 4 fichiers de tests.
  Au-dessus de la limite de 3, **exception acceptée** : une seule cause (la déconnexion ne nettoie
  rien), des modifications courtes et du même genre dans chaque module concerné, à garder dans une seule PR.
  **Aucune migration SQL.**
- **Constats couverts** (rapport du 2026-10-21) :
  - Déconnexion : l'abonnement aux notifications reste lié au compte côté serveur — `supabase/024_push_notifications.sql:71`
  - Déconnexion sans réseau : l'écran dit « déconnecté », mais la session revient au lancement suivant — `js/auth.js:156` (aujourd'hui ligne 173)
  - Après la déconnexion de l'admin, la console (e-mails, SIRET, messages) et les fiches en attente de tous les membres restent affichées — `js/app.js:697` (aujourd'hui lignes 787-812)
  - Déconnexion sur « Ma demande » ou « Mes ajouts » : la page garde la demande, l'échange avec l'équipe et le champ d'envoi du compte précédent — `js/operators.js:288`
  - Désabonnement aux notifications : l'échec de `push_unsubscribe` est ignoré — `js/push.js:133` (aujourd'hui ligne 138)
  - **Non couvert, hors périmètre (voir plus bas)** : « Script hCaptcha chargé pour chaque visiteur, connecté ou non » — `index.html:1089`

## But
Après « Se déconnecter » (ou une déconnexion venue d'un autre onglet), le téléphone ne garde plus
rien du compte : ni sa session (même sans réseau), ni son lien avec l'abonnement aux notifications,
ni la console admin, « Ma demande », « Mes ajouts » ou les fiches en attente lues grâce à lui.

## User story
En tant que membre (ou admin) qui se déconnecte sur un appareil partagé, je veux que la personne
suivante ne voie ni ne réutilise rien de mon compte, afin que mes demandes, mes échanges avec
l'équipe et les données des autres membres restent privés.

**Critères d'acceptation**
- [ ] Déconnexion sans réseau : la session est effacée de l'appareil (clé `sb-<ref>-auth-token`),
      l'app passe en visiteur et ne se reconnecte pas au lancement suivant.
- [ ] Déconnexion avec les notifications app fermée actives : `push_unsubscribe` part **avant** la
      fin de session, puis `push_subscribe` recrée l'abonnement **sans compte**.
- [ ] Couper les notifications (interrupteur ou « Effacer mes données ») alors que le serveur ne
      répond pas : l'adresse est gardée (`distrimatch_push_pending_unsubscribe`) et l'effacement est
      renvoyé au démarrage suivant et au retour du réseau ; la clé disparaît une fois l'effacement fait.
- [ ] Déconnexion pendant la console admin : retour à la carte, console vidée (listes, détail,
      mini-carte, feuille du bas, carte imprimée), fiches en attente et refusées retirées de la carte,
      de la liste et de la recherche.
- [ ] Déconnexion sur « Ma demande » : retour à la carte, contenu vidé, champ d'envoi masqué et vide,
      relecture des 30 s arrêtée. Ouvrir une demande ne montre plus, même un instant, la précédente.
- [ ] Déconnexion sur « Mes ajouts » : retour à la carte, liste vidée.
- [ ] Rien ne change pour un membre connecté (tests fonctionnels existants verts).

## Ce qui est déjà tranché (ne pas refaire l'analyse)
- **Push sans migration** : `push_subscribe` (026, ligne 100) garde
  `user_id = coalesce(auth.uid(), push_subscriptions.user_id)` : un appel sans compte ne retire
  **pas** le lien. Côté front, on **efface** l'abonnement (`push_unsubscribe`, ouvert à l'anonyme,
  par l'adresse) dans `signOut()` **avant** `supabaseClient.auth.signOut()` ; la synchronisation
  déjà déclenchée par la déconnexion (`onAuthChange(syncPushSubscription)`, `js/app.js:765`)
  recrée alors la ligne par un INSERT, donc `user_id = auth.uid()` = null.
  **Pourquoi avant** : `supabaseClient.auth.signOut()` émet `SIGNED_OUT` pendant son exécution,
  ce qui lance déjà la synchronisation anonyme ; effacer après arriverait trop tard.
  **Pourquoi pas dans l'écouteur `onAuthStateChange`** : supabase-js déconseille d'attendre un appel
  Supabase dans ce rappel (blocage possible).
- **Session hors ligne** : `signOut({ scope: 'local' })` **ne corrige rien** : supabase-js appelle
  aussi le serveur avec cette portée et renvoie la même erreur sans effacer la session. On lit
  l'erreur et on efface nous-mêmes la clé locale, même calcul que `tests/e2e/session.mjs:24` :
  `` `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token` ``. La session reste valable
  côté serveur jusqu'à son expiration, mais plus rien ne la porte sur l'appareil.
- **Désabonnement** : on lit le résultat de `push_unsubscribe` ; en cas d'échec, l'adresse va dans
  `distrimatch_push_pending_unsubscribe` (clé **absente** de la liste effacée par
  `clearUserData`, `js/app.js:269-272` : elle sert justement à finir l'effacement), renvoyée au
  démarrage et sur l'événement `online`. Le navigateur est désabonné quoi qu'il arrive (plus rien
  n'arrive sur le téléphone).
- **Écrans** : un seul écouteur dans `js/app.js` (`forgetAccountScreens`) quitte les pages du compte
  (`admin-view`, `operator-request-view`, `my-additions-view`) et retire de `AppState.distributors`
  les fiches `reviewStatus === 'pending'` (hors `isLocalOnly`) : un visiteur ne les lit jamais
  (RLS 022), qu'elles soient de lui ou d'un autre. `AppState.rejectedDistributors` est vidé.
  Chaque module vide ses propres données : `resetAdmin()` (`js/admin.js`),
  `clearOperatorRequestView()` (`js/operators.js`), `#my-additions-content` (`js/additions.js`).
  Pas de rechargement de page (il ramènerait l'écran de géolocalisation et ferait perdre le cadrage).
- **hCaptcha** : laissé hors périmètre (voir « Hors périmètre »).

## Avant de coder
**Lire en entier** : `js/auth.js` lignes 1-60 et 169-178 ; `js/push.js` en entier ;
`js/app.js` lignes 50-62, 252-313, 572-581, 688-700, 757-812 ; `js/admin.js` lignes 28-37, 435-490, 676-683 ;
`js/operators.js` lignes 20-30, 270-310, 423-435 ; `js/additions.js` lignes 36-45, 123-130 ;
`tests/functional/notifications.spec.js` lignes 284-345 ; `tests/functional/validation.spec.js` lignes 1-40 ;
`tests/functional/exploitants.spec.js` lignes 1-82 et 146-155 ; `tests/integration/dom.test.js` lignes 170-215 et 641-660.

**Réutiliser** (ne pas réécrire) : `currentSubscription`, `isPushSupported`, `permission` (`js/push.js`),
`goBackToMap`, `updateMapMarkers`, `openSidePanelForFilters` (déjà importés dans `js/app.js`),
`setStatus` (`js/admin.js`), `setSupabaseClient` (`js/state.js`, déjà importé dans `dom.test.js`),
`loginForTest`, `minutesAgoIso` (`tests/functional/helpers.js`), `routeReviewApi` (`validation.spec.js`),
`routeOperatorApi`, `request`, `firstSignalableId` (`exploitants.spec.js`).

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter ; un numéro de ligne différent n'est pas un échec) :
```bash
grep -n "import { getHcaptchaSitekey, isLocalhost } from './config.js';" js/auth.js     # 1 ligne (13)
grep -n "import { isStandalone } from './push.js';" js/auth.js                          # 1 ligne (15)
grep -n -A 5 "^export async function signOut() {" js/auth.js                           # 1 bloc (173), identique à l'étape 1 c
grep -n "export const SUPABASE_URL" js/config.js                                        # 1 ligne
grep -n "if (supabaseClient) await supabaseClient.rpc('push_unsubscribe'" js/push.js    # 1 ligne (138), dans disablePush
grep -n "Abonnement aux notifications non mis a jour" js/push.js                        # 1 ligne (82)
grep -n "forgetPushAccount\|retryPendingUnsubscribe\|distrimatch_push_pending_unsubscribe" js/ tests/ -r   # aucun résultat
grep -n "import { initPushSettings, syncPushSubscription, disablePush, maybeHintHomeScreenFavorites" js/app.js   # 1 ligne (58)
grep -n "onAuthChange(syncPushSubscription);" js/app.js                                  # 1 ligne (765)
grep -n -A 1 "^    initPushSettings();" js/app.js                                        # 692-693 : initPushSettings(); puis syncPushSubscription();
grep -n "^document.addEventListener('DOMContentLoaded', async () => {" js/app.js         # 1 ligne (581)
grep -n "goBackToMap\|updateMapMarkers\|openSidePanelForFilters" js/app.js | head -4    # les trois sont importés (lignes 18, 24, 52)
grep -n "from './operators.js';" js/admin.js                                             # 1 ligne (28)
grep -n "onAuthChange\|from './auth.js'" js/admin.js                                     # aucun résultat
grep -n "^export function initAdmin() {" js/admin.js                                     # 1 ligne (676)
grep -n "onAuthChange(() => refreshOperatorState());" js/operators.js                    # 1 ligne (430)
grep -n -A 1 "^export async function openOperatorRequest(requestId) {" js/operators.js   # 276-277 : openRequestId = Number(requestId);
grep -n "^let renderedTodoKey = null;" js/operators.js                                   # 1 ligne (289)
grep -n "onAuthChange(() => refreshMyAdditions());" js/additions.js                      # 1 ligne (125)
grep -o '"./js/app.js": "./js/app.js?v=[0-9]*"' index.html                               # noter la valeur V (ex. 108)
grep -n 'Flag dev : `distrimatch_force_auth`.' CLAUDE.md                                 # 1 ligne
grep -n "signOut\|getCurrentUser" tests/integration/dom.test.js                         # aucun résultat
grep -n "assert.deepEqual(resultIds(), \['pain', 'sans-adresse'\]);" tests/integration/dom.test.js   # 1 ligne (fin du fichier)
grep -n "product-seen.is-owner')).toHaveCount(0);" tests/functional/exploitants.spec.js  # 1 ligne (fin du fichier)
```

## Étapes

1. **js/auth.js** — session effacée même sans réseau ; abonnement aux notifications oublié avant la fin de session.

   a) Avant :
   ```js
   import { getHcaptchaSitekey, isLocalhost } from './config.js';
   ```
   Après :
   ```js
   import { getHcaptchaSitekey, isLocalhost, SUPABASE_URL } from './config.js';
   ```

   b) Avant :
   ```js
   import { isStandalone } from './push.js';
   ```
   Après :
   ```js
   import { isStandalone, forgetPushAccount } from './push.js';
   ```

   c) Avant :
   ```js
   export async function signOut() {
       if (!supabaseClient) return;
       await supabaseClient.auth.signOut();
       currentUser = null;
       notifyAuthChange();
   }
   ```
   Après :
   ```js
   // Cle de la session de supabase-js sur cet appareil (meme calcul que tests/e2e/session.mjs)
   const SESSION_STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

   export async function signOut() {
       if (!supabaseClient) return;
       // PRIV-06 : l'abonnement aux notifications quitte le compte AVANT la fin de session ;
       // la synchronisation qui suit la deconnexion le recree sans compte (push.js)
       await forgetPushAccount();
       let error = null;
       try {
           ({ error } = await supabaseClient.auth.signOut());
       } catch (e) {
           error = e;
       }
       if (error) {
           // PRIV-06 : sans reseau, supabase-js garde la session sur l'appareil (elle revenait
           // au lancement suivant) : on l'efface ici. Elle reste ouverte cote serveur jusqu'a
           // son expiration, mais plus rien ne la porte sur ce telephone.
           console.warn('[Auth] Deconnexion sans reponse du serveur, session effacee sur cet appareil :', error?.message || error);
           try { localStorage.removeItem(SESSION_STORAGE_KEY); } catch (e) { /* stockage bloque */ }
       }
       currentUser = null;
       notifyAuthChange();
   }
   ```

2. **js/push.js** — oublier le compte à la déconnexion ; ne plus ignorer l'échec du désabonnement.

   a) Juste après la fin de `syncPushSubscription`. Avant :
   ```js
           console.warn('[DistriMatch] Abonnement aux notifications non mis a jour :', e?.message || e);
       }
   }
   ```
   Après :
   ```js
           console.warn('[DistriMatch] Abonnement aux notifications non mis a jour :', e?.message || e);
       }
   }

   // PRIV-06 : push_subscribe garde le compte deja memorise (024, 026). A la deconnexion
   // (signOut, auth.js, AVANT la fin de session), on efface l'abonnement : la
   // synchronisation qui suit la deconnexion le recree sans compte.
   export async function forgetPushAccount() {
       if (!supabaseClient || !isPushSupported() || !NotificationPrefs.push || permission() !== 'granted') return;
       try {
           const subscription = await currentSubscription();
           if (!subscription) return;
           const { error } = await supabaseClient.rpc('push_unsubscribe', { p_endpoint: subscription.endpoint });
           if (error) throw error;
       } catch (e) {
           console.warn('[DistriMatch] Abonnement aux notifications encore lie au compte :', e?.message || e);
       }
   }

   // PRIV-06 : effacement cote serveur pas confirme (hors ligne, projet en pause) : l'adresse
   // est gardee ici et renvoyee plus tard (retryPendingUnsubscribe). Cle volontairement hors
   // de la liste de « Effacer mes données » (app.js) : elle sert a finir l'effacement.
   export const PENDING_UNSUBSCRIBE_KEY = 'distrimatch_push_pending_unsubscribe';

   async function deleteOnServer(endpoint) {
       if (!supabaseClient) return false;
       try {
           const { error } = await supabaseClient.rpc('push_unsubscribe', { p_endpoint: endpoint });
           return !error;
       } catch (e) {
           return false;
       }
   }

   // Au demarrage et au retour du reseau : renvoie un effacement reste en attente
   export async function retryPendingUnsubscribe() {
       let endpoint = null;
       try { endpoint = localStorage.getItem(PENDING_UNSUBSCRIBE_KEY); } catch (e) { return false; }
       if (!endpoint) return false;
       if (!(await deleteOnServer(endpoint))) return false;
       try { localStorage.removeItem(PENDING_UNSUBSCRIBE_KEY); } catch (e) { /* stockage bloque */ }
       return true;
   }
   ```

   b) Avant :
   ```js
   export async function disablePush() {
       NotificationPrefs.push = false;
       saveNotificationPrefs();
       try {
           const subscription = await currentSubscription();
           if (!subscription) return;
           if (supabaseClient) await supabaseClient.rpc('push_unsubscribe', { p_endpoint: subscription.endpoint });
           await subscription.unsubscribe();
       } catch (e) {
           console.warn('[DistriMatch] Desabonnement incomplet :', e?.message || e);
       }
   }
   ```
   Après :
   ```js
   export async function disablePush() {
       NotificationPrefs.push = false;
       saveNotificationPrefs();
       try {
           const subscription = await currentSubscription();
           if (!subscription) return;
           const endpoint = subscription.endpoint;
           // PRIV-06 : le resultat est lu ; un echec est retente plus tard
           if (!(await deleteOnServer(endpoint))) {
               try { localStorage.setItem(PENDING_UNSUBSCRIBE_KEY, endpoint); } catch (e) { /* stockage bloque */ }
               console.warn('[DistriMatch] Abonnement pas encore efface sur le serveur : nouvel essai plus tard');
           }
           await subscription.unsubscribe();   // plus rien n'arrive sur ce telephone
       } catch (e) {
           console.warn('[DistriMatch] Desabonnement incomplet :', e?.message || e);
       }
   }
   ```

3. **js/app.js** — quitter les pages du compte et retirer les fiches lues grâce à lui ; renvoyer un effacement en attente.

   a) Import. Avant :
   ```js
   import { initPushSettings, syncPushSubscription, disablePush, maybeHintHomeScreenFavorites, ASKED_KEY as PUSH_ASKED_KEY, HOME_SCREEN_SEEN_KEY } from './push.js';
   ```
   Après :
   ```js
   import { initPushSettings, syncPushSubscription, disablePush, retryPendingUnsubscribe, maybeHintHomeScreenFavorites, ASKED_KEY as PUSH_ASKED_KEY, HOME_SCREEN_SEEN_KEY } from './push.js';
   ```

   b) Nouvelle fonction au niveau du module, juste avant le rappel `DOMContentLoaded`. Avant :
   ```js
   document.addEventListener('DOMContentLoaded', async () => {
   ```
   Après :
   ```js
   // PRIV-06 : deconnecte (bouton, autre onglet, session expiree), plus rien du compte
   // precedent : ni ses pages (console admin, « Ma demande », « Mes ajouts »), ni les fiches
   // en attente ou refusees lues grace a lui (auteur ou admin, RLS 022). Chaque module vide
   // ses propres donnees (admin.js, operators.js, additions.js).
   const ACCOUNT_VIEW_IDS = ['admin-view', 'operator-request-view', 'my-additions-view'];

   function forgetAccountScreens(user) {
       if (user && !user.is_anonymous) return;
       if (ACCOUNT_VIEW_IDS.some((id) => document.getElementById(id)?.classList.contains('view-active'))) goBackToMap();
       AppState.rejectedDistributors = [];
       const kept = AppState.distributors.filter((d) => d.reviewStatus !== 'pending' || d.isLocalOnly);
       if (kept.length === AppState.distributors.length) return;
       const openId = document.getElementById('dist-modal-overlay')?.classList.contains('active') ? AppState.currentDistributor?.id : null;
       AppState.distributors = kept;
       if (openId && !kept.some((d) => d.id === openId)) document.getElementById('dist-modal-close')?.click();
       updateMapMarkers(false);   // la carte garde son cadrage
       if (document.getElementById('sidebar')?.classList.contains('open')) openSidePanelForFilters(AppState.activeFilters);
   }

   document.addEventListener('DOMContentLoaded', async () => {
   ```

   c) Avant :
   ```js
       initPushSettings();
       syncPushSubscription();
   ```
   Après :
   ```js
       initPushSettings();
       syncPushSubscription();
       // PRIV-06 : un effacement d'abonnement reste en attente (hors ligne) est renvoye
       retryPendingUnsubscribe();
       window.addEventListener('online', retryPendingUnsubscribe);
   ```

   d) Avant :
   ```js
       // Le serveur ne notifie pas son propre signal : il connait le compte (EPIC-T25)
       onAuthChange(syncPushSubscription);
   ```
   Après :
   ```js
       // Le serveur ne notifie pas son propre signal : il connait le compte (EPIC-T25)
       onAuthChange(syncPushSubscription);
       // PRIV-06 : deconnecte, plus rien du compte precedent a l'ecran ni en memoire
       onAuthChange(forgetAccountScreens);
   ```

4. **js/admin.js** — la console se vide à la déconnexion.

   a) Avant :
   ```js
   import { isAdminUser, whenOperatorStateReady, renderOperatorProgress, renderOperatorThread, loadOperatorMessages } from './operators.js';
   ```
   Après :
   ```js
   import { isAdminUser, whenOperatorStateReady, renderOperatorProgress, renderOperatorThread, loadOperatorMessages } from './operators.js';
   import { onAuthChange } from './auth.js';
   ```

   b) Avant (4 lignes, uniques ensemble) :
   ```js
   export function initAdmin() {
       const view = document.getElementById('admin-view');
       if (!view) return;
       view.addEventListener('click', handleAdminClick);
   ```
   Après :
   ```js
   // PRIV-06 : deconnecte, la console ne garde rien (e-mails, SIRET, echanges, carte imprimee)
   function resetAdmin() {
       requests = [];
       pending = [];
       currentId = null;
       currentPendingId = null;
       pendingDraft = null;
       sireneCache.clear();
       if (pendingMap) {   // avant de vider #admin-detail, qui la contient
           pendingMap.remove();
           pendingMap = null;
       }
       for (const id of ['admin-pending', 'admin-requests', 'admin-operators', 'admin-detail', 'operator-print-card']) {
           const el = document.getElementById(id);
           if (el) el.innerHTML = '';
       }
       for (const id of ['admin-pending-count', 'admin-requests-count']) {
           const el = document.getElementById(id);
           if (el) el.textContent = '';
       }
       const detail = document.getElementById('admin-detail');
       if (detail) detail.hidden = true;
       const content = document.getElementById('admin-content');
       if (content) content.hidden = true;
       setStatus('');
       const sheet = document.getElementById('admin-sheet');
       if (sheet) {
           sheet.hidden = true;
           sheet.innerHTML = '';
       }
   }

   export function initAdmin() {
       onAuthChange((user) => { if (!user || user.is_anonymous) resetAdmin(); });
       const view = document.getElementById('admin-view');
       if (!view) return;
       view.addEventListener('click', handleAdminClick);
   ```

5. **js/operators.js** — « Ma demande » vidée à la déconnexion et avant chaque ouverture.

   a) Avant (2 lignes) :
   ```js
   export async function openOperatorRequest(requestId) {
       openRequestId = Number(requestId);
   ```
   Après :
   ```js
   // PRIV-06 : page « Ma demande » videe (deconnexion, ou avant d'ouvrir une demande :
   // jamais celle d'un autre compte, meme un instant) ; relecture des 30 s arretee
   function clearOperatorRequestView() {
       openRequestId = null;
       clearInterval(pollTimer);
       renderedTodoKey = null;
       const content = document.getElementById('operator-request-content');
       if (content) content.innerHTML = '';
       const input = document.getElementById('op-composer-input');
       if (input) input.value = '';
       document.getElementById('op-composer')?.setAttribute('hidden', '');
   }

   export async function openOperatorRequest(requestId) {
       clearOperatorRequestView();
       openRequestId = Number(requestId);
   ```

   b) Avant :
   ```js
       onAuthChange(() => refreshOperatorState());
   ```
   Après :
   ```js
       onAuthChange((user) => {
           if (!user || user.is_anonymous) clearOperatorRequestView();   // PRIV-06
           refreshOperatorState();
       });
   ```

6. **js/additions.js** — « Mes ajouts » vidée à la déconnexion. Avant :
   ```js
       onAuthChange(() => refreshMyAdditions());
   ```
   Après :
   ```js
       onAuthChange((user) => {
           // PRIV-06 : deconnecte, la page ne garde rien du compte precedent
           if (!user || user.is_anonymous) {
               const box = document.getElementById('my-additions-content');
               if (box) box.innerHTML = '';
           }
           refreshMyAdditions();
       });
   ```

7. **CLAUDE.md** — nouvelle clé locale. Avant :
   ```
   Flag dev : `distrimatch_force_auth`.
   ```
   Après :
   ```
   Flag dev : `distrimatch_force_auth`. `distrimatch_push_pending_unsubscribe` (PRIV-06) : adresse d'un abonnement aux notifications dont l'effacement serveur a echoue (hors ligne), renvoye au demarrage et au retour du reseau, gardee par « Effacer mes données » ; a la deconnexion, l'abonnement est efface puis recree sans compte, et la session locale est effacee meme sans reseau.
   ```

8. **index.html** — six modules JS changent : monter le `?v=` de **toutes** les entrées de l'import
   map à la même valeur V+1 (V noté aux contrôles). Aucun CSS ne change. **Ne pas toucher** à la
   balise hCaptcha (ligne 1089).

## Tests

### Test 1 — session effacée sans réseau (intégration DOM, jsdom)
- **Fichier** : `tests/integration/dom.test.js`, **à la fin du fichier**. Avant (fin actuelle du fichier, 3 lignes) :
  ```js
          assert.deepEqual(resultIds(), ['pain', 'sans-adresse']);
      });
  });
  ```
  Après :
  ```js
          assert.deepEqual(resultIds(), ['pain', 'sans-adresse']);
      });
  });

  // ============================================
  // DECONNEXION SANS RESEAU (PRIV-06)
  // ============================================

  const { signOut, getCurrentUser } = await import('../../js/auth.js');
  const { SUPABASE_URL: SUPABASE_URL_FOR_SESSION } = await import('../../js/config.js');

  describe('Deconnexion sans reseau (PRIV-06)', () => {
      const SESSION_KEY = `sb-${new URL(SUPABASE_URL_FOR_SESSION).hostname.split('.')[0]}-auth-token`;
      after(() => { setSupabaseClient(null); localStorage.removeItem(SESSION_KEY); });

      it('le serveur ne repond pas : session effacee de l’appareil, visiteur', async () => {
          localStorage.setItem(SESSION_KEY, '{"access_token":"itest"}');
          let calls = 0;
          setSupabaseClient({ auth: { signOut: async () => { calls++; return { error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch' } }; } } });
          window.__testLogin();
          await signOut();
          assert.equal(calls, 1);
          assert.equal(localStorage.getItem(SESSION_KEY), null);
          assert.equal(getCurrentUser(), null);
      });

      it('signOut qui leve une exception : meme resultat, aucune erreur remontee', async () => {
          localStorage.setItem(SESSION_KEY, '{"access_token":"itest"}');
          setSupabaseClient({ auth: { signOut: async () => { throw new TypeError('Failed to fetch'); } } });
          window.__testLogin();
          await signOut();
          assert.equal(localStorage.getItem(SESSION_KEY), null);
          assert.equal(getCurrentUser(), null);
      });
  });
  ```
- **Doit échouer avant l'étape 1** : la clé reste en place (1er test) ; l'exception remonte de `signOut` (2e test).
- jsdom n'a pas de `serviceWorker` : `forgetPushAccount` sort tout de suite (voulu, testé en fonctionnel).

### Test 2 — notifications et déconnexion (fonctionnel)
- **Fichier** : `tests/functional/notifications.spec.js`, **à la fin du fichier**. Avant (fin actuelle, 3 lignes, uniques ensemble) :
  ```js
          await expect(modal).toContainText('Être prévenu même app fermée ?');
      });
  });
  ```
  Après :
  ```js
          await expect(modal).toContainText('Être prévenu même app fermée ?');
      });
  });

  // ============================================
  // 40c. NOTIFICATIONS APP FERMEE ET COMPTE (PRIV-06)
  // ============================================

  test.describe('40c. Notifications app fermee et compte (PRIV-06)', () => {
      const ENDPOINT = 'https://push.test/abc';

      // Abonnement simule, notifications accordees et actives ; RPC push interceptees
      async function fakePush(page) {
          const state = { calls: [], failUnsubscribe: false };
          for (const fn of ['push_subscribe', 'push_unsubscribe']) {
              await page.route(`**/rest/v1/rpc/${fn}`, async route => {
                  state.calls.push({ fn, endpoint: route.request().postDataJSON()?.p_endpoint });
                  if (fn === 'push_unsubscribe' && state.failUnsubscribe) {
                      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'indisponible' }) });
                  }
                  return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
              });
          }
          await page.evaluate(async (endpoint) => {
              Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'granted' });
              const fakeSub = { endpoint, toJSON: () => ({ endpoint, keys: { p256dh: 'p256', auth: 'auth' } }), unsubscribe: async () => true };
              navigator.serviceWorker.getRegistration = async () => ({ pushManager: { getSubscription: async () => fakeSub } });
              const { NotificationPrefs } = await import('./js/state.js');
              NotificationPrefs.push = true;
          }, ENDPOINT);
          return state;
      }

      test('deconnexion : l’abonnement est efface puis recree sans compte', async ({ page }) => {
          const push = await fakePush(page);
          await loginForTest(page);
          await expect.poll(() => push.calls.length).toBeGreaterThan(0);   // synchro a la connexion
          push.calls.length = 0;
          await page.evaluate(() => window.switchView('account'));
          await page.click('#account-auth-action');
          await expect.poll(() => push.calls.some(c => c.fn === 'push_subscribe')).toBe(true);
          expect(push.calls[0]).toEqual({ fn: 'push_unsubscribe', endpoint: ENDPOINT });
          expect(push.calls.findIndex(c => c.fn === 'push_subscribe')).toBeGreaterThan(0);
          await expect(page.locator('#account-auth-text')).toHaveText('Non connecté');
      });

      test('couper les notifications sans reponse du serveur : l’effacement est garde puis renvoye', async ({ page }) => {
          const push = await fakePush(page);
          push.failUnsubscribe = true;
          await page.evaluate(async () => (await import('./js/push.js')).disablePush());
          expect(push.calls.filter(c => c.fn === 'push_unsubscribe')[0]).toEqual({ fn: 'push_unsubscribe', endpoint: ENDPOINT });
          expect(await page.evaluate(() => localStorage.getItem('distrimatch_push_pending_unsubscribe'))).toBe(ENDPOINT);
          push.failUnsubscribe = false;
          push.calls.length = 0;
          expect(await page.evaluate(async () => (await import('./js/push.js')).retryPendingUnsubscribe())).toBe(true);
          expect(push.calls).toEqual([{ fn: 'push_unsubscribe', endpoint: ENDPOINT }]);
          expect(await page.evaluate(() => localStorage.getItem('distrimatch_push_pending_unsubscribe'))).toBeNull();
      });
  });
  ```
- **Doivent échouer avant les étapes 1-2** : 1er test, le premier appel est `push_subscribe` (rien n'efface
  l'abonnement) ; 2e test, la clé reste vide puis `retryPendingUnsubscribe` n'existe pas (« is not a function »).

### Test 3 — console admin et « Mes ajouts » (fonctionnel)
- **Fichier** : `tests/functional/validation.spec.js`, **à la fin du fichier**. Avant (fin actuelle, 4 lignes) :
  ```js
              p_id: 'user-new', p_decision: 'publish', p_name: 'Pizza corrigée', p_type: 'bakery', p_emoji: '🥖', p_lat: moved.lat, p_lng: moved.lng
          });
      });
  });
  ```
  Après :
  ```js
              p_id: 'user-new', p_decision: 'publish', p_name: 'Pizza corrigée', p_type: 'bakery', p_emoji: '🥖', p_lat: moved.lat, p_lng: moved.lng
          });
      });
  });

  // PRIV-06 : la deconnexion ne laisse rien du compte a l'ecran
  test.describe('37b. Deconnexion (PRIV-06)', () => {
      test('admin deconnecte, console ouverte : retour a la carte, console videe, fiches en attente retirees', async ({ page }) => {
          await routeReviewApi(page, {
              admin: true,
              pending: [{ id: 'user-new', name: 'Fiche en attente itest', type: 'pizza', emoji: '🍕', address: '1 rue Test', city: 'Bayonne', lat: 43.4935, lng: -1.4748,
                  created_at: minutesAgoIso(60), email: 'membre@example.test', products: ['Margherita'], unread: 0 }]
          });
          await loginForTest(page);
          // Fiches lues grace au compte admin (RLS 022) : une en attente d'un autre membre, une refusee
          await page.evaluate(() => {
              const base = window.AppState.distributors[0];
              window.AppState.distributors.push({ ...base, id: 'pending-other', name: 'Fiche en attente itest', reviewStatus: 'pending', addedById: 'autre-membre', products: [] });
              window.AppState.rejectedDistributors = [{ ...base, id: 'rejected-other', reviewStatus: 'rejected' }];
          });
          await page.evaluate(() => window.switchView('admin'));
          await page.locator('#admin-pending .admin-request').click();
          await expect(page.locator('#admin-detail')).toContainText('membre@example.test');
          await expect(page.locator('#admin-pending-map')).toBeVisible();
          await page.evaluate(() => window.__testLogout());
          await expect(page.locator('#admin-view')).not.toHaveClass(/view-active/);
          await expect(page.locator('#admin-detail')).toBeEmpty();
          await expect(page.locator('#admin-pending')).toBeEmpty();
          await expect(page.locator('#admin-pending-map')).toHaveCount(0);
          expect(await page.evaluate(() => ({
              pending: window.AppState.distributors.some(d => d.id === 'pending-other'),
              rejected: window.AppState.rejectedDistributors.length
          }))).toEqual({ pending: false, rejected: 0 });
      });

      test('deconnexion sur « Mes ajouts » : retour a la carte, liste videe', async ({ page }) => {
          await routeReviewApi(page, {
              mine: [{ id: 'user-a', name: 'Pizza de la gare', type: 'pizza', emoji: '🍕', city: 'Bayonne', review_status: 'pending', review_reason: null, author_read_at: minutesAgoIso(100), created_at: minutesAgoIso(200) }]
          });
          await loginForTest(page);
          await page.evaluate(() => window.switchView('account'));
          await page.click('#account-additions-row');
          await expect(page.locator('#my-additions-content .addition-card')).toHaveCount(1);
          await page.evaluate(() => window.__testLogout());
          await expect(page.locator('#my-additions-view')).not.toHaveClass(/view-active/);
          await expect(page.locator('#my-additions-content')).toBeEmpty();
          await expect(page.locator('#account-additions-row')).toBeHidden();
      });
  });
  ```
- **Doivent échouer avant l'étape 3** : la page (`#admin-view`, `#my-additions-view`) reste active.

### Test 4 — « Ma demande » (fonctionnel)
- **Fichier** : `tests/functional/exploitants.spec.js`, **à la fin du fichier**. Avant (fin actuelle, 3 lignes) :
  ```js
          await expect(page.locator('#dist-products-list .product-seen.is-owner')).toHaveCount(0);
      });
  });
  ```
  Après :
  ```js
          await expect(page.locator('#dist-products-list .product-seen.is-owner')).toHaveCount(0);
      });
  });

  // PRIV-06 : deconnexion pendant « Ma demande »
  test.describe('33b. Deconnexion sur « Ma demande » (PRIV-06)', () => {
      test('retour a la carte ; demande, echange et champ d’envoi effaces', async ({ page }) => {
          const id = await firstSignalableId(page);
          await routeOperatorApi(page, {
              requests: [request(id)],
              messages: [{ id: 2, request_id: 7, author: 'admin', body: 'Message de l’équipe itest', created_at: minutesAgoIso(30) }]
          });
          await loginForTest(page);
          await page.evaluate(async () => { const m = await import('./js/operators.js'); await m.refreshOperatorState(); m.openOperatorRequest(7); });
          await expect(page.locator('#op-thread')).toContainText('Message de l’équipe itest');
          await expect(page.locator('#op-composer')).toBeVisible();
          await page.fill('#op-composer-input', 'Brouillon du compte precedent');
          await page.evaluate(() => window.__testLogout());
          await expect(page.locator('#operator-request-view')).not.toHaveClass(/view-active/);
          await expect(page.locator('#operator-request-content')).toBeEmpty();
          await expect(page.locator('#op-composer')).toHaveAttribute('hidden', '');
          await expect(page.locator('#op-composer-input')).toHaveValue('');
      });
  });
  ```
- **Doit échouer avant l'étape 3** : `#operator-request-view` reste active.

## Vérification (dans l'ordre)
```bash
grep -n "forgetPushAccount" js/auth.js js/push.js            # auth.js : import + appel ; push.js : la fonction
grep -n "retryPendingUnsubscribe" js/app.js js/push.js      # app.js : import + 2 lignes ; push.js : la fonction
grep -n "onAuthChange(forgetAccountScreens);" js/app.js     # 1 ligne
grep -n "PENDING_UNSUBSCRIBE_KEY\|distrimatch_push_pending" js/app.js   # aucun résultat (la clé n'est PAS dans clearUserData)
grep -n "js.hcaptcha.com" index.html                        # inchangé : 1 ligne
npm test                                                    # tout vert, dont « Deconnexion sans reseau (PRIV-06) » et « cache-busting »
npx playwright test --project=functional -g "PRIV-06"       # 5 passed
npx playwright test --project=functional -g "Console admin|Validation des nouvelles fiches|Demande d’exploitant|Notifications app fermee|Auth wall|Politique d"   # tout vert
npm run test:functional                                     # en arrière-plan (~10 min) : tout vert, instables notés dans la PR
git diff --stat                                             # seuls les fichiers de la fiche (+ index.html, CLAUDE.md, BACKLOG.md)
```

## Hors périmètre
- **hCaptcha chargé à la demande** (`index.html:1089`) : **non fait ici**, raison : charger le script à
  l'ouverture de la fenêtre de connexion impose `?render=explicit` (sinon hCaptcha rend tout seul
  le `.h-captcha` déjà présent avec `data-callback="onHcaptchaSuccess"`, fonction inexistante : le
  bouton « Recevoir le lien » resterait grisé et **plus personne ne pourrait se connecter en prod**).
  Or aucun test ne peut le vérifier avant la fusion : sur localhost le captcha est désactivé
  (`auth.js:251`) et les E2E n'ouvrent pas la fenêtre de connexion. À faire dans une story à part,
  avec un test E2E visiteur (ouvrir la connexion sur le site en ligne, attendre l'iframe hCaptcha)
  et la correction des `data-callback` inexistants.
- Côté serveur, push_subscribe retire le compte lors d'un réabonnement sans compte : migration 033 (PRIV-07).
- Déconnexion venue d'un autre onglet ou session expirée : les écrans sont nettoyés (écouteurs), mais
  l'abonnement n'est oublié que par l'onglet qui a appelé `signOut()`.
- Révoquer la session côté serveur après une déconnexion hors ligne (impossible sans réseau).
- Message honnête de « Effacer mes données » quand l'effacement serveur est différé ; ménage du
  cas « désabonnement navigateur échoué puis réabonnement à la même adresse ».
- Menu de l'avatar sous les pages (`.top-nav` sous `.view-page`) : story BUG / A11Y.
- « Mon activité » (`js/my-activity.js`) : elle vide déjà ses données à la déconnexion, ne pas y toucher.

## Pièges connus
- `forgetPushAccount()` **avant** `supabaseClient.auth.signOut()`, jamais après : `SIGNED_OUT` lance la
  synchronisation anonyme pendant `signOut()` ; après, elle passerait avant l'effacement.
- Ne pas mettre d'appel Supabase attendu dans le rappel `onAuthStateChange` d'`initAuth` (blocage
  possible de supabase-js) : la logique reste dans `signOut()` et dans les écouteurs `onAuthChange`.
- Ne pas remplacer par `signOut({ scope: 'local' })` : même appel serveur, même échec.
- **Ne pas ajouter** `distrimatch_push_pending_unsubscribe` à la liste `userKeys` de `clearUserData`.
- `resetAdmin` : `pendingMap.remove()` **avant** de vider `#admin-detail` (Leaflet a besoin de son conteneur).
- `clearOperatorRequestView` utilise `renderedTodoKey`, déclaré plus bas avec `let` : sans risque
  (fonction appelée après le chargement du module). Ne pas déplacer la déclaration.
- `window.__testLogout()` n'appelle pas `signOut()` (il prévient seulement les écouteurs) : le test
  push clique donc le vrai bouton `#account-auth-action` ; les tests d'écrans utilisent `__testLogout`.
- `#op-composer` : vérifier l'attribut `hidden`, pas `toBeHidden()` (la page masquée le rendrait
  « caché » même sans la correction).
- Dans `dom.test.js`, `SUPABASE_URL` est importé sous un autre nom (`SUPABASE_URL_FOR_SESSION`) par
  précaution : une story précédente pourrait déclarer ce nom plus haut (une double déclaration
  `const` casse tout le fichier). Si `signOut` ou `getCurrentUser` y sont déjà déclarés
  (`grep -n "signOut\|getCurrentUser" tests/integration/dom.test.js` doit ne rien trouver avant
  le Test 1), s'arrêter et signaler.
- Bump de **toutes** les entrées de l'import map à la **même** valeur, sinon `cache-busting` échoue.
- Fichiers en CRLF : outil Edit (il garde les fins de ligne) ; si un bloc refuse, petit script Node
  dans le scratchpad (voir README).

## Terminé quand
- [ ] Contrôles passés, tests écrits (échouent avant, passent après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : non (aucun écran nouveau ; le changement se voit seulement à la déconnexion, couvert par les tests)
- [ ] Story cochée dans BACKLOG.md (si elle n'y figure pas : le noter dans la PR), PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `fix(vie-privee): la deconnexion efface vraiment ce qui releve du compte`

**Corps** : constats corrigés (liste ci-dessus) ; causes (erreur de `auth.signOut()` ignorée,
`push_subscribe` qui garde le compte, résultat de `push_unsubscribe` ignoré, aucune page ni donnée
du compte vidée à la déconnexion) ; correction (session locale effacée sur erreur, abonnement effacé
avant la fin de session puis recréé sans compte, effacement en attente renvoyé, écouteurs de
déconnexion dans app.js / admin.js / operators.js / additions.js) ; ce qui change pour l'utilisateur
(rien tant qu'il est connecté ; à la déconnexion, retour à la carte depuis les pages du compte) ;
tests ajoutés ; sorties des commandes de vérification ; **hCaptcha non traité, avec la raison** ;
côté serveur, `push_subscribe` retirera le compte lors d'un réabonnement sans compte : migration 033 (PRIV-07).
