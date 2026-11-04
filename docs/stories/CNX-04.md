# CNX-04 — Coup de pouce sur place : jamais de demande de position avant l'écran d'accueil

- **Lot** : 4. Connexion, retour et liens · **Gravité** : faible · **Niveau conseillé** : medium
- **Prérequis** : **CNX-03 fusionnée** dans `master` (les tests réutilisent son aide `openWithSession`) ;
  partir de `master` **à jour**. Sinon : s'arrêter.
- **Ordre** : avant CNX-05, qui branche la bascule de la fiche avant la géolocalisation (sans cette
  fiche-ci, CNX-05 ferait surgir la demande de position plus souvent).
- **Branche** : `fix/coup-de-pouce-apres-accueil` · **Taille** : 2 fichiers JS (+ `index.html`) + 1 fichier de tests. **Aucune migration.**
- **Constats couverts** (rapport du 2026-10-21) :
  - Coup de pouce sur place : la demande de position système surgit avant l'écran de consentement (lien profond / QR) — `js/availability.js:212`

## But
Un membre connecté qui ouvre une fiche par un lien ou un QR ne voit plus la demande de position du
navigateur avant l'écran d'accueil qui l'explique ; le coup de pouce « Tu es sur place » se calcule
dès que la carte est prête.

## User story
En tant que membre qui scanne le QR d'un distributeur, je veux que l'app m'explique pourquoi elle
demande ma position avant que le navigateur me la demande, afin de l'accepter en confiance.

**Critères d'acceptation**
- [ ] Connecté, lien vers une fiche, localisation jamais autorisée : aucune lecture de position par
      le coup de pouce tant que l'écran d'accueil est là.
- [ ] Connecté, lien vers une fiche, localisation déjà autorisée : la position est lue une fois la
      carte prête (coup de pouce calculé), jamais avant.
- [ ] Fiche ouverte depuis la carte : rien ne change (tests existants du coup de pouce verts).

## Ce qui est déjà tranché (ne pas refaire l'analyse)
- La carte n'existe qu'après le consentement (`AppState.mapInitialized`, posé par `initMainMap`,
  `js/map.js:40`) : c'est le signal retenu, comme pour l'épingle « Voir sur la carte »
  (`gmaps-ui.js`, `locateBtn.hidden = !AppState.mapInitialized`). Pas d'API Permissions ici.
