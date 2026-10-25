// DistriMatch - Notifications app fermee (EPIC-T25) : logique pure.
// Partagee par la fonction serveur push-notify (Deno) et les tests unitaires
// (Node) : aucune dependance, aucun acces reseau.

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
