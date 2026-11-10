# SCR-01 — Bibliothèques externes en version exacte, avec empreinte d'intégrité

- **Lot** : 8. Scripts et config · **Gravité** : faible · **Niveau conseillé** : medium
- **Prérequis** : partir de `master` **à jour** (A11Y-03 fusionnée, import map à `?v=131`).
- **Branche** : `fix/cdn-versions` · **Taille** : `index.html` (3 lignes) + `CLAUDE.md` (2 passages) + 1 fichier de
  tests (`tests/unit/unit.test.js`). **Aucun module JS, aucune migration, aucun `?v=` à changer.**
- **Constat couvert** (rapport du 2026-10-21, revérifié le 2026-11-10 : **non corrigé**) :
  - Scripts CDN sans intégrité (SRI) et supabase-js en version flottante `@2` — `index.html:1184` (rapport : `index.html:88`)

## But
`index.html` charge supabase-js par `@supabase/supabase-js@2` : le CDN sert **la dernière 2.x publiée**. Une
nouvelle version publiée un soir peut casser l'app chez tous les testeurs sans qu'aucun commit n'ait eu lieu,
et rien ne garantit que le fichier reçu est celui qu'on a testé. On fige la version **déjà servie aujourd'hui**
(2.119.0, donc aucun changement de comportement) et on ajoute une empreinte d'intégrité (SRI) à Leaflet et à
supabase-js : si le fichier du CDN change, le navigateur refuse de l'exécuter au lieu d'exécuter autre chose.

## User story
En tant que testeur, je veux que l'app utilise toujours la même version de ses bibliothèques, afin qu'elle ne
casse pas un soir sans que personne n'ait rien changé.

**Critères d'acceptation**
- [ ] supabase-js est chargée en `@2.119.0` (version exacte), plus `@2`.
- [ ] Le script et la feuille de style de Leaflet, et le script de supabase-js, portent `integrity="sha384-..."`
      et `crossorigin="anonymous"`.
- [ ] Un test rapide échoue si une bibliothèque externe de `index.html` (hors hCaptcha) n'a pas de version exacte
      `x.y.z` ou pas d'empreinte `sha384`.
