# PRIV-08 — hCaptcha contacté seulement à l'ouverture de la connexion

- **Lot** : 2. Vie privée · **Gravité** : faible · **Niveau conseillé** : medium
- **Prérequis** : `master` à jour (v131 dans l'import map). La branche `fix/hcaptcha-a-la-demande` existe déjà
  avec cette fiche et l'entrée du `BACKLOG.md` : la reprendre, **ne pas la recréer**.
- **Branche** : `fix/hcaptcha-a-la-demande` · **Taille** : `js/auth.js`, `index.html`, `tests/unit/unit.test.js`,
  `tests/functional/confidentialite.spec.js`, `tests/e2e/visiteur.spec.js` (un commentaire), `CLAUDE.md`
  (+ `BACKLOG.md`).
- **Origine** : décision de Stéphane le 2026-11-11 (« applique maintenant »), pas un constat de la revue.

## But
Aujourd'hui `index.html` charge le script de hCaptcha (le contrôle anti-robot de la connexion) pour **chaque**
visiteur, même celui qui ne fait que regarder la carte : la société hCaptcha voit son adresse internet et son
navigateur sans raison. **Après** : le script n'est demandé qu'à la première ouverture de la fenêtre de connexion.
À l'écran, rien ne change, sauf que la case peut apparaître une seconde plus tard la première fois (cas déjà géré
par CNX-08 : attente, puis message au bout de 10 s).

## User story
En tant que visiteur, je veux que l'app ne contacte hCaptcha que si j'ouvre la connexion, afin de ne pas confier
mon adresse internet à un service dont je n'ai pas besoin.

**Critères d'acceptation**
- [ ] Au chargement de l'app et en ouvrant une fiche, **aucune** requête vers un domaine `hcaptcha.com`.
- [ ] À la première ouverture de la fenêtre de connexion (site en ligne), le script est demandé **une seule fois**,
      la case s'affiche une seule fois, le bouton reste grisé tant qu'elle n'est pas cochée (tests E2E CNX-08).
- [ ] Après un échec de chargement (réseau, bloqueur), une nouvelle ouverture de la fenêtre redemande le script.
- [ ] En local (`localhost`), toujours aucun captcha et aucun script demandé.
- [ ] Page Confidentialité exacte : hCaptcha « se charge seulement quand tu ouvres la fenêtre de connexion » ;
      hébergement « GitHub Pages » seul (Cloudflare Pages retiré le 2026-11-05).

## Ce qui est déjà tranché (ne pas refaire l'analyse)
- Le script est ajouté par `auth.js` (`loadHcaptchaScript`), appelé dans `openEmailModal` **seulement** dans la
  branche existante `else if (!isLocalhost())` (script pas encore là, hors local). L'attente existante (vérification
  de `window.hcaptcha` toutes les 200 ms, message `CAPTCHA_SLOW_TEXT` au bout de 10 s) ne change pas.
- Même adresse qu'avant (`?render=explicit`), sans empreinte d'intégrité (fichier sans version, cf. SCR-01).
- Une seule demande par page ; en cas d'`onerror`, la balise est retirée et la demande oubliée, pour que la
  prochaine ouverture de la fenêtre réessaie.
- `doc` en paramètre (par défaut `document`) : le test unitaire passe un faux document, sans navigateur.

## Avant de coder
**Lire en entier** : `js/auth.js` lignes 183-192 (`describeCodeError`, `CAPTCHA_SLOW_TEXT`) et la fonction
`openEmailModal` (vers les lignes 313-431) ; `tests/unit/unit.test.js` le bloc
`describe('hCaptcha rendu par l’app seulement (CNX-08)', ...)` (vers la ligne 2488) ;
`tests/functional/confidentialite.spec.js` (en entier, 78 lignes) ; `tests/functional/helpers.js` `setupApp` et
`openDistModal` ; `tests/e2e/visiteur.spec.js` lignes 137-168.

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter ; un numéro de ligne différent n'est pas un échec) :
```bash
grep -c '<script src="https://js.hcaptcha.com/1/api.js?render=explicit" async defer></script>' index.html   # 1
grep -c 'hcaptcha.com' index.html                                                                  # 1
grep -c 'son script se charge avec la page.</li>' index.html                                        # 1
grep -c '<li><strong>GitHub Pages et Cloudflare Pages</strong> : hébergent le site.</li>' index.html   # 1
grep -c '"./js/auth.js": "./js/auth.js?v=131",' index.html                                          # 1
grep -c '?v=131"' index.html                                                                        # 29
grep -c "^const CAPTCHA_SLOW_TEXT = " js/auth.js                                                    # 1
grep -c "^    } else if (!isLocalhost()) {" js/auth.js                                              # 1
grep -c "^        captchaWait = setInterval(() => {" js/auth.js                                     # 1
grep -c "window.hcaptcha" js/auth.js                                                                # 8
grep -c "assert.ok(index.includes('https://js.hcaptcha.com/1/api.js?render=explicit'));" tests/unit/unit.test.js   # 1
grep -c "^describe('hCaptcha rendu par l’app seulement (CNX-08)', () => {" tests/unit/unit.test.js  # 1
grep -c "^import { BASE_URL, EVENTS_ROUTE, setupApp, loginForTest, openSignalableFiche, newTestContext } from './helpers.js';" tests/functional/confidentialite.spec.js   # 1
grep -c "domcontentloaded : l'evenement load attendrait le script en retard" tests/e2e/visiteur.spec.js   # 1
grep -c "hCaptcha sans empreinte (fichier sans version)" CLAUDE.md                                  # 1
```