- Juste après `initMainMap()`, `js/app.js` relance `checkNearbyForFiche` si une fiche est ouverte.
- Les lectures de position du coup de pouce se reconnaissent à `maximumAge: 0` (celle de l'accueil,
  `getUserLocation` dans `js/utils.js`, n'en a pas) : le test les compte ainsi.

## Avant de coder
**Lire en entier** : `js/availability.js` lignes 200-245 ; `js/app.js` lignes 14-22 et 680-705 ;
`tests/functional/auth.spec.js` (aide `openWithSession`, ajoutée par CNX-03).

**Réutiliser** : `checkNearbyForFiche` (`js/availability.js`, exportée), `AppState` (déjà importé dans
les deux modules), `openWithSession` (`tests/functional/auth.spec.js`).

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
grep -n "^async function openWithSession(context, path = '/') {" tests/functional/auth.spec.js   # 1 ligne (CNX-03 fusionnée)
grep -n "    if (!distributor || isPrivateFiche(distributor) || !isAuthenticated() || !navigator.geolocation) return;" js/availability.js   # 1 ligne (211)
grep -n "^import { AppState, supabaseClient } from './state.js';" js/availability.js   # 1 ligne
grep -n "^import { openLayers } from './history.js';" js/app.js                         # 1 ligne (21)
grep -n "from './availability.js'" js/app.js                                            # aucun résultat
grep -n "^        initMainMap();" js/app.js                                           # 1 ligne (695)
grep -n "showToast('La carte n’a pas pu s’afficher : recharge la page pour réessayer', 'error');" js/app.js   # 1 ligne
grep -n "^// CONNEXION PAR CODE RECU PAR E-MAIL (BUG-05)" tests/functional/auth.spec.js # 1 ligne
grep -o '"./js/app.js": "./js/app.js?v=[0-9]*"' index.html                             # noter V (116 attendu après CNX-03)
```

## Étapes

1. **js/availability.js**, `checkNearbyForFiche` — rien avant la carte. Avant :
   ```js
       if (!distributor || isPrivateFiche(distributor) || !isAuthenticated() || !navigator.geolocation) return;
   ```
   Après :
   ```js
       // CNX-04 : jamais de demande de position avant l'ecran d'accueil (lien, QR) : la carte
       // n'existe qu'apres le consentement ; app.js relance ce calcul a ce moment
       if (!AppState.mapInitialized) return;
       if (!distributor || isPrivateFiche(distributor) || !isAuthenticated() || !navigator.geolocation) return;
   ```

2. **js/app.js** — import. Avant :
   ```js
   import { openLayers } from './history.js';
   ```
   Après :
   ```js
   import { openLayers } from './history.js';
   import { checkNearbyForFiche } from './availability.js';
   ```

3. **js/app.js** — relancer le coup de pouce une fois la carte prête. Avant :
   ```js
           showToast('La carte n’a pas pu s’afficher : recharge la page pour réessayer', 'error');
       }
   ```
   Après :
   ```js
           showToast('La carte n’a pas pu s’afficher : recharge la page pour réessayer', 'error');
       }
       // CNX-04 : fiche ouverte par un lien avant la carte : le coup de pouce sur place
       // attendait le consentement (availability.js), il se calcule maintenant
       if (document.getElementById('dist-modal-overlay')?.classList.contains('active')) checkNearbyForFiche(AppState.currentDistributor);
   ```

4. **index.html** — deux modules JS changent : monter le `?v=` de **toutes** les entrées de l'import
   map à la même valeur V+1. Aucun CSS ne change.

## Tests
- **Fichier** : `tests/functional/auth.spec.js`, **juste avant** ces 3 lignes (uniques ensemble) :
  ```js
  // ============================================
  // CONNEXION PAR CODE RECU PAR E-MAIL (BUG-05)
  // ============================================
  ```
- **Code à ajouter** :
  ```js
  // ============================================
  // COUP DE POUCE SUR PLACE ET ECRAN D'ACCUEIL (CNX-04)
  // ============================================

  test.describe('Coup de pouce sur place, fiche ouverte par un lien (CNX-04)', () => {
      // Espion : lectures de position du coup de pouce (maximumAge 0), avec l'etat de la carte a ce moment
      async function spyNearby(context) {
          await context.addInitScript(() => {
              window.__nearbyCalls = [];
              const geo = navigator.geolocation;
              const original = geo.getCurrentPosition.bind(geo);
              geo.getCurrentPosition = (ok, ko, options) => {
                  if (options && options.maximumAge === 0) window.__nearbyCalls.push(!!(window.AppState && window.AppState.mapInitialized));
                  return original(ok, ko, options);
              };
          });
      }

      test('connecte, localisation jamais autorisee : aucune lecture de position avant l’accueil', async ({ browser }) => {
          const context = await browser.newContext();
          await spyNearby(context);
          const page = await openWithSession(context, '/?id=dist-007');
          await page.waitForSelector('#dist-modal-overlay.active', { timeout: 50000 });
          expect(await page.evaluate(async () => (await import('./js/auth.js')).isAuthenticated())).toBe(true);
          await page.waitForTimeout(1500);
          expect(await page.evaluate(() => window.__nearbyCalls)).toEqual([]);
          expect(await page.evaluate(() => !document.getElementById('geoloc-overlay')?.classList.contains('hidden'))).toBe(true);
          await context.close();
      });

      test('connecte, localisation deja autorisee : la position est lue une fois la carte prete', async ({ browser }) => {
          const context = await browser.newContext({ permissions: ['geolocation'], geolocation: { latitude: 43.4929, longitude: -1.4748 } });
          await spyNearby(context);
          const page = await openWithSession(context, '/?id=dist-007');
          await page.waitForSelector('#dist-modal-overlay.active', { timeout: 50000 });
          await page.waitForFunction(() => window.AppState?.mapInitialized === true, null, { timeout: 50000 });
          await expect.poll(() => page.evaluate(() => window.__nearbyCalls.length)).toBeGreaterThan(0);
          expect(await page.evaluate(() => window.__nearbyCalls.every(Boolean))).toBe(true);
          await context.close();
      });
  });

  ```
- **Doivent échouer avant la correction** : le 1er parce qu'une lecture a lieu dès l'ouverture de la
  fiche (`[false]` au lieu de `[]`) ; le 2e parce que la première lecture a lieu avant la carte
  (`every(Boolean)` faux).

## Vérification (dans l'ordre)
```bash
node --check js/availability.js && node --check js/app.js                     # aucune sortie
npx playwright test --project=functional -g "CNX-04"                          # 2 passed
npx playwright test --project=functional -g "sur place|Coup de pouce|Deep link|Onboarding|Retour avec la localisation|CNX-03"   # tout vert
npm test                                                                      # tout vert, dont « cache-busting »
npm run test:functional                                                       # en arrière-plan (~10 min) : tout vert, instables notés dans la PR
git diff --stat                                                               # availability.js, app.js, index.html, auth.spec.js (+ BACKLOG.md)
```

## Hors périmètre
- Bascule de la fiche à une connexion faite avant l'accueil (écouteurs branchés trop tard) : **CNX-05**.
- Le texte du coup de pouce et son seuil de 15 m : inchangés.
- Aucune lecture de `navigator.permissions` dans `availability.js`.

## Pièges connus
- Étape 1 : la nouvelle ligne vient **après** `nearbyFor = null;` et `renderNearbyNudge();` (déjà en
  tête de la fonction) : l'ancien coup de pouce est toujours effacé.
- Étape 3 : la relance est **hors** du `try / catch` de `initMainMap()`, juste après son `}`.
- Le test 1 n'accorde pas la localisation : Chromium sans écran refuse seul la demande, sans fenêtre ;
  c'est le compteur de l'espion qui fait foi.
- Fichiers en CRLF : outil Edit ; si un bloc refuse, petit script Node dans le scratchpad (voir README).
- Bump de **toutes** les entrées de l'import map à la **même** valeur.

## Terminé quand
- [ ] Contrôles passés, tests écrits (échouent avant, passent après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : non (la demande de position du système n'apparaît pas sur une capture)
- [ ] Story cochée dans BACKLOG.md si elle y figure (sinon le noter dans la PR), PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `fix(fiche): coup de pouce sur place seulement apres l'ecran d'accueil`

**Corps** : constat couvert ; cause (`checkNearbyForFiche` lisait la position à chaque ouverture de
fiche d'un membre, même avant le consentement) ; correction (attente de la carte, relance après
`initMainMap`) ; tests ajoutés ; sorties des commandes de vérification.
