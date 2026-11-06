# NOTIF-01 — Notifications app fermée : dire l'état affiché sur la fiche

- **Lot** : 5. Notifications · **Gravité** : moyen · **Niveau conseillé** : medium, relecture par un modèle plus fort avant fusion
- **Prérequis** : aucun (partir de `master` à jour).
- **Branche** : `fix/notifications-etat-affiche` · **Taille** : 2 fichiers de la fonction serveur (`logic.js`, `index.ts`) + 1 fichier de tests. **Aucune migration, aucun module de `js/`, pas de `?v=` à monter.**
- **Constats couverts** (rapport du 2026-10-21, tous revérifiés le 2026-11-06 : aucun n'est déjà corrigé ; SEC-04 a seulement déplacé les lignes de `index.ts`) :
  - push-notify compare au dernier signal brut, sans tenir compte de son âge ni de l'état déduit des produits — `supabase/functions/push-notify/logic.js:23` (aujourd'hui lignes 19-37)
  - Produits suivis comparés par égalité exacte au lieu d'un morceau de nom — `supabase/functions/push-notify/logic.js:45` (toujours 45)
  - L'anti-rafale de 30 min bloque la correction « de nouveau En service » — `supabase/functions/push-notify/index.ts:71` (aujourd'hui 137)
  - Notification contraire à l'état affiché quand un exploitant a signalé (règle des 30 min de 020) — `supabase/functions/push-notify/index.ts:50` (aujourd'hui 38-48 et 98-102)
  - Un signal écarté par la règle « exploitant » est quand même envoyé — `supabase/functions/push-notify/logic.js:22`
  - Produits suivis sensibles aux accents — `js/notifications.js:401` : **partie app fermée seulement** (`logic.js:43-45`). La partie app ouverte (`diffFavoriteSignals`, `js/utils.js:1104-1106`) est dans **NOTIF-02** (« accents ignorés »), pas ici.

## But
La notification reçue app fermée dit ce que la fiche affiche : plus d'alerte « vide » contredite par
l'exploitant, plus d'alerte manquée parce qu'un vieux signal disait déjà la même chose, le retour
« en service » n'est jamais retenu par l'anti-rafale, et un produit suivi est reconnu sans accents
ni nom complet (« oeufs » suit « Œufs fermiers »).

## User story
En tant que membre qui suit un favori, je veux que la notification app fermée dise l'état affiché
sur la fiche, afin de ne pas recevoir d'alerte fausse ni en manquer une vraie.

**Critères d'acceptation**
- [ ] L'état « avant » et « après » un signal est déduit comme sur la fiche : un signal de plus de 24 h
      ne compte plus, un produit vu « Dispo » plus récent que l'état du distributeur vaut
      « En service », un membre qui contredit l'exploitant moins de 30 min après lui n'est pas retenu.
- [ ] « Vide » ou « En panne » notifie dès que l'état affiché change (aussi depuis « Pas d'info » ou
      « En service » déduit d'un produit) ; jamais quand il ne change pas.
- [ ] Le retour « En service » (signal du distributeur, ou premier produit revu « Dispo » après
      « Vide » / « En panne ») passe l'anti-rafale de 30 min ; les autres alertes l'attendent toujours.
- [ ] Après un « Vide », seul le premier produit revu dit « de nouveau dispo » ; un produit suivi revu
      « Dispo » après plus de 24 h sans signal notifie de nouveau.
- [ ] Un produit suivi est reconnu sans casse ni accents et par morceau de nom ; un suivi vide ne
      reconnaît rien ; un produit suivi revu après « Pas dispo » donne « vu dispo » (même texte que l'app).
- [ ] `npm test` vert, dont les nouveaux tests « NOTIF-01 ».

## Ce qui est déjà tranché (ne pas refaire l'analyse)
- **Comparer des états affichés, pas des signaux bruts.** `decideBaseEvent(signal, history)` reçoit
  désormais l'historique du distributeur (tous les signaux antérieurs sur 24 h + 30 min) et compare
  `displayedState(history)` à `displayedState(history + signal)`, avec `now = signal.created_at`.
  `displayedState` reproduit `resolveMachineStatus` / `resolveProductStatus` (`js/utils.js`)
  appliqués aux lignes des vues `distributor_status` / `product_availability` (020, 025). Un test de
  parité compare les deux sur plusieurs historiques.
- **Règle de l'exploitant** (vues 020, reprise à l'identique par 025) : par produit (ou pour l'état du
  distributeur), on garde le plus récent, sauf s'il n'est pas de l'exploitant, que l'exploitant a un
  signal d'état différent, et que l'écart est ≤ 30 min : on garde alors le dernier signal de
  l'exploitant. Fonction pure `effectiveSignal(rows)`. `source` est `NOT NULL` en base (007), un
  signal sans `source` (tests anciens) compte comme un membre.
