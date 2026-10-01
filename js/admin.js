/**
 * DistriMatch - Page admin (EPIC-T18, migration 020)
 *
 * Reservee aux comptes de `app_admins` (entree « Admin » du menu avatar, posee
 * par js/operators.js). Demandes d'exploitant en attente (Valider / Refuser) et
 * exploitants accordes (Retirer, avec confirmation). Les droits sont verifies
 * par la base : chaque fonction admin_* refuse un non-admin (42501).
 */

import { AppState, supabaseClient } from './state.js';
import { escapeHTML, showToast } from './utils.js';
import { confirmDialog } from './confirm-dialog.js';
import { isAdminUser, whenOperatorStateReady } from './operators.js';

function formatDay(iso) {
    try {
        return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    } catch (e) {
        return '';
    }
}

function setStatus(text) {
    const el = document.getElementById('admin-status');
    if (!el) return;
    el.textContent = text;
    el.hidden = !text;
}

export async function loadAdmin() {
    const content = document.getElementById('admin-content');
    if (!content) return;
    setStatus('Chargement…');
    await whenOperatorStateReady();
    if (!isAdminUser() || !supabaseClient) {
        content.hidden = true;
        setStatus('Réservé à l’admin.');
        return;
    }
    setStatus('Chargement…');
    const [requests, operators] = await Promise.all([
        supabaseClient.rpc('admin_operator_requests'),
        supabaseClient.rpc('admin_operators')
    ]);
    if (requests.error || operators.error) {
        const code = requests.error?.code || operators.error?.code;
        content.hidden = true;
        setStatus(code === '42501' ? 'Réservé à l’admin.' : 'Chargement impossible, réessaie plus tard.');
        return;
    }
    setStatus('');
    content.hidden = false;
    renderRequests(requests.data || []);
    renderOperators(operators.data || []);
}

function renderRequests(rows) {
    const list = document.getElementById('admin-requests');
    const count = document.getElementById('admin-requests-count');
    if (count) count.textContent = rows.length ? `(${rows.length})` : '';
    if (!list) return;
    if (!rows.length) {
        list.innerHTML = '<p class="admin-empty">Aucune demande en attente.</p>';
        return;
    }
    list.innerHTML = rows.map(r => `
        <article class="admin-card" data-request-id="${escapeHTML(String(r.id))}" data-distributor-id="${escapeHTML(r.distributor_id)}">
            <h4 class="admin-card-title">${escapeHTML(r.distributor_name)}${r.city ? ` <span class="admin-card-city">· ${escapeHTML(r.city)}</span>` : ''}</h4>
            <dl class="admin-card-facts">
                <dt>Société</dt><dd>${escapeHTML(r.company)}</dd>
                <dt>Contact</dt><dd>${escapeHTML(r.contact)}</dd>
                <dt>Compte</dt><dd>${escapeHTML(r.email || 'inconnu')}</dd>
                <dt>Reçue</dt><dd>${escapeHTML(formatDay(r.created_at))}</dd>
            </dl>
            <div class="admin-card-actions">
                <button type="button" class="btn-secondary-clean" data-decide="reject">Refuser</button>
                <button type="button" class="btn-primary-clean" data-decide="approve">Valider</button>
            </div>
        </article>`).join('');
}

function renderOperators(rows) {
    const list = document.getElementById('admin-operators');
    if (!list) return;
    if (!rows.length) {
        list.innerHTML = '<p class="admin-empty">Aucun exploitant pour l’instant.</p>';
        return;
    }
    list.innerHTML = rows.map(o => `
        <div class="admin-row" data-distributor-id="${escapeHTML(o.distributor_id)}" data-user-id="${escapeHTML(o.user_id)}">
            <span class="admin-row-main">
                <strong>${escapeHTML(o.distributor_name)}</strong>
                <span class="admin-row-meta">${escapeHTML(o.email || 'compte inconnu')} · depuis le ${escapeHTML(formatDay(o.granted_at))}</span>
            </span>
            <button type="button" class="admin-revoke" data-revoke="1">Retirer</button>
        </div>`).join('');
}

function markDistributor(distributorId, hasOperator) {
    const d = AppState.distributors.find(x => x.id === distributorId);
    if (d) d.hasOperator = hasOperator;
}

async function decide(card, approve) {
    card.querySelectorAll('button').forEach(b => { b.disabled = true; });
    const { error } = await supabaseClient.rpc('admin_decide_operator_request', { p_id: Number(card.dataset.requestId), p_approve: approve });
    if (error) {
        console.warn('[DistriMatch] Decision refusee :', error.code, error.message);
        showToast('Action impossible : demande déjà traitée ou droits manquants', 'error');
        loadAdmin();
        return;
    }
    if (approve) markDistributor(card.dataset.distributorId, true);
    showToast(approve ? 'Exploitant validé' : 'Demande refusée', 'success');
    loadAdmin();
}

async function revoke(row) {
    const name = row.querySelector('strong')?.textContent || '';
    const ok = await confirmDialog({
        title: 'Retirer ce statut ?',
        message: `Ce compte ne sera plus l’exploitant de ${name}. Ses signaux redeviendront ceux d’un membre.`,
        confirmLabel: 'Retirer'
    });
    if (!ok) return;
    const { error } = await supabaseClient.rpc('admin_revoke_operator', { p_distributor_id: row.dataset.distributorId, p_user_id: row.dataset.userId });
    if (error) {
        showToast('Retrait impossible, réessaie plus tard', 'error');
        return;
    }
    showToast('Statut retiré', 'success');
    await loadAdmin();
    // Le tag reste si un autre compte exploite encore la fiche
    const still = document.querySelector(`#admin-operators [data-distributor-id="${CSS.escape(row.dataset.distributorId)}"]`);
    markDistributor(row.dataset.distributorId, !!still);
}

export function initAdmin() {
    const view = document.getElementById('admin-view');
    if (!view) return;
    view.addEventListener('click', (e) => {
        const decideBtn = e.target.closest('[data-decide]');
        if (decideBtn) {
            decide(decideBtn.closest('.admin-card'), decideBtn.dataset.decide === 'approve');
            return;
        }
        const revokeBtn = e.target.closest('[data-revoke]');
        if (revokeBtn) revoke(revokeBtn.closest('.admin-row'));
    });
}
