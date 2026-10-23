# BUG-01 — Menu du profil invisible depuis une page

- **Lot** : 3. Bugs visibles · **Gravité** : moyen · **Niveau conseillé** : medium
- **Branche** : `fix/menu-profil-pages` · **Taille** : 1 fichier CSS + 1 test
- **Constats couverts** (rapport du 2026-10-21) :
  - Menu de l'avatar invisible depuis toute page (Favoris, Activité, Notifications, Compte...) — `css/panels.css:542`

## But
Depuis n'importe quelle page (Favoris, Activité, Notifications, Compte, Mon profil), toucher
l'avatar ouvre le menu du profil **au-dessus** de la page, et ses choix sont touchables.

## User story
En tant que membre qui consulte ses Favoris, je veux ouvrir le menu de mon avatar, afin
d'aller sur Compte ou de me connecter sans revenir d'abord à la carte.

**Critères d'acceptation**
- [ ] Page Favoris ouverte : toucher l'avatar affiche le menu ; toucher « Compte » ouvre la page Compte.
- [ ] La recherche s'affiche toujours au-dessus de la barre du haut (rien ne change pour elle).
- [ ] La fiche distributeur, les fenêtres (connexion, confirmation) et les messages restent au-dessus de tout.

## Pourquoi ça arrive (déjà analysé, ne pas refaire)
`#profile-menu` est dans `.top-nav`. `.top-nav` est `position: fixed; z-index: var(--z-nav)` (110) :
elle crée son propre empilement, donc le `z-index: 150` du menu ne compte qu'**à l'intérieur** de
la barre. Les pages (`.view-page`) sont à `z-index: var(--z-overlay)` (150) dans l'empilement
général et commencent juste sous la barre : elles passent **au-dessus** de tout ce qui dépasse
de la barre, donc du menu. La recherche a eu le même souci, corrigé à `calc(var(--z-overlay) + 10)`
(160), voir `css/base.css` vers la ligne 266.

La correction : monter la barre du haut à **155**, entre les pages (150) et la recherche (160).
Rien d'autre dans l'empilement général ne se trouve entre 110 et 160 (vérifié : barre du bas 110,
chat 100, fenêtres et fiche à 10 000 et plus).

## Avant de coder
**Lire en entier** : `css/base.css` lignes 60 à 70 (variables z-index) et 143 à 158 (`.top-nav`),
`css/panels.css` lignes 285 à 296 (`.view-page`) et 530 à 547 (`.profile-menu`).

**Réutiliser** : les variables `--z-overlay` et `--z-nav` existantes. Ne pas créer de variable.

**Contrôles** :
```bash
grep -n "z-index: var(--z-nav);" css/base.css          # attendu : une ligne vers 157, dans .top-nav
grep -n "\-\-z-overlay: 150;" css/base.css             # attendu : ligne 66
grep -n "calc(var(--z-overlay) + 10)" css/base.css     # attendu : vers la ligne 268 (recherche)
grep -n 'css/base.css?v=' index.html                   # attendu : css/base.css?v=37 (ou plus)
```
Si `.top-nav` n'a plus `z-index: var(--z-nav)`, s'arrêter.

## Étapes
1. **css/base.css**, règle `.top-nav` (vers la ligne 157) — monter la barre au-dessus des pages.
   Avant :
   ```css
       right: 0;
       z-index: var(--z-nav);
   }
   ```
   Après :
   ```css
       right: 0;
       /* Au-dessus des pages (--z-overlay) pour que le menu du profil, qui deborde de la
          barre, ne passe pas derriere elles ; sous la recherche (+10) et les fenetres */
       z-index: calc(var(--z-overlay) + 5);
   }
   ```
   Attention : `z-index: var(--z-nav);` apparaît aussi ailleurs (barre du bas, dans
   `css/feed-and-nav.css`). Ne modifier **que** la règle `.top-nav` de `css/base.css`.
2. **index.html** — monter le `?v=` de `css/base.css` de 1 (ex. `?v=37` → `?v=38`).
   Aucun module JS ne change : **ne pas** toucher à l'import map.

## Tests
- **Fichier** : `tests/functional/navigation.spec.js`, dans `test.describe('7. Profil (Local Guides + menu avatar)'`,
  après le test `menu Connexion -> mur d'auth`.
- **Nom** : `menu avatar utilisable depuis une page (Favoris) : Compte s'ouvre`
- **Code à ajouter** :
  ```js
      test('menu avatar utilisable depuis une page (Favoris) : Compte s\'ouvre', async ({ page }) => {
          await page.click('.bottom-nav [data-tab="favorites"]');
          await page.waitForSelector('#subscriptions-view.view-active', { timeout: 3000 });
          await page.click('#profile-avatar-btn');
          await page.waitForSelector('#profile-menu:not([hidden])', { timeout: 3000 });
          await page.click('#profile-menu [data-action="account"]', { timeout: 3000 });
          await page.waitForSelector('#account-view.view-active', { timeout: 3000 });
      });
  ```
- **Doit échouer avant la correction** : le clic sur « Compte » expire, Playwright signale que
  `subscriptions-view` intercepte le clic (le menu est derrière la page).

## Vérification (dans l'ordre)
```bash
npx playwright test --project=functional -g "menu avatar utilisable depuis une page"   # 1 passed
npx playwright test --project=functional -g "7. Profil"                                # tous passent
npm test                                                                               # tout vert
npm run test:functional                                                                # en arrière-plan (~10 min) : tout vert, instables notés
```

## Hors périmètre
- Le clavier dans le menu (flèches, Échap) : story A11Y séparée.
- La barre du bas, la recherche, les pages : ne pas changer leur `z-index`.
- Fermer la page quand on touche l'avatar : non, on garde la page ouverte.

## Pièges connus
- Ne pas mettre la barre à 160 ou plus : elle passerait au-dessus de la recherche.
- Ne pas sortir `#profile-menu` de `.top-nav` dans `index.html` : correction plus lourde, inutile.
- Faire le test avec Favoris **ouverte** ; sur la carte seule, le bug ne se voit pas.

## Terminé quand
- [ ] Contrôles passés, test écrit (échoue avant, passe après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : oui, écran `favoris-menu` (`node tests/tools/capture-iphone.mjs BUG-01-avant favoris-menu`, puis `BUG-01-apres`)
- [ ] Story cochée dans BACKLOG.md, PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `fix(profil): menu de l'avatar au-dessus des pages`

**Corps** : constat corrigé (menu de l'avatar invisible depuis une page), cause (empilement de
la barre du haut), correction (z-index de `.top-nav` à `--z-overlay + 5`), test ajouté, sorties
des commandes, captures iPhone avant / après.