- **Événements** (inchangés dans leurs noms et leurs textes) :
  - signal du distributeur : `empty` / `broken` si l'état affiché après est « Vide » / « En panne » et
    différent d'avant ; `working` si l'état passe de « Vide » / « En panne » à « En service » ; sinon rien ;
  - signal produit « Dispo » retenu (affiché « Dispo » après, pas avant) : `restock` si le produit
    était affiché « Pas dispo » (par son signal ou par un distributeur vide / en panne plus récent),
    sinon `available` (pour les produits suivis seulement). Après un « Vide », le 1er produit revu
    fait repasser l'état à « En service » : un 2e produit revu n'est donc plus « Pas dispo » avant,
    il donne `available` (= `alreadyBack` de l'app).
- **Anti-rafale** : décision prise (« ne bloque jamais le retour En service »). L'événement porte
  `back: true` quand l'état passe de « Vide » / « En panne » à « En service » (`working`, ou
  `restock` qui l'entraîne). `passesCooldown(base, lastSentAt, now)` laisse passer `back`, sinon
  applique `isInCooldown` (inchangé, toujours exporté et testé). **Pas de migration** (`push_sent`
  ne gagne pas de colonne `last_event`) : la notification de retour garde le même `tag`
  (`distrimatch-<id>`), elle **remplace** l'alerte affichée, sans nouveau son (`renotify` absent de
  `sw.js`). Un abus « vide / en service » en boucle reste borné par les 20 signaux / heure / compte
  (014) et ne fait que remplacer la notification.
