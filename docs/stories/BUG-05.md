# BUG-05 — iPhone : se connecter dans l'app de l'écran d'accueil (code reçu par e-mail)

- **Lot** : 3. Bugs visibles · **Gravité** : moyen · **Niveau conseillé** : medium, relecture par un modèle plus fort avant fusion (connexion)
- **Prérequis** : BUG-07, BUG-02 et BUG-13 **fusionnées** sur `master` (partir de `master` à jour après la fusion de BUG-13)
- **Ordre** : BUG-07 → BUG-02 → BUG-13 → **BUG-05** → BUG-04 → BUG-14 → …
- **Branche** : `fix/connexion-par-code` · **Taille** : 2 fichiers JS (`js/auth.js`, `js/push.js` : un mot) + 1 CSS (`css/overlays.css`) + 1 fichier de tests
- **Constats couverts** (rapport du 2026-10-21) :
  - iPhone : l'app installée sur l'écran d'accueil, exigée pour les notifications, ne peut pas se connecter — `js/auth.js:104`

## But
Dans l'app ouverte depuis l'écran d'accueil d'un iPhone, on peut se connecter en entrant le
code à 6 chiffres reçu par e-mail : la session est créée dans l'app elle-même, la fiche ouverte
reste ouverte. Dans le navigateur, le lien de l'e-mail marche comme avant, et le code aussi.

## ⚠ Action de Stéphane avant la fusion (bloquant)
**Ne pas fusionner tant que Stéphane n'a pas fait cette action et ne l'a pas confirmée.**
L'exécutant ouvre la PR, recopie cette section dans le corps de la PR avec une case à cocher
« Modèles d'e-mail mis à jour par Stéphane », et s'arrête là. Sans le code dans l'e-mail, le
nouveau champ ne sert à rien (le lien continue de marcher).

Dans le tableau de bord Supabase (https://supabase.com/dashboard, projet DistriMatch) :

1. **Authentication** → **Emails** (selon la version du tableau de bord : **Email Templates**) →
   onglet **Templates**.
2. Ouvrir le modèle **Magic Link**. Remplacer l'objet et le contenu par le modèle ci-dessous,
   puis **Save**.
3. Ouvrir le modèle **Confirm signup** et y mettre le même contenu (objet conseillé :
   « Bienvenue sur DistriMatch : ta connexion »), puis **Save**. Ce modèle ne sert que si la
   **confirmation d'e-mail** est activée (une adresse qui se connecte pour la première fois le
   reçoit alors à la place du Magic Link) ; le modifier quand même est sans risque.
4. **Email OTP Length** (Authentication → Sign In / Providers → Email) : ne rien changer. L'app
   accepte un code de 6 à 10 chiffres.
5. Essai réel après fusion : sur l'iPhone, depuis l'app de l'écran d'accueil, demander la
   connexion avec une adresse **déjà connue** puis avec une adresse **jamais utilisée**, entrer
   le code reçu : la fenêtre se ferme et « Connecte avec … » s'affiche.

Modèle (objet : « Ta connexion à DistriMatch ») :
```html
<h2>Ta connexion à DistriMatch</h2>
<p>Bonjour,</p>
<p>Pour te connecter, touche ce lien :</p>
<p><a href="{{ .ConfirmationURL }}">Me connecter à DistriMatch</a></p>
<p>Tu utilises DistriMatch depuis l’icône de ton écran d’accueil ? Entre plutôt ce code dans la fenêtre de connexion de l’app :</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
<p>Ce lien et ce code servent une seule fois. Si tu n’as rien demandé, ignore simplement cet e-mail.</p>
```
`{{ .ConfirmationURL }}` = le lien actuel, `{{ .Token }}` = le code. Écrire ces deux balises
exactement ainsi (accolades doubles, point, majuscules).

## User story
En tant qu'utilisateur d'iPhone qui a installé DistriMatch sur son écran d'accueil, je veux me
connecter avec le code reçu par e-mail, afin de signaler, donner mon avis et recevoir les
notifications dans l'app installée (le lien de l'e-mail, lui, ouvre Safari).

