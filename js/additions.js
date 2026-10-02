/**
 * DistriMatch - « Mes ajouts » : suivre la validation de ses fiches (EPIC-T21, migration 022)
 *
 * Une fiche ajoutee par un membre attend la validation de l'admin (en attente :
 * visible par son auteur seulement). Compte -> « Mes ajouts » liste ses fiches
 * (En attente / Publiée / Refusée [: motif]) avec l'echange direct de l'equipe
 * (distributor_review_messages) et une reponse possible. Relu a la connexion et
 * a l'ouverture de la page ; jamais bloquant.
 */

import { AppState, supabaseClient } from './state.js';
import { escapeHTML, showToast, describeReviewStatus, countUnreadMessages, describeOperatorRequestError } from './utils.js';
import { isAuthenticated, getCurrentUser, onAuthChange } from './auth.js';
import { switchView, registerViewCallback } from './navigation.js';

let mine = [];          // fiches du compte (toutes, refusees comprises)
let messages = [];      // fil de chacune

function formatWhen(iso) {
    try {
        return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return '';
    }
}

// Fil d'une fiche (membre ou console) : evenements centres, bulles sinon
export function renderReviewThread(list, me = 'member') {
    if (!list.length) return '<p class="admin-empty">Pas encore de message.</p>';
    return list.map(m => {
        if (m.author === 'system') return `<p class="op-msg-event"><span>${escapeHTML(m.body)} · ${escapeHTML(formatWhen(m.created_at))}</span></p>`;
        const mineMsg = m.author === me;
        const who = m.author === 'admin' ? 'Équipe DistriMatch' : (me === 'member' ? 'Toi' : 'Membre');
        return `<div class="op-msg is-${m.author}${mineMsg ? ' is-mine' : ''}">
            <span class="op-msg-meta">${escapeHTML(who)} · ${escapeHTML(formatWhen(m.created_at))}</span>
            <div class="op-msg-bubble"><p>${escapeHTML(m.body)}</p></div>
        </div>`;
    }).join('');
}

function unreadFor(d) {
    return countUnreadMessages(messages.filter(m => m.distributor_id === d.id), d.author_read_at, 'member');
}

export async function refreshMyAdditions() {
    mine = [];
    messages = [];
    const user = getCurrentUser();
    if (!isAuthenticated() || !supabaseClient || !user?.id) {
        renderAccountRow();
        return;
    }
    try {
        const [d, m] = await Promise.all([
            supabaseClient.from('distributors').select('id, name, type, emoji, city, review_status, review_reason, author_read_at, created_at')
                .eq('added_by', user.id).order('created_at', { ascending: false }),
            supabaseClient.from('distributor_review_messages').select('id, distributor_id, author, body, created_at').order('created_at', { ascending: true })
        ]);
        mine = d.data || [];
        messages = (m.data || []).filter(x => mine.some(f => f.id === x.distributor_id));
    } catch (e) {
        /* hors ligne : rien */
    }
    renderAccountRow();
}

function renderAccountRow() {
    const row = document.getElementById('account-additions-row');
    if (!row) return;
    row.hidden = !mine.length;
    const unread = mine.reduce((n, d) => n + unreadFor(d), 0);
    const pending = mine.filter(d => d.review_status === 'pending').length;
    const label = row.querySelector('.account-row-label');
    if (label) {
        label.textContent = `Mes ajouts${pending ? ` · ${pending} en attente` : ''}${unread ? ` · ${unread} nouveau${unread > 1 ? 'x' : ''}` : ''}`;
    }
}

function renderAdditionsView() {
    const box = document.getElementById('my-additions-content');
    if (!box) return;
    if (!mine.length) {
        box.innerHTML = '<p class="admin-empty">Tu n’as pas encore ajouté de distributeur.</p>';
        return;
    }
    box.innerHTML = mine.map(d => {
        const s = describeReviewStatus(d.review_status);
        const thread = messages.filter(m => m.distributor_id === d.id);
        const unread = unreadFor(d);
        return `<article class="admin-card addition-card" data-distributor-id="${escapeHTML(d.id)}">
            <div class="addition-head">
                <strong class="admin-card-title">${escapeHTML(d.emoji || '📍')} ${escapeHTML(d.name)}</strong>
                <span class="operator-status is-${s.tone}">${escapeHTML(s.label)}</span>
            </div>
            <p class="admin-request-meta">Ajouté le ${escapeHTML(formatWhen(d.created_at))}${d.city ? ` · ${escapeHTML(d.city)}` : ''}</p>
            ${d.review_status === 'rejected' && d.review_reason ? `<p class="addition-reason">Motif : ${escapeHTML(d.review_reason)}</p>` : ''}
            ${d.review_status !== 'rejected' ? `<button type="button" class="btn-secondary-clean" data-open-fiche="${escapeHTML(d.id)}">Voir la fiche</button>` : ''}
            <details class="addition-thread"${unread ? ' open' : ''}>
                <summary>Échange avec l’équipe${unread ? ` · ${unread} nouveau${unread > 1 ? 'x' : ''}` : ''}</summary>
                <div class="op-thread">${renderReviewThread(thread, 'member')}</div>
                <form class="op-composer addition-composer" data-distributor-id="${escapeHTML(d.id)}">
                    <label class="sr-only" for="addition-input-${escapeHTML(d.id)}">Écrire à l’équipe</label>
                    <textarea id="addition-input-${escapeHTML(d.id)}" name="body" rows="1" maxlength="1000" placeholder="Écrire à l’équipe…"></textarea>
                    <button type="submit" class="op-send" aria-label="Envoyer">→</button>
                </form>
            </details>
        </article>`;
    }).join('');
    // Lu : remise a zero des non lus
    for (const d of mine) {
        if (unreadFor(d) > 0) {
            supabaseClient.rpc('mark_review_thread_read', { p_distributor_id: d.id }).then(() => { d.author_read_at = new Date().toISOString(); renderAccountRow(); });
        }
    }
}

export function initAdditions() {
    onAuthChange(() => refreshMyAdditions());
    refreshMyAdditions();
    registerViewCallback('my-additions', () => {
        renderAdditionsView();
        refreshMyAdditions().then(renderAdditionsView);
    });
    document.getElementById('account-additions-row')?.addEventListener('click', () => switchView('my-additions'));
    const view = document.getElementById('my-additions-view');
    view?.addEventListener('click', (e) => {
        const open = e.target.closest('[data-open-fiche]');
        if (open && AppState.distributors.some(d => d.id === open.dataset.openFiche)) {
            window.openDistributorModal?.(open.dataset.openFiche);
        }
    });
    view?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target.closest('.addition-composer');
        if (!form) return;
        const body = form.body.value.trim();
        if (!body) return;
        const { error } = await supabaseClient.rpc('post_review_message', { p_distributor_id: form.dataset.distributorId, p_body: body });
        if (error) {
            showToast(describeOperatorRequestError(error), 'error');
            return;
        }
        form.body.value = '';
        await refreshMyAdditions();
        renderAdditionsView();
    });
}
