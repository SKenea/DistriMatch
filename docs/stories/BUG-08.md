# BUG-08 — Bas de la carte et « © OpenStreetMap » cachés dans le navigateur du téléphone

> **Ordre du lot 3 (EPIC-R3)** : BUG-07 → BUG-02 → BUG-13 → BUG-05 → BUG-04 → BUG-14 → BUG-03 → BUG-06 → BUG-11 → BUG-12 → BUG-15 → BUG-08 → BUG-09 → BUG-10. **Prérequis** : BUG-15 fusionnée dans master (sinon s'arrêter).

- **Lot** : 3. Bugs visibles · **Gravité** : moyen · **Niveau conseillé** : medium
- **Branche** : `fix/hauteur-visible-telephone` · **Taille** : 1 fichier CSS + 1 test unitaire
- **Constats couverts** (rapport du 2026-10-21) :
  - 100vh sur mobile : bas de carte et attribution « © OpenStreetMap » cachés sous la barre du bas — `css/base.css:362`

## But
Dans Chrome Android et Safari iPhone (navigateur, pas l'app installée), la carte s'arrête
juste au-dessus de la barre du bas : son bas et la mention « © OpenStreetMap » sont visibles.

## User story
En tant que visiteur arrivé par un QR code dans le navigateur de mon téléphone, je veux voir
toute la carte jusqu'à la barre du bas, afin de ne pas perdre les distributeurs du bas de
l'écran et de voir la mention obligatoire « © OpenStreetMap ».

**Critères d'acceptation**
- [ ] `body`, `.app-container` et `.search-results-clean` (`css/base.css`) déclarent d'abord leur
      hauteur en `100vh` (repli), puis la même en `100dvh` (zone réellement visible).
- [ ] Sur téléphone, dans le navigateur : « © OpenStreetMap » est visible juste au-dessus de la
      barre du bas (vérification à la main par Stéphane, voir plus bas).
- [ ] Sur ordinateur et dans l'app installée : rien ne change (dans ces cas, 100dvh = 100vh).

## Pourquoi ça arrive (déjà analysé, ne pas refaire)
`body { height: 100vh }` et `.app-container { height: calc(100vh - var(--nav-height)) }`
supposent que `100vh` = hauteur visible. Dans le navigateur du téléphone, `100vh` vaut la
hauteur **sans** les barres du navigateur (barre d'adresse, barre d'outils de Safari). Or la
page ne défile jamais (`overflow: hidden` sur `body`) : ces barres restent affichées. La carte
descend donc de 56 à 80 px trop bas et passe sous la barre du bas de l'app (`.bottom-nav`,
fixée au bas **visible**), ou sort de l'écran. L'attribution Leaflet, en bas à droite, disparaît
avec elle. L'unité `dvh` (« dynamic viewport height ») vaut la hauteur réellement visible ;
navigateurs : Chrome 108+, Safari 15.4+, Firefox 101+. Un navigateur plus ancien ignore la
déclaration en `dvh` et garde la précédente en `vh` : d'où l'ordre « vh puis dvh ».

Autres `100vh` du projet, vérifiés, **à ne pas toucher** :
- `css/overlays.css:889` (`.dist-modal { height: 100vh }` sous 768 px) : remplacé plus bas dans
  le même fichier par `height: 100%` (règle « Fiche en feuille du bas », vers la ligne 2437).
- `css/overlays.css:1024` (`.webcam-modal`) : photos inactives (`FEATURES.photos = false`).
- `max-height: 85vh / 90vh` des fenêtres (`panels.css:843`, `overlays.css:611`, `overlays.css:2296`,
  `overlays.css:2416`, `feed-and-nav.css:136`) et `min-height: 50vh` (`panels.css:388`) : ce sont
  des maximums ou minimums de fenêtres centrées, pas des hauteurs d'écran ; hors périmètre.

## Avant de coder
**Lire en entier** : `css/base.css` lignes 132 à 139 (`body`), 323 à 327 (`.search-results-clean`),
360 à 365 (`.app-container`) ; `css/feed-and-nav.css` lignes 172 à 186 (`.bottom-nav`) et 255 à 258
(`padding-bottom: 60px` de `.app-container`, à lire seulement, ne pas modifier).

**Réutiliser** : la variable `--nav-height` existante. Ne créer ni variable ni règle.

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
grep -n 'height: 100vh;' css/base.css                            # attendu : une seule ligne, 138 (dans body)
grep -n 'max-height: calc(100vh - 70px);' css/base.css           # attendu : ligne 326 (.search-results-clean)
grep -n 'height: calc(100vh - var(--nav-height));' css/base.css  # attendu : ligne 364 (.app-container)
grep -rn 'dvh' css/                                              # attendu : aucune ligne
grep -n 'css/base.css?v=' index.html                             # attendu : css/base.css?v=38 (ou plus)
```
Si `grep -rn 'dvh' css/` trouve déjà quelque chose, s'arrêter : la correction a peut-être déjà été faite.

## Étapes
1. **css/base.css**, règle `body` (lignes 132 à 139) — ajouter la hauteur visible après le repli.
   Avant :
   ```css
       overflow: hidden;
       height: 100vh;
   }
   ```
   Après :
   ```css
       overflow: hidden;
       height: 100vh;
       /* Zone reellement visible (BUG-08) : dans le navigateur du telephone, 100vh
          compte aussi la place des barres du navigateur, qui restent affichees ici
          (la page ne defile pas). 100vh reste en repli pour les anciens navigateurs. */
       height: 100dvh;
   }
   ```
2. **css/base.css**, règle `.search-results-clean` (ligne 326).
   Avant :
   ```css
       max-height: calc(100vh - 70px);
   ```
   Après :
   ```css
       max-height: calc(100vh - 70px);
       max-height: calc(100dvh - 70px);   /* zone visible, voir body (BUG-08) */
   ```
3. **css/base.css**, règle `.app-container` (ligne 364).
   Avant :
   ```css
       height: calc(100vh - var(--nav-height));
   ```
   Après :
   ```css
       height: calc(100vh - var(--nav-height));
       height: calc(100dvh - var(--nav-height));   /* zone visible, voir body (BUG-08) */
   ```
4. **index.html** — monter le `?v=` de `css/base.css` de 1 (aujourd'hui `?v=38` → `?v=39` ; si
   master a bougé, valeur courante + 1). Aucun module JS ne change : **ne pas** toucher à l'import map.

Contrôle après les étapes : `git diff --stat` doit montrer `css/base.css` (+6 lignes environ),
`index.html` (1 ligne), `tests/unit/unit.test.js` (le test), et rien d'autre.

## Tests
Playwright ne simule pas la barre d'adresse du navigateur du téléphone : le défaut ne se voit
pas dans un test navigateur. On vérifie donc la règle CSS elle-même.

- **Fichier** : `tests/unit/unit.test.js`, **à la toute fin du fichier** (après le `describe`
  `'Connexion : retour sur la fiche (2026-10-17)'`). `readFileSync` est déjà importé en haut
  (ligne 41) : ne pas le réimporter.
- **Nom** : `Telephone : hauteur de la zone visible (BUG-08)` (3 tests, un par règle)
- **Code à ajouter** (avec l'outil Edit ou Write, **pas** par un heredoc bash qui mange les `\`) :
  ```js

  // ============================================
  // TELEPHONE : HAUTEUR DE LA ZONE VISIBLE (BUG-08)
  // ============================================
  // Playwright ne simule pas la barre d'adresse du telephone : on verifie la regle CSS.
  // Chaque hauteur d'ecran de css/base.css a un repli en 100vh PUIS sa version en 100dvh.

  describe('Telephone : hauteur de la zone visible (BUG-08)', () => {
      const css = readFileSync(new URL('../../css/base.css', import.meta.url), 'utf8');

      function ruleBody(selector) {
          const m = css.match(new RegExp(`^${selector.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`, 'm'));
          assert.ok(m, `regle ${selector} introuvable dans css/base.css`);
          return m[1];
      }

      for (const [selector, prop] of [['body', 'height'], ['.app-container', 'height'], ['.search-results-clean', 'max-height']]) {
          it(`${selector} : ${prop} en 100dvh, apres le repli 100vh`, () => {
              const rule = ruleBody(selector);
              const vh = rule.search(new RegExp(`(^|[;\\s])${prop}:[^;]*100vh`));
              const dvh = rule.search(new RegExp(`(^|[;\\s])${prop}:[^;]*100dvh`));
              assert.ok(vh >= 0, `${selector} : repli ${prop} en 100vh absent (vieux navigateurs)`);
              assert.ok(dvh > vh, `${selector} : ${prop} en 100dvh absent ou place avant le repli 100vh`);
          });
      }
  });
  ```
- **Doit échouer avant la correction** : les 3 tests échouent avec
  `<selecteur> : height en 100dvh absent ou place avant le repli 100vh` (vérifié sur le code actuel).
  Si le message est `regle ... introuvable`, le test a été mal recopié (les `\\` doivent rester doublés).

## Vérification (dans l'ordre)
```bash
node --test --test-name-pattern="BUG-08" tests/unit/unit.test.js        # 3 tests passent
npm test                                                                 # tout vert
npx playwright test --project=functional -g "8. Mobile"                  # tous passent
npm run test:functional                                                  # en arrière-plan (~10 min) : tout vert, instables notés
```

**Captures iPhone** (serveur local lancé) :
```bash
node tests/tools/capture-iphone.mjs BUG-08-avant-carte carte    # avant les étapes
node tests/tools/capture-iphone.mjs BUG-08-apres-carte carte    # après
```
Les deux images doivent être **identiques** : Playwright WebKit n'affiche pas de barre d'adresse.
Elles servent à prouver que rien n'a bougé là où tout allait bien ; le vrai contrôle est
la vérification à la main ci-dessous.

## Vérification à la main par Stéphane sur téléphone (après fusion)
À noter tel quel dans la PR, pour Stéphane :
1. **Chrome Android**, dans le navigateur (pas l'app installée), ouvrir le site, accepter la position.
2. Regarder le bas de la carte : la mention « Leaflet | © OpenStreetMap » est visible **juste
   au-dessus** de la barre du bas (Explorer / Favoris / Activité), en bas à droite.
3. Même chose dans **Safari sur iPhone** (navigateur, pas l'icône de l'écran d'accueil), barre
   d'adresse en bas comme en haut (réglage Safari « Onglets »).
4. Ouvrir la recherche (loupe) : la liste des résultats défile jusqu'au dernier résultat.

## Hors périmètre
- Les autres `100vh`, `85vh`, `90vh`, `50vh` listés dans « Pourquoi ça arrive » : ne pas y toucher.
- La variante « `.app-container` en `position: fixed` entre les deux barres » et le
  `padding-bottom: 60px` de `css/feed-and-nav.css` : ne pas modifier `feed-and-nav.css`.
- `env(safe-area-inset-bottom)` et `viewport-fit=cover` : rien à changer.
- La barre du bas, la recherche (`.search-overlay`), la fiche : leur position ne change pas.

## Pièges connus
- **Garder la ligne en `100vh`** et mettre la ligne en `100dvh` **après** : l'inverse annule le
  correctif (la dernière déclaration comprise gagne), et la supprimer casse les vieux navigateurs.
- `height: 100vh;` n'apparaît qu'une fois dans `css/base.css`, mais `max-height: 85vh` / `90vh`
  existent dans d'autres fichiers : ne modifier que les 3 endroits des étapes.
- Ne pas écrire le test par un heredoc bash (`cat <<'EOF'`) : dans cet environnement, un `\` y est
  retiré, la regex devient fausse et le test échoue toujours (`regle ... introuvable`).
- Les captures avant / après identiques sont **normales** (voir Vérification).

## Terminé quand
- [ ] Contrôles passés, test écrit (échoue avant, passe après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : oui, écran `carte` (`BUG-08-avant-carte`, `BUG-08-apres-carte`)
- [ ] Section « Vérification à la main par Stéphane » recopiée dans la PR
- [ ] BUG-08 absent de `BACKLOG.md` à ce jour : ne pas l'ajouter, le noter dans la PR ; PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `fix(carte): hauteur sur la zone visible du téléphone (100dvh)`

**Corps** : constat corrigé (bas de carte et « © OpenStreetMap » cachés sous la barre du bas dans
le navigateur du téléphone), cause (`100vh` compte la place des barres du navigateur), correction
(repli `100vh` puis `100dvh` sur `body`, `.app-container`, `.search-results-clean`), test unitaire
ajouté, sorties des commandes, chemins des captures (identiques, attendu), étapes de vérification
à la main pour Stéphane (Chrome Android, Safari iPhone), « BUG-08 pas encore dans BACKLOG.md ».