**Critères d'acceptation**
- [ ] Après « Recevoir le lien », la fenêtre de connexion montre un champ « Code reçu par e-mail »
      (`inputmode="numeric"`, `autocomplete="one-time-code"`).
- [ ] Code juste : la fenêtre se ferme, le compte est connecté, la fiche ouverte reste ouverte,
      `distrimatch_login_return` est effacé.
- [ ] Code faux ou expiré : message en français dans la fenêtre, qui reste ouverte ; on peut réessayer.
- [ ] Saisie qui n'est pas 6 à 10 chiffres (espaces ignorés) : message, aucun appel au serveur.
- [ ] App de l'écran d'accueil (standalone) : bouton « Recevoir le code », message « Entre ici le
      code reçu par e-mail… », le champ du code reçoit le focus.
- [ ] Navigateur : le lien de l'e-mail marche comme avant (rien ne change dans `sendMagicLink`).

## Pourquoi ça arrive (déjà analysé, ne pas refaire)
La seule voie de connexion est le lien magique (`signInWithOtp` avec `emailRedirectTo`,
`js/auth.js` vers la ligne 104). Sur iPhone, un lien touché dans Mail s'ouvre dans Safari, jamais
dans l'app de l'écran d'accueil, qui a un stockage séparé : la session est enregistrée dans
Safari, pas dans l'app. Or `js/push.js` envoie les utilisateurs d'iPhone vers l'app installée.

Supabase envoie dans le même e-mail un code (`{{ .Token }}`) qu'on vérifie par
`supabaseClient.auth.verifyOtp({ email, token, type: 'email' })` (requête `POST /auth/v1/verify`).
La session naît alors dans l'app où l'on se trouve : `onAuthStateChange` reçoit `SIGNED_IN`,
`initAuth` met `currentUser` à jour et prévient les écouteurs, l'écouteur de la fenêtre la ferme.
`type: 'email'` vaut pour une adresse connue comme pour une première connexion. La vérification
du code n'exige pas de captcha (seul l'envoi en demande un).

Longueur du code : 6 chiffres par défaut chez Supabase, réglable. On accepte **6 à 10 chiffres**
(`/^\d{6,10}$/`, `maxlength="10"`) pour ne pas casser si le réglage change.

## Avant de coder
**Lire en entier** : `js/auth.js` (357 lignes) ; `js/push.js` lignes 1-31 ; `css/overlays.css`
lignes 150-300 ; `tests/functional/auth.spec.js` (195 lignes) ; `tests/functional/helpers.js` lignes 35-84.

