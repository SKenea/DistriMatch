// DistriMatch - Fiche en feuille du bas sur telephone (EPIC-T26 US2).
// A l'ouverture, la fiche occupe la moitie basse de l'ecran : la carte reste
// visible et touchable au-dessus (toucher une autre pastille ouvre sa fiche).
// La poignee se tire (vers le haut = plein ecran, vers le bas = fermer) ou se
// touche (bascule mi-hauteur / plein ecran : voie en un toucher, WCAG 2.5.1).
// Faire defiler le contenu d'une fiche a mi-hauteur la passe en plein ecran.
// Grand ecran : rien ne change (modale centree).

const SHEET_QUERY = '(max-width: 768px)';
const DRAG_THRESHOLD = 6;      // px avant de considerer un glisser (sinon c'est un toucher)
const CLOSE_RATIO = 0.3;       // relachee sous 30 % de l'ecran : fermee
const FULL_RATIO = 0.72;       // relachee au-dessus de 72 % : plein ecran

export function isSheetLayout() {
    return typeof window.matchMedia === 'function' && window.matchMedia(SHEET_QUERY).matches;
}

function refreshHandle(modal) {
    const handle = document.getElementById('dist-sheet-handle');
    if (!handle) return;
    const full = modal.classList.contains('is-full');
    handle.setAttribute('aria-label', full ? 'Réduire la fiche' : 'Agrandir la fiche');
    handle.setAttribute('aria-expanded', String(full));
}

// Mi-hauteur par defaut ; plein ecran sur demande (ou deep link sans carte).
export function resetFicheSheet({ full = false } = {}) {
    const modal = document.getElementById('dist-modal');
    if (!modal) return;
    modal.style.height = '';
    modal.classList.toggle('is-full', full);
    refreshHandle(modal);
}

export function initFicheSheet(onClose) {
    const modal = document.getElementById('dist-modal');
    const handle = document.getElementById('dist-sheet-handle');
    if (!modal || !handle) return;
    let drag = null;

    handle.addEventListener('pointerdown', (e) => {
        if (!isSheetLayout()) return;
        drag = { y: e.clientY, height: modal.getBoundingClientRect().height, moved: false };
        try { handle.setPointerCapture(e.pointerId); } catch (err) { /* pointeur deja relache */ }
    });
    handle.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const dy = e.clientY - drag.y;
        if (!drag.moved && Math.abs(dy) < DRAG_THRESHOLD) return;
        if (!drag.moved) {
            drag.moved = true;
            modal.classList.add('is-dragging');
        }
        modal.style.height = `${Math.min(window.innerHeight, Math.max(80, drag.height - dy))}px`;
    });
    function endDrag() {
        if (!drag) return;
        const { moved } = drag;
        drag = null;
        modal.classList.remove('is-dragging');
        if (!moved) {
            resetFicheSheet({ full: !modal.classList.contains('is-full') });
            return;
        }
        const ratio = modal.getBoundingClientRect().height / window.innerHeight;
        if (ratio < CLOSE_RATIO) {
            resetFicheSheet();
            onClose();
            return;
        }
        resetFicheSheet({ full: ratio > FULL_RATIO });
    }
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', () => {
        drag = null;
        modal.classList.remove('is-dragging');
        modal.style.height = '';
    });
    // Clavier (Entree / Espace) : meme bascule qu'un toucher
    handle.addEventListener('click', (e) => {
        if (e.detail === 0) resetFicheSheet({ full: !modal.classList.contains('is-full') });
    });
    // Lire la suite d'une fiche a mi-hauteur la deplie
    modal.addEventListener('scroll', () => {
        if (isSheetLayout() && !modal.classList.contains('is-full') && modal.scrollTop > 40) {
            resetFicheSheet({ full: true });
        }
    }, { passive: true });
}