## Étapes
Fichiers en CRLF : outil Edit ou petit script Node (scratchpad, hors dépôt), **jamais `sed -i`**.

1. **js/auth.js** — ajouter le chargeur juste **après** la constante `CAPTCHA_SLOW_TEXT` (et sa ligne vide).
   Avant :
   ```js
   // CNX-08 : script hCaptcha pas encore la au bout de 10 s (reseau lent, bloqueur)
   const CAPTCHA_SLOW_TEXT = 'Le contrôle anti-robot ne s’est pas chargé : vérifie ta connexion ou ton bloqueur de publicités, puis patiente un instant.';

   // ============================================
   // RETOUR SUR LA FICHE APRES CONNEXION (Stephane 2026-10-17)
   ```
   Après :
   ```js
   // CNX-08 : script hCaptcha pas encore la au bout de 10 s (reseau lent, bloqueur)
   const CAPTCHA_SLOW_TEXT = 'Le contrôle anti-robot ne s’est pas chargé : vérifie ta connexion ou ton bloqueur de publicités, puis patiente un instant.';

   // PRIV-08 : le script hCaptcha n'est plus dans index.html. Il est demande a la premiere
   // ouverture de la fenetre de connexion : un visiteur qui ne se connecte pas ne contacte
   // jamais hCaptcha. Une seule demande ; apres un echec (reseau, bloqueur), la prochaine
   // ouverture le redemande (la fenetre ouverte affiche deja CAPTCHA_SLOW_TEXT au bout de 10 s).
   export const HCAPTCHA_SCRIPT_URL = 'https://js.hcaptcha.com/1/api.js?render=explicit';
   let hcaptchaScript = null;

   export function loadHcaptchaScript(doc = document) {
       if (hcaptchaScript) return;
       const script = doc.createElement('script');
       script.src = HCAPTCHA_SCRIPT_URL;
       script.async = true;
       script.onerror = () => {
           script.remove();
           if (hcaptchaScript === script) hcaptchaScript = null;
       };
       doc.head.appendChild(script);
       hcaptchaScript = script;
   }

   // ============================================
   // RETOUR SUR LA FICHE APRES CONNEXION (Stephane 2026-10-17)
   ```
2. **js/auth.js** — dans `openEmailModal`, demander le script au début de l'attente.
   Avant :
   ```js
       if (window.hcaptcha) {
           tryRenderHcaptcha();
       } else if (!isLocalhost()) {
           captchaWait = setInterval(() => {
   ```
   Après :
   ```js
       if (window.hcaptcha) {
           tryRenderHcaptcha();
       } else if (!isLocalhost()) {
           loadHcaptchaScript();   // PRIV-08 : demande seulement maintenant (deja demande : rien)
           captchaWait = setInterval(() => {
   ```
3. **index.html** — **supprimer** la ligne entière (avec son retour à la ligne) :
   ```html
       <script src="https://js.hcaptcha.com/1/api.js?render=explicit" async defer></script>
   ```
   Après la suppression, `grep -c 'hcaptcha.com' index.html` doit répondre `0`.
