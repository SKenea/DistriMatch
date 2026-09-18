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

const stack = [];      // couches ouvertes, de la plus ancienne a la plus recente
let ignorePops = 0;    // popstate provoques par nos propres history.back()

function hasHistory() {
    return typeof window !== 'undefined' && !!window.history && typeof window.history.pushState === 'function';
}

// A l'ouverture d'une couche : close() sera appele si l'utilisateur fait "retour".
export function pushLayer(name, close) {
    if (!hasHistory() || typeof close !== 'function') return;
    stack.push({ name, close });
    try {
        window.history.pushState({ layer: name, depth: stack.length }, '');
    } catch (e) {
        stack.pop();
    }
}

// A la fermeture par l'UI : retire l'entree d'historique de la couche si elle
// est bien la plus haute (sinon rien : la couche a deja ete fermee par retour).
export function popLayer(name) {
    if (!hasHistory()) return;
    const top = stack[stack.length - 1];
    if (!top || top.name !== name) return;
    stack.pop();
    ignorePops++;
    window.history.back();
}

// Pour les tests et le debug : noms des couches ouvertes.
export function openLayers() {
    return stack.map(l => l.name);
}

function onPopState() {
    if (ignorePops > 0) {
        ignorePops--;
        return;
    }
    const top = stack.pop();
    if (!top) return;
    try {
        top.close();
    } catch (e) {
        console.warn('[DistriMatch] Fermeture de couche :', e?.message || e);
    }
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('popstate', onPopState);
}