- [ ] CLAUDE.md dit comment changer de version (recalculer l'empreinte) et cite la migration 034 (absente de la liste).
- [ ] L'app se charge comme avant (carte, fiches de la base) : suite fonctionnelle verte.

## Ce qui est déjà tranché (ne pas refaire l'analyse)
- **Version** : `2.119.0` = ce que `@2` sert le 2026-11-10 (en-tête `x-jsd-version: 2.119.0` ; fichier identique
  octet pour octet à `@2.119.0`). Ne pas prendre une autre version.
- **Empreintes** (calculées le 2026-11-10 par Claude, `curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A`) :
  - `https://unpkg.com/leaflet@1.9.4/dist/leaflet.css` → `sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H`
  - `https://unpkg.com/leaflet@1.9.4/dist/leaflet.js` → `sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH`
  - `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.min.js` → `sha384-gnyZit14c5lnGcarmA166QQjjJXpucw25ogZXuwH3HxxY904zHkBqmxVpelsPorb`
  Les deux CDN répondent `Access-Control-Allow-Origin: *` : `crossorigin="anonymous"` fonctionne.
- **hCaptcha** (`https://js.hcaptcha.com/1/api.js`) : **pas** d'empreinte. Le fichier change côté hCaptcha sans
  numéro de version ; une empreinte le casserait. Le test l'exclut nommément.
- Aucun test ne simule ces fichiers du CDN (vérifié : `grep -rn "jsdelivr\|unpkg" tests/` ne trouve rien), donc
  l'empreinte ne gêne aucun test.

## Avant de coder
**Lire en entier** : `index.html` lignes 40-50 et 1180-1190 ; `tests/unit/unit.test.js` le bloc
`describe('cache-busting : import map de index.html', ...)` (vers les lignes 1066-1124) ; dans `CLAUDE.md`, la
ligne « CDN charges dans `index.html` » (section Stack) et la fin de la liste des migrations (`033_account_deletion`).

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter ; un numéro de ligne différent n'est pas un échec) :
```bash
grep -c '<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />' index.html   # 1
grep -c '<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>' index.html             # 1
grep -c '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>' index.html   # 1
grep -c 'integrity=' index.html                                                                         # 0
grep -c "assert.doesNotMatch(html, /src=\"js\\\\/app\\\\.js/);" tests/unit/unit.test.js                  # 1
grep -c "CDN charges dans \`index.html\` : Leaflet 1.9.4 (unpkg), \`@supabase/supabase-js@2\` (jsdelivr), hCaptcha" CLAUDE.md   # 1
grep -c "dans \`docs/stories/PRIV-07.md\`). AVANT d'appliquer une migration" CLAUDE.md                  # 1
grep -c '034_demo_signal_flag' CLAUDE.md                                                                # 0
ls supabase/034_demo_signal_flag.sql                                                                    # existe
grep -rn "jsdelivr\|unpkg" tests/ | wc -l                                                               # 0
```

## Étapes
Les trois fichiers sont en CRLF : modifier avec l'outil Edit ou un petit script Node, **jamais `sed -i`**.

1. **index.html**, ligne de la feuille de style Leaflet (dans `<head>`). Avant :
   ```html
       <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
   ```
   Après :
   ```html
       <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H" crossorigin="anonymous" />
   ```
2. **index.html**, scripts en bas de page. Avant :
   ```html
       <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
       <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
   ```
   Après :
   ```html
       <!-- SCR-01 : versions exactes + empreinte d'integrite (pour changer de version : CLAUDE.md, Stack) -->
       <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH" crossorigin="anonymous"></script>
       <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.min.js" integrity="sha384-gnyZit14c5lnGcarmA166QQjjJXpucw25ogZXuwH3HxxY904zHkBqmxVpelsPorb" crossorigin="anonymous"></script>
   ```
   Ne pas toucher à la ligne hCaptcha qui suit.
3. **CLAUDE.md**, section Stack. Avant :
   ```
   - CDN charges dans `index.html` : Leaflet 1.9.4 (unpkg), `@supabase/supabase-js@2` (jsdelivr), hCaptcha
   ```
   Après :
   ```
   - CDN charges dans `index.html` : Leaflet 1.9.4 (unpkg), `@supabase/supabase-js@2.119.0` (jsdelivr), hCaptcha. Versions EXACTES + empreinte `integrity` sha384 + `crossorigin="anonymous"` (SCR-01, test rapide `CDN : versions exactes`) ; hCaptcha sans empreinte (fichier sans version). Changer de version = modifier l'URL ET recalculer l'empreinte : `curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A`, sinon le navigateur refuse le fichier et l'app retombe sur le JSON
   ```
4. **CLAUDE.md**, liste des migrations : ajouter 034 juste après 033. Avant :
   ```
   dans `docs/stories/PRIV-07.md`). AVANT d'appliquer une migration
   ```
   Après :
   ```
   dans `docs/stories/PRIV-07.md`), `034_demo_signal_flag` (NOTIF-02 : colonne generee `availability_signals.is_demo_signal` (vrai si `device_hash` commence par 'demo-'), lisible par l'API alors que `device_hash` reste illisible, exposee en derniere colonne des vues `product_availability` / `distributor_status` : la veille des favoris ignore les signaux de demo ; ne jamais ecrire `s.device_hash` dans ces vues). AVANT d'appliquer une migration
   ```
5. **BACKLOG.md** : cocher SCR-01 (`- [ ] SCR-01` → `- [x] SCR-01`).

## Tests
### Test 1 — versions exactes et empreintes (rapide)
- **Fichier** : `tests/unit/unit.test.js`, **juste après** la fin du bloc `describe('cache-busting : import map de index.html', ...)`,
  c'est-à-dire après ces lignes :
  ```js
      it('app.js est charge via l\'import map, pas via un src="js/app.js?v=" a part', () => {
          assert.doesNotMatch(html, /src="js\/app\.js/);
      });
  });
  ```
- **Code à ajouter** :
  ```js

  // ============================================
  // CDN : VERSIONS EXACTES ET EMPREINTES (SCR-01)
  // ============================================
  // Une bibliothèque en version flottante (@2) change sans commit ; une empreinte
  // sha384 garantit que le navigateur exécute le fichier testé. hCaptcha : exclu
  // (fichier sans version, une empreinte le casserait).

  describe('CDN : versions exactes et empreintes d\'integrite (SCR-01)', () => {
      const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
      const tags = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="(https:\/\/[^"]+)"[^>]*>/g)]
          .filter(m => !m[1].startsWith('https://js.hcaptcha.com/'))
          .filter(m => m[0].startsWith('<script') || /rel="stylesheet"/.test(m[0]))
          .filter(m => !m[1].startsWith('https://fonts.googleapis.com/'));

      it('index.html charge bien Leaflet et supabase-js depuis un CDN', () => {
          const urls = tags.map(m => m[1]).join('\n');
          assert.match(urls, /leaflet@/, 'Leaflet introuvable');
          assert.match(urls, /@supabase\/supabase-js@/, 'supabase-js introuvable');
      });

      it('chaque bibliotheque externe a une version exacte x.y.z', () => {
          for (const [, url] of tags) {
              assert.match(url, /@\d+\.\d+\.\d+\//, `version flottante ou absente : ${url}`);
          }
      });

      it('chaque bibliotheque externe a une empreinte sha384 et crossorigin="anonymous"', () => {
          for (const [tag, url] of tags) {
              assert.match(tag, /\bintegrity="sha384-[A-Za-z0-9+/=]{64}"/, `empreinte absente : ${url}`);
              assert.match(tag, /\bcrossorigin="anonymous"/, `crossorigin absent : ${url}`);
          }
      });
  });
  ```
- `readFileSync` est **déjà importé** en tête de `tests/unit/unit.test.js` (le bloc cache-busting s'en sert) : ne pas
  l'importer une deuxième fois.
- **Doit échouer avant la correction** : `version flottante ou absente : https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/...`
  puis `empreinte absente : https://unpkg.com/leaflet@1.9.4/dist/leaflet.css`.

## Vérification (dans l'ordre)
```bash
npm test                                    # tout vert, dont « CDN : versions exactes » et « cache-busting »
npx playwright test --project=functional -g "la carte se charge apres validation geoloc|des marqueurs sont affiches"   # vert : Leaflet et supabase-js passent l'empreinte
npm run test:functional                     # en arrière-plan (~13 min) : tout vert, instables notés dans la PR
git diff --stat                             # index.html, CLAUDE.md, BACKLOG.md, tests/unit/unit.test.js
```
Le serveur local doit répondre sur le port 8080 (`npx http-server -p 8080 -c-1`).
Si le navigateur refuse un fichier (console : `Failed to find a valid digest in the 'integrity' attribute`) :
**s'arrêter et signaler** (ne pas recalculer l'empreinte soi-même).

## Hors périmètre
- hCaptcha, Google Fonts : inchangés. Pas de changement de version de Leaflet ni de supabase-js.
- `supabase/functions/push-notify` (imports Deno) : hors périmètre.
- Aucun module de `js/` ne change : **ne pas** toucher à l'import map ni aux `?v=`.

## Pièges connus
- Les empreintes sont longues : les copier **exactement** depuis cette fiche (64 caractères après `sha384-`).
- `crossorigin="anonymous"` est obligatoire avec `integrity` sur un autre domaine, sinon le navigateur bloque le fichier.
- Dans le test, l'expression `[A-Za-z0-9+/=]{64}` : une empreinte sha384 en base64 fait exactement 64 caractères.

## Terminé quand
- [ ] Contrôles passés, test écrit (échoue avant, passe après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : non (rien de visible ne change)
- [ ] Story cochée dans BACKLOG.md, PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `fix(scripts): bibliotheques en version exacte avec empreinte d'integrite (SCR-01)`

**Corps** : constat corrigé, ce qui change (rien de visible : supabase-js figée sur la version servie aujourd'hui,
2.119.0 ; Leaflet et supabase-js vérifiés par empreinte), test ajouté (échec avant / succès après), CLAUDE.md
(changer de version, migration 034), sorties des commandes de vérification, éléments non faits.
