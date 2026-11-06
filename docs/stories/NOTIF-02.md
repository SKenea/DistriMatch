# NOTIF-02 — Alertes des favoris justes, app ouverte

- **Lot** : 5. Notifications · **Gravité** : moyen · **Niveau conseillé** : medium, **relecture par un modèle plus fort avant fusion**
  (une course entre deux traitements asynchrones + une migration SQL appliquée par Claude)
- **Prérequis** : **NOTIF-01 fusionnée** dans `master` ; partir de `master` **à jour**. Sinon : s'arrêter
  (le test de parité « app ouverte / app fermée » suppose la règle de produit suivi de NOTIF-01 dans `push-notify`).
- **Branche** : `fix/alertes-favoris-justes` · **Taille** : 5 fichiers JS (+ `index.html`) + 1 migration SQL neuve + 3 fichiers de tests.
- **Constats couverts** (rapport du 2026-10-21 ; numéros de ligne revérifiés le 2026-11-06 sur `master` b970d4d) :
  - Course : un contrôle des favoris en cours peut notifier son propre signal — `js/favorites-watch.js:45` (aujourd'hui 44-57 et 86)
  - Produits suivis : comparaison sensible aux accents, et règle différente app ouverte / app fermée — `js/notifications.js:401`
    (aujourd'hui `js/notifications.js:406` et `js/utils.js:1066` / `1105-1106`) ; **côté app seulement** : le côté
    `push-notify` (`logic.js`) est corrigé par NOTIF-01
  - Veille des favoris : l'état frais n'alimente pas les résumés, la page Favoris contredit la notification — `js/favorites-watch.js:66` (aujourd'hui 64-67)
  - Veille des favoris : un « En service » plus récent efface les notifications « produit suivi vu dispo » et « de nouveau dispo » — `js/utils.js:1038` (aujourd'hui 1103)
  - Les signaux de démo régénérés chaque nuit déclenchent des notifications in-app, alors que le push les ignore — `js/favorites-watch.js:80` (aujourd'hui 80-84)
  - Produit ajouté ou renommé après le démarrage : « produit suivi vu dispo » jamais notifié in-app — `js/favorites-watch.js:78` (aujourd'hui 77-78)
  - Aucun constat n'était déjà corrigé (revérifiés un par un sur le code actuel).

## But
App ouverte, une alerte de favori dit vrai : jamais sur son propre signal ni sur les signaux de
démo de la nuit, la page Favoris et la carte affichent le même état que l'alerte, « En service »
n'avale plus un « vu dispo », et un produit suivi est reconnu même ajouté après l'ouverture de
l'app ou écrit sans accent.

## User story
En tant que membre qui suit des distributeurs en favori, je veux que les alertes de mes favoris
app ouverte soient justes, afin de leur faire confiance.

**Critères d'acceptation**
- [ ] Mon propre signal n'est jamais notifié, même si un contrôle des favoris tourne pendant son envoi
      (réponse de la RPC avant ou après la lecture des vues).
- [ ] Un signal de démo (regénéré chaque nuit) est mémorisé sans être annoncé ; un vrai signal posé sur
      une fiche de démo est annoncé (comme `push-notify`, qui ne filtre que les signaux `demo-`).
- [ ] Après une alerte « X a été signalée vide », la page Favoris ouverte et la pastille de la carte
      disent « Vide », sans ouvrir la fiche ni recharger.
- [ ] Produit suivi vu dispo puis distributeur reconfirmé « En service » : l'alerte « vu dispo » (ou
      « de nouveau vu dispo ») part quand même.
- [ ] Produit ajouté (ou renommé) par un autre membre après l'ouverture de l'app : son « vu dispo » est
      annoncé s'il est suivi.
- [ ] « oeufs » suit « Œufs fermiers (x6) », « pate » suit « Pâté basque » ; suivre « Œufs » après
      « oeufs » n'ajoute pas un deuxième produit suivi ; même réponse que les notifications app fermée.

## Ce qui est déjà tranché (ne pas refaire l'analyse)
1. **Propre signal (course)** : deux protections, toutes deux nécessaires.
   - `pendingOwnIds` (nouvel ensemble dans `favorites-watch.js`) : `expectOwnSignal(id)` l'y met **avant**
     l'appel de la RPC (`availability.js`, `sendSignal`) ; `rememberOwnSignal(id)` l'en retire après la
     réponse ; `cancelOwnSignal(id)` l'en retire dans le `finally` (refus, erreur : plus rien à taire).
     Couvre le contrôle qui lit le signal **avant** la réponse de la RPC.
   - Au tri des lignes, le test « silencieux » regarde aussi les ensembles **en direct** (`silentIds`,
     `pendingOwnIds`) et pas seulement la copie figée `silent`. Couvre la réponse qui arrive **pendant**
     la lecture : `rememberOwnSignal` ajoute l'id à `silentIds` alors que le contrôle est en vol. On ne
     vide pas `silentIds` à cet endroit : le contrôle relancé (`rerunRequested`) le consomme.
2. **Signaux de démo : par signal, pas par fiche.** 29 des 30 fiches publiées sont des fiches de démo
   (`is_demo`, lecture anonyme du 2026-11-06) : ignorer les fiches `isDemo` couperait toute alerte de
   favori pendant les essais de Stéphane, et casserait 3 tests fonctionnels (`notifications.spec.js`,
   « 6. » et « 6bis. », qui mettent en favori `AppState.distributors[0]`). `push-notify` filtre par
   signal (`device_hash like 'demo-%'`), mais `device_hash` est illisible par l'API depuis 023. Donc :
   migration `034_demo_signal_flag.sql` (colonne générée `is_demo_signal`, lisible, exposée en fin de
   liste par les deux vues), et `diffFavoriteSignals` ignore pour les **événements** les lignes
   `is_demo_signal === true` tout en les gardant dans l'instantané. Une ligne sans la colonne (migration
   pas encore appliquée, ou tests qui simulent les vues) = vrai signal : aucun changement de comportement
   tant que Claude n'a pas appliqué la migration. L'affichage (fiche, anneaux) ne change pas.
3. **Résumés** : nouvelle fonction `mergeSummaries(statusRows, productRows, ids)` dans `summaries.js`,
   appelée par la veille juste après le contrôle d'erreur, **avant** la boucle (indépendante du cooldown,
   des heures calmes et des signaux silencieux). Une ligne déjà connue plus récente est gardée (même
   règle que `isNewer` d'`availability.js`). **Un seul** événement `distrimatch:summaries`, et **seulement
   si quelque chose a changé** (chaque événement redessine toutes les pastilles de la carte : sans ce
   garde-fou, un redessin toutes les 5 min). Pas de rechargement des résumés des autres fiches (option
   du rapport non retenue).
4. **« En service » ne masque plus un « vu dispo »** : la condition « vu dispo plus ancien que le dernier
   signal du distributeur » ne vaut que si ce signal est vide / en panne (`machineDown`), comme
   `resolveProductStatus` et `logic.js`. Le test existant « un « vu dispo » plus ancien que le dernier
   « vide » ne dit rien » reste vert.
5. **Noms de produits frais** : 3e lecture dans le `Promise.all` de la veille :
   `products` → `select('id, name, distributor_id')` filtré sur les favoris (colonnes ouvertes par 029 ;
   la règle RLS de 025 masque déjà les produits retirés ; jamais `select('*')` sur `products`). Les noms
   du chargement servent de base, les noms frais les remplacent (produit renommé) ou les complètent
   (produit ajouté). Lecture en échec = noms du chargement, le contrôle continue. `distributor.products`
   n'est **pas** modifié (la fiche n'est pas concernée).
6. **Accents** : nouvelle fonction pure `matchesFollowedProduct(productName, followedProducts)` dans
   `utils.js` = `normalizeName` (déjà là : NFD sans accents, minuscules, œ → oe, æ → ae, espaces réduits)
   des deux côtés, puis **sous-chaîne** (règle déjà voulue et testée app ouverte ; NOTIF-01 l'adopte pour
   `push-notify`). Stockage de `followedProducts` inchangé (minuscules, lisible) ; `followProduct` ne
   rajoute pas un produit dont la forme normalisée est déjà suivie. `logic.js` n'est pas touché ici.
7. **Tests DOM** : `summaries.js` émet un `CustomEvent` ; dans `dom.test.js`, le `CustomEvent` global est
   celui de Node, refusé par le `document` de jsdom (« parameter 1 is not of type 'Event' »). On expose
   celui de jsdom en tête du fichier, comme `HTMLElement`.

Le code de la fiche a été appliqué sur une copie du dépôt (`master` b970d4d) : `npm test` vert (sauf le
test de parité, qui attend NOTIF-01), les 20 tests de `tests/functional/notifications.spec.js` verts.

## Avant de coder
**Lire en entier** : `js/favorites-watch.js` (137 lignes) ; `js/summaries.js` lignes 1-55 ;
`js/utils.js` lignes 418-425 (`normalizeName`) et 1040-1117 (`diffFavoriteSignals`) ;
`js/availability.js` lignes 420-495 (`confirmWithRefresh`, `sendSignal`) ; `js/notifications.js` lignes 1-14
et 401-425 ; `supabase/020_operators.sql` lignes 228-270 ; `supabase/025_product_soft_delete.sql` lignes 236-261 ;
`tests/integration/dom.test.js` lignes 170-215 et 636-736 ; `tests/integration/db.test.js` lignes 1-56.

**Réutiliser** (ne pas réécrire) : `normalizeName` (`js/utils.js`), `notify` (`js/summaries.js`),
`checkFavoriteUpdates` / `rememberOwnSignal` (`js/favorites-watch.js`), `eventForSubscriber`
(`supabase/functions/push-notify/logic.js`, déjà importée par `unit.test.js`), `probe` / `AS_ANON` / `DEMO` /
`SKIP` (`db.test.js`), `displaySubscriptions` (déjà importée par `dom.test.js`).

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter ; un numéro de ligne
différent n'est pas un échec) :
```bash
grep -n "\[x\] NOTIF-01" BACKLOG.md                                                  # 1 ligne (NOTIF-01 fusionnée)
grep -rn "matchesFollowedProduct\|is_demo_signal\|mergeSummaries\|expectOwnSignal\|cancelOwnSignal\|pendingOwnIds" js/ tests/integration/   # aucun résultat
grep -rn "is_demo_signal" supabase/ tests/                                           # aucun résultat
grep -n "export function matchesFollowedProduct" supabase/functions/push-notify/logic.js   # 1 ligne (ajoutée par NOTIF-01)
grep -n "matchesFollowedProduct.*push-notify/logic.js" tests/unit/unit.test.js     # 1 ligne (import de NOTIF-01) : d'où l'alias du Test 1
grep -n "export function rememberOwnSignal" js/favorites-watch.js                     # 1 ligne (120)
grep -n "const silent = new Set(silentIds);" js/favorites-watch.js                    # 1 ligne (56)
grep -n "if (silent.has(id)) {" js/favorites-watch.js                                 # 1 ligne (86)
grep -nF "supabaseClient.from('product_availability').select('*').in('distributor_id', ids)" js/favorites-watch.js   # 1 ligne (62)
grep -nF "for (const p of distributor.products || []) productNames[p.id] = p.name;" js/favorites-watch.js            # 1 ligne (78)
grep -n "if (at <= snapshot.machineAt) continue;" js/utils.js                         # 1 ligne (1103)
grep -nF "const followed = (options.followedProducts || []).map(p => String(p).toLowerCase().trim()).filter(Boolean);" js/utils.js   # 1 ligne (1066)
grep -nF "if (name && followed.some(f => lower.includes(f))) {" js/utils.js           # 1 ligne (1106)
grep -n "export function normalizeName" js/utils.js                                   # 1 ligne (419)
grep -n "export function setSummaryFor" js/summaries.js                               # 1 ligne (30)
grep -n "import { rememberOwnSignal } from './favorites-watch.js';" js/availability.js   # 1 ligne (25)
grep -n "rememberOwnSignal(distributor.id);" js/availability.js                       # 1 ligne (486)
grep -n "    } finally {" js/availability.js                                          # 1 ligne (490)
grep -n "const normalized = productName.toLowerCase().trim();" js/notifications.js    # 2 lignes (406 followProduct, 417 unfollowProduct)
grep -n "saveNotificationPrefs, saveNotificationQueue" js/notifications.js            # 1 ligne (8)
grep -n "create or replace view product_availability\|create or replace view distributor_status" supabase/*.sql
#   exactement 3 lignes : 020_operators.sql:233, 020_operators.sql:252, 025_product_soft_delete.sql:242
ls supabase | grep -E "^0[0-9][0-9]_" | tail -1                                       # 033_account_deletion.sql (voir Pièges si 034_*)
grep -n "Object.defineProperty(globalThis, 'HTMLElement'" tests/integration/dom.test.js   # 1 ligne (177)
grep -c "CustomEvent" tests/integration/dom.test.js                                   # 0
grep -o '"./js/app.js": "./js/app.js?v=[0-9]*"' index.html                            # noter V (123 le 2026-11-06)
```

## Étapes

1. **js/utils.js** — test de produit suivi, juste après `normalizeName`. Avant :
   ```js
           .replace(/\s+/g, ' ').trim();
   }

   // Machines ajoutees localement qui doublonnent une machine de la base : meme
   ```
   Après :
   ```js
           .replace(/\s+/g, ' ').trim();
   }

   // Produit suivi (NOTIF-02) : nom compare sans casse, accents ni ligature, et partiel
   // (« oeufs » suit « Œufs fermiers (x6) »). Meme regle que push-notify (NOTIF-01).
   export function matchesFollowedProduct(productName, followedProducts) {
       const name = normalizeName(productName);
       if (!name) return false;
       return (followedProducts || []).some((followed) => {
           const key = normalizeName(followed);
           return key !== '' && name.includes(key);
       });
   }

   // Machines ajoutees localement qui doublonnent une machine de la base : meme
   ```

2. **js/utils.js** — commentaire de `diffFavoriteSignals` (options). Avant :
   ```js
   //   options  : { now, followedProducts: ['pain', ...] (minuscules), productNames: { [productId]: nom } }
   ```
   Après :
   ```js
   //   options  : { now, followedProducts: ['pain', ...] (compares par matchesFollowedProduct), productNames: { [productId]: nom } }
   ```

3. **js/utils.js** — `diffFavoriteSignals`, début. Avant :
   ```js
   // Premier passage (previous absent) : on memorise sans rien notifier. Un signal
   // de plus de 24 h ne notifie pas.
   export function diffFavoriteSignals(previous, current, options = {}) {
       const now = options.now ?? Date.now();
       const followed = (options.followedProducts || []).map(p => String(p).toLowerCase().trim()).filter(Boolean);
   ```
   Après :
   ```js
   // Premier passage (previous absent) : on memorise sans rien notifier. Un signal
   // de plus de 24 h ne notifie pas. Un signal de demo (is_demo_signal, NOTIF-02) est
   // memorise sans etre annonce, comme dans push-notify.
   export function diffFavoriteSignals(previous, current, options = {}) {
       const now = options.now ?? Date.now();
       const followed = options.followedProducts || [];
   ```

4. **js/utils.js** — `diffFavoriteSignals`, état du distributeur. Avant :
   ```js
       const machineWasDown = (previous.machineState === 'empty' || previous.machineState === 'broken') && !alreadyBack;

       if (machine && snapshot.machineAt > (previous.machineAt || 0) && isFresh(snapshot.machineAt)) {
   ```
   Après :
   ```js
       const machineWasDown = (previous.machineState === 'empty' || previous.machineState === 'broken') && !alreadyBack;
       const machineDown = !!machine && (machine.state === 'empty' || machine.state === 'broken');

       if (machine && !machine.is_demo_signal && snapshot.machineAt > (previous.machineAt || 0) && isFresh(snapshot.machineAt)) {
   ```

5. **js/utils.js** — `diffFavoriteSignals`, boucle des produits. Avant :
   ```js
           if (row.state !== 'available' || at <= (seen?.at || 0) || !isFresh(at)) continue;
           // Un "vu dispo" plus ancien que le dernier "vide / en panne" ne dit rien
           if (at <= snapshot.machineAt) continue;
           const name = productNames[row.product_id] || '';
           const lower = name.toLowerCase();
           if (name && followed.some(f => lower.includes(f))) {
   ```
   Après :
   ```js
           if (row.state !== 'available' || row.is_demo_signal || at <= (seen?.at || 0) || !isFresh(at)) continue;
           // Un "vu dispo" plus ancien que le dernier "vide / en panne" ne dit rien
           // (NOTIF-02 : un "en service" plus recent, lui, ne l'efface pas)
           if (machineDown && at <= snapshot.machineAt) continue;
           const name = productNames[row.product_id] || '';
           if (name && matchesFollowedProduct(name, followed)) {
   ```

6. **js/summaries.js** — fusion de l'état frais, juste après `setSummaryFor`. Avant :
   ```js
       raw.set(distributorId, { status: status || null, products: { ...(products || {}) } });
       notify([distributorId]);
   }
   ```
   Après :
   ```js
       raw.set(distributorId, { status: status || null, products: { ...(products || {}) } });
       notify([distributorId]);
   }

   function isNewerRow(a, b) {
       return new Date(a.created_at).getTime() > new Date(b.created_at).getTime();
   }

   function summaryKey(entry) {
       const s = entry.status;
       const products = Object.keys(entry.products).sort()
           .map(id => `${id}:${entry.products[id].state}@${entry.products[id].created_at}@${entry.products[id].source}`);
       return `${s ? `${s.state}@${s.created_at}@${s.source}` : ''}|${products.join(',')}`;
   }

   // Veille des favoris (NOTIF-02) : etat frais de quelques fiches (lignes des vues
   // distributor_status / product_availability). Une ligne deja connue plus recente
   // (signal envoye, vue en retard) est gardee. Un seul evenement, et seulement si
   // quelque chose a change (chaque evenement redessine toutes les pastilles).
   export function mergeSummaries(statusRows, productRows, ids) {
       const changed = [];
       for (const id of ids || []) {
           const before = raw.get(id) || { status: null, products: {} };
           let status = (statusRows || []).find(row => row.distributor_id === id) || null;
           if (before.status && (!status || isNewerRow(before.status, status))) status = before.status;
           const products = { ...before.products };
           for (const row of productRows || []) {
               if (row.distributor_id !== id) continue;
               const known = products[row.product_id];
               if (!known || !isNewerRow(known, row)) products[row.product_id] = row;
           }
           const next = { status, products };
           if (summaryKey(next) === summaryKey(before)) continue;
           raw.set(id, next);
           changed.push(id);
       }
       if (changed.length > 0) notify(changed);
   }
   ```

7. **js/favorites-watch.js** — import. Avant :
   ```js
   import { canNotify, notifyFavoriteEvent } from './notifications.js';
   ```
   Après :
   ```js
   import { canNotify, notifyFavoriteEvent } from './notifications.js';
   import { mergeSummaries } from './summaries.js';
   ```

8. **js/favorites-watch.js** — ensemble des envois en cours. Avant :
   ```js
   const silentIds = new Set();
   ```
   Après :
   ```js
   const silentIds = new Set();
   // Machines ou un signal de l'utilisateur est en cours d'envoi (NOTIF-02) : un
   // controle deja parti peut lire ce signal avant la reponse de la RPC.
   const pendingOwnIds = new Set();
   ```

9. **js/favorites-watch.js** — lectures, résumés, noms frais. Avant :
   ```js
           const [statusRes, productsRes] = await Promise.all([
               supabaseClient.from('distributor_status').select('*').in('distributor_id', ids),
               supabaseClient.from('product_availability').select('*').in('distributor_id', ids)
           ]);
           if (statusRes.error || productsRes.error) return sent;
   ```
   Après :
   ```js
           const [statusRes, productsRes, namesRes] = await Promise.all([
               supabaseClient.from('distributor_status').select('*').in('distributor_id', ids),
               supabaseClient.from('product_availability').select('*').in('distributor_id', ids),
               supabaseClient.from('products').select('id, name, distributor_id').in('distributor_id', ids)
           ]);
           if (statusRes.error || productsRes.error) return sent;
           // NOTIF-02 : la page Favoris et la carte suivent l'etat lu ici
           mergeSummaries(statusRes.data, productsRes.data, ids);
           // NOTIF-02 : noms relus a chaque controle (produit ajoute ou renomme depuis
           // l'ouverture) ; lecture en echec = noms du chargement
           const freshNames = {};
           for (const p of (namesRes.error ? [] : namesRes.data) || []) {
               (freshNames[p.distributor_id] = freshNames[p.distributor_id] || {})[p.id] = p.name;
           }
   ```

10. **js/favorites-watch.js** — noms utilisés pour la comparaison. Avant :
    ```js
                for (const p of distributor.products || []) productNames[p.id] = p.name;
    ```
    Après :
    ```js
                for (const p of distributor.products || []) productNames[p.id] = p.name;
                Object.assign(productNames, freshNames[id]);
    ```

11. **js/favorites-watch.js** — test « silencieux » en direct. Avant :
    ```js
                // Signal envoye par l'utilisateur lui-meme : on memorise, sans notifier
                if (silent.has(id)) {
    ```
    Après :
    ```js
                // Signal envoye par l'utilisateur lui-meme : on memorise, sans notifier.
                // NOTIF-02 : aussi s'il a ete envoye pendant ce controle (ensembles en direct)
                if (silent.has(id) || silentIds.has(id) || pendingOwnIds.has(id)) {
    ```

12. **js/favorites-watch.js** — `rememberOwnSignal` et deux nouvelles fonctions. Avant :
    ```js
    export function rememberOwnSignal(distributorId) {
        if (!AppState.subscriptions.includes(distributorId)) return;
        checkFavoriteUpdates({ silentIds: [distributorId] });
    }
    ```
    Après :
    ```js
    export function rememberOwnSignal(distributorId) {
        pendingOwnIds.delete(distributorId);
        if (!AppState.subscriptions.includes(distributorId)) return;
        checkFavoriteUpdates({ silentIds: [distributorId] });
    }

    // Avant l'envoi d'un signal (NOTIF-02) : tant que la RPC n'a pas repondu, un
    // controle qui lit deja ce signal le memorise sans notifier.
    export function expectOwnSignal(distributorId) {
        if (distributorId) pendingOwnIds.add(distributorId);
    }

    // Envoi termine sans rememberOwnSignal (refus, erreur) : plus rien a taire.
    export function cancelOwnSignal(distributorId) {
        pendingOwnIds.delete(distributorId);
    }
    ```

13. **js/availability.js** — import. Avant :
    ```js
    import { rememberOwnSignal } from './favorites-watch.js';
    ```
    Après :
    ```js
    import { rememberOwnSignal, expectOwnSignal, cancelOwnSignal } from './favorites-watch.js';
    ```

14. **js/availability.js**, `sendSignal` — annoncer l'envoi. Avant :
    ```js
        isSending = true;
        setBusy(true);
        try {
            const { data, error, status } = await confirmWithRefresh(payload);
    ```
    Après :
    ```js
        isSending = true;
        setBusy(true);
        expectOwnSignal(distributor.id);   // NOTIF-02 : jamais notifie de son propre signal
        try {
            const { data, error, status } = await confirmWithRefresh(payload);
    ```

15. **js/availability.js**, `sendSignal` — fin d'envoi. Avant :
    ```js
        } finally {
            isSending = false;
            setBusy(false);
        }
    }

    function setBusy(busy) {
    ```
    Après :
    ```js
        } finally {
            isSending = false;
            setBusy(false);
            cancelOwnSignal(distributor.id);   // apres rememberOwnSignal : sans effet
        }
    }

    function setBusy(busy) {
    ```

16. **js/notifications.js** — import. Avant :
    ```js
        calculateDistance, escapeHTML, showToast, timeAgo,
        saveNotificationPrefs, saveNotificationQueue
    } from './utils.js';
    ```
    Après :
    ```js
        calculateDistance, escapeHTML, showToast, timeAgo,
        saveNotificationPrefs, saveNotificationQueue, normalizeName
    } from './utils.js';
    ```

17. **js/notifications.js**, `followProduct` — pas de doublon à un accent près. Avant :
    ```js
    export function followProduct(productName) {
        const normalized = productName.toLowerCase().trim();
        if (!NotificationPrefs.followedProducts.includes(normalized)) {
    ```
    Après :
    ```js
    export function followProduct(productName) {
        const normalized = productName.toLowerCase().trim();
        // NOTIF-02 : « oeufs » et « Œufs » sont le meme produit suivi
        if (!NotificationPrefs.followedProducts.some(p => normalizeName(p) === normalizeName(normalized))) {
    ```
    (`unfollowProduct` ne change pas.)

18. **supabase/034_demo_signal_flag.sql** — nouveau fichier, contenu complet (fins de ligne CRLF comme les
    autres migrations si l'outil le permet ; sinon LF, ce n'est pas bloquant pour du SQL). Les deux vues sont
    la reprise **exacte** de 025 (`product_availability`) et 020 (`distributor_status`), seule la ligne
    `s.is_demo_signal` est ajoutée en fin de liste :
    ```sql
    -- ============================================================================
    -- 034 : signaux de demo reconnaissables par l'app (NOTIF-02)
    -- ============================================================================
    -- Revue du 2026-10-21. La veille des favoris (app ouverte, js/favorites-watch.js)
    -- annoncait les signaux de demo regeneres chaque nuit (017) : « ... de nouveau vu
    -- dispo », alors que push-notify les ignore (device_hash 'demo-%', 024). Depuis
    -- 023, l'API ne lit plus device_hash : l'app ne pouvait pas les reconnaitre.
    -- Apres :
    --   1. Colonne generee availability_signals.is_demo_signal (vrai si device_hash
    --      commence par 'demo-'), lisible par l'API. device_hash reste illisible.
    --   2. Les vues product_availability (reprise exacte de 025) et distributor_status
    --      (reprise exacte de 020) l'exposent en DERNIERE colonne (create or replace
    --      view n'accepte un ajout qu'en fin de liste ; droits des vues inchanges).
    -- Ne jamais ecrire s.device_hash dans ces vues : security_invoker, anon ne lit
    -- pas cette colonne, les vues echoueraient pour tous les visiteurs.
    -- Idempotente, en une seule transaction. Execution (Claude, apres relecture ;
    -- d'abord avec « rollback; » a la place du « commit; » final) :
    --   node scripts/supabase-sql.mjs supabase/034_demo_signal_flag.sql
    -- ============================================================================

    begin;

    alter table availability_signals
      add column if not exists is_demo_signal boolean
      generated always as (coalesce(device_hash, '') like 'demo-%') stored;

    grant select (is_demo_signal) on availability_signals to anon, authenticated;

    create or replace view product_availability with (security_invoker = true) as
    with latest as (
      select distinct on (distributor_id, product_id) id, distributor_id, product_id, state, source, created_at
      from availability_signals where product_id is not null
      order by distributor_id, product_id, created_at desc
    ), owner_latest as (
      select distinct on (distributor_id, product_id) id, distributor_id, product_id, state, created_at
      from availability_signals where product_id is not null and source = 'owner'
      order by distributor_id, product_id, created_at desc
    )
    select s.distributor_id, s.product_id, s.state, s.source, s.weight, s.created_at,
           (extract(epoch from (now() - s.created_at)))::bigint as age_seconds,
           s.is_demo_signal
    from latest l
    left join owner_latest o on o.distributor_id = l.distributor_id and o.product_id = l.product_id
    join availability_signals s on s.id = case
      when o.id is not null and l.source <> 'owner' and o.state <> l.state
           and l.created_at - o.created_at <= interval '30 minutes' then o.id
      else l.id end
    where exists (select 1 from products p where p.id = l.product_id and p.removed_at is null);

    create or replace view distributor_status with (security_invoker = true) as
    with latest as (
      select distinct on (distributor_id) id, distributor_id, state, source, created_at
      from availability_signals where product_id is null
      order by distributor_id, created_at desc
    ), owner_latest as (
      select distinct on (distributor_id) id, distributor_id, state, created_at
      from availability_signals where product_id is null and source = 'owner'
      order by distributor_id, created_at desc
    )
    select s.distributor_id, s.state, s.source, s.weight, s.created_at,
           (extract(epoch from (now() - s.created_at)))::bigint as age_seconds,
           s.is_demo_signal
    from latest l
    left join owner_latest o on o.distributor_id = l.distributor_id
    join availability_signals s on s.id = case
      when o.id is not null and l.source <> 'owner' and o.state <> l.state
           and l.created_at - o.created_at <= interval '30 minutes' then o.id
      else l.id end;

    commit;

    -- Controle (postgres) :
    -- select is_demo_signal, count(*) from availability_signals group by 1;
    -- select distributor_id, state, is_demo_signal from distributor_status limit 5;
    ```

19. **index.html** — cinq modules de `js/` changent : monter le `?v=` de **toutes** les entrées de l'import
    map à la même valeur V+1. Aucun CSS ne change.

## Tests

### Test 1 — règles pures (unitaire)
- **Fichier** : `tests/unit/unit.test.js`, **à la toute fin du fichier** (après sa dernière ligne `});`).
- **Code à ajouter** :
  ```js

  // ============================================
  // ALERTES DES FAVORIS JUSTES, APP OUVERTE (NOTIF-02)
  // ============================================
  // Alias : NOTIF-01 importe deja matchesFollowedProduct depuis push-notify/logic.js
  import { matchesFollowedProduct as matchesFollowedProductApp } from '../../js/utils.js';

  describe('NOTIF-02 : alertes des favoris app ouverte', () => {
      const NOW = Date.parse('2026-09-21T12:00:00Z');
      const at = (minutesAgo) => new Date(NOW - minutesAgo * 60000).toISOString();
      const ts = (minutesAgo) => NOW - minutesAgo * 60000;
      const machine = (state, minutesAgo) => ({ state, created_at: at(minutesAgo) });
      const product = (id, state, minutesAgo) => ({ product_id: id, state, created_at: at(minutesAgo) });
      const names = { 1: 'Baguette tradition', 2: 'Œufs fermiers (x6)' };

      it('« En service » plus recent n’efface pas « de nouveau dispo » ni « produit suivi vu dispo »', () => {
          const seen = { machineState: 'working', machineAt: ts(160), products: { 1: { state: 'absent', at: ts(300) } } };
          const current = { machine: machine('working', 20), products: [product(1, 'available', 40)] };
          assert.deepEqual(diffFavoriteSignals(seen, current, { now: NOW, productNames: names }).event,
              { type: 'restock', at: ts(40), product: 'Baguette tradition' });
          assert.deepEqual(diffFavoriteSignals(seen, current, { now: NOW, productNames: names, followedProducts: ['baguette'] }).event,
              { type: 'stock', at: ts(40), product: 'Baguette tradition' });
      });

      it('produit suivi : accents, ligature et casse ignores, nom partiel accepte', () => {
          assert.equal(matchesFollowedProductApp('Œufs', ['oeufs']), true);
          assert.equal(matchesFollowedProductApp('Oeufs fermiers (x6)', ['œufs']), true);
          assert.equal(matchesFollowedProductApp('Pizza Margherita', ['pizza']), true);
          assert.equal(matchesFollowedProductApp('Baguette tradition', [' BAGUETTE ']), true);
          assert.equal(matchesFollowedProductApp('Pâté basque', ['pate']), true);
          assert.equal(matchesFollowedProductApp('Œufs', ['pain']), false);
          assert.equal(matchesFollowedProductApp('', ['pain']), false);
          assert.equal(matchesFollowedProductApp('Pain', ['', '  ']), false);
          const current = { machine: null, products: [product(2, 'available', 5)] };
          assert.deepEqual(diffFavoriteSignals({ machineState: null, machineAt: 0, products: {} }, current, { now: NOW, productNames: names, followedProducts: ['oeufs'] }).event,
              { type: 'stock', at: ts(5), product: 'Œufs fermiers (x6)' });
      });

      it('produit suivi : meme reponse app ouverte et app fermee (push-notify, NOTIF-01)', () => {
          const cases = [['Œufs', 'oeufs'], ['Oeufs fermiers (x6)', 'œufs'], ['Pizza Margherita', 'pizza'],
              ['Baguette tradition', 'BAGUETTE'], ['Pâté basque', 'pate'], ['Œufs', 'pain']];
          for (const [name, followed] of cases) {
              const push = eventForSubscriber({ type: 'available' }, name, [followed]) !== null;
              assert.equal(matchesFollowedProductApp(name, [followed]), push, `${name} / ${followed}`);
          }
      });

      it('signal de demo : memorise, jamais annonce (comme push-notify)', () => {
          const seen = { machineState: 'working', machineAt: ts(600), products: { 1: { state: 'absent', at: ts(600) } } };
          const demoMachine = { ...machine('empty', 10), is_demo_signal: true };
          const demoProduct = { ...product(1, 'available', 5), is_demo_signal: true };
          const { event, snapshot } = diffFavoriteSignals(seen, { machine: demoMachine, products: [demoProduct] },
              { now: NOW, productNames: names, followedProducts: ['baguette'] });
          assert.equal(event, null);
          assert.deepEqual(snapshot, { machineState: 'empty', machineAt: ts(10), products: { 1: { state: 'available', at: ts(5) } } });
          // Un vrai signal (is_demo_signal faux ou absent) notifie toujours
          assert.equal(diffFavoriteSignals(seen, { machine: { ...machine('empty', 10), is_demo_signal: false }, products: [] }, { now: NOW }).event.type, 'empty');
      });
  });
  ```
- `diffFavoriteSignals` et `eventForSubscriber` sont déjà importés plus haut dans le fichier (un `import`
  en milieu de fichier est remonté par JavaScript, comme celui d'EPIC-T25). `matchesFollowedProduct` y est
  **déjà** importé depuis `logic.js` par NOTIF-01 : la version de l'app est donc importée sous l'alias
  `matchesFollowedProductApp` (sans alias : « Identifier 'matchesFollowedProduct' has already been declared »).
- **Doit échouer avant la correction** : tout le fichier s'arrête sur
  `SyntaxError: The requested module '../../js/utils.js' does not provide an export named 'matchesFollowedProduct'`
  (raison attendue). Après les étapes 1-5 : les 4 tests passent (vérifié avec le `logic.js` de la fiche
  NOTIF-01). Si **seul** « meme reponse app ouverte et app fermee » échoue : NOTIF-01 n'a pas aligné
  `eventForSubscriber` (sans accents, sous-chaîne) ; s'arrêter et le signaler, ne pas toucher `logic.js`.

### Test 2 — veille des favoris (intégration DOM, jsdom)
- **Fichier** : `tests/integration/dom.test.js`, deux ajouts.
- **Ajout a**, juste **après** la ligne `Object.defineProperty(globalThis, 'HTMLElement', ...` (ligne 177) :
  ```js
  // Evenements de la page (distrimatch:summaries...) : ceux de jsdom, pas ceux de Node (NOTIF-02)
  Object.defineProperty(globalThis, 'CustomEvent', { value: dom.window.CustomEvent, writable: true, configurable: true });
  ```
- **Ajout b**, **à la toute fin du fichier** (après sa dernière ligne `});`) :
  ```js

  // ============================================
  // ALERTES DES FAVORIS JUSTES, APP OUVERTE (NOTIF-02)
  // ============================================
  const { rememberOwnSignal, expectOwnSignal } = await import('../../js/favorites-watch.js');
  const { getDistributorSummary } = await import('../../js/summaries.js');
  const { followProduct } = await import('../../js/notifications.js');

  describe('Veille des favoris : alertes justes (NOTIF-02)', () => {
      let tables;
      let gate = null;   // promesse liberee a la main : un controle « en vol »
      const read = (table) => (gate || Promise.resolve()).then(() => ({ data: tables[table] || [], error: null }));
      const fakeClient = { from(table) { return { select() { return { in() { return read(table); } }; } }; } };
      const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();
      const tick = () => new Promise(r => setTimeout(r, 0));

      after(() => {
          setSupabaseClient(null);
          AppState.subscriptions = [];
          document.getElementById('subscriptions-view').classList.remove('view-active');
      });

      beforeEach(() => {
          tables = { distributor_status: [], product_availability: [], products: [] };
          gate = null;
          setSupabaseClient(fakeClient);
          AppState.subscriptions = ['dist-fav'];
          AppState.distributors = [
              { id: 'dist-fav', name: 'Pain du Coin', type: 'bakery', emoji: '🥖', address: 'Addr', products: [{ id: 7, name: 'Baguette', price: 1, available: true }] }
          ];
          AppState.typeConfig = { bakery: { label: 'Boulangerie', gradient: '' } };
          NotificationPrefs.enabled = true;
          NotificationPrefs.quietHours.enabled = false;
          NotificationPrefs.followedProducts = [];
          NotificationPrefs.lastNotifications = {};
          NotificationPrefs.lastSeenSignals = {};
          NotificationQueue.pending = [];
          NotificationQueue.history = [];
      });

      it('mon signal arrive pendant un controle deja parti : jamais notifie', async () => {
          await checkFavoriteUpdates();   // 1er passage : etat memorise
          let release;
          gate = new Promise(r => { release = r; });
          const running = checkFavoriteUpdates();   // controle parti avant la reponse de la RPC
          tables.distributor_status = [{ distributor_id: 'dist-fav', state: 'empty', created_at: minutesAgo(0) }];
          rememberOwnSignal('dist-fav');            // la reponse arrive pendant la lecture
          release();
          await running;
          gate = null;
          await tick();
          assert.equal(NotificationQueue.history.length, 0);
          assert.equal(NotificationPrefs.lastSeenSignals['dist-fav'].machineState, 'empty');
      });

      it('mon signal lu par un controle avant la reponse de la RPC : jamais notifie', async () => {
          await checkFavoriteUpdates();
          expectOwnSignal('dist-fav');              // l'envoi commence
          tables.distributor_status = [{ distributor_id: 'dist-fav', state: 'broken', created_at: minutesAgo(0) }];
          await checkFavoriteUpdates();             // la base a deja le signal, la RPC n'a pas repondu
          rememberOwnSignal('dist-fav');            // la reponse arrive ensuite
          await tick();
          assert.equal(NotificationQueue.history.length, 0);
          assert.equal(NotificationPrefs.lastSeenSignals['dist-fav'].machineState, 'broken');
          // Le signal suivant, d'un autre membre, notifie de nouveau
          tables.distributor_status = [{ distributor_id: 'dist-fav', state: 'empty', created_at: new Date(Date.now() + 1000).toISOString() }];
          await checkFavoriteUpdates();
          assert.equal(NotificationQueue.history.length, 1);
      });

      it('la page Favoris ouverte dit la meme chose que la notification', async () => {
          document.getElementById('subscriptions-view').classList.add('view-active');
          displaySubscriptions();
          await checkFavoriteUpdates();
          tables.distributor_status = [{ distributor_id: 'dist-fav', state: 'empty', created_at: new Date(Date.now() + 2000).toISOString() }];
          await checkFavoriteUpdates();
          assert.equal(NotificationQueue.history[0].type, 'empty');
          assert.equal(getDistributorSummary(AppState.distributors[0]).state, 'empty');
          assert.match(document.querySelector('#subscriptions-list .side-panel-item-state').textContent, /Vide/);
          document.getElementById('subscriptions-view').classList.remove('view-active');
      });

      it('produit ajoute par un autre membre apres l’ouverture, suivi sans accent : « vu dispo »', async () => {
          NotificationPrefs.followedProducts = ['oeufs'];
          tables.products = [
              { id: 7, name: 'Baguette', distributor_id: 'dist-fav' },
              { id: 8, name: 'Œufs fermiers (x6)', distributor_id: 'dist-fav' }
          ];
          await checkFavoriteUpdates();
          tables.product_availability = [{ distributor_id: 'dist-fav', product_id: 8, state: 'available', created_at: minutesAgo(2) }];
          await checkFavoriteUpdates();
          assert.equal(NotificationQueue.history.length, 1);
          assert.equal(NotificationQueue.history[0].type, 'stock');
          assert.match(NotificationQueue.history[0].message, /Œufs fermiers \(x6\) vu dispo chez Pain du Coin/);
      });

      it('suivre « Œufs » apres « oeufs » : un seul produit suivi', () => {
          followProduct('oeufs');
          followProduct('Œufs');
          assert.deepEqual(NotificationPrefs.followedProducts, ['oeufs']);
      });
  });
  ```
- Les dates « dans le futur » (+1 s, +2 s) sont voulues : les résumés (`summaries.js`) sont partagés par
  tout le fichier de tests et gardent une ligne plus récente ; une date future passe toujours devant.
- **Doit échouer avant la correction** (ajouts a et b écrits, étapes pas encore appliquées) : 5 échecs dans
  « Veille des favoris : alertes justes (NOTIF-02) », tous les autres tests verts :
  1. `history.length` vaut 1 au lieu de 0 (le contrôle en vol notifie le propre signal) ;
  2. `TypeError: expectOwnSignal is not a function` ;
  3. `getDistributorSummary(...).state` vaut `'unknown'` au lieu de `'empty'` ;
  4. `history.length` vaut 0 au lieu de 1 (nom du produit 8 inconnu) ;
  5. `followedProducts` vaut `['oeufs', 'œufs']`.

### Test 3 — base (intégration, vraie base, transactions annulées)
- **Fichier** : `tests/integration/db.test.js`, **à la toute fin du fichier** (après sa dernière ligne `});`).
- **Code à ajouter** :
  ```js

  // ============================================
  // SIGNAUX DE DEMO RECONNAISSABLES PAR L'APP (NOTIF-02, migration 034)
  // ============================================
  describe('base : signaux de demo reconnaissables sans device_hash (NOTIF-02, 034)', { skip: SKIP }, () => {
      const lastStatus = `select state || ':' || is_demo_signal::text into r from distributor_status where distributor_id = '${DEMO}'`;
      const insert = (hash) => `insert into availability_signals (distributor_id, product_id, state, source, weight, device_hash, created_at) values ('${DEMO}', null, 'broken', 'user', 0.8, '${hash}', now() + interval '1 minute')`;

      it('un visiteur lit is_demo_signal : vrai pour un signal de demo, faux pour un vrai signal', async () => {
          const demo = await probe(`${insert('demo-itest')}; ${AS_ANON} ${lastStatus}`);
          assert.ok(demo.reachedEnd, demo.message);
          assert.equal(demo.result, 'broken:true');
          const real = await probe(`${insert('account')}; ${AS_ANON} ${lastStatus}`);
          assert.ok(real.reachedEnd, real.message);
          assert.equal(real.result, 'broken:false');
      });

      it('product_availability expose aussi is_demo_signal a un visiteur', async () => {
          const p = await probe(`${AS_ANON} select count(*)::text into r from product_availability where is_demo_signal is not null`);
          assert.ok(p.reachedEnd, p.message);
      });

      it('device_hash reste illisible par l’API (42501)', async () => {
          const p = await probe(`${AS_ANON} select device_hash into r from availability_signals limit 1`);
          assert.equal(p.reachedEnd, false);
          assert.equal(p.code, '42501');
      });
  });
  ```
- **Doit échouer avant la correction** : la migration n'est **pas** appliquée par l'exécutant (c'est Claude,
  modèle principal, qui l'applique après relecture). Donc au moment de la PR, les deux premiers tests échouent
  (colonne `is_demo_signal` inexistante, code 42703) ; le troisième (garde-fou) passe déjà. Ces 2 échecs sont
  **attendus** : ne pas « corriger » les tests. Lancer ce fichier **restreint**, une seule fois (l'API de
  gestion limite le débit) : `node --test --test-name-pattern="NOTIF-02" tests/integration/db.test.js`.

## Vérification (dans l'ordre)
```bash
node --check js/utils.js && node --check js/summaries.js && node --check js/favorites-watch.js && node --check js/availability.js && node --check js/notifications.js   # aucune sortie
grep -rn "is_demo_signal" js/                       # 3 lignes, toutes dans js/utils.js (diffFavoriteSignals : 1 commentaire + 2 tests)
grep -rn "from('products').select(" js/favorites-watch.js   # 1 ligne : 'id, name, distributor_id'
npm test                                            # tout vert, dont « NOTIF-02 » (unitaire et DOM), « cache-busting » et « colonnes lues par l’app »
node --test --test-name-pattern="NOTIF-02" tests/integration/db.test.js
#   attendu AVANT application de la migration par Claude : 2 échecs (42703), le garde-fou 42501 vert
npx playwright test --project=functional tests/functional/notifications.spec.js   # 20 passed
npx playwright test --project=functional -g "signal|Signal|favori|Favori"          # 47 tests, tout vert
npm run test:functional                             # en arrière-plan (~10 min) : tout vert, instables notés dans la PR
git diff --stat                                     # 5 js/, index.html, 3 tests (+ BACKLOG.md) ; + supabase/034_demo_signal_flag.sql (nouveau)
```

## Après la PR — réservé à Claude (modèle principal), JAMAIS à l'exécutant
1. Relire la PR (course `pendingOwnIds` / `silentIds`, `mergeSummaries`, SQL).
2. Essayer la migration avec `rollback;` à la place du `commit;` final, puis l'appliquer :
   `node scripts/supabase-sql.mjs supabase/034_demo_signal_flag.sql`.
3. `node --test --test-name-pattern="NOTIF-02" tests/integration/db.test.js` : 3 verts.
4. Vérifier qu'un visiteur lit toujours les vues (incident du 2026-10-02) :
   `node --test --test-name-pattern="visiteur" tests/integration/db.test.js`, puis fusionner, puis `npm run test:e2e`.
5. Mettre à jour la liste des migrations de `CLAUDE.md` (034) dans un commit séparé.

## Hors périmètre
- `supabase/functions/push-notify/*` (règle du produit suivi côté app fermée : NOTIF-01, avec sa propre copie
  `followKey` / `matchesFollowedProduct` ; ne pas la « partager » avec `js/utils.js`, ne pas redéployer).
- Cooldown d'1 h partagé avec la proximité, doublon push + veille, deux onglets (NOTIF-03) ; proximité et
  heures calmes (NOTIF-04) ; abonnement app fermée (NOTIF-05) ; textes « fonctionne de nouveau », « Machine »,
  « retire » sans accent (NOTIF-06) ; affichage des notifications (NOTIF-07).
- Rafraîchir les résumés des fiches qui ne sont **pas** en favori (option du rapport non retenue).
- Mettre à jour `distributor.products` avec les noms frais (la fiche n'est pas concernée).
- Ignorer les fiches `isDemo` (non retenu, voir « Ce qui est déjà tranché » n° 2).
- Appliquer la migration, `scripts/supabase-sql.mjs`, `scripts/deploy-push.mjs`, `CLAUDE.md` : Claude seul.

## Pièges connus
- **Ne jamais exécuter de SQL** sur la vraie base : `db.test.js` seul (transactions annulées), restreint par
  `--test-name-pattern="NOTIF-02"`.
- **Numéro de migration** : si `ls supabase` montre déjà un `034_*.sql` (ajouté par NOTIF-01), prendre `035`
  et remplacer `034` partout dans cette fiche (nom du fichier, en-tête SQL, titre du `describe` de `db.test.js`).
  Si une migration postérieure à 025 redéfinit déjà `product_availability` ou `distributor_status` (contrôle des
  3 lignes en échec) : s'arrêter, la reprise « exacte » des vues serait fausse.
- Dans les vues, `s.is_demo_signal` va **après** `age_seconds` (fin de liste), avec la virgule ajoutée à la
  ligne d'`age_seconds`. Ne jamais y écrire `device_hash`.
- Étape 11 : ne **pas** vider `silentIds` dans la boucle ; le contrôle relancé s'en charge. Ne pas déplacer
  `const silent = new Set(silentIds); silentIds.clear();`.
- Étape 9 : la lecture `products` ne doit pas faire échouer le contrôle (`namesRes.error` = repli) ; ne pas
  l'ajouter à la condition `if (statusRes.error || productsRes.error)`. Colonnes listées, jamais `'*'`
  (test « colonnes lues par l’app »).
- Étape 6 : `notify` n'est appelé qu'une fois par contrôle, et pas du tout si rien n'a changé.
- Étape 17 : `normalizeName` doit être ajouté à l'import de l'étape 16, sinon `ReferenceError` au premier suivi.
- `dom.test.js` : sans l'ajout a (`CustomEvent` de jsdom), la veille échoue en silence (« Veille des favoris
  indisponible : ... parameter 1 is not of type 'Event' ») et les tests existants « checkFavoriteUpdates »
  cassent après l'étape 9.
- **Stories voisines** : les extraits « Avant » des étapes 9 à 12 (`js/favorites-watch.js`) et 16-17
  (`js/notifications.js`, import de `utils.js` et `followProduct`) sont aussi dans le périmètre de NOTIF-03
  (cooldown ligne 92, instances), NOTIF-04 et NOTIF-06 (`notifications.js`) ; NOTIF-01 couvre le même constat
  « accents » côté `push-notify`. Cette fiche passe **avant** elles : si un extrait ne correspond pas, c'est
  que NOTIF-01 a touché ce code : s'arrêter et signaler, ne pas fusionner au jugé.
- Fichiers en CRLF : outil Edit ; si un bloc refuse, petit script Node dans le scratchpad (voir README).
  Le nouveau fichier SQL : CRLF si possible.
- Textes : aucun texte d'interface nouveau. Commentaires sans accents (ceux de la fiche le sont déjà).
- Bump de **toutes** les entrées de l'import map à la **même** valeur V+1.
- `git add` fichier par fichier : `js/utils.js`, `js/summaries.js`, `js/favorites-watch.js`, `js/availability.js`,
  `js/notifications.js`, `supabase/034_demo_signal_flag.sql`, `index.html`, `tests/unit/unit.test.js`,
  `tests/integration/dom.test.js`, `tests/integration/db.test.js` (+ `BACKLOG.md`). Jamais `test-results/`.

## Terminé quand
- [ ] Contrôles passés, tests écrits (unitaire et DOM : échouent avant pour les raisons annoncées, passent
      après ; base : 2 échecs « NOTIF-02 » attendus tant que la migration n'est pas appliquée)
- [ ] Vérifications vertes
- [ ] Captures iPhone : non (états simulés, aucun écran nouveau)
- [ ] Story cochée dans BACKLOG.md, PR ouverte (non fusionnée), avec la mention « à relire par un modèle
      plus fort ; migration 034 à appliquer par Claude »

## Modèle de PR
**Titre** : `fix(favoris): alertes justes app ouverte (propre signal, demo, Favoris, produits suivis)`

**Corps** : les 6 constats couverts ; ce qui change pour l'utilisateur (plus d'alerte sur son propre signal
ni sur la démo de la nuit, page Favoris et carte d'accord avec l'alerte, « vu dispo » plus avalé par
« En service », produit ajouté après l'ouverture suivi, accents ignorés) ; correction (dont la migration 034,
non appliquée) ; tests ajoutés ; sorties des commandes de vérification, dont les 2 échecs « NOTIF-02 » de
`db.test.js` attendus ; section « À faire par Claude » (relecture, migration 034, `db.test.js`, CLAUDE.md).