**Réutiliser** (ne pas réécrire) : `isStandalone()` de `js/push.js` (l'exporter, étape 1),
`escapeHTML` (`js/utils.js`, déjà importé dans auth.js), `close()` et `status` de `openEmailModal`,
la constante `LOGIN_RETURN_KEY` (auth.js).

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
grep -n '^function isStandalone() {' js/push.js
# attendu : ligne 24
grep -n "import { activateFocusTrap, deactivateFocusTrap } from './focus-trap.js';" js/auth.js
# attendu : ligne 14
grep -n 'const { error } = await supabaseClient.auth.signInWithOtp({ email, options });' js/auth.js
# attendu : ligne 104
grep -n "const LOGIN_RETURN_KEY = 'distrimatch_login_return';" js/auth.js
# attendu : ligne 118
grep -n 'Pas de mot de passe, juste un lien a cliquer.' js/auth.js
# attendu : 1 ligne (vers 226)
grep -n "Recevoir le lien" js/auth.js
# attendu : 2 lignes (vers 233 et 347)
grep -n 'Consulte ta boite mail et clique sur le lien pour te connecter.' js/auth.js
# attendu : 1 ligne (vers 334)
grep -n "const status = overlay.querySelector('.auth-modal-status');" js/auth.js
# attendu : 1 ligne (vers 313)
grep -n "// Si l'user clique deja sur le lien dans son email et revient, on ferme automatiquement" js/auth.js
# attendu : 1 ligne (vers 351)
grep -rn 'verifyOtp' js
# attendu : rien
grep -n '^.auth-modal-status.error {' css/overlays.css
# attendu : 1 ligne (vers 296)
grep -n 'css/overlays.css?v=' index.html
# attendu : ?v=73 au moment de la fiche (ou plus)
grep -n '"./js/app.js": "./js/app.js?v=' index.html
# attendu : la valeur laissée par BUG-13 (95 sur master du 2026-10-25, environ 98 après BUG-07, 02 et 13) : la noter
grep -n "from './auth.js'" js/push.js js/confirm-dialog.js js/focus-trap.js js/history.js js/state.js js/config.js js/utils.js
# attendu : rien (push.js et ses imports n'importent pas auth.js : pas d'import circulaire)
```

## Étapes

1. **js/push.js** — exporter la détection de l'app de l'écran d'accueil (ligne 24). Un seul mot.
   Avant :
   ```js
   function isStandalone() {
   ```
   Après :
   ```js
   export function isStandalone() {
   ```
   Rien d'autre ne change dans push.js.

2. **js/auth.js** — import, juste sous la ligne 14 (`import { activateFocusTrap, ... }`). Ajouter :
   ```js
   import { isStandalone } from './push.js';
   ```

3. **js/auth.js** — vérification du code, juste après la fin de `sendMagicLink` (après son
   `return true;` et son `}`, avant le bloc de commentaire `// RETOUR SUR LA FICHE APRES CONNEXION`).
   Ajouter :
   ```js

   // Code recu par e-mail (BUG-05) : la session nait dans l'app ou on le saisit.
   // Indispensable dans l'app de l'ecran d'accueil sur iPhone : le lien ouvrirait Safari.
   export async function verifyEmailCode(email, token) {
       if (!supabaseClient) throw new Error('Supabase indisponible');
       const { error } = await supabaseClient.auth.verifyOtp({ email, token, type: 'email' });
       if (error) throw error;
       // Connecte sur place, la fiche est deja ouverte : rien a rouvrir au prochain lancement
       try { localStorage.removeItem(LOGIN_RETURN_KEY); } catch (e) { /* stockage bloque */ }
       return true;
   }

   // Erreur du code en francais (Supabase repond en anglais)
   function describeCodeError(err) {
       if (err?.status === 429) return 'Trop d’essais d’affilée : réessaie dans quelques minutes.';
       if (!err?.status || err.status >= 500) return 'Connexion impossible pour le moment : vérifie ton réseau et réessaie.';
       return 'Code incorrect ou expiré. Vérifie les chiffres, ou ferme cette fenêtre pour recevoir un nouveau code.';
   }
   ```
   `LOGIN_RETURN_KEY` est déclarée plus bas dans le fichier : c'est sans effet, la fonction n'est
   appelée qu'après le chargement du module.

4. **js/auth.js** — `openEmailModal` : mode « app de l'écran d'accueil ».
   Avant :
   ```js
       if (modalOpen) return;
       modalOpen = true;

       const overlay = document.createElement('div');
   ```
   Après :
   ```js
       if (modalOpen) return;
       modalOpen = true;
       // App de l'ecran d'accueil : le lien de l'e-mail ouvrirait Safari, on met le code en avant (BUG-05)
       const standalone = isStandalone();
       const sendLabel = standalone ? 'Recevoir le code' : 'Recevoir le lien';

       const overlay = document.createElement('div');
   ```

5. **js/auth.js** — gabarit de la fenêtre : sous-titre, libellé du bouton, formulaire du code.
   a) Avant :
   ```js
               <p class="auth-modal-subtitle">Pour ajouter, modifier ou suivre un distributeur, on a besoin de ton email. Pas de mot de passe, juste un lien a cliquer.</p>
   ```
   Après :
   ```js
               <p class="auth-modal-subtitle">Pour ajouter, modifier ou suivre un distributeur, on a besoin de ton email. Pas de mot de passe : tu reçois un lien et un code par e-mail.</p>
   ```
   b) Avant :
   ```js
               <button type="submit" class="auth-modal-submit"${isLocalhost() ? '' : ' disabled'}>Recevoir le lien</button>
           </form>
           <p class="auth-modal-status" style="display:none"></p>
       </div>
   ```
   Après :
   ```js
               <button type="submit" class="auth-modal-submit"${isLocalhost() ? '' : ' disabled'}>${sendLabel}</button>
           </form>
           <p class="auth-modal-status" style="display:none"></p>
           <form class="auth-modal-form auth-modal-otp" hidden>
               <label for="auth-modal-code">Code reçu par e-mail</label>
               <input id="auth-modal-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="123456">
               <button type="submit" class="auth-modal-submit auth-modal-code-submit">Valider le code</button>
           </form>
       </div>
   ```
   Le formulaire du code est **après** le formulaire e-mail : `overlay.querySelector('form')` et
   `overlay.querySelector('.auth-modal-submit')` (lignes 310 et 312) continuent de trouver ceux de
   l'e-mail. Ne pas changer ces deux lignes.

