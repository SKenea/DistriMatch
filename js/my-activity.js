/**
 * DistriMatch - « Mon activité » : l'historique du compte (EPIC-T22, migration 023)
 *
 * Remplace l'ancien fil local (signalements, votes, points) : la page lit
 * my_activity() (signaux, ajouts de distributeurs, avis, demandes d'exploitant),
 * du plus recent au plus ancien, avec des filtres. Une ligne ouvre la fiche.
 * Visiteur : invitation a se connecter (l'historique est lie au compte).
 */

import { AppState, supabaseClient } from './state.js';
import { escapeHTML, timeAgo, describeActivityItem } from './utils.js';
import { isAuthenticated, requireAuth, onAuthChange } from './auth.js';

let items = [];
let filter = 'all';
const FILTERS = { all: null, signal: ['signal'], addition: ['addition'], review: ['review', 'operator'] };

function visible() {
    const kinds = FILTERS[filter];
    return kinds ? items.filter(i => kinds.includes(i.kind)) : items;
}

function render() {
    const list = document.getElementById('activity-list');
    const empty = document.getElementById('activity-empty');
    const count = document.getElementById('activity-count');
    const filters = document.querySelector('.activity-filters');
    if (!list || !empty) return;
    if (!isAuthenticated()) {
        list.innerHTML = '';
        if (count) count.textContent = '';
        if (filters) filters.hidden = true;
        empty.hidden = false;
        empty.innerHTML = `<div class="empty-icon" aria-hidden="true">🕘</div>
            <h3>Ton historique</h3>
            <p>Connecte-toi pour retrouver ici tes signaux, tes ajouts et tes avis.</p>
            <button type="button" class="btn-primary-clean activity-login" id="activity-login">Se connecter</button>`;
        return;
    }
    if (filters) filters.hidden = false;
    const rows = visible();
    if (count) count.textContent = items.length ? String(items.length) : '';
    empty.hidden = rows.length > 0;
    if (!rows.length) {
        empty.innerHTML = `<div class="empty-icon" aria-hidden="true">🕘</div>
            <h3>Rien pour l’instant</h3>
            <p>Tes signaux, tes ajouts et tes avis apparaîtront ici.</p>`;
    }
    list.innerHTML = rows.map(i => {
        const d = describeActivityItem(i);
        const known = AppState.distributors.some(x => x.id === i.distributor_id);
        return `<button type="button" class="activity-row is-${escapeHTML(i.kind)}" data-distributor-id="${escapeHTML(i.distributor_id || '')}"${known ? '' : ' disabled'}>
            <span class="activity-row-dot is-${escapeHTML(d.tone)}" aria-hidden="true"></span>
            <span class="activity-row-main">
                <strong>${escapeHTML(d.title)}</strong>
                <span class="activity-row-meta">${escapeHTML(i.distributor_name || '')} · ${escapeHTML(timeAgo(new Date(i.at).getTime()))}</span>
                ${d.detail ? `<span class="activity-row-detail">${escapeHTML(d.detail)}</span>` : ''}
            </span>
        </button>`;
    }).join('');
}

export async function renderMyActivity() {
    render();
    if (!isAuthenticated() || !supabaseClient) return;
    try {
        const { data, error } = await supabaseClient.rpc('my_activity');
        if (error) throw error;
        items = data || [];
    } catch (e) {
        console.warn('[DistriMatch] Historique indisponible :', e?.message || e);
        items = [];
    }
    render();
}

export function initMyActivity() {
    onAuthChange(() => {
        items = [];
        if (document.getElementById('activity-view')?.classList.contains('view-active')) renderMyActivity();
    });
    document.querySelector('.activity-filters')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.activity-filter');
        if (!btn) return;
        filter = btn.dataset.filter;
        document.querySelectorAll('.activity-filter').forEach(b => {
            const on = b === btn;
            b.classList.toggle('active', on);
            b.setAttribute('aria-pressed', String(on));
        });
        render();
    });
    const view = document.getElementById('activity-view');
    view?.addEventListener('click', (e) => {
        if (e.target.closest('#activity-login')) {
            requireAuth();
            return;
        }
        const row = e.target.closest('.activity-row[data-distributor-id]');
        if (row && !row.disabled) window.openDistributorModal?.(row.dataset.distributorId);
    });
}