- **Produit suivi** : `matchesFollowedProduct(productName, followedProducts)` dans `logic.js`, avec
  `followKey` = copie exacte de `normalizeName` (`js/utils.js`) ; le nom du produit doit **contenir**
  le terme suivi (même règle que `diffFavoriteSignals`), un terme vide est ignoré. `logic.js` ne
  peut **pas** importer `js/utils.js` : `scripts/deploy-push.mjs` n'envoie que `index.ts` et
  `logic.js` (`FUNCTION_FILES`). Le partage est garanti par un test (`followKey` = `normalizeName`).
  `eventForSubscriber` : produit suivi reconnu → `stock` pour `available` **et** `restock`
  (priorité « stock » de l'app) ; sinon `restock` pour tous, `available` pour personne.
- **Lecture de l'historique** (`index.ts`) : une requête remplace les deux `previousSignal` :
  `product_id, state, source, created_at` du distributeur, `created_at` < signal et ≥ signal − 24 h
  30 min, `limit(1000)`. Le signal lu gagne la colonne `source`. Les signaux de démo restent dans
  l'historique (les vues les montrent aussi) ; un nouveau signal de démo n'envoie toujours rien.
- **Déploiement** : la fonction en ligne ne change qu'au déploiement. **L'agent ne déploie pas.**
  Après fusion, Claude (modèle principal) lance `node scripts/deploy-push.mjs`.

## Avant de coder
**Lire en entier** : `supabase/functions/push-notify/logic.js` ; `supabase/functions/push-notify/index.ts` ;
`js/utils.js` lignes 418-424 (`normalizeName`) et 700-797 (`SIGNAL_MAX_AGE_MS`, `resolveMachineStatus`,
`resolveProductStatus`) ; `supabase/020_operators.sql` lignes 229-269 (les deux vues) ;
`tests/unit/unit.test.js` lignes 1956-2022 (bloc EPIC-T25).

**Réutiliser** (ne pas réécrire) : `isInCooldown`, `buildPushMessage`, `readOrThrow`, `chunk` (inchangés) ;
dans les tests, `resolveMachineStatus`, `resolveProductStatus`, `normalizeName` (déjà importés en tête
de `tests/unit/unit.test.js`, ligne 20-21).

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
grep -n "^export function decideBaseEvent(signal, previousProduct, previousMachine) {" supabase/functions/push-notify/logic.js   # 1 ligne (19)
grep -n "return name && followed.includes(name)" supabase/functions/push-notify/logic.js                # 1 ligne (45)
grep -n "^export function isInCooldown(lastSentAt, now = Date.now()) {" supabase/functions/push-notify/logic.js   # 1 ligne (72)
grep -n "^async function previousSignal(signal: any, productId: number | null) {" supabase/functions/push-notify/index.ts   # 1 ligne (38)
grep -c "previousSignal(" supabase/functions/push-notify/index.ts                                      # 3
grep -n "select('id, distributor_id, product_id, state, user_id, device_hash, created_at')" supabase/functions/push-notify/index.ts   # 1 ligne (94)
grep -n "decideBaseEvent(signal, previousProduct, previousMachine)" supabase/functions/push-notify/index.ts   # 1 ligne (102)
grep -n "isInCooldown(lastSent.get(t.sub.id))" supabase/functions/push-notify/index.ts                  # 1 ligne (137)
grep -n "^const FUNCTION_FILES = \['index.ts', 'logic.js'\];" scripts/deploy-push.mjs                   # 1 ligne (20)
grep -n "export const SIGNAL_MAX_AGE_MS = 24 \* 60 \* 60 \* 1000;" js/utils.js                         # 1 ligne (712)
grep -c "l.created_at - o.created_at <= interval '30 minutes'" supabase/020_operators.sql               # 2
grep -n "^describe('Notifications app fermee : quel evenement (EPIC-T25)'" tests/unit/unit.test.js     # 1 ligne (1964)
grep -n "^describe('App de l’écran d’accueil sans favori : indice (BUG-04)'" tests/unit/unit.test.js   # 1 ligne (2024)
grep -c "decideBaseEvent(" tests/unit/unit.test.js                                                     # 11
grep -rln "passesCooldown\|displayedState\|effectiveSignal\|matchesFollowedProduct\|followKey\|HISTORY_WINDOW_MS" supabase js tests   # aucun résultat
```

## Étapes

Les trois fichiers sont en CRLF. Les blocs sont longs : faire les remplacements par un petit script
Node dans le scratchpad (lit le fichier, remplace le bloc « Avant » exact par le bloc « Après » en
`\r\n`, vérifie qu'il l'a trouvé **une seule fois**, réécrit), comme dit le README.

1. **supabase/functions/push-notify/logic.js** — états affichés, règle de l'exploitant, produit suivi.
   Remplacer tout le début, du commentaire de l'anti-rafale jusqu'à la fin de `eventForSubscriber`.
   Avant (lignes 5-46) :
   ```js
// Un meme favori notifie au plus toutes les 30 min (anti-rafale).
export const PUSH_COOLDOWN_MS = 30 * 60 * 1000;

const MACHINE_DOWN = ['empty', 'broken'];

function time(row) {
    return row ? new Date(row.created_at).getTime() : 0;
}

// Ce que change un nouveau signal, independamment de l'abonne.
// signal / previousProduct / previousMachine : lignes d'availability_signals
// ({ product_id, state, created_at }) ; previous* = le dernier signal AVANT
// celui-ci pour le meme produit / pour l'etat du distributeur.
// Retour : { type: 'empty' | 'broken' | 'working' | 'restock' | 'available' } ou null.
export function decideBaseEvent(signal, previousProduct, previousMachine) {
    if (!signal) return null;
    if (signal.product_id == null) {
        if (MACHINE_DOWN.includes(signal.state)) {
            if (previousMachine?.state === signal.state) return null;   // deja signale
            return { type: signal.state };
        }
        if (signal.state === 'working' && MACHINE_DOWN.includes(previousMachine?.state)) {
            return { type: 'working' };
        }
        return null;
    }
    if (signal.state !== 'available') return null;
    const machineWasDown = MACHINE_DOWN.includes(previousMachine?.state)
        && time(previousMachine) > time(previousProduct);
    if (previousProduct?.state === 'absent' || machineWasDown) return { type: 'restock' };
    if (previousProduct?.state === 'available') return null;   // rien de neuf
    return { type: 'available' };
}

// L'evenement pour UN abonne : « available » ne compte que pour un produit suivi.
export function eventForSubscriber(base, productName, followedProducts) {
    if (!base) return null;
    if (base.type !== 'available') return base.type === 'restock' ? { type: 'restock', product: productName || '' } : { type: base.type };
    const name = String(productName || '').toLowerCase().trim();
    const followed = (followedProducts || []).map(p => String(p).toLowerCase().trim());
    return name && followed.includes(name) ? { type: 'stock', product: productName } : null;
}
   ```
   Après :
   ```js
// Un meme favori notifie au plus toutes les 30 min (anti-rafale), sauf le retour
// « En service » qui corrige une alerte (passesCooldown, NOTIF-01).
export const PUSH_COOLDOWN_MS = 30 * 60 * 1000;

// NOTIF-01 : la notification dit l'etat affiche sur la fiche, avec les regles de
// l'app (js/utils.js) et des vues de la base (migrations 020 et 025).
// Au-dela de 24 h, un signal ne compte plus (« Pas d'info ») : SIGNAL_MAX_AGE_MS de js/utils.js.
export const SIGNAL_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Un membre qui contredit l'exploitant moins de 30 min apres lui n'est pas retenu.
export const OWNER_PRIORITY_MS = 30 * 60 * 1000;
// Historique a lire avant un signal pour deduire l'etat affiche juste avant lui.
export const HISTORY_WINDOW_MS = SIGNAL_MAX_AGE_MS + OWNER_PRIORITY_MS;

const MACHINE_DOWN = ['empty', 'broken'];
const MACHINE_STATES = ['working', 'empty', 'broken'];

function time(row) {
    const ts = row ? new Date(row.created_at).getTime() : NaN;
    return Number.isNaN(ts) ? 0 : ts;
}

function isRecent(row, now) {
    return Boolean(row) && now - time(row) < SIGNAL_MAX_AGE_MS;
}

// Le signal retenu parmi ceux d'UN produit (ou de l'etat du distributeur), comme
// les vues product_availability / distributor_status : le plus recent, sauf s'il
// contredit l'exploitant moins de 30 min apres lui (l'exploitant l'emporte alors).
export function effectiveSignal(rows) {
    let latest = null;
    let owner = null;
    for (const row of rows || []) {
        if (!latest || time(row) > time(latest)) latest = row;
        if (row.source === 'owner' && (!owner || time(row) > time(owner))) owner = row;
    }
    if (latest && owner && latest.source !== 'owner' && owner.state !== latest.state
        && time(latest) - time(owner) <= OWNER_PRIORITY_MS) return owner;
    return latest;
}

// Etat affiche a l'instant `now`, comme resolveMachineStatus / resolveProductStatus
// (js/utils.js). rows : signaux du distributeur jusqu'a `now` ({ product_id, state,
// source, created_at }). Retour : { machine: 'unknown' | 'working' | 'empty' | 'broken',
// product: 'unknown' | 'available' | 'absent' } (product : celui de productId).
export function displayedState(rows, productId, now) {
    const groups = new Map();
    for (const row of rows || []) {
        const key = row.product_id == null ? 'machine' : String(row.product_id);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }
    let machine = null;   // { state, at }
    const status = effectiveSignal(groups.get('machine'));
    if (status && MACHINE_STATES.includes(status.state) && isRecent(status, now)) {
        machine = { state: status.state, at: time(status) };
    }
    // Un « Dispo » plus recent que tout signal du distributeur = « En service » deduit
    for (const [key, group] of groups) {
        if (key === 'machine') continue;
        const row = effectiveSignal(group);
        if (row.state === 'available' && isRecent(row, now) && (!machine || time(row) > machine.at)) {
            machine = { state: 'working', at: time(row) };
        }
    }
    let product = 'unknown';
    if (productId != null) {
        const row = effectiveSignal(groups.get(String(productId)));
        const hasSignal = isRecent(row, now) && (row.state === 'available' || row.state === 'absent');
        const machineDown = machine && MACHINE_DOWN.includes(machine.state);
        if (machineDown && (!hasSignal || machine.at > time(row))) product = 'absent';
        else if (hasSignal) product = row.state;
    }
    return { machine: machine ? machine.state : 'unknown', product };
}

// Ce que change un nouveau signal, independamment de l'abonne : l'etat affiche
// juste avant lui compare a l'etat affiche juste apres lui (NOTIF-01 ; avant :
// le dernier signal brut, quel que soit son age ou celui qui l'avait donne).
//   signal  : ligne d'availability_signals ({ product_id, state, source, created_at })
//   history : signaux du meme distributeur anterieurs a celui-ci (HISTORY_WINDOW_MS suffit)
// Retour : { type: 'empty' | 'broken' | 'working' | 'restock' | 'available', back? } ou null.
// back = true : le distributeur repasse « En service » apres « Vide » / « En panne ».
export function decideBaseEvent(signal, history = []) {
    if (!signal) return null;
    const now = time(signal);
    const productId = signal.product_id;
    const before = displayedState(history, productId, now);
    const after = displayedState([...(history || []), signal], productId, now);
    const back = MACHINE_DOWN.includes(before.machine) && after.machine === 'working';
    if (productId == null) {
        if (MACHINE_DOWN.includes(after.machine) && after.machine !== before.machine) return { type: after.machine };
        return back ? { type: 'working', back: true } : null;
    }
    if (signal.state !== 'available' || after.product !== 'available' || before.product === 'available') return null;
    if (before.product === 'absent') return back ? { type: 'restock', back: true } : { type: 'restock' };
    return { type: 'available' };
}

// Produit suivi reconnu dans un nom, sans casse ni accents (« oeufs » suit
// « Oeufs fermiers »), par morceau de nom (« pizza » suit « Pizza Margherita »).
// Copie de normalizeName / matchesFollowedProduct de js/utils.js (ce fichier reste
// sans dependance) : un test unitaire verifie qu'elles repondent pareil.
export function followKey(text) {
    return String(text || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
        .replace(/\s+/g, ' ').trim();
}

export function matchesFollowedProduct(productName, followedProducts) {
    const name = followKey(productName);
    if (!name) return false;
    return (followedProducts || []).some((f) => {
        const key = followKey(f);
        return key !== '' && name.includes(key);
    });
}

// L'evenement pour UN abonne, comme le centre de notifications : un produit suivi
// vu dispo donne « vu dispo » (stock), meme apres un « Pas dispo » ; sinon
// « available » ne compte pas, « restock » et l'etat du distributeur comptent pour tous.
export function eventForSubscriber(base, productName, followedProducts) {
    if (!base) return null;
    if (base.type !== 'available' && base.type !== 'restock') return { type: base.type };
    if (matchesFollowedProduct(productName, followedProducts)) return { type: 'stock', product: productName };
    return base.type === 'restock' ? { type: 'restock', product: productName || '' } : null;
}
   ```

2. **supabase/functions/push-notify/logic.js** — anti-rafale qui laisse passer le retour « En service ». Avant :
   ```js
export function isInCooldown(lastSentAt, now = Date.now()) {
    return lastSentAt != null && now - new Date(lastSentAt).getTime() < PUSH_COOLDOWN_MS;
}
   ```
   Après :
   ```js
export function isInCooldown(lastSentAt, now = Date.now()) {
    return lastSentAt != null && now - new Date(lastSentAt).getTime() < PUSH_COOLDOWN_MS;
}

// Anti-rafale : au plus une notification toutes les 30 min par favori, sauf le
// retour « En service » (base.back) : il corrige une alerte « Vide » / « En panne »
// encore affichee (meme tag : elle la remplace).
export function passesCooldown(base, lastSentAt, now = Date.now()) {
    return Boolean(base?.back) || !isInCooldown(lastSentAt, now);
}
   ```

3. **supabase/functions/push-notify/index.ts**, ligne 8 — imports. Avant :
   ```ts
import { decideBaseEvent, eventForSubscriber, buildPushMessage, isQuietTime, isInCooldown, isAllowedPushEndpoint, pushFailureAction, chunk } from './logic.js';
   ```
   Après :
   ```ts
import { decideBaseEvent, eventForSubscriber, buildPushMessage, isQuietTime, passesCooldown, isAllowedPushEndpoint, pushFailureAction, chunk, HISTORY_WINDOW_MS } from './logic.js';
   ```

4. **supabase/functions/push-notify/index.ts** — l'historique remplace « le signal précédent ». Avant :
   ```ts
async function previousSignal(signal: any, productId: number | null) {
    let query = supabase.from('availability_signals')
        .select('product_id, state, created_at')
        .eq('distributor_id', signal.distributor_id)
        .lt('created_at', signal.created_at)
        .order('created_at', { ascending: false })
        .limit(1);
    query = productId == null ? query.is('product_id', null) : query.eq('product_id', productId);
    const data = await readOrThrow('signal precedent', query);
    return data?.[0] || null;
}
   ```
   Après :
   ```ts
// NOTIF-01 : les signaux du distributeur avant celui-ci, sur la fenetre utile
// (24 h + 30 min), pour deduire l'etat affiche juste avant lui comme l'app et les
// vues de la base (age du signal, regle de l'exploitant, produit vu dispo = en service).
// Au plus 1000 lignes (plafond de l'API), tres au-dessus du reel (20 signaux / heure / compte).
async function signalsBefore(signal: any) {
    const since = new Date(new Date(signal.created_at).getTime() - HISTORY_WINDOW_MS).toISOString();
    const data = await readOrThrow('signaux precedents', supabase.from('availability_signals')
        .select('product_id, state, source, created_at')
        .eq('distributor_id', signal.distributor_id)
        .lt('created_at', signal.created_at)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1000));
    return data || [];
}
   ```

5. **supabase/functions/push-notify/index.ts**, `notifySignal` — lire la source du signal. Avant :
   ```ts
        .select('id, distributor_id, product_id, state, user_id, device_hash, created_at')
   ```
   Après :
   ```ts
        .select('id, distributor_id, product_id, state, source, user_id, device_hash, created_at')
   ```

6. **supabase/functions/push-notify/index.ts**, `notifySignal` — décider sur l'historique. Avant :
   ```ts
    const [previousProduct, previousMachine] = await Promise.all([
        signal.product_id == null ? null : previousSignal(signal, signal.product_id),
        previousSignal(signal, null)
    ]);
    const base = decideBaseEvent(signal, previousProduct, previousMachine);
   ```
   Après :
   ```ts
    const base = decideBaseEvent(signal, await signalsBefore(signal));
   ```

7. **supabase/functions/push-notify/index.ts**, boucle des lots — anti-rafale. Avant :
   ```ts
            .filter((t: any) => !isInCooldown(lastSent.get(t.sub.id)))
   ```
   Après :
   ```ts
            .filter((t: any) => passesCooldown(base, lastSent.get(t.sub.id)))
   ```

8. **index.html** : rien (aucun module de `js/` ni CSS ne change).

## Tests

Tout est dans `tests/unit/unit.test.js` (fonctions pures, `npm test`). Aucun test DOM ni navigateur :
la fonction serveur n'est pas chargée par l'app.

### Test 1 — adapter les deux tests existants à la nouvelle signature
- **Où** : bloc `describe('Notifications app fermee : quel evenement (EPIC-T25)'`, ses deux premiers `it`.
- Avant :
  ```js
    it('etat : vide / en panne notifient une fois, en service seulement apres une panne', () => {
        assert.deepEqual(decideBaseEvent(machine('empty', 5), null, machine('working', 1)), { type: 'empty' });
        assert.equal(decideBaseEvent(machine('empty', 5), null, machine('empty', 1)), null);
        assert.deepEqual(decideBaseEvent(machine('broken', 5), null, null), { type: 'broken' });
        assert.deepEqual(decideBaseEvent(machine('working', 5), null, machine('broken', 1)), { type: 'working' });
        assert.equal(decideBaseEvent(machine('working', 5), null, machine('working', 1)), null);
        assert.equal(decideBaseEvent(machine('working', 5), null, null), null);
    });

    it('produit : de nouveau dispo apres « Pas dispo » ou un distributeur vide ; rien pour « Pas dispo »', () => {
        assert.deepEqual(decideBaseEvent(product('available', 9), product('absent', 2), null), { type: 'restock' });
        assert.deepEqual(decideBaseEvent(product('available', 9), product('available', 1), machine('empty', 4)), { type: 'restock' });
        assert.equal(decideBaseEvent(product('available', 9), product('available', 5), machine('empty', 1)), null);
        assert.deepEqual(decideBaseEvent(product('available', 9), null, null), { type: 'available' });
        assert.equal(decideBaseEvent(product('absent', 9), product('available', 1), null), null);
    });
  ```
- Après (mêmes cas ; l'historique est une liste ; `back: true` sur le retour en service) :
  ```js
    it('etat : vide / en panne notifient une fois, en service seulement apres une panne', () => {
        assert.deepEqual(decideBaseEvent(machine('empty', 5), [machine('working', 1)]), { type: 'empty' });
        assert.equal(decideBaseEvent(machine('empty', 5), [machine('empty', 1)]), null);
        assert.deepEqual(decideBaseEvent(machine('broken', 5), []), { type: 'broken' });
        assert.deepEqual(decideBaseEvent(machine('working', 5), [machine('broken', 1)]), { type: 'working', back: true });
        assert.equal(decideBaseEvent(machine('working', 5), [machine('working', 1)]), null);
        assert.equal(decideBaseEvent(machine('working', 5), []), null);
    });

    it('produit : de nouveau dispo apres « Pas dispo » ou un distributeur vide ; rien pour « Pas dispo »', () => {
        assert.deepEqual(decideBaseEvent(product('available', 9), [product('absent', 2)]), { type: 'restock' });
        assert.deepEqual(decideBaseEvent(product('available', 9), [product('available', 1), machine('empty', 4)]), { type: 'restock', back: true });
        assert.equal(decideBaseEvent(product('available', 9), [product('available', 5), machine('empty', 1)]), null);
        assert.deepEqual(decideBaseEvent(product('available', 9), []), { type: 'available' });
        assert.equal(decideBaseEvent(product('absent', 9), [product('available', 1)]), null);
    });
  ```

### Test 2 — nouveau bloc NOTIF-01
- **Fichier** : `tests/unit/unit.test.js`, **juste avant** la ligne
  `describe('App de l’écran d’accueil sans favori : indice (BUG-04)', () => {` (unique), séparé par
  une ligne vide comme les autres blocs.
- **Code à ajouter** :
  ```js
// ============================================
// NOTIF-01 : notification app fermee = etat affiche sur la fiche
// ============================================
import { passesCooldown, displayedState, effectiveSignal, followKey, matchesFollowedProduct, SIGNAL_MAX_AGE_MS as PUSH_SIGNAL_MAX_AGE_MS } from '../../supabase/functions/push-notify/logic.js';
import { SIGNAL_MAX_AGE_MS as APP_SIGNAL_MAX_AGE_MS } from '../../js/utils.js';

describe('Notifications app fermee : l’etat affiche sur la fiche (NOTIF-01)', () => {
    const H = 60;   // minutes
    const at = (min) => new Date(Date.UTC(2026, 10, 2, 10) + min * 60000).toISOString();   // lundi 10:00 + min
    const machine = (state, min, source = 'user') => ({ product_id: null, state, source, created_at: at(min) });
    const product = (id, state, min, source = 'user') => ({ product_id: id, state, source, created_at: at(min) });

    it('« Vide » lundi, produit vu « Dispo » jeudi, « Vide » vendredi : l’alerte part', () => {
        assert.deepEqual(decideBaseEvent(machine('empty', 94 * H), [machine('empty', 0), product(1, 'available', 80 * H)]), { type: 'empty' });
        assert.deepEqual(decideBaseEvent(machine('broken', 94 * H), [machine('broken', 0), product(1, 'available', 80 * H)]), { type: 'broken' });
    });

    it('produit suivi vu « Dispo » lundi puis vendredi : de nouveau une alerte ; deux fois le meme jour : une seule', () => {
        assert.deepEqual(decideBaseEvent(product(2, 'available', 96 * H), [product(2, 'available', 0)]), { type: 'available' });
        assert.equal(decideBaseEvent(product(2, 'available', 5 * H), [product(2, 'available', 0)]), null);
    });

    it('apres un « Vide », seul le premier produit revu dit « de nouveau dispo »', () => {
        assert.deepEqual(decideBaseEvent(product(1, 'available', 60), [machine('empty', 0)]), { type: 'restock', back: true });
        const second = decideBaseEvent(product(2, 'available', 120), [machine('empty', 0), product(1, 'available', 60)]);
        assert.deepEqual(second, { type: 'available' });
        assert.equal(eventForSubscriber(second, 'Pain', []), null);
    });

    it('regle de l’exploitant (020) : un membre qui le contredit moins de 30 min apres ne notifie pas', () => {
        const owner = machine('working', 0, 'owner');
        assert.equal(decideBaseEvent(machine('empty', 10), [owner]), null);
        assert.deepEqual(decideBaseEvent(machine('empty', 40), [owner]), { type: 'empty' });
        const ownerAbsent = product(3, 'absent', 0, 'owner');
        assert.equal(decideBaseEvent(product(3, 'available', 10), [ownerAbsent]), null);
        assert.deepEqual(decideBaseEvent(product(3, 'available', 40), [ownerAbsent]), { type: 'restock' });
    });

    it('anti-rafale : le retour « En service » passe toujours, le reste attend 30 min', () => {
        const now = Date.parse(at(10));
        const sentAt = at(0);
        assert.equal(passesCooldown(decideBaseEvent(machine('working', 10), [machine('broken', 0)]), sentAt, now), true);
        assert.equal(passesCooldown(decideBaseEvent(product(1, 'available', 10), [machine('empty', 0)]), sentAt, now), true);
        assert.equal(passesCooldown({ type: 'empty' }, sentAt, now), false);
        assert.equal(passesCooldown({ type: 'restock' }, sentAt, now), false);
        assert.equal(passesCooldown({ type: 'empty' }, null, now), true);
    });

    it('produit suivi : sans casse ni accents, par morceau de nom', () => {
        const cases = [
            ['Œufs', ['oeufs'], true],
            ['Oeufs fermiers (x6)', ['œufs'], true],
            ['Pizza Margherita', ['pizza'], true],
            ['Baguette tradition', ['BAGUETTE'], true],
            ['Pâté basque', ['pate'], true],
            ['Fromage de chèvre', ['fromage de chevre'], true],
            ['Œufs', ['pain'], false],
            ['Pain', [' ', ''], false],
            ['', ['pain'], false]
        ];
        for (const [name, followed, expected] of cases) assert.equal(matchesFollowedProduct(name, followed), expected, `${name} / ${followed}`);
        assert.deepEqual(eventForSubscriber({ type: 'available' }, 'Baguette tradition', ['baguette']), { type: 'stock', product: 'Baguette tradition' });
        assert.deepEqual(eventForSubscriber({ type: 'restock' }, 'Baguette tradition', ['baguette']), { type: 'stock', product: 'Baguette tradition' });
        assert.deepEqual(eventForSubscriber({ type: 'restock', back: true }, 'Pain', ['oeufs']), { type: 'restock', product: 'Pain' });
    });

    it('memes regles que la fiche : resolveMachineStatus / resolveProductStatus et normalizeName', () => {
        assert.equal(PUSH_SIGNAL_MAX_AGE_MS, APP_SIGNAL_MAX_AGE_MS);
        const now = Date.parse(at(30 * H));
        const histories = [
            [],
            [machine('empty', 25 * H)],
            [machine('empty', 25 * H), product(1, 'available', 26 * H)],
            [product(1, 'available', 25 * H), machine('broken', 26 * H)],
            [machine('empty', 2 * H)],
            [machine('working', 29 * H, 'owner'), machine('empty', 29 * H + 10)],
            [product(1, 'absent', 29 * H, 'owner'), product(1, 'available', 29 * H + 10)],
            [product(1, 'available', 28 * H), product(2, 'absent', 29 * H)]
        ];
        for (const rows of histories) {
            const status = effectiveSignal(rows.filter((r) => r.product_id == null));
            const productRows = [1, 2].map((id) => effectiveSignal(rows.filter((r) => r.product_id === id))).filter(Boolean);
            const fiche = resolveMachineStatus(status, productRows, null, now);
            const shown = displayedState(rows, 1, now);
            assert.equal(shown.machine, fiche.state, JSON.stringify(rows));
            assert.equal(shown.product, resolveProductStatus(null, productRows.find((r) => r.product_id === 1) || null, fiche, now).tone, JSON.stringify(rows));
        }
        for (const text of ['Œufs', 'Pâté  basque ', 'CRÈME', 'Fromage de chèvre', 'Æble']) assert.equal(followKey(text), normalizeName(text));
    });
});
  ```
- **Ce qu'il fait** : rejoue les scénarios du rapport avec des écarts de plusieurs jours (« Vide »
  lundi / « Dispo » jeudi / « Vide » vendredi ; produit suivi revu après 4 jours ; 2e produit revu
  après un « Vide »), la règle de l'exploitant à 10 min et 40 min, l'anti-rafale, la reconnaissance
  des produits suivis, et la parité avec les fonctions de la fiche (`resolveMachineStatus`,
  `resolveProductStatus`, `normalizeName`, `SIGNAL_MAX_AGE_MS`).
- **Assertions** : celles du code ci-dessus, exactement.
- **Doit échouer avant la correction** parce que `logic.js` n'exporte pas encore `passesCooldown`,
  `displayedState`, `effectiveSignal`, `followKey`, `matchesFollowedProduct` ni `SIGNAL_MAX_AGE_MS` :
  le fichier ne se charge pas (`SyntaxError: The requested module '../../supabase/functions/push-notify/logic.js'
  does not provide an export named ...`, « fail 1 »). Sur le fond, l'ancien `decideBaseEvent` renvoie
  `{ type: 'empty' }` pour l'exploitant contredit à 10 min et `null` pour le 2e « Dispo » d'un produit
  suivi 4 jours plus tard.

Ordre : écrire les tests 1 et 2, lancer `npm run test:unit` (échec de chargement attendu), puis
appliquer les étapes 1 à 7.

## Vérification (dans l'ordre)
```bash
node --check supabase/functions/push-notify/logic.js                                   # aucune sortie
node --experimental-strip-types --check supabase/functions/push-notify/index.ts         # aucune sortie (avertissement « ExperimentalWarning » possible)
grep -c "isInCooldown" supabase/functions/push-notify/index.ts                         # 0
grep -c "passesCooldown(base, lastSent.get(t.sub.id))" supabase/functions/push-notify/index.ts   # 1
grep -c "previousSignal" supabase/functions/push-notify/index.ts                       # 0
grep -c "signalsBefore" supabase/functions/push-notify/index.ts                        # 2
grep -c "[«»’]" supabase/functions/push-notify/index.ts                                # 0 (index.ts reste en ASCII)
grep -c "decideBaseEvent(" tests/unit/unit.test.js                                     # 23
npm test                                                                               # tout vert (351 tests au 2026-11-06), dont « NOTIF-01 » et « EPIC-T25 »
git diff --stat                                                                        # logic.js, index.ts, unit.test.js (+ BACKLOG.md)
```
Pas de suite fonctionnelle à lancer : aucun fichier chargé par l'app ne change.

## Hors périmètre
- **Déploiement** de la fonction (`node scripts/deploy-push.mjs`) : Claude (modèle principal), après
  fusion. Tant qu'il n'est pas fait, la production garde l'ancien comportement.
- `js/utils.js` (`diffFavoriteSignals` : accents côté app ouverte, propre signal, démo) → **NOTIF-02**.
  Ne pas y toucher, même pour « partager » `matchesFollowedProduct` : NOTIF-02 part des extraits actuels.
- Doublon entre la notification du serveur et celle de l'app, ou entre onglets → **NOTIF-03**.
- Textes des notifications (« fonctionne de nouveau », « signalée vide »…) → **NOTIF-06** ; ici
  `buildPushMessage` ne change pas et reste identique à `buildFavoriteMessage` (test existant).
- Son / vibration, `renotify` de `sw.js` → **NOTIF-07**.
- Migration `push_sent.last_event` proposée par le rapport : non retenue (voir « déjà tranché »).
- Produit retiré (025) dans les dernières 24 h : son ancien « Dispo » compte encore pour l'état
  « En service » déduit côté serveur, alors que la vue l'ignore. Cas rare, accepté.
- Stockage de `followedProducts` (`followProduct`, `js/notifications.js`) : inchangé.

## Pièges connus
- **Nouvelle signature** : `decideBaseEvent(signal, history)` avec `history` = **liste** (jamais
  `null` dans les tests ; `[]` si vide). `back: true` n'apparaît **que** quand il vaut vrai :
  les `deepEqual` en dépendent.
- `logic.js` reste **sans import** (Deno et Node) : ne pas y importer `js/utils.js`, le déploiement
  n'envoie que `index.ts` et `logic.js`.
- `index.ts` est en ASCII : pas de « » ni d'accent dans les commentaires ajoutés (vérification `grep -c "[«»’]"`).
- `.lt('created_at', signal.created_at)` reste strict : le signal lui-même n'est pas dans l'historique,
  `decideBaseEvent` l'ajoute pour l'état « après ».
- Tests : les nouveaux `import` au milieu du fichier sont normaux (déjà fait pour `pinsNear`) ; les
  noms `resolveMachineStatus`, `resolveProductStatus`, `normalizeName` sont déjà importés en tête :
  ne pas les réimporter. Garder `isInCooldown` et `PUSH_COOLDOWN_MS` dans l'import de la ligne 1960
  (test d'anti-rafale existant).
- Dates des tests : minutes **entières** (`at(min)`), jamais de fraction d'heure (arrondi des millisecondes).
- **Stories voisines** : aucun extrait « Avant » de cette fiche n'est dans le périmètre de NOTIF-02
  à NOTIF-07 (elles touchent `js/` et `sw.js`). Seule NOTIF-03 (doublon serveur / app) pourrait
  toucher la charge utile envoyée par `index.ts` (lignes `title` / `body` / `url` / `tag`) : cette
  fiche ne les modifie pas, ne pas y toucher.
- Fins de ligne CRLF : remplacement par script Node, puis `git diff --stat` (seules les lignes prévues).

## Terminé quand
- [ ] Contrôles passés, tests écrits (échouent avant, passent après)
- [ ] Vérifications vertes
- [ ] Captures iPhone : non (aucun écran ne change)
- [ ] Story cochée dans BACKLOG.md, PR ouverte (non fusionnée), avec la mention « déploiement de
      push-notify à faire après fusion (`node scripts/deploy-push.mjs`, Claude principal) »

## Modèle de PR
**Titre** : `fix(notifications): app fermee, la notification dit l'etat affiche sur la fiche`

**Corps** : constats couverts (6, dont la partie app ouverte des accents renvoyée à NOTIF-02) ;
cause (comparaison au dernier signal brut, sans âge ni règle de l'exploitant ; anti-rafale sans
exception ; égalité exacte des noms) ; correction (état affiché avant / après, `effectiveSignal`,
`passesCooldown`, `matchesFollowedProduct`) ; tests ajoutés ; sorties des commandes de vérification ;
**à faire après fusion : déployer la fonction** (`node scripts/deploy-push.mjs`, Claude principal).
