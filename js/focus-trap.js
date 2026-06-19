// ============================================
// FOCUS TRAP — accessibilite clavier des modales (WCAG 2.4.3 / 2.1.2)
// ============================================
//
// A l'ouverture d'une modale : memorise l'element declencheur, deplace le
// focus sur le 1er element focusable, piege Tab / Shift-Tab a l'interieur, et
// ferme sur Echap (via le callback onEscape). A la fermeture : rend le focus
// au declencheur.
//
// Le listener est pose sur la modale elle-meme (pas sur document) : comme le
// focus est piege a l'interieur, les evenements clavier y remontent par
// bubbling. Echap appelle e.stopPropagation() pour ne PAS declencher en plus
// le handler Echap global "fourre-tout" (js/app.js). Les modales imbriquees
// (ex: gate "Connexion requise" par-dessus la fiche) fonctionnent car chacune
// a son propre listener et le focus reste dans la modale du dessus.

const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(',');

// Elements focusables ET visibles (un bouton masque par display:none ne doit
// pas capter le focus).
function getFocusable(container) {
    return Array.from(container.querySelectorAll(FOCUSABLE)).filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
    );
}

export function activateFocusTrap(modal, onEscape) {
    if (!modal || modal.__focusTrap) return;
    const trigger = document.activeElement;

    function onKeydown(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            if (typeof onEscape === 'function') onEscape();
            return;
        }
        if (e.key !== 'Tab') return;

        const items = getFocusable(modal);
        if (items.length === 0) {
            e.preventDefault();
            return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;

        if (e.shiftKey && (active === first || !modal.contains(active))) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && (active === last || !modal.contains(active))) {
            e.preventDefault();
            first.focus();
        }
    }

    modal.addEventListener('keydown', onKeydown);
    modal.__focusTrap = { trigger, onKeydown };

    // Focus initial : l'element [autofocus] s'il existe (ex: champ email de la
    // modale auth), sinon le 1er focusable, sinon la modale (tabindex="-1").
    const items = getFocusable(modal);
    const preferred = modal.querySelector('[autofocus]');
    (preferred || items[0] || modal).focus();
}

export function deactivateFocusTrap(modal) {
    if (!modal || !modal.__focusTrap) return;
    const { trigger, onKeydown } = modal.__focusTrap;
    modal.removeEventListener('keydown', onKeydown);
    delete modal.__focusTrap;

    // Rendre le focus au declencheur s'il est toujours dans le DOM.
    if (trigger && document.contains(trigger) && typeof trigger.focus === 'function') {
        trigger.focus();
    }
}
