// DistriMatch - Notifications app fermee (EPIC-T25) : logique pure.
// Partagee par la fonction serveur push-notify (Deno) et les tests unitaires
// (Node) : aucune dependance, aucun acces reseau.

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

// Memes textes que le centre de notifications (buildFavoriteMessage, notifications.js).
export function buildPushMessage(distributorName, event) {
    const product = event.product || 'Un produit';
    switch (event.type) {
        case 'broken': return `${distributorName} a été signalée en panne`;
        case 'working': return `${distributorName} fonctionne de nouveau`;
        case 'empty': return `${distributorName} a été signalée vide`;
        case 'stock': return `${product} vu dispo chez ${distributorName}`;
        default: return `${product} de nouveau vu dispo chez ${distributorName}`;
    }
}

// Heures calmes de l'abonne, dans SON fuseau (heures entieres, null = aucune).
export function isQuietTime(quietStart, quietEnd, timeZone, now = new Date()) {
    if (quietStart == null || quietEnd == null || quietStart === quietEnd) return false;
    let hour;
    try {
        hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: timeZone || 'UTC' }).format(now));
    } catch (e) {
        hour = now.getUTCHours();
    }
    return quietStart > quietEnd ? (hour >= quietStart || hour < quietEnd) : (hour >= quietStart && hour < quietEnd);
}

export function isInCooldown(lastSentAt, now = Date.now()) {
    return lastSentAt != null && now - new Date(lastSentAt).getTime() < PUSH_COOLDOWN_MS;
}

// Anti-rafale : au plus une notification toutes les 30 min par favori, sauf le
// retour « En service » (base.back) : il corrige une alerte « Vide » / « En panne »
// encore affichee (meme tag : elle la remplace).
export function passesCooldown(base, lastSentAt, now = Date.now()) {
    return Boolean(base?.back) || !isInCooldown(lastSentAt, now);
}

// Adresses d'abonnement acceptees : celles des services push des navigateurs
// (FCM : Chrome, Android, Edge Android, Samsung ; Mozilla : Firefox ; Apple : Safari ;
// WNS : Edge Windows). Meme liste que push_endpoint_allowed (migration 026).
// Le / juste apres l'hote ecarte un port, un « user@ » ou un faux suffixe.
const PUSH_ENDPOINT_PATTERN = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//;

export function isAllowedPushEndpoint(endpoint) {
    return typeof endpoint === 'string' && endpoint.length <= 1000 && PUSH_ENDPOINT_PATTERN.test(endpoint);
}

// Echecs d'envoi de suite tolere avant d'effacer un abonnement.
export const PUSH_MAX_FAILURES = 5;

// Que faire d'un envoi en echec. 404 / 410 : abonnement retire par le navigateur
// -> 'delete'. Reseau, delai depasse, 400 (adresse inventee), 429 ou 5xx -> 'count'
// (fail_count + 1), puis 'delete' au-dela de PUSH_MAX_FAILURES echecs de suite.
// 401 / 403 et autres 4xx (cle VAPID mal configuree...) : 'log' seulement, pour ne
// pas effacer tout le monde sur une erreur de configuration.
// failCount = echecs deja comptes avant celui-ci.
export function pushFailureAction(statusCode, failCount) {
    if (statusCode === 404 || statusCode === 410) return 'delete';
    const transient = !statusCode || statusCode === 400 || statusCode === 429 || statusCode >= 500;
    if (!transient) return 'log';
    return (Number(failCount) || 0) + 1 > PUSH_MAX_FAILURES ? 'delete' : 'count';
}

// Decoupe une liste en lots de `size` (envois en parallele bornes).
export function chunk(items, size) {
    const out = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}
