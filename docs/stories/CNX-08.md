# CNX-08 — Contrôle anti-robot : rendu par l'app seulement, et expliqué s'il tarde

- **Lot** : 4. Connexion, retour et liens · **Gravité** : faible · **Niveau conseillé** : medium, **relecture par un modèle plus fort avant fusion**
  (rien ne peut le vérifier sur localhost : le captcha y est désactivé ; voir « Vérification »)
- **Prérequis** : **CNX-07 fusionnée** dans `master` ; partir de `master` **à jour**. Sinon : s'arrêter.
- **Branche** : `fix/hcaptcha-explicite` · **Taille** : 1 fichier JS + `index.html` + 2 fichiers de tests. **Aucune migration.**
- **Constats couverts** (rapport du 2026-10-21) :
  - Captcha : la classe `h-captcha` et des fonctions de rappel inexistantes peuvent bloquer le bouton d'envoi — `js/auth.js:231` (aujourd'hui ligne 272)
  - hCaptcha : rendu automatique avec un callback inexistant, bouton « Recevoir le lien » bloqué sans explication — `index.html:1089` (aujourd'hui ligne 1184)

## But
Sur un réseau lent, le contrôle anti-robot de la fenêtre de connexion est toujours celui que l'app
a rendu (cocher la case active le bouton d'envoi) ; s'il ne se charge pas, la fenêtre le dit au lieu
de laisser un bouton grisé sans explication, et l'affiche dès qu'il arrive.

## User story
En tant que visiteur qui scanne un QR en 3G, je veux que cocher la case anti-robot active
« Recevoir le lien », ou savoir pourquoi elle n'apparaît pas, afin de pouvoir me connecter.

**Critères d'acceptation**
- [ ] Le script hCaptcha se charge en mode explicite (`?render=explicit`) : il ne rend plus rien de lui-même.
- [ ] Le conteneur n'a plus `class="h-captcha"` ni `data-callback` / `data-expired-callback` (fonctions inexistantes).
- [ ] Script en retard : l'app attend tant que la fenêtre est ouverte (plus d'abandon au bout de 10 s) ;
      après 10 s, « Le contrôle anti-robot ne s’est pas chargé : vérifie ta connexion ou ton bloqueur
      de publicités, puis patiente un instant. » ; le message disparaît quand le contrôle s'affiche.
- [ ] Fenêtre fermée : l'attente s'arrête.
- [ ] Sur le site en ligne (après déploiement) : un seul contrôle dans la fenêtre, bouton grisé tant
      qu'il n'est pas coché.

## Ce qui est déjà tranché (ne pas refaire l'analyse)
- Mode explicite = le script ne cherche plus `.h-captcha` dans la page ; seul `hcaptcha.render()`
  (déjà dans `tryRenderHcaptcha`, avec les bons rappels) rend le contrôle. Le conteneur prend une
  classe neutre `auth-captcha` (aucune règle CSS ne visait `.h-captcha`).
- Le script reste chargé avec la page (`async defer`) : la page Confidentialité le dit
  (« son script se charge avec la page »). Le charger à la demande est hors périmètre.
- Localhost : captcha désactivé (`isLocalhost()`), donc aucun test fonctionnel ne peut le voir. Filets :
  un test unitaire « garde-fou » qui lit `index.html` et `js/auth.js`, et un test E2E sur le site en
  ligne, lancé **après** fusion et déploiement par Claude (modèle principal).

## Avant de coder
**Lire en entier** : `js/auth.js` lignes 120-130 et 247-375 (fenêtre de connexion, version CNX-02 / CNX-07) ;
`index.html` lignes 1180-1188 ; `tests/e2e/visiteur.spec.js` (en entier, 125 lignes environ).

**Réutiliser** : `tryRenderHcaptcha` (inchangée sauf son sélecteur), `openApp` (`tests/e2e/visiteur.spec.js`).

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
grep -n "describeAuthError" js/auth.js                                        # 2 lignes (CNX-07 fusionnée)
grep -n '<script src="https://js.hcaptcha.com/1/api.js" async defer></script>' index.html   # 1 ligne (1184)
grep -n 'data-callback="onHcaptchaSuccess"' js/auth.js                       # 1 ligne (272 environ)
grep -n "const captchaEl = overlay.querySelector('.h-captcha');" js/auth.js  # 1 ligne
grep -n "        // Timeout au bout de 10s" js/auth.js                        # 1 ligne
grep -n "            if (closed) return;   // CNX-02" js/auth.js              # 1 ligne (dans close)
grep -n "onHcaptchaSuccess\|h-captcha\|auth-captcha" css/ js/ index.html -r   # seulement js/auth.js (2 lignes)
grep -n "^// Parcours connecte (vrai compte de test) : tests/e2e/connecte.spec.js" tests/e2e/visiteur.spec.js   # 1 ligne
grep -o '"./js/app.js": "./js/app.js?v=[0-9]*"' index.html                   # noter V (120 attendu après CNX-07)
```

## Étapes

1. **index.html** — script en mode explicite. Avant :
   ```html
       <script src="https://js.hcaptcha.com/1/api.js" async defer></script>
   ```
   Après :
   ```html
       <script src="https://js.hcaptcha.com/1/api.js?render=explicit" async defer></script>
   ```

2. **js/auth.js** — texte d'attente, juste après `describeCodeError`. Avant :
   ```js
       return 'Code incorrect ou expiré. Vérifie les chiffres, ou ferme cette fenêtre pour recevoir un nouveau code.';
   }
   ```
   Après :
   ```js
       return 'Code incorrect ou expiré. Vérifie les chiffres, ou ferme cette fenêtre pour recevoir un nouveau code.';
   }

   // CNX-08 : script hCaptcha pas encore la au bout de 10 s (reseau lent, bloqueur)
   const CAPTCHA_SLOW_TEXT = 'Le contrôle anti-robot ne s’est pas chargé : vérifie ta connexion ou ton bloqueur de publicités, puis patiente un instant.';
   ```

3. **js/auth.js**, `openEmailModal` — conteneur neutre, sans rappels globaux. Avant :
   ```js
                       : `<div class="h-captcha" data-sitekey="${getHcaptchaSitekey()}" data-callback="onHcaptchaSuccess" data-expired-callback="onHcaptchaExpired"></div>`
   ```
   Après :
   ```js
                       : '<div class="auth-captcha"></div>'   // CNX-08 : rendu par tryRenderHcaptcha seulement (script en mode explicite)
   ```

4. **js/auth.js**, `tryRenderHcaptcha`. Avant :
   ```js
           const captchaEl = overlay.querySelector('.h-captcha');
   ```
   Après :
   ```js
           const captchaEl = overlay.querySelector('.auth-captcha');
   ```

5. **js/auth.js** — attendre le script tant que la fenêtre est ouverte. Avant :
   ```js
       // Attendre que hCaptcha soit charge
       if (window.hcaptcha) {
           tryRenderHcaptcha();
       } else {
           const interval = setInterval(() => {
               if (window.hcaptcha) {
                   clearInterval(interval);
                   tryRenderHcaptcha();
               }
           }, 200);
           // Timeout au bout de 10s
           setTimeout(() => clearInterval(interval), 10000);
       }
   ```
   Après :
   ```js
       // Attendre hCaptcha tant que la fenetre est ouverte (CNX-08 : plus d'abandon muet au
       // bout de 10 s) ; au-dela de 10 s, on dit pourquoi le bouton reste grise
       let captchaWait = null;
       let captchaSlowTimer = null;
       if (window.hcaptcha) {
           tryRenderHcaptcha();
       } else if (!isLocalhost()) {
           captchaWait = setInterval(() => {
               if (!window.hcaptcha) return;
               clearInterval(captchaWait);
               clearTimeout(captchaSlowTimer);
               if (status.textContent === CAPTCHA_SLOW_TEXT) status.style.display = 'none';
               tryRenderHcaptcha();
           }, 200);
           captchaSlowTimer = setTimeout(() => {
               status.style.display = 'block';
               status.className = 'auth-modal-status error';
               status.textContent = CAPTCHA_SLOW_TEXT;
           }, 10000);
       }
   ```

6. **js/auth.js**, `close` — l'attente s'arrête avec la fenêtre. Avant :
   ```js
           if (closed) return;   // CNX-02 : une seule fermeture (croix, Echap, fond, retour, connexion)
           closed = true;
           modalOpen = false;
   ```
   Après :
   ```js
           if (closed) return;   // CNX-02 : une seule fermeture (croix, Echap, fond, retour, connexion)
           closed = true;
           modalOpen = false;
           clearInterval(captchaWait);        // CNX-08
           clearTimeout(captchaSlowTimer);
   ```

7. **index.html** — `js/auth.js` change : monter le `?v=` de **toutes** les entrées de l'import map
   à la même valeur V+1. Aucun CSS ne change.

## Tests

### Test 1 — garde-fou (unitaire)
- **Fichier** : `tests/unit/unit.test.js`, **à la toute fin du fichier** (après sa dernière ligne `});`).
- **Code à ajouter** :
  ```js

  // ============================================
  // CONTROLE ANTI-ROBOT RENDU PAR L'APP SEULEMENT (CNX-08)
  // ============================================
  // Sur localhost le captcha est desactive : ce test lit les sources. Le rendu automatique
  // de hCaptcha (classe h-captcha + rappels globaux inexistants) bloquait le bouton d'envoi.

  describe('hCaptcha rendu par l’app seulement (CNX-08)', () => {
      it('script en mode explicite, conteneur neutre sans rappels globaux', () => {
          const projectRoot = new URL('../../', import.meta.url);
          const index = readFileSync(new URL('index.html', projectRoot), 'utf8');
          const auth = readFileSync(new URL('js/auth.js', projectRoot), 'utf8');
          assert.ok(index.includes('https://js.hcaptcha.com/1/api.js?render=explicit'));
          assert.ok(!auth.includes('data-callback'));
          assert.ok(!auth.includes('class="h-captcha"'));
          assert.ok(auth.includes('<div class="auth-captcha"></div>'));
          assert.ok(auth.includes("overlay.querySelector('.auth-captcha')"));
      });
  });
  ```
- **Doit échouer avant les étapes 1-4** : `index.html` ne contient pas `?render=explicit`.
  (`readFileSync` est déjà importé en tête du fichier.)

### Test 2 — site en ligne (E2E, après déploiement)
- **Fichier** : `tests/e2e/visiteur.spec.js`, **juste avant** la ligne `// Parcours connecte (vrai compte de test) : tests/e2e/connecte.spec.js`.
  **Code à ajouter** :
  ```js
  // CNX-08 : le controle anti-robot est rendu une seule fois par l'app (mode explicite) ;
  // le bouton attend la case. Ne peut tourner que sur le site en ligne (captcha coupe en local).
  test.describe('E2E visiteur : connexion (CNX-08)', () => {
      test('fenetre de connexion : un seul controle anti-robot, bouton grise tant qu’il n’est pas coche', async ({ page, context }) => {
          const errors = [];
          page.on('pageerror', e => errors.push(String(e)));
          await openApp(page, context, `?id=${DEMO_ID}&confirm=1&src=qr`);
          await page.waitForSelector('#dist-modal-overlay.active', { timeout: 60000 });
          await page.evaluate(() => document.getElementById('dist-login-invite-btn').click());
          await expect(page.locator('.auth-modal-overlay')).toBeVisible();
          await expect(page.locator('.auth-modal .auth-captcha iframe')).toHaveCount(1, { timeout: 30000 });
          await expect(page.locator('.auth-modal-form:not(.auth-modal-otp) .auth-modal-submit')).toBeDisabled();
          expect(errors).toEqual([]);
      });

      test('controle anti-robot en retard : la fenetre le dit, puis l’affiche une seule fois', async ({ page, context }) => {
          await context.grantPermissions(['geolocation']);
          await context.setGeolocation({ latitude: 43.4929, longitude: -1.4748 });
          await page.route('**/rest/v1/rpc/log_event', route => route.abort());   // pas de mesure d'audience
          // Reseau lent : le script hCaptcha arrive 25 s apres la demande (rien n'est remplace)
          await page.route(url => url.hostname === 'js.hcaptcha.com', async route => { await new Promise(r => setTimeout(r, 25000)); await route.continue(); });
          // domcontentloaded : l'evenement load attendrait le script en retard
          await page.goto(`./?id=${DEMO_ID}&confirm=1&nocache=${Date.now()}`, { waitUntil: 'domcontentloaded' });
          await page.waitForSelector('#dist-modal-overlay.active', { timeout: 60000 });
          await page.evaluate(() => document.getElementById('dist-login-invite-btn').click());
          await expect(page.locator('.auth-modal-status')).toContainText('Le contrôle anti-robot ne s’est pas chargé', { timeout: 15000 });
          await expect(page.locator('.auth-modal .auth-captcha iframe')).toHaveCount(1, { timeout: 30000 });
          await expect(page.locator('.auth-modal-status')).toBeHidden();
          await page.waitForTimeout(1500);
          await expect(page.locator('.auth-modal .auth-captcha iframe')).toHaveCount(1);
      });
  });

  ```