6. **js/auth.js** — références du formulaire du code, juste après
   `const status = overlay.querySelector('.auth-modal-status');`. Ajouter :
   ```js
       const codeForm = overlay.querySelector('.auth-modal-otp');
       const codeInput = codeForm.querySelector('#auth-modal-code');
       const codeSubmit = codeForm.querySelector('.auth-modal-code-submit');
       let sentEmail = '';
   ```

7. **js/auth.js** — envoi réussi : montrer le champ du code.
   Avant :
   ```js
               await sendMagicLink(email, captchaToken);
               status.style.display = 'block';
               status.className = 'auth-modal-status success';
               status.innerHTML = `Lien envoyé a <strong>${escapeHTML(email)}</strong>.<br>Consulte ta boite mail et clique sur le lien pour te connecter.`;
               submit.style.display = 'none';
               input.disabled = true;
   ```
   Après :
   ```js
               await sendMagicLink(email, captchaToken);
               sentEmail = email;
               status.style.display = 'block';
               status.className = 'auth-modal-status success';
               status.innerHTML = standalone
                   ? `Code envoyé à <strong>${escapeHTML(email)}</strong>.<br>Entre ici le code reçu par e-mail pour te connecter dans l’app.`
                   : `Lien envoyé à <strong>${escapeHTML(email)}</strong>.<br>Ouvre le lien de l’e-mail, ou entre ici le code reçu.`;
               submit.style.display = 'none';
               input.disabled = true;
               codeForm.hidden = false;
               if (standalone) codeInput.focus();
   ```

8. **js/auth.js** — bouton remis après une erreur d'envoi (vers la ligne 347).
   Avant :
   ```js
               submit.textContent = 'Recevoir le lien';
   ```
   Après :
   ```js
               submit.textContent = sendLabel;
   ```

9. **js/auth.js** — envoi du code. Juste **avant** la ligne
   `// Si l'user clique deja sur le lien dans son email et revient, on ferme automatiquement`, ajouter :
   ```js
       // Code recu par e-mail (BUG-05) : connexion sur place, sans quitter l'app
       codeForm.addEventListener('submit', async (e) => {
           e.preventDefault();
           const token = codeInput.value.replace(/\s/g, '');
           if (!/^\d{6,10}$/.test(token)) {
               status.style.display = 'block';
               status.className = 'auth-modal-status error';
               status.textContent = 'Entre les chiffres du code reçu par e-mail.';
               return;
           }
           codeSubmit.disabled = true;
           codeSubmit.textContent = 'Vérification...';
           try {
               await verifyEmailCode(sentEmail, token);
               // En general l'ecouteur onAuthChange ci-dessous a deja ferme la fenetre
               if (overlay.isConnected) close(true);
           } catch (err) {
               status.style.display = 'block';
               status.className = 'auth-modal-status error';
               status.textContent = describeCodeError(err);
               codeSubmit.disabled = false;
               codeSubmit.textContent = 'Valider le code';
           }
       });

   ```

