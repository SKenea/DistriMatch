/**
 * DistriMatch - Couches et bouton retour (audit UX-04)
 *
 * Sur Android, le bouton retour est LE geste de fermeture. Chaque couche
 * ouverte par-dessus la carte (fiche, panneau, modale de signal, chat,
 * confirmation, vue Compte / Favoris / ...) pousse une entree d'historique ;
 * un retour (popstate) ferme la couche la plus haute au lieu de quitter
 * l'app. Une fermeture par l'UI (croix, Annuler, Echap) retire son entree
 * sans re-fermer. Sans History API (tests unitaires), tout est no-op.
 */

// CNX-01 : history.back() est asynchrone. Un pushState lance dans la meme tache
// etait annule par le retour (fermer puis ouvrir d'un seul toucher), et WebKit ne
// fait qu'un retour pour deux back() d'affilee. Les retours d'une tache partent donc
// en un seul history.go(-n), et une couche ouverte pendant un retour en cours ne
// pousse son entree qu'apres lui. Une couche fermee sous une autre (croix de la
// liste sous une fiche) est marquee stale et retiree des qu'elle arrive au sommet.
const stack = [];      // couches ouvertes, de la plus ancienne a la plus recente : { name, close, pushed, stale }
let ignorePops = 0;    // popstate provoques par nos propres retours
let pendingBack = 0;   // retours demandes pendant la tache en cours
let waiting = [];      // couches ouvertes pendant un retour pas encore abouti
let closing = null;    // couche en cours de fermeture par « retour »

function hasHistory() {
    return typeof window !== 'undefined' && !!window.history && typeof window.history.pushState === 'function';
}

function pushEntry(layer) {
    try {
        window.history.pushState({ layer: layer.name, depth: stack.indexOf(layer) + 1 }, '');
        layer.pushed = true;
    } catch (e) {
        const i = stack.indexOf(layer);
        if (i !== -1) stack.splice(i, 1);
    }
}

function pushWaiting() {
    const layers = waiting;
    waiting = [];
    layers.forEach(l => { if (stack.includes(l)) pushEntry(l); });
}

function sendBack() {
    const n = pendingBack;
    pendingBack = 0;
    if (n === 0) return;
    ignorePops++;
    window.history.go(-n);
}

function goBack(n) {
    pendingBack += n;
    if (pendingBack === n) queueMicrotask(sendBack);
}

// Couches fermees sous une autre, arrivees au sommet : retirees avec leur entree
function dropStaleTop() {
    let n = 0;
    while (stack.length && stack[stack.length - 1].stale) {
        const layer = stack.pop();
        if (layer.pushed) n++;
        else waiting = waiting.filter(l => l !== layer);
    }
    if (n) goBack(n);
}

// A l'ouverture d'une couche : close() sera appele si l'utilisateur fait "retour".
export function pushLayer(name, close) {
    if (!hasHistory() || typeof close !== 'function') return;
    const layer = { name, close, pushed: false, stale: false };
    stack.push(layer);
    if (pendingBack > 0 || ignorePops > 0) waiting.push(layer);
    else pushEntry(layer);
}

// A la fermeture par l'UI : retire l'entree d'historique de la couche. Couche sous
// une autre : marquee stale, son entree part quand elle arrive au sommet. Deja
// fermee par « retour » : rien.
export function popLayer(name) {
    if (!hasHistory()) return;
    if (closing && closing.name === name) return;
    const top = stack[stack.length - 1];
    if (!top) return;
    if (top.name !== name) {
        for (let i = stack.length - 2; i >= 0; i--) {
            if (stack[i].name === name && !stack[i].stale) {
                stack[i].stale = true;
                break;
            }
        }
        return;
    }
    stack.pop();
    if (top.pushed) goBack(1);
    else waiting = waiting.filter(l => l !== top);
    dropStaleTop();
}

// Pour les tests et le debug : noms des couches ouvertes.
export function openLayers() {
    return stack.filter(l => !l.stale).map(l => l.name);
}

function onPopState() {
    if (ignorePops > 0) {
        ignorePops--;
        // Nos retours sont arrives : les couches ouvertes entre-temps poussent leur entree
        if (ignorePops === 0 && pendingBack === 0) pushWaiting();
        return;
    }
    const top = stack.pop();
    if (!top) return;
    closing = top;
    try {
        top.close();
    } catch (e) {
        console.warn('[DistriMatch] Fermeture de couche :', e?.message || e);
    } finally {
        closing = null;
    }
    dropStaleTop();
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('popstate', onPopState);
}
