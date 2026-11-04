# CNX-07 — Fenêtre de connexion : erreurs en français et textes fidèles à la règle du compte

- **Lot** : 4. Connexion, retour et liens · **Gravité** : faible · **Niveau conseillé** : medium
- **Prérequis** : **CNX-06 fusionnée** dans `master` ; partir de `master` **à jour**. Sinon : s'arrêter.
  **Textes validés par Stéphane** avant de lancer la fiche (voir « Textes »). S'il en a changé un :
  reprendre son texte mot pour mot dans les étapes et dans les tests.
- **Branche** : `fix/textes-connexion` · **Taille** : 3 fichiers JS + `index.html` (texte et `?v=`) + 2 fichiers de tests. **Aucune migration.**
- **Constats couverts** (rapport du 2026-10-21) :
  - Erreurs Supabase affichées telles quelles, en anglais, dans la modale de connexion — `js/auth.js:340` (aujourd'hui ligne 395)
  - Deux textes contredisent la règle d'authentification : « suivre » demanderait l'e-mail, se connecter « retrouverait » les favoris — `js/auth.js:226` (aujourd'hui ligne 266), `js/app.js:306` (aujourd'hui 359), `index.html:649` (aujourd'hui 650)

## But
Un refus d'envoi de l'e-mail de connexion s'explique en français (attendre N s, pas de réseau,
anti-robot, adresse invalide) ; la fenêtre de connexion et la page Compte ne laissent plus croire
qu'un favori demande un e-mail ou que se connecter retrouve les favoris.

## User story
En tant que visiteur, je veux comprendre pourquoi l'e-mail de connexion n'est pas parti et ce que le
compte apporte vraiment, afin de ne pas renoncer à un favori qui marche sans compte.

**Critères d'acceptation**
- [ ] Refus « trop de demandes » (429, « after 52 seconds ») : « Patiente encore 52 s avant de redemander un e-mail. »
- [ ] Hors réseau : « Pas de réseau : l’e-mail n’est pas parti. Vérifie ta connexion et réessaie. »
- [ ] Captcha refusé : « La vérification anti-robot n’a pas abouti : coche-la de nouveau. »
- [ ] Adresse refusée : « Cette adresse e-mail ne semble pas valide : vérifie-la. »
- [ ] Autre refus : « L’e-mail n’a pas pu partir : réessaie dans un moment (code X). » ; jamais « Erreur : » suivi d'anglais.
- [ ] Fenêtre de connexion : plus de « suivre » (favoris et alertes n'exigent pas de compte, UC5 / UC6).
- [ ] Page Compte, visiteur : plus de « retrouver tes favoris » (aucune synchronisation n'existe).

## Textes (décision de Stéphane, proposés ici ; ton : tutoiement, positif, ni « tap » ni « reste », aucune promesse)
| Où | Avant | Après |
|---|---|---|
| Fenêtre de connexion, sous-titre | Pour ajouter, modifier ou suivre un distributeur, on a besoin de ton email. Pas de mot de passe : tu reçois un lien et un code par e-mail. | Pour signaler ce qui est dispo, donner ton avis, ajouter un distributeur ou modifier une fiche, on a besoin de ton e-mail. Pas de mot de passe : tu reçois un lien et un code par e-mail. |
| Compte, visiteur (sous « Non connecté ») | Connecte-toi pour contribuer et retrouver tes favoris | Connecte-toi pour signaler, donner ton avis et ajouter des distributeurs |
| Erreurs d'envoi | `Erreur : <texte anglais de Supabase>` | les cinq messages des critères d'acceptation |

## Ce qui est déjà tranché (ne pas refaire l'analyse)
- Fonction pure `describeAuthError(error, online)` dans `js/utils.js`, sur le modèle de
  `describeSignalError` (même détection du hors-réseau). Codes Supabase lus : `status` 429 ou `code`
  `over_email_send_rate_limit` (délai lu dans `after N seconds`), `captcha_failed` (ou « captcha » dans
  le message, y compris l'erreur locale « Captcha requis »), `email_address_invalid` / `validation_failed`.
  Le texte anglais reste dans la console (`console.warn`) pour le diagnostic.
- Les messages disent « e-mail » et non « lien » : dans l'app de l'écran d'accueil, on reçoit un code.
- Le texte de la page Compte est écrit à deux endroits qui doivent rester identiques :
  `index.html` (avant le chargement) et `refreshAuthUI` (`js/app.js`).

## Avant de coder
**Lire en entier** : `js/auth.js` lignes 10-16, 255-280 et 365-405 ; `js/utils.js` lignes 205-245 ;
`js/app.js` lignes 350-362 ; `index.html` lignes 640-655.

**Réutiliser** : `describeSignalError` (modèle, ne pas la modifier), `openLoginOnFiche` (aide déjà
dans `tests/functional/auth.spec.js`, BUG-05 : fiche ouverte + fenêtre de connexion).

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
grep -n "^export const ENTRY_SOURCE_TTL" js/events.js                          # 1 ligne (CNX-06 fusionnée)
grep -n "^import { showToast, escapeHTML } from './utils.js';" js/auth.js       # 1 ligne (12)
grep -n 'status.textContent = `Erreur : ${err.message}`;' js/auth.js           # 1 ligne
grep -n "Pour ajouter, modifier ou suivre un distributeur" js/auth.js          # 1 ligne
grep -n "Connecte-toi pour contribuer et retrouver tes favoris" js/app.js index.html   # 2 lignes : app.js (359) et index.html (650)
grep -n "describeAuthError" js/ tests/ -r                                       # aucun résultat
grep -n -A 2 "    const code = error?.code || status || '?';" js/utils.js       # 1 bloc (fin de describeSignalError)
grep -n "^async function openLoginOnFiche(page) {" tests/functional/auth.spec.js   # 1 ligne
grep -o '"./js/app.js": "./js/app.js?v=[0-9]*"' index.html                     # noter V (119 attendu après CNX-06)
```

## Étapes

1. **js/utils.js** — message d'envoi refusé, en français. Juste après la fin de `describeSignalError`
   (le bloc `parseAuthLinkError` de CNX-03 suit ; il ne bouge pas). Avant :
   ```js
       const code = error?.code || status || '?';
       return `Signal non envoyé, réessaie plus tard (code ${code})`;
   }
   ```
   Après :
   ```js
       const code = error?.code || status || '?';
       return `Signal non envoyé, réessaie plus tard (code ${code})`;
   }

   // E-mail de connexion non envoye (CNX-07) : message en francais, jamais le texte
   // anglais de Supabase. error : AuthApiError ({ status, code, message }) ou exception
   // reseau ; online : navigator.onLine. « e-mail » et non « lien » : l'app de l'ecran
   // d'accueil envoie un code.
   export function describeAuthError(error, online = true) {
       const message = String(error?.message || error || '');
       if (online === false || /failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
           return 'Pas de réseau : l’e-mail n’est pas parti. Vérifie ta connexion et réessaie.';
       }
       if (error?.code === 'over_email_send_rate_limit' || error?.status === 429) {
           const wait = message.match(/after (\d+) seconds?/i);
           return wait
               ? `Patiente encore ${wait[1]} s avant de redemander un e-mail.`
               : 'Beaucoup de demandes en ce moment : réessaie dans quelques minutes.';
       }
       if (error?.code === 'captcha_failed' || /captcha/i.test(message)) {
           return 'La vérification anti-robot n’a pas abouti : coche-la de nouveau.';
       }
       if (error?.code === 'email_address_invalid' || error?.code === 'validation_failed') {
           return 'Cette adresse e-mail ne semble pas valide : vérifie-la.';
       }
       return `L’e-mail n’a pas pu partir : réessaie dans un moment (code ${error?.code || error?.status || '?'}).`;
   }
   ```

2. **js/auth.js** — import. Avant :
   ```js
   import { showToast, escapeHTML } from './utils.js';
   ```
   Après :
   ```js
   import { showToast, escapeHTML, describeAuthError } from './utils.js';
   ```

3. **js/auth.js**, `openEmailModal` — sous-titre fidèle à la règle du compte. Avant :
   ```js
               <p class="auth-modal-subtitle">Pour ajouter, modifier ou suivre un distributeur, on a besoin de ton email. Pas de mot de passe : tu reçois un lien et un code par e-mail.</p>
   ```
   Après :
   ```js
               <p class="auth-modal-subtitle">Pour signaler ce qui est dispo, donner ton avis, ajouter un distributeur ou modifier une fiche, on a besoin de ton e-mail. Pas de mot de passe : tu reçois un lien et un code par e-mail.</p>
   ```

4. **js/auth.js**, envoi refusé. Avant :
   ```js
               status.textContent = `Erreur : ${err.message}`;
   ```
   Après :
   ```js
               console.warn('[Auth] Envoi de l’e-mail refuse :', err?.status, err?.code, err?.message);
               status.textContent = describeAuthError(err, navigator.onLine);   // CNX-07 : en francais
   ```

5. **js/app.js**, `refreshAuthUI`. Avant :
   ```js
               accountMeta.textContent = 'Connecte-toi pour contribuer et retrouver tes favoris';
   ```
   Après :
   ```js
               accountMeta.textContent = 'Connecte-toi pour signaler, donner ton avis et ajouter des distributeurs';   // CNX-07 : favoris sans compte
   ```

6. **index.html** — même texte avant le chargement. Avant :
   ```html
                               <span id="account-meta">Connecte-toi pour contribuer et retrouver tes favoris</span>
   ```
   Après :
   ```html
                               <span id="account-meta">Connecte-toi pour signaler, donner ton avis et ajouter des distributeurs</span>
   ```

7. **index.html** — trois modules JS changent : monter le `?v=` de **toutes** les entrées de l'import
   map à la même valeur V+1. Aucun CSS ne change.

## Tests

### Test 1 — `describeAuthError` (unitaire)
- **Fichier** : `tests/unit/unit.test.js`, **à la toute fin du fichier** (après sa dernière ligne `});`).
- **Code à ajouter** :
  ```js

  // ============================================
  // E-MAIL DE CONNEXION NON ENVOYE (CNX-07)
  // ============================================

  const { describeAuthError } = await import('../../js/utils.js');

  describe('describeAuthError (e-mail de connexion non envoye, CNX-07)', () => {
      it('trop de demandes : le delai lu dans le message, sinon un message general', () => {
          assert.equal(describeAuthError({ status: 429, code: 'over_email_send_rate_limit', message: 'For security purposes, you can only request this after 52 seconds.' }), 'Patiente encore 52 s avant de redemander un e-mail.');
          assert.equal(describeAuthError({ status: 429, code: 'over_email_send_rate_limit', message: 'Email rate limit exceeded' }), 'Beaucoup de demandes en ce moment : réessaie dans quelques minutes.');
      });

      it('reseau, captcha, adresse invalide, autre', () => {
          assert.equal(describeAuthError(new TypeError('Failed to fetch')), 'Pas de réseau : l’e-mail n’est pas parti. Vérifie ta connexion et réessaie.');
          assert.equal(describeAuthError({ status: 400, message: 'x' }, false), 'Pas de réseau : l’e-mail n’est pas parti. Vérifie ta connexion et réessaie.');
          assert.equal(describeAuthError({ status: 400, code: 'captcha_failed', message: 'captcha protection: request disallowed' }), 'La vérification anti-robot n’a pas abouti : coche-la de nouveau.');
          assert.equal(describeAuthError(new Error('Captcha requis')), 'La vérification anti-robot n’a pas abouti : coche-la de nouveau.');
          assert.equal(describeAuthError({ status: 400, code: 'email_address_invalid', message: 'Email address is invalid' }), 'Cette adresse e-mail ne semble pas valide : vérifie-la.');
          assert.equal(describeAuthError({ status: 500, code: 'unexpected_failure', message: 'Error sending magic link email' }), 'L’e-mail n’a pas pu partir : réessaie dans un moment (code unexpected_failure).');
          assert.equal(describeAuthError(new Error('Supabase indisponible')), 'L’e-mail n’a pas pu partir : réessaie dans un moment (code ?).');
      });
  });
  ```
- **Doit échouer avant l'étape 1** : `describeAuthError` n'existe pas (`is not a function`).

### Test 2 — fenêtre et Compte (fonctionnel)
- **Fichier** : `tests/functional/auth.spec.js`, **à la toute fin du fichier** (après sa dernière ligne `});`).
- **Code à ajouter** :
  ```js

  // ============================================
  // TEXTES DE CONNEXION (CNX-07)
  // ============================================

  test.describe('Textes de connexion (CNX-07)', () => {
      test('trop de demandes : le delai est dit en francais, sans « Erreur : »', async ({ page }) => {
          await openLoginOnFiche(page);
          // Pose apres openLoginOnFiche (qui repond 200) : cette route passe en premier
          await page.route('**/auth/v1/otp**', route => route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ code: 429, error_code: 'over_email_send_rate_limit', msg: 'For security purposes, you can only request this after 52 seconds.' }) }));
          await page.fill('.auth-modal-form input[type=email]', 'test@exemple.fr');
          await page.locator('.auth-modal-form:not(.auth-modal-otp) .auth-modal-submit').click();
          await expect(page.locator('.auth-modal-status')).toHaveText('Patiente encore 52 s avant de redemander un e-mail.');
      });

      test('fenetre de connexion et Compte : ni « suivre », ni « retrouver tes favoris »', async ({ page }) => {
          await openLoginOnFiche(page);
          await expect(page.locator('.auth-modal-subtitle')).toContainText('Pour signaler ce qui est dispo, donner ton avis');
          await expect(page.locator('.auth-modal-subtitle')).not.toContainText('suivre');
          await page.click('.auth-modal-close');
          await page.evaluate(() => window.switchView('account'));
          await expect(page.locator('#account-meta')).toHaveText('Connecte-toi pour signaler, donner ton avis et ajouter des distributeurs');
          const html = await (await page.request.get('/')).text();
          expect(html).toContain('<span id="account-meta">Connecte-toi pour signaler, donner ton avis et ajouter des distributeurs</span>');
      });
  });
  ```
- **Doivent échouer avant la correction** : le 1er affiche « Erreur : For security purposes… » ;
  le 2e trouve « suivre » dans le sous-titre.

## Vérification (dans l'ordre)
```bash
node --check js/utils.js && node --check js/auth.js && node --check js/app.js   # aucune sortie
grep -rnF -e 'retrouver tes favoris' -e 'ou suivre un distributeur' -e 'Erreur : ${err' js index.html   # aucun résultat
npm test                                                     # tout vert, dont « describeAuthError » et « cache-busting »
npx playwright test --project=functional -g "CNX-07"         # 2 passed
npx playwright test --project=functional -g "Connexion par code|Auth wall|Politique d|Profil|Compte|textes|ton"   # tout vert
npm run test:functional                                      # en arrière-plan (~10 min) : tout vert, instables notés dans la PR
git diff --stat                                              # utils.js, auth.js, app.js, index.html, unit.test.js, auth.spec.js (+ BACKLOG.md)
```

## Captures iPhone
```bash
node tests/tools/capture-iphone.mjs CNX-07-avant-compte compte    # avant les étapes
node tests/tools/capture-iphone.mjs CNX-07-apres-compte compte    # après
```

## Hors périmètre
- Le titre de la fenêtre (« Ton email pour interagir ») et le texte « Lien envoyé à … » : inchangés.
- Les erreurs du code à 6 chiffres (`describeCodeError`, BUG-05) : déjà en français.
- La fenêtre « Connexion requise » des photos (inactives).
- Le contrôle anti-robot qui ne se charge pas : **CNX-08**.

## Pièges connus
- Étape 4 : `err` peut être une simple `Error` (« Captcha requis », « Supabase indisponible ») sans
  `status` ni `code` : la fonction le gère, ne pas ajouter de test autour.
- Étapes 5 et 6 : le texte doit être **identique** aux deux endroits (le test lit les deux).
- `index.html` change pour le texte **et** pour les `?v=` : un seul fichier, deux modifications.
- Fichiers en CRLF : outil Edit ; si un bloc refuse, petit script Node dans le scratchpad (voir README).
- Bump de **toutes** les entrées de l'import map à la **même** valeur.

## Terminé quand
- [ ] Contrôles passés, tests écrits (échouent avant, passent après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : oui, écran `compte` avant / après (chemins dans la PR)
- [ ] Story cochée dans BACKLOG.md si elle y figure (sinon le noter dans la PR), PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `fix(connexion): erreurs d'envoi en francais, textes fideles a la regle du compte`

**Corps** : constats couverts ; textes avant / après (tableau « Textes ») ; correspondance code
Supabase → message ; tests ajoutés ; sorties des commandes de vérification ; chemins des captures.