10. **css/overlays.css** — champ du code. Juste après la règle `.auth-modal-status.error { ... }`
    (qui se termine par `border: 1px solid #fca5a5;` puis `}`), ajouter :
    ```css

    /* Code recu par e-mail (BUG-05). [hidden] : .auth-modal-form est en display:flex,
       qui l'emporterait sinon sur l'attribut hidden. */
    .auth-modal-form[hidden] {
        display: none;
    }

    .auth-modal-otp {
        margin-top: 1rem;
    }

    .auth-modal-otp label {
        font-size: 0.9rem;
        font-weight: 600;
    }

    .auth-modal-otp input {
        padding: 0.875rem 1rem;
        border: 1px solid var(--light-gray);
        border-radius: var(--radius-sm);
        font-size: 1.25rem;
        letter-spacing: 0.3em;
        text-align: center;
        outline: none;
    }

    .auth-modal-otp input:focus {
        border-color: var(--primary-text);
    }
    ```

11. **index.html** — `css/overlays.css?v=` + 1 (au moment de la fiche : `?v=73` → `?v=74`) ; et
    deux modules JS changent : monter le `?v=` de **toutes** les entrées de l'import map à la même
    valeur : la valeur notée aux contrôles + 1 (ex. `?v=98` → `?v=99` partout).

## Tests
- **Fichier** : `tests/functional/auth.spec.js`, nouveau bloc à la **fin** du fichier.
- **Ce qu'il fait** : sur localhost le mur d'auth est sauté ; `distrimatch_force_auth = '1'` le
  rétablit. On ouvre la fiche `dist-007`, on appelle `requireAuth()`, on simule l'envoi
  (`/auth/v1/otp`, comme les tests existants) puis la vérification (`/auth/v1/verify`) qui rend
  une fausse session au format de Supabase.