4. **index.html** — page Confidentialité, rubrique « Les services utilisés ».
   Avant :
   ```html
                       <li><strong>hCaptcha</strong> : vérifie que la connexion vient d’une personne ; son script se charge avec la page.</li>
   ```
   Après :
   ```html
                       <li><strong>hCaptcha</strong> : vérifie que la connexion vient d’une personne ; son script se charge seulement quand tu ouvres la fenêtre de connexion.</li>
   ```
   Avant :
   ```html
                       <li><strong>GitHub Pages et Cloudflare Pages</strong> : hébergent le site.</li>
   ```
   Après :
   ```html
                       <li><strong>GitHub Pages</strong> : héberge le site.</li>
   ```
5. **index.html** — import map : les **29** entrées `?v=131` → `?v=132` (toutes, même valeur).
6. **tests/e2e/visiteur.spec.js** — le commentaire devenu faux (le script n'est plus demandé au chargement).
   Avant :
   ```js
           // domcontentloaded : l'evenement load attendrait le script en retard
   ```
   Après (une seule ligne, même indentation) :
   ```js
           // PRIV-08 : le script hCaptcha n'est demande qu'a l'ouverture de la connexion (retard compte de la)
   ```
7. **CLAUDE.md** — section Stack, ligne `CDN charges dans index.html`.
   Avant (extrait) :
   ```text
   - CDN charges dans `index.html` : Leaflet 1.9.4 (unpkg), `@supabase/supabase-js@2.119.0` (jsdelivr), hCaptcha. Versions EXACTES
   ```
   Après :
   ```text
   - CDN charges dans `index.html` : Leaflet 1.9.4 (unpkg), `@supabase/supabase-js@2.119.0` (jsdelivr). Versions EXACTES
   ```
   Et, dans la même ligne :
   Avant : ```hCaptcha sans empreinte (fichier sans version).```
   Après : ```hCaptcha n'est PAS dans `index.html` : `loadHcaptchaScript()` (auth.js) le demande a la premiere ouverture de la fenetre de connexion, jamais en local (PRIV-08), sans empreinte (fichier sans version).```
8. **BACKLOG.md** — cocher PRIV-08 (`- [ ] PRIV-08` → `- [x] PRIV-08`).

## Tests
Écrire les tests **avant** les étapes 1 à 5 et les voir échouer.

1. **Fichier** : `tests/unit/unit.test.js`.
   a) Dans le bloc `describe('hCaptcha rendu par l’app seulement (CNX-08)', ...)`, remplacer la ligne
   ```js
           assert.ok(index.includes('https://js.hcaptcha.com/1/api.js?render=explicit'));
   ```
   par
   ```js
           assert.ok(auth.includes("'https://js.hcaptcha.com/1/api.js?render=explicit'"));   // PRIV-08 : demande par auth.js
   ```
   b) Juste **après** la fermeture `});` de ce bloc CNX-08, ajouter :
   ```js

   // ============================================
   // HCAPTCHA CONTACTE SEULEMENT A L'OUVERTURE DE LA CONNEXION (PRIV-08)
   // ============================================
   // Un visiteur qui ne se connecte pas ne doit jamais contacter hCaptcha : plus de script
   // dans index.html, auth.js le demande a l'ouverture de la fenetre de connexion.
   const { loadHcaptchaScript } = await import('../../js/auth.js');

   describe('hCaptcha seulement à l’ouverture de la connexion (PRIV-08)', () => {
       const projectRoot = new URL('../../', import.meta.url);

       it('index.html ne charge plus hCaptcha', () => {
           const index = readFileSync(new URL('index.html', projectRoot), 'utf8');
           assert.ok(!index.includes('hcaptcha.com'), 'index.html ne doit plus demander hCaptcha');
       });

       it('un seul script demandé, redemandé après un échec', () => {
           const added = [];
           const doc = {
               createElement: (tag) => ({ tag, remove() { this.removed = true; } }),
               head: { appendChild: (el) => { added.push(el); return el; } }
           };
           loadHcaptchaScript(doc);
           loadHcaptchaScript(doc);
           assert.equal(added.length, 1, 'une seule demande');
           assert.equal(added[0].tag, 'script');
           assert.equal(added[0].src, 'https://js.hcaptcha.com/1/api.js?render=explicit');
           assert.equal(added[0].async, true);
           added[0].onerror();
           assert.equal(added[0].removed, true, 'balise en échec retirée');
           loadHcaptchaScript(doc);
           assert.equal(added.length, 2, 'redemandé après un échec');
       });

       it('la fenêtre de connexion le demande, hors localhost seulement', () => {
           const auth = readFileSync(new URL('js/auth.js', projectRoot), 'utf8');
           const modal = auth.slice(auth.indexOf('function openEmailModal('));
           assert.match(modal, /\} else if \(!isLocalhost\(\)\) \{\s*loadHcaptchaScript\(\);/);
       });
   });
   ```
   **Doit échouer avant** : `index.html` contient `js.hcaptcha.com` ; `loadHcaptchaScript` est `undefined`
   (TypeError) ; `openEmailModal` ne l'appelle pas ; et le test CNX-08 modifié ne trouve pas l'adresse dans `auth.js`.
