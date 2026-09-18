/**
 * DistriMatch - Modale de confirmation maison
 *
 * Remplace confirm() natif (boite systeme non stylable, hostile mobile) pour
 * les actions destructrices : effacer mes donnees, supprimer un produit, tout
 * effacer les notifications. Accessible : role alertdialog, focus-trap, Echap
 * = annuler, focus initial sur Annuler (l'action destructrice n'est jamais le
 * defaut). Une seule demande a la fois.
 *
 * Usage : if (!(await confirmDialog({ title, message, confirmLabel }))) return;
 */

import { activateFocusTrap, deactivateFocusTrap } from './focus-trap.js';
import { pushLayer, popLayer } from './history.js';

let pending = null; // resolve() de la demande en cours

export function confirmDialog({
    title = 'Confirmer ?',
    message = '',
    confirmLabel = 'Confirmer',
    cancelLabel = 'Annuler',
    danger = true
} = {}) {
    const modal = document.getElementById('confirm-modal');
    // Hors DOM complet (tests unit, page sans la modale) : on ne bloque pas
    // l'action, comme quand confirm() n'existait pas.
    if (!modal) return Promise.resolve(true);
    if (pending) settle(false);

    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    const okBtn = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');
    okBtn.textContent = confirmLabel;
    cancelBtn.textContent = cancelLabel;
    okBtn.classList.toggle('btn-danger-clean', danger);
    okBtn.classList.toggle('btn-primary-clean', !danger);

    wireOnce(modal);
    modal.classList.add('active');
    pushLayer('confirm', () => settle(false));   // bouton retour = annuler (audit UX-04)
    activateFocusTrap(modal, () => settle(false));
    cancelBtn.focus();

    return new Promise(resolve => { pending = resolve; });
}

function settle(value) {
    const modal = document.getElementById('confirm-modal');
    if (modal) {
        modal.classList.remove('active');
        popLayer('confirm');
        deactivateFocusTrap(modal);
    }
    const resolve = pending;
    pending = null;
    if (resolve) resolve(value);
}

// Listeners poses une seule fois : la modale est statique et reutilisee.
function wireOnce(modal) {
    if (modal.dataset.wired) return;
    modal.dataset.wired = '1';
    document.getElementById('confirm-ok').addEventListener('click', () => settle(true));
    document.getElementById('confirm-cancel').addEventListener('click', () => settle(false));
    document.getElementById('confirm-close').addEventListener('click', () => settle(false));
    modal.addEventListener('click', (e) => { if (e.target === modal) settle(false); });
}