- **Code** :
  ```js
  // ============================================
  // CONNEXION PAR CODE RECU PAR E-MAIL (BUG-05)
  // ============================================

  // Fausse session au format Supabase (jeton en-tete.charge.signature). Les appels que l'app
  // fera ensuite au vrai serveur avec ce jeton seront refuses : sans effet sur ces tests.
  function fakeSession(email) {
      const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const user = {
          id: '00000000-0000-0000-0000-0000000b0505', aud: 'authenticated', role: 'authenticated',
          email, is_anonymous: false, app_metadata: { provider: 'email' }, user_metadata: {},
          created_at: new Date().toISOString()
      };
      return {
          access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, email, role: 'authenticated', aud: 'authenticated', exp })}.signature`,
          token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'faux-refresh', user
      };
  }

  // Fiche dist-007 ouverte, fenetre de connexion ouverte par requireAuth() (resultat dans window.__authOk)
  async function openLoginOnFiche(page) {
      await page.route('**/auth/v1/otp**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
      await page.evaluate(() => localStorage.setItem('distrimatch_force_auth', '1'));
      await page.evaluate(() => window.openDistributorModal('dist-007'));
      await page.waitForSelector('#dist-modal-overlay.active');
      await page.evaluate(() => {
          import('./js/auth.js').then(m => m.requireAuth()).then(ok => { window.__authOk = ok; });
      });
      await page.waitForSelector('.auth-modal-overlay');
      await expect(page.locator('#auth-modal-code')).toBeHidden();
  }

  async function sendEmail(page) {
      await page.fill('.auth-modal-form input[type=email]', 'test@exemple.fr');
      await page.locator('.auth-modal-form:not(.auth-modal-otp) .auth-modal-submit').click();
      await expect(page.locator('#auth-modal-code')).toBeVisible();
  }

  async function isLoggedIn(page) {
      return page.evaluate(async () => (await import('./js/auth.js')).isAuthenticated());
  }

  test.describe('Connexion par code reçu par e-mail (BUG-05)', () => {
      test('code juste : connecté, fenêtre fermée, fiche toujours ouverte', async ({ page }) => {
          let body = null;
          await page.route('**/auth/v1/verify**', async route => {
              body = route.request().postDataJSON();
              await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeSession('test@exemple.fr')) });
          });
          await page.route('**/auth/v1/user**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeSession('test@exemple.fr').user) }));
          await openLoginOnFiche(page);
          await sendEmail(page);
          await expect(page.locator('.auth-modal-status')).toContainText('entre ici le code reçu');
          await expect(page.locator('#auth-modal-code')).toHaveAttribute('inputmode', 'numeric');
          await expect(page.locator('#auth-modal-code')).toHaveAttribute('autocomplete', 'one-time-code');

          await page.fill('#auth-modal-code', '123 456');
          await page.click('.auth-modal-code-submit');
          await expect(page.locator('.auth-modal-overlay')).toHaveCount(0, { timeout: 5000 });
          expect(body).toMatchObject({ email: 'test@exemple.fr', token: '123456', type: 'email' });
          expect(await isLoggedIn(page)).toBe(true);
          await page.waitForFunction(() => window.__authOk === true, null, { timeout: 3000 });
          await expect(page.locator('#dist-modal-overlay')).toHaveClass(/active/);
          expect(await page.evaluate(() => window.AppState.currentDistributor?.id)).toBe('dist-007');
          expect(await page.evaluate(() => localStorage.getItem('distrimatch_login_return'))).toBeNull();
      });

      test('code faux ou mal saisi : message en français, fenêtre ouverte, pas connecté', async ({ page }) => {
          let calls = 0;
          await page.route('**/auth/v1/verify**', route => {
              calls += 1;
              return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' }) });
          });
          await openLoginOnFiche(page);
          await sendEmail(page);

          await page.fill('#auth-modal-code', '12ab');
          await page.click('.auth-modal-code-submit');
          await expect(page.locator('.auth-modal-status')).toContainText('Entre les chiffres du code');
          expect(calls).toBe(0);

          await page.fill('#auth-modal-code', '000000');
          await page.click('.auth-modal-code-submit');
          await expect(page.locator('.auth-modal-status')).toContainText('Code incorrect ou expiré');
          expect(calls).toBe(1);
          await expect(page.locator('.auth-modal-overlay')).toHaveCount(1);
          await expect(page.locator('.auth-modal-code-submit')).toBeEnabled();
          expect(await isLoggedIn(page)).toBe(false);
      });

      test('app de l’écran d’accueil : le code est mis en avant', async ({ page }) => {
          await page.evaluate(() => Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => true }));
          await openLoginOnFiche(page);
          await expect(page.locator('.auth-modal-form:not(.auth-modal-otp) .auth-modal-submit')).toHaveText('Recevoir le code');
          await sendEmail(page);
          await expect(page.locator('.auth-modal-status')).toContainText('Entre ici le code reçu par e-mail');
          await expect(page.locator('.auth-modal-status')).not.toContainText('Ouvre le lien');
          await expect(page.locator('#auth-modal-code')).toBeFocused();
      });
  });
  ```
- **Doivent échouer avant la correction** : dans `sendEmail`, `#auth-modal-code` n'apparaît jamais
  (le champ n'existe pas) : `toBeVisible` expire. Pour le 3e test, l'échec arrive un peu avant :
  le bouton s'appelle « Recevoir le lien ».
- `requireAuth()` n'est pas attendu dans `page.evaluate` (sa promesse ne se résout qu'à la
  fermeture de la fenêtre) : on lit son résultat dans `window.__authOk`.

## Vérification (dans l'ordre)
```bash
grep -n 'verifyOtp' js/auth.js                                  # 1 ligne
grep -n 'one-time-code' js/auth.js                              # 1 ligne
grep -n '^export function isStandalone() {' js/push.js          # 1 ligne
npm test                                                        # tout vert, dont « cache-busting » et « Connexion : retour sur la fiche »
npx playwright test --project=functional -g "BUG-05"            # 3 passed
npx playwright test --project=functional -g "Connexion|Auth|auth|Politique"   # tout vert
npm run test:functional                                         # en arrière-plan (~10 min) : tout vert, instables notés dans la PR
```

