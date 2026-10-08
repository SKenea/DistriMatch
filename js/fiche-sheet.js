// DistriMatch - Fiche en feuille du bas sur telephone (EPIC-T26, comme Google Maps).
// Trois positions : plein ecran, mi-hauteur (a l'ouverture), reduite en bas (nom et
// etat seulement, la carte utilisable au-dessus). On tire la feuille depuis la
// poignee ou tout le haut de la fiche (nom, etat) : elle suit le doigt, puis se pose
// sur la position la plus proche (en tenant compte de l'elan) ; un dernier glisser
// vers le bas depuis la position reduite la ferme. Toucher la poignee (ou Entree /
// Espace) remonte d'un cran : voie en un toucher (WCAG 2.5.1).
// La feuille garde toujours la hauteur de l'ecran et se deplace par transform
// (fluide) ; une marge basse egale au decalage garde la fin du contenu atteignable.
// Grand ecran : rien ne change (modale centree).

const SHEET_QUERY = '(max-width: 768px)';
const HALF_RATIO = 0.58;        // part de l'ecran visible a mi-hauteur
const DRAG_THRESHOLD = 6;       // px avant de considerer un glisser
const CLOSE_MARGIN = 60;        // px tires sous la position reduite pour fermer
const MOMENTUM_MS = 120;        // projection de l'elan au lacher

let state = 'half';

export function isSheetLayout() {
    return typeof window.matchMedia === 'function' && window.matchMedia(SHEET_QUERY).matches;
}

function modalEl() {
    return document.getElementById('dist-modal');
}

// Hauteur visible en position reduite : jusqu'a la ligne d'etat (nom + etat).
function peekVisible(modal) {
    const status = document.getElementById('dist-status');
    if (!status) return 150;
    const bottom = status.getBoundingClientRect().bottom - modal.getBoundingClientRect().top + modal.scrollTop;
    return Math.max(120, Math.min(260, Math.round(bottom + 14)));
}

function offsetFor(name, modal) {
    const vh = window.innerHeight;
    if (name === 'full') return 0;
    if (name === 'peek') return Math.max(0, vh - peekVisible(modal));
    return Math.round(vh * (1 - HALF_RATIO));
}

function currentOffset(modal) {
    const m = /translateY\((-?[\d.]+)px\)/.exec(modal.style.transform || '');
    return m ? parseFloat(m[1]) : offsetFor(state, modal);
}

function refreshHandle() {
    const handle = document.getElementById('dist-sheet-handle');
    if (!handle) return;
    handle.setAttribute('aria-label', state === 'full' ? 'Réduire la fiche' : 'Agrandir la fiche');
    handle.setAttribute('aria-expanded', String(state === 'full'));
}

function applyState(name, modal = modalEl()) {
    if (!modal) return;
    state = name;
    const offset = offsetFor(name, modal);
    modal.style.transform = `translateY(${offset}px)`;
    modal.style.setProperty('--sheet-offset', `${offset}px`);
    modal.classList.toggle('is-full', name === 'full');
    modal.classList.toggle('is-peek', name === 'peek');
    if (name !== 'full') modal.scrollTop = 0;
    refreshHandle();
}

// Ouverture : la feuille monte du bas jusqu'a mi-hauteur (plein ecran sans carte :
// deep link avant la geolocalisation). Une fiche deja ouverte garde sa position
// (sauf reduite : elle remonte a mi-hauteur pour montrer la nouvelle fiche).
export function openFicheSheet({ full = false, alreadyOpen = false } = {}) {
    const modal = modalEl();
    if (!modal || !isSheetLayout()) return;
    if (alreadyOpen && !full) {
        applyState(state === 'peek' ? 'half' : state, modal);
        return;
    }
    modal.classList.add('is-dragging');            // pas de transition pour le point de depart
    modal.style.transform = `translateY(${window.innerHeight}px)`;
    void modal.offsetHeight;                        // fixe le point de depart
    modal.classList.remove('is-dragging');
    requestAnimationFrame(() => applyState(full ? 'full' : 'half', modal));
}