2. **Fichier** : `tests/functional/confidentialite.spec.js` · **Nom** :
   `aucun appel à hCaptcha au chargement ni en ouvrant une fiche`
   - Ajouter `openDistModal` à l'import de `./helpers.js` (à la fin de la liste, après `newTestContext`).
   - À la **fin du fichier** (après le `});` final du groupe `49. Confidentialité (PRIV-04)`), ajouter :
   ```js

   // PRIV-08 : hCaptcha n'est contacte qu'a l'ouverture de la connexion (en local, jamais)
   test.describe('50. hCaptcha seulement à la connexion (PRIV-08)', () => {
       test('aucun appel à hCaptcha au chargement ni en ouvrant une fiche', async ({ page, context }) => {
           const calls = [];
           page.on('request', req => {
               if (new URL(req.url()).hostname.endsWith('hcaptcha.com')) calls.push(req.url());
           });
           await setupApp(page, context);
           await openDistModal(page);
           await page.waitForTimeout(500);
           expect(calls).toEqual([]);
       });
   });
   ```
   **Doit échouer avant** : la balise `<script src="https://js.hcaptcha.com/...">` d'`index.html` part au chargement
   (`calls` contient l'adresse).

## Vérification (dans l'ordre)
```bash
npm test                                                                            # tout vert (dont cache-busting, CNX-08, PRIV-08)
npx playwright test --project=functional -g "hCaptcha|Confidentialité|connexion"    # verts
grep -c 'hcaptcha.com' index.html                                                   # 0
grep -c '?v=132"' index.html                                                        # 29
npm run test:functional                                                             # en arrière-plan (~15 min) : tout vert, instables notés dans la PR
git diff --stat master                                                              # les 6 fichiers + BACKLOG.md (+ la fiche, déjà commitée)
```
Le serveur local doit répondre sur le port 8080 (`npx http-server -p 8080 -c-1`).
**Ne pas** lancer les tests E2E : ils visent le site en ligne, qui n'a pas encore ce code. Claude les lance
après la fusion, et vérifie la case sur le vrai domaine avant la fusion.

## Hors périmètre
- Le filtre `!m[1].startsWith('https://js.hcaptcha.com/')` du test SCR-01 : devenu sans effet, le laisser.
- Le rendu de la case, les textes de la fenêtre de connexion, `CAPTCHA_SLOW_TEXT` : inchangés.
- Précharger le script plus tôt (au survol, à l'affichage de l'invitation) : non.
- Les autres services de la page Confidentialité : ne pas y toucher.

## Pièges connus
- `loadHcaptchaScript` est appelé **dans** la branche `else if (!isLocalhost())`, jamais avant le `if` : en local,
  rien ne doit être demandé, et si `window.hcaptcha` existe déjà, inutile.
- Importer `loadHcaptchaScript` par `await import(...)` (comme dans le code donné), **pas** en ajoutant un nom à
  l'`import { takeLoginReturn } ...` statique : avant la correction, un import statique d'un nom absent fait
  planter tout le fichier de tests au lieu d'un seul test.
- Dans le faux document, `remove() { this.removed = true; }` est une méthode (pas une flèche) : `this` doit
  désigner l'élément.
- L'import map compte 29 entrées : toutes à `?v=132`, sinon le test `cache-busting` échoue.
- Le texte de la page Confidentialité est vérifié par un test (pas de « tap », « machine », « reste ») : le
  nouveau texte n'en contient pas.

## Terminé quand
- [ ] Contrôles passés, tests écrits (échouent avant, passent après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : non
- [ ] Story cochée dans BACKLOG.md, PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `fix(privacy): hCaptcha contacté seulement à l'ouverture de la connexion (PRIV-08)`

**Corps** : ce qui change pour le visiteur ; ce qui ne change pas à l'écran ; tests ajoutés (et preuve qu'ils
échouaient avant) ; sorties des commandes de vérification ; rappel : les E2E CNX-08 (case affichée une fois, retard
annoncé) sont à lancer après la fusion, sur le site en ligne.