## Hors périmètre
- Le modèle d'e-mail Supabase : c'est Stéphane qui le change (section « Action de Stéphane »).
  L'exécutant ne touche à **rien** dans Supabase et n'exécute aucun SQL.
- `sendMagicLink`, `emailRedirectTo`, `rememberLoginReturn`, `takeLoginReturn` : ne pas changer.
- Le titre « Ton email pour interagir » et « suivre un distributeur » du sous-titre : ne pas les changer ici.
- Les écouteurs `onAuthChange` qui s'accumulent à chaque ouverture de la fenêtre (défaut existant) : ne pas corriger ici.
- Déplacer `isStandalone` dans `utils.js` : non, l'export depuis push.js suffit.
- BUG-04 (indice des favoris dans l'app installée) : autre story.

## Pièges connus
- `.auth-modal-form` est en `display: flex` : sans la règle `.auth-modal-form[hidden]`, le champ
  du code serait visible dès l'ouverture (le test le détecte avec `toBeHidden`).
- Garder le formulaire du code **après** le formulaire e-mail dans le gabarit, sinon
  `overlay.querySelector('form')` / `('.auth-modal-submit')` prendraient le mauvais.
- Dans les tests, `.auth-modal-form .auth-modal-submit` trouve **deux** boutons : utiliser les
  sélecteurs écrits (`:not(.auth-modal-otp)` ou `.auth-modal-code-submit`).
- Fermer avec `if (overlay.isConnected) close(true);`, pas `if (modalOpen)` : l'écouteur
  `onAuthChange` a souvent déjà fermé la fenêtre, et un écouteur d'une ouverture précédente peut
  avoir remis `modalOpen` à faux sans retirer la fenêtre actuelle.
- Ne pas écrire « tape le code » (règle : jamais « tap ») : « Entre le code ».
- Garder les apostrophes typographiques `’` des textes écrits ici.
- Si la route `/auth/v1/verify` n'est pas interceptée (la requête part ailleurs), s'arrêter et
  signaler l'URL vue dans l'onglet réseau : ne pas changer la façon d'appeler `verifyOtp`.
- Bump de **toutes** les entrées de l'import map à la **même** valeur, en partant de celle de
  `master` à jour (BUG-07, BUG-02 et BUG-13 l'ont déjà montée). Ces trois stories ne touchent ni
  `js/auth.js`, ni `js/push.js`, ni `css/overlays.css`, ni `tests/functional/auth.spec.js` : les
  extraits « avant » de cette fiche restent valables.
- BUG-04 passe **après** cette story et compte sur l'export de `isStandalone` (étape 1) : ne pas
  l'oublier, ne pas le renommer.

## Terminé quand
- [ ] Contrôles passés, tests écrits (échouent avant, passent après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : non (la fenêtre de connexion n'est pas un écran du script de capture)
- [ ] Story cochée dans BACKLOG.md si elle y figure (sinon le noter dans la PR), PR ouverte (**non fusionnée**)
- [ ] Section « Action de Stéphane avant la fusion » recopiée dans la PR, case non cochée

## Modèle de PR
**Titre** : `fix(connexion): code recu par e-mail, pour l'app de l'ecran d'accueil`

**Corps** : constat corrigé (l'app de l'écran d'accueil ne pouvait pas se connecter), cause (le
lien de l'e-mail ouvre Safari, stockage séparé), correction (champ « Code reçu par e-mail » après
l'envoi, `verifyOtp`, code mis en avant dans l'app installée, lien inchangé), tests ajoutés
(3 fonctionnels), sorties des commandes. En tête du corps, en gras : **Ne pas fusionner avant
l'action de Stéphane**, suivie de la section « Action de Stéphane avant la fusion » recopiée en
entier avec la case « Modèles d'e-mail mis à jour par Stéphane » à cocher.