- Ces deux tests ne tournent pas sur localhost ; ils ne font **aucune** écriture (aucun e-mail envoyé).
  Le second retarde seulement le script hCaptcha (rien n'est remplacé). Vérifiés avant d'écrire la
  fiche sur le site en ligne avec le code corrigé servi à la place : 2 passed ; avec le code actuel :
  les deux échouent (pas de conteneur `.auth-captcha`, pas de message).

## Vérification (dans l'ordre)
```bash
node --check js/auth.js                                        # aucune sortie
grep -rn "onHcaptchaSuccess\|h-captcha" js/ index.html css/    # aucun résultat
npm test                                                       # tout vert, dont « CNX-08 » et « cache-busting »
npx playwright test --project=functional -g "Auth wall|Politique d|Connexion par code|CNX-0"   # tout vert (captcha coupé en local : la fenêtre marche comme avant)
npm run test:functional                                        # en arrière-plan (~10 min) : tout vert, instables notés dans la PR
git diff --stat                                                # auth.js, index.html, unit.test.js, visiteur.spec.js (+ BACKLOG.md)
```
**Après fusion et déploiement (Claude, modèle principal, pas l'exécutant de la fiche)** :
```bash
npx playwright test --project=e2e -g "CNX-08"                  # 2 passed, sur le site en ligne
```
Puis demander à Stéphane d'ouvrir la fenêtre de connexion sur son téléphone et de cocher la case.

## Hors périmètre
- Charger le script hCaptcha seulement à l'ouverture de la fenêtre (vie privée, PRIV-06) : story à part.
- Réinitialiser le contrôle après une erreur d'envoi : déjà fait (`hcaptcha.reset`), inchangé.
- Le texte de la page Confidentialité sur hCaptcha : toujours exact.

## Pièges connus
- Étape 3 : la chaîne devient une chaîne simple entre apostrophes (plus de `${...}`) ; garder le
  `:` du ternaire en début de ligne. Vérifier avec `node --check js/auth.js`.
- Étape 5 : `status` est déclaré plus bas dans `openEmailModal` ; il n'est lu que dans les rappels
  (200 ms et 10 s plus tard) : ne pas déplacer de déclaration.
- Étape 6 : `captchaWait` et `captchaSlowTimer` sont déclarés à l'étape 5, **avant** `close` :
  `clearInterval(null)` est sans effet (fenêtre ouverte avec le script déjà là, ou sur localhost).
- Ne pas ajouter `&onload=` ni de fonction globale : l'attente par intervalle suffit.
- Fichiers en CRLF : outil Edit ; si un bloc refuse, petit script Node dans le scratchpad (voir README).
- Bump de **toutes** les entrées de l'import map à la **même** valeur.

## Terminé quand
- [ ] Contrôles passés, test unitaire écrit (échoue avant, passe après), test E2E écrit (non lancé)
- [ ] Vérifications vertes (sauf l'E2E, lancé après déploiement)
- [ ] Captures iPhone : non (captcha coupé sur localhost)
- [ ] Story cochée dans BACKLOG.md si elle y figure (sinon le noter dans la PR), PR ouverte (non fusionnée),
      avec la mention « à relire par un modèle plus fort ; E2E CNX-08 à lancer après déploiement »

## Modèle de PR
**Titre** : `fix(connexion): controle anti-robot rendu par l'app seulement, attente expliquee`

**Corps** : constats couverts ; cause (rendu automatique de hCaptcha sur `.h-captcha` avec des
rappels globaux inexistants, puis abandon de l'attente au bout de 10 s) ; correction ; texte nouveau
(message d'attente) ; tests (garde-fou unitaire ; E2E à lancer après déploiement) ; sorties des
commandes de vérification ; **à relire par un modèle plus fort avant fusion** (non vérifiable en local).
