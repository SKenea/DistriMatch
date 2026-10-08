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