// Fermeture (ou grand ecran) : plus aucun style de feuille.
export function resetFicheSheet() {
    const modal = modalEl();
    if (!modal) return;
    state = 'half';
    modal.style.transform = '';
    modal.style.removeProperty('--sheet-offset');
    modal.classList.remove('is-full', 'is-peek', 'is-dragging');
    refreshHandle();
}

// Toucher la poignee : remonte d'un cran (plein ecran -> mi-hauteur).
function stepUp() {
    applyState(state === 'peek' ? 'half' : state === 'half' ? 'full' : 'half');
}

export function initFicheSheet(onClose) {
    const modal = modalEl();
    const handle = document.getElementById('dist-sheet-handle');
    if (!modal || !handle) return;
    let drag = null;
    let swallowClick = false;

    // Zones de prise : la poignee et le haut de la fiche (nom, etat)
    function inGrip(target) {
        return target.closest('#dist-sheet-handle, .dist-modal-header') && !target.closest('input, textarea, select');
    }

    modal.addEventListener('pointerdown', (e) => {
        if (!isSheetLayout() || !inGrip(e.target)) return;
        drag = { id: e.pointerId, y: e.clientY, x: e.clientX, start: currentOffset(modal), moved: false, lastY: e.clientY, lastT: e.timeStamp, v: 0, onHandle: !!e.target.closest('#dist-sheet-handle') };
    });
    modal.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const dy = e.clientY - drag.y;
        if (!drag.moved) {
            if (Math.abs(dy) < DRAG_THRESHOLD || Math.abs(dy) < Math.abs(e.clientX - drag.x)) return;
            drag.moved = true;
            modal.classList.add('is-dragging');
            try { modal.setPointerCapture(e.pointerId); } catch (err) { /* pointeur deja relache */ }
        }
        const dt = Math.max(1, e.timeStamp - drag.lastT);
        drag.v = (e.clientY - drag.lastY) / dt;     // px / ms, positif vers le bas
        drag.lastY = e.clientY;
        drag.lastT = e.timeStamp;
        const offset = Math.min(window.innerHeight - 40, Math.max(0, drag.start + dy));
        modal.style.transform = `translateY(${offset}px)`;
    });
    function release(e) {
        if (!drag || e.pointerId !== drag.id) return;
        const d = drag;
        drag = null;
        modal.classList.remove('is-dragging');
        if (!d.moved) {
            if (d.onHandle) stepUp();
            return;
        }
        swallowClick = true;                         // le glisser n'est pas un toucher
        setTimeout(() => { swallowClick = false; }, 300);
        const projected = currentOffset(modal) + d.v * MOMENTUM_MS;
        const peek = offsetFor('peek', modal);
        if (projected > peek + CLOSE_MARGIN) {
            resetFicheSheet();
            onClose();
            return;
        }
        const nearest = ['full', 'half', 'peek']
            .map(name => ({ name, gap: Math.abs(offsetFor(name, modal) - projected) }))
            .sort((a, b) => a.gap - b.gap)[0].name;
        applyState(nearest, modal);
    }
    modal.addEventListener('pointerup', release);
    modal.addEventListener('pointercancel', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        drag = null;
        modal.classList.remove('is-dragging');
        applyState(state, modal);
    });
    modal.addEventListener('click', (e) => {
        if (!swallowClick) return;
        swallowClick = false;
        e.stopPropagation();
        e.preventDefault();
    }, true);
    // Clavier (Entree / Espace) sur la poignee : meme cran qu'un toucher
    handle.addEventListener('click', (e) => {
        if (e.detail === 0 && isSheetLayout()) stepUp();
    });
    // Rotation / clavier virtuel : la position se recale
    window.addEventListener('resize', () => {
        if (isSheetLayout() && modal.style.transform) applyState(state, modal);
    });
}
