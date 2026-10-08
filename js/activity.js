/**
 * DistriMatch - Signalement d'un distributeur (modale « Signaler »)
 *
 * Seul point d'entree : le chat (inactif, FEATURES.chat). L'ancien fil
 * d'activite local (snackmatch_activity, votes Confirmer / Infirmer) a ete
 * retire : l'onglet Activite affiche l'historique du compte (my-activity.js).
 * Les points restent attribues (gamification gardee, decision 2026-10-08).
 */

import { AppState, supabaseClient, selectedReportType, setSelectedReportType } from './state.js';
import { escapeHTML, showToast, saveToLocalStorage } from './utils.js';
import { updateProfileStats } from './navigation.js';
import { requireAuth } from './auth.js';
import { activateFocusTrap, deactivateFocusTrap } from './focus-trap.js';

// Ancien fil local : donnees laissees par les versions precedentes
export function removeLegacyActivityFeed() {
    try { localStorage.removeItem('snackmatch_activity'); } catch (e) { /* stockage bloque */ }
}

// ============================================
// SIGNALEMENTS
// ============================================

export async function openReportModal() {
    if (!(await requireAuth())) return;
    if (!AppState.currentDistributor) return;

    const distributor = AppState.currentDistributor;

    document.getElementById('report-name').textContent = distributor.name;
    document.getElementById('report-address').textContent = distributor.address;

    const select = document.getElementById('report-product');
    select.innerHTML = distributor.products.map(p =>
        `<option value="${escapeHTML(p.name)}">${escapeHTML(p.name)}</option>`
    ).join('');

    const modal = document.getElementById('report-modal');
    modal.classList.add('active');
    activateFocusTrap(modal, closeReportModal);
}

// Fermeture centralisee de la modale signalement (X, Echap, apres envoi) :
// retire l'etat actif ET relache le focus-trap. Utilisee partout pour eviter
// les fermetures partielles (piege a focus non relache).
export function closeReportModal() {
    const modal = document.getElementById('report-modal');
    modal.classList.remove('active');
    deactivateFocusTrap(modal);
}

export function selectReportType(type) {
    setSelectedReportType(type);

    document.querySelectorAll('.report-type-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.type === type);
    });

    const productSelect = document.getElementById('report-product-select');
    productSelect.style.display = ['out_of_stock', 'price_change'].includes(type) ? 'block' : 'none';

    document.getElementById('submit-report').disabled = false;
}

export async function submitReport() {
    if (!selectedReportType || !AppState.currentDistributor) return;

    const selectedBtn = document.querySelector(`.report-type-btn[data-type="${selectedReportType}"]`);
    const points = parseInt(selectedBtn?.dataset.points || '10');

    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient.rpc('submit_report', {
                p_distributor_id: AppState.currentDistributor.id,
                p_report_type: selectedReportType,
                p_product_name: null,
                p_points: points
            });
            if (error) throw error;
            console.log('[DistriMatch] Signalement envoye sur Supabase, id:', data);
        } catch (e) {
            console.warn('[DistriMatch] Erreur signalement Supabase:', e.message);
        }
    }

    AppState.reports++;
    AppState.points += points;
    saveToLocalStorage();
    updateProfileStats();

    showToast(`Merci pour ton signalement ! +${points} points`, 'success');

    closeReportModal();
    setSelectedReportType(null);
}
