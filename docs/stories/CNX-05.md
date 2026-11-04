# CNX-05 — Connexion : l'app ne réagit qu'à un vrai changement de compte, et dès l'ouverture

- **Lot** : 4. Connexion, retour et liens · **Gravité** : moyen · **Niveau conseillé** : medium
- **Prérequis** : **CNX-04 fusionnée** dans `master` ; partir de `master` **à jour**. Sinon : s'arrêter
  (sans CNX-04, la bascule de la fiche avant l'accueil ferait surgir la demande de position).
- **Branche** : `fix/evenements-connexion` · **Taille** : 2 fichiers JS (+ `index.html`) + 2 fichiers de tests. **Aucune migration.**
- **Constats couverts** (rapport du 2026-10-21) :
  - Chaque événement d'authentification relance tout : toast « Connecte avec … » répété et brouillon d'avis écrasé — `js/auth.js:70` (aujourd'hui ligne 67)
  - Fiche ouverte par lien avant la géolocalisation : une connexion faite dans un autre onglet ne la met pas à jour, et « Connecte-toi » ne fait plus rien — `js/app.js:670` (aujourd'hui lignes 798-804)

## But
Revenir dans l'app (écran déverrouillé, autre onglet) n'efface plus un avis en cours ni un ajout de
produit, et le toast « Connecté avec … » ne revient plus ; une fiche ouverte par un QR passe en mode
membre dès qu'on se connecte, même avant d'avoir accepté la localisation.

## User story
En tant que membre qui écrit un avis devant le distributeur, je veux retrouver mon texte quand je
reviens dans l'app, afin de ne pas tout réécrire ; et, connecté depuis le lien reçu par e-mail, je
veux pouvoir signaler tout de suite sur la fiche du QR.

**Critères d'acceptation**
- [ ] `SIGNED_IN` répété ou `TOKEN_REFRESHED` du même compte : aucun toast, aucun écouteur prévenu
      (la session est quand même mise à jour).
- [ ] Vraie connexion : un toast « Connecté avec <e-mail> » et les écouteurs prévenus une fois ;
      vraie déconnexion : un toast « Déconnecté » et les écouteurs prévenus une fois.
- [ ] « Se déconnecter » ne prévient plus les écouteurs deux fois.
- [ ] Fiche ouverte par un lien avant l'écran d'accueil, connexion faite ailleurs : l'invitation
      « Connecte-toi » disparaît et la ligne d'état devient touchable, sans passer par l'accueil.

## Ce qui est déjà tranché (ne pas refaire l'analyse)
- **Événements répétés** : supabase-js réémet `SIGNED_IN` quand la session est confirmée (retour sur
  l'onglet) et `TOKEN_REFRESHED` environ toutes les heures. On garde toujours la session fraîche
  (`currentUser = session?.user`), mais on ne prévient (toast + `notifyAuthChange`) que si
  l'identifiant du compte change. Le brouillon d'avis n'est plus réécrit puisque
  `refreshFicheForAuth` → `refreshReviewsForAuth` → `fetchMine` ne tourne plus. Pas de drapeau
  « brouillon modifié » dans `reviews.js` (hors périmètre).
- **Déconnexion** : `supabaseClient.auth.signOut()` émet déjà `SIGNED_OUT` quand le serveur répond
  (écouteurs prévenus) ; `signOut()` (auth.js) ne prévient plus que si `currentUser` n'est pas déjà
  `null` (cas hors réseau de PRIV-06, où supabase-js n'émet rien).
- **Écouteurs trop tard** : `refreshAuthUI` et `refreshFicheForAuth` étaient branchés après
  `await initGeolocationOverlay()`. On les branche juste après `initDistModal()` (tous leurs
  éléments existent déjà dans la page). `syncPushSubscription` et `forgetAccountScreens` restent où
  ils sont (ils dépendent de `initPushSettings()` et des pages chargées ensuite).
- Le texte du toast prend ses accents (« Connecté », « Déconnecté ») : textes de l'interface.

## Avant de coder
**Lire en entier** : `js/auth.js` lignes 20-90 et 170-200 ; `js/app.js` lignes 640-670 et 790-812 ;
`js/gmaps-ui.js` `refreshFicheForAuth` (vers la ligne 855) ; `js/reviews.js` lignes 100-133 ;
fin de `tests/integration/dom.test.js` (bloc PRIV-06) ; `tests/functional/auth.spec.js` lignes 1-20.

**Réutiliser** : `onAuthChange` (renvoie de quoi retirer l'écouteur depuis CNX-02), `initAuth`,
`getCurrentUser` (`js/auth.js`), `setSupabaseClient` (`js/state.js`, déjà importé dans `dom.test.js`),
`captureEvents`, `BASE_URL` (`tests/functional/helpers.js`, déjà importés dans `auth.spec.js` depuis CNX-03).

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
grep -n "    return () => {" js/auth.js                                       # 1 ligne (onAuthChange, CNX-02 fusionnée)
grep -n "checkNearbyForFiche(AppState.currentDistributor);" js/app.js         # 1 ligne (CNX-04 fusionnée)
grep -n "        supabaseClient.auth.onAuthStateChange((event, session) => {" js/auth.js   # 1 ligne (78 environ)
grep -n 'Connecte avec ' js/auth.js                                        # 1 ligne (72, dans onAuthStateChange)
grep -n "showToast('Deconnecte', 'default');" js/auth.js                       # 1 ligne
grep -n -B 2 "^    currentUser = null;$" js/auth.js                           # 1 bloc, précédé de « try { localStorage.removeItem(SESSION_STORAGE_KEY) ... » puis « } »
grep -n "^    initDistModal();" js/app.js                                      # 1 ligne
grep -n "^    onAuthChange(refreshAuthUI);" js/app.js                          # 1 ligne (802)
grep -n "^    onAuthChange(refreshFicheForAuth);" js/app.js                    # 1 ligne (804)
grep -n "^    onAuthChange(syncPushSubscription);" js/app.js                   # 1 ligne (806)
grep -n "^const { signOut, getCurrentUser } = await import('../../js/auth.js');" tests/integration/dom.test.js   # 1 ligne
grep -n "initAuth\|onAuthChange" tests/integration/dom.test.js                 # aucun résultat
grep -n "^async function openWithSession" tests/functional/auth.spec.js        # 1 ligne
grep -o '"./js/app.js": "./js/app.js?v=[0-9]*"' index.html                    # noter V (117 attendu après CNX-04)
```

## Étapes

1. **js/auth.js**, `initAuth` — ne prévenir qu'au vrai changement de compte. Avant :
   ```js
           supabaseClient.auth.onAuthStateChange((event, session) => {
               currentUser = session?.user || null;
               console.log('[Auth] Event:', event, 'User:', currentUser?.email || 'anonyme/null');

               if (event === 'SIGNED_IN' && !currentUser?.is_anonymous) {
                   showToast(`Connecte avec ${currentUser.email}`, 'success');
               }
               if (event === 'SIGNED_OUT') {
                   showToast('Deconnecte', 'default');
               }

               notifyAuthChange();
           });
   ```
   Après :
   ```js
           supabaseClient.auth.onAuthStateChange((event, session) => {
               // CNX-05 : supabase-js reemet SIGNED_IN au retour sur l'onglet et TOKEN_REFRESHED
               // toutes les heures. La session est gardee a jour, mais l'app (toast, fiche, avis,
               // formulaires) n'est prevenue que si le compte change : sinon une saisie en cours
               // etait effacee et le toast revenait a chaque retour dans l'app.
               const previousId = currentUser?.id ?? null;
               currentUser = session?.user || null;
               const nextId = currentUser?.id ?? null;
               console.log('[Auth] Event:', event, 'User:', currentUser?.email || 'anonyme/null');
               if (previousId === nextId) return;
               if (nextId && !currentUser.is_anonymous) showToast(`Connecté avec ${currentUser.email}`, 'success');
               if (!nextId) showToast('Déconnecté', 'default');
               notifyAuthChange();
           });
   ```

2. **js/auth.js**, fin de `signOut` — une seule notification. Avant :
   ```js
           try { localStorage.removeItem(SESSION_STORAGE_KEY); } catch (e) { /* stockage bloque */ }
       }
       currentUser = null;
       notifyAuthChange();
   }
   ```
   Après :
   ```js
           try { localStorage.removeItem(SESSION_STORAGE_KEY); } catch (e) { /* stockage bloque */ }
       }
       // CNX-05 : si le serveur a repondu, supabase-js a deja emis SIGNED_OUT (ecouteurs
       // prevenus, currentUser a null) : une seule notification par vrai changement
       if (currentUser === null) return;
       currentUser = null;
       notifyAuthChange();
   }
   ```

3. **js/app.js** — brancher l'état de connexion avant l'attente de la géolocalisation. Avant :
   ```js
       // Initialiser la modal des maintenant pour le deep link
       initDistModal();
   ```
   Après :
   ```js
       // Initialiser la modal des maintenant pour le deep link
       initDistModal();
       // Etat auth : indicateur Compte + libelle Connexion/Deconnexion du menu + nom du hero
       // profil (refreshAuthUI, aussi callback des vues profil/compte) et fiche ouverte
       // (lecture / information, EPIC-T5). CNX-05 : branche AVANT l'attente de la
       // geolocalisation, sinon une fiche ouverte par un lien (QR) ne basculait pas quand on
       // se connectait dans un autre onglet avant d'accepter la localisation.
       refreshAuthUI(getCurrentUser());
       onAuthChange(refreshAuthUI);
       onAuthChange(refreshFicheForAuth);
   ```

4. **js/app.js** — retirer l'ancien branchement. Avant :
   ```js
       // Etat auth : indicateur Compte + libelle Connexion/Deconnexion du menu
       // + nom du hero profil. refreshAuthUI() est aussi le callback des vues
       // profil/compte (defini au niveau module plus bas).
       refreshAuthUI(getCurrentUser());
       onAuthChange(refreshAuthUI);
       // Fiche ouverte : bascule lecture / information a la connexion (EPIC-T5)
       onAuthChange(refreshFicheForAuth);
       // Le serveur ne notifie pas son propre signal : il connait le compte (EPIC-T25)
       onAuthChange(syncPushSubscription);
   ```
   Après :
   ```js
       // Etat auth (refreshAuthUI, refreshFicheForAuth) : branche plus haut, apres initDistModal (CNX-05)
       // Le serveur ne notifie pas son propre signal : il connait le compte (EPIC-T25)
       onAuthChange(syncPushSubscription);
   ```

5. **index.html** — deux modules JS changent : monter le `?v=` de **toutes** les entrées de l'import
   map à la même valeur V+1. Aucun CSS ne change.

## Tests

### Test 1 — événements répétés (intégration DOM, jsdom)
- **Fichier** : `tests/integration/dom.test.js`, **à la toute fin du fichier** (après sa dernière ligne `});`).
- **Code à ajouter** :
  ```js

  // ============================================
  // EVENEMENTS DE SESSION REPETES (CNX-05)
  // ============================================

  const { initAuth, onAuthChange } = await import('../../js/auth.js');

  describe('Evenements de session repetes (CNX-05)', () => {
      after(() => setSupabaseClient(null));

      it('SIGNED_IN repete et TOKEN_REFRESHED du meme compte : ni toast ni ecouteur ; vrai changement : une fois', async () => {
          let emit = null;
          setSupabaseClient({ auth: {
              getSession: async () => ({ data: { session: null } }),
              onAuthStateChange: (cb) => { emit = cb; return { data: { subscription: { unsubscribe() {} } } }; }
          } });
          window.__testLogout();
          await initAuth();
          const seen = [];
          const stop = onAuthChange((user) => seen.push(user?.id ?? null));
          const container = document.getElementById('toast-container');
          container.innerHTML = '';
          const session = { user: { id: 'u-cnx05', email: 'cnx05@exemple.fr', is_anonymous: false } };
          emit('SIGNED_IN', session);
          emit('SIGNED_IN', session);
          emit('TOKEN_REFRESHED', session);
          assert.deepEqual(seen, ['u-cnx05']);
          assert.equal(getCurrentUser().id, 'u-cnx05');
          assert.equal(container.children.length, 1);
          assert.equal(container.children[0].textContent, 'Connecté avec cnx05@exemple.fr');
          emit('SIGNED_OUT', null);
          assert.deepEqual(seen, ['u-cnx05', null]);
          assert.equal(getCurrentUser(), null);
          assert.equal(container.children[1].textContent, 'Déconnecté');
          stop();
      });
  });
  ```
- **Doit échouer avant l'étape 1** : `seen` vaut `['u-cnx05', 'u-cnx05', 'u-cnx05']`.

### Test 2 — fiche ouverte avant l'accueil (fonctionnel)
- **Fichier** : `tests/functional/auth.spec.js`, **juste avant** ces 3 lignes (uniques ensemble) :
  ```js
  // ============================================
  // CONNEXION PAR CODE RECU PAR E-MAIL (BUG-05)
  // ============================================
  ```
- **Code à ajouter** :
  ```js
  // ============================================
  // FICHE OUVERTE PAR UN LIEN AVANT L'ACCUEIL (CNX-05)
  // ============================================

  test.describe('Fiche ouverte par un lien avant la localisation (CNX-05)', () => {
      test('connexion faite ailleurs : la fiche passe en mode membre sans attendre l’accueil', async ({ browser }) => {
          const context = await browser.newContext();
          const page = await context.newPage();
          await captureEvents(page);
          await page.goto(`${BASE_URL}/?id=dist-007`);
          await page.waitForSelector('#dist-modal-overlay.active', { timeout: 50000 });
          await expect(page.locator('#dist-login-invite')).toBeVisible();
          await page.evaluate(() => window.__testLogin());
          await expect(page.locator('#dist-login-invite')).toBeHidden();
          await expect(page.locator('#dist-status-update')).not.toHaveAttribute('data-guest', '1');
          // Toujours avant l'accueil : la localisation n'a pas ete demandee
          expect(await page.evaluate(() => !document.getElementById('geoloc-overlay')?.classList.contains('hidden'))).toBe(true);
          await context.close();
      });
  });

  ```
- **Doit échouer avant les étapes 3-4** : l'invitation reste visible (`toBeHidden` expire).

## Vérification (dans l'ordre)
```bash
node --check js/auth.js && node --check js/app.js                            # aucune sortie
grep -c "onAuthChange(refreshFicheForAuth);" js/app.js                       # 1
npm test                                                                     # tout vert, dont « Evenements de session repetes (CNX-05) », « PRIV-06 » et « cache-busting »
npx playwright test --project=functional -g "CNX-05"                         # 1 passed
npx playwright test --project=functional -g "Connexion par code|Connexion depuis une fiche|CNX-0|PRIV-06|Politique d|Avis"   # tout vert
npm run test:functional                                                      # en arrière-plan (~10 min) : tout vert, instables notés dans la PR
git diff --stat                                                              # auth.js, app.js, index.html, dom.test.js, auth.spec.js (+ BACKLOG.md)
```

## Hors périmètre
- Drapeau « brouillon modifié » dans `js/reviews.js` (protéger aussi le brouillon lors d'un vrai
  changement de compte) : pas utile une fois les événements répétés filtrés.
- Changement d'adresse e-mail du compte (`USER_UPDATED`, même identifiant) : l'e-mail affiché dans
  Compte se met à jour au prochain chargement. Rare, accepté.
- Les boutons « Connecte-toi » qui ignorent le résultat de `requireAuth()` (`gmaps-ui.js`,
  `reviews.js`) : inutile une fois les écouteurs branchés à temps.

## Pièges connus
- Étape 1 : garder `console.log` **avant** le `return` (diagnostic des événements conservé).
- Étapes 3 et 4 : il doit rester **un seul** `onAuthChange(refreshAuthUI)` et **un seul**
  `onAuthChange(refreshFicheForAuth)` dans `js/app.js` (vérification `grep -c`).
- Test 1 : `window.__testLogout()` remet `currentUser` à `null` avant `initAuth()` (les tests PRIV-06
  juste au-dessus ont pu laisser un compte). `initAuth` n'est appelé qu'une fois dans ce fichier.
- Test 2 : nouveau contexte **sans** localisation accordée (l'accueil reste affiché) ; ne pas le
  remplacer par `page` du `beforeEach`, qui a la localisation.
- Fichiers en CRLF : outil Edit ; si un bloc refuse, petit script Node dans le scratchpad (voir README).
- Bump de **toutes** les entrées de l'import map à la **même** valeur.

## Terminé quand
- [ ] Contrôles passés, tests écrits (échouent avant, passent après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : non (aucun écran ne change)
- [ ] Story cochée dans BACKLOG.md si elle y figure (sinon le noter dans la PR), PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `fix(connexion): l'app ne reagit qu'a un vrai changement de compte, des l'ouverture`

**Corps** : constats couverts ; causes (chaque `SIGNED_IN` / `TOKEN_REFRESHED` relançait tous les
écouteurs ; écouteurs de la fiche branchés après l'accueil) ; correction ; textes du toast avec
accents ; tests ajoutés ; sorties des commandes de vérification.
