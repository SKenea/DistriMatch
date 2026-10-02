/**
 * DistriMatch - Avis sur les machines (EPIC-T8)
 *
 * Onglet « Avis » de la fiche : tout le monde lit les avis (du plus recent au
 * plus ancien, 10 par page), un compte connecte depose, modifie ou supprime SON
 * avis (note 1..5 + commentaire facultatif), un visiteur est invite a se
 * connecter. La note affichee en tete de fiche vient de la vue
 * distributor_ratings (migration 016), jamais des colonnes du seed.
 *
 * Securite portee par la base (016) : RLS, un avis par compte et par machine,
 * 10 avis / heure / compte, comptes bloques. Ce module ne bloque jamais
 * l'ouverture de la fiche : lectures en fire-and-forget.
 */

import { AppState, supabaseClient } from './state.js';
import {
    escapeHTML, generateStars, showToast, timeAgo,
    describeRating, validateReview, describeReviewError, REVIEW_BODY_MAX, isPrivateFiche
} from './utils.js';
import { isAuthenticated, getCurrentUser, requireAuth, promptReconnect } from './auth.js';
import { confirmDialog } from './confirm-dialog.js';

const PAGE_SIZE = 10;
const COLUMNS = 'id, user_id, author_name, rating, body, created_at, updated_at';

let state = freshState(null);

function freshState(distributorId) {
    return { distributorId, items: [], total: 0, loaded: false, mine: null, draftRating: 0, busy: false };
}

function currentDistributor() {
    const d = AppState.currentDistributor;
    return d && d.id === state.distributorId ? d : null;
}

// ============================================
// NOTE EN TETE DE FICHE
// ============================================

export function renderRatingHeader(distributor) {
    const ratingEl = document.getElementById('dist-modal-rating');
    const reviewsEl = document.getElementById('dist-modal-reviews');
    if (!ratingEl || !reviewsEl || !distributor) return;
    const r = describeRating(distributor.reviewCount, distributor.rating);
    if (r.hasReviews) {
        ratingEl.textContent = `${r.score} ${r.stars}`;
        ratingEl.classList.remove('no-reviews');
        reviewsEl.textContent = r.count;
        reviewsEl.style.display = '';
    } else {
        ratingEl.textContent = r.label;
        ratingEl.classList.add('no-reviews');
        reviewsEl.textContent = '';
        reviewsEl.style.display = 'none';
    }
}

// ============================================
// LECTURE
// ============================================

// Fire-and-forget : l'appelant ne l'await jamais.
export function loadReviewsForDistributor(distributor) {
    state = freshState(distributor?.id || null);
    // Fiche seulement locale (EPIC-T9) ou pas encore publiee (EPIC-T21) : pas d'avis
    if (isPrivateFiche(distributor)) {
        state.loaded = true;
        renderReviews();
        return;
    }
    renderReviews();
    if (!supabaseClient || !distributor) return;
    fetchPage();
    fetchMine();
}

async function fetchPage() {
    const distributorId = state.distributorId;
    const from = state.items.length;
    try {
        const { data, error, count } = await supabaseClient
            .from('reviews')
            .select(COLUMNS, { count: 'exact' })
            .eq('distributor_id', distributorId)
            .order('created_at', { ascending: false })
            .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        if (state.distributorId !== distributorId) return;   // la fiche a change
        state.items = state.items.concat(data || []);
        state.total = typeof count === 'number' ? count : state.items.length;
        state.loaded = true;
        renderReviews();
    } catch (e) {
        console.warn('[DistriMatch] Avis indisponibles :', e?.message || e);
    }
}

async function fetchMine() {
    const distributorId = state.distributorId;
    const uid = isAuthenticated() ? getCurrentUser()?.id : null;
    if (!uid) {
        state.mine = null;
        renderReviews();
        return;
    }
    try {
        const { data, error } = await supabaseClient
            .from('reviews')
            .select(COLUMNS)
            .eq('distributor_id', distributorId)
            .eq('user_id', uid)
            .maybeSingle();
        if (error) throw error;
        if (state.distributorId !== distributorId) return;
        state.mine = data || null;
        state.draftRating = data ? data.rating : 0;
        const body = document.getElementById('dist-review-body');
        if (body) body.value = data?.body || '';
        renderReviews();
    } catch (e) {
        console.warn('[DistriMatch] Ton avis est indisponible :', e?.message || e);
    }
}

// Connexion / deconnexion pendant que la fiche est ouverte
export function refreshReviewsForAuth() {
    if (!state.distributorId) return;
    fetchMine();
    renderReviews();
}

// ============================================
// RENDU
// ============================================

function renderStarsInput() {
    document.querySelectorAll('#dist-review-stars .review-star').forEach(btn => {
        const value = Number(btn.dataset.rating);
        const on = value <= state.draftRating;
        btn.classList.toggle('is-on', on);
        btn.setAttribute('aria-pressed', String(value === state.draftRating));
    });
}

function updateFormState() {
    const body = document.getElementById('dist-review-body');
    const chars = document.getElementById('dist-review-chars');
    const submit = document.getElementById('dist-review-submit');
    const length = body ? body.value.trim().length : 0;
    if (chars) chars.textContent = `${length} / ${REVIEW_BODY_MAX}`;
    if (submit) submit.disabled = state.busy || state.draftRating < 1 || length > REVIEW_BODY_MAX;
}

export function renderReviews() {
    const distributor = currentDistributor();
    const authed = isAuthenticated();
    const localOnly = isPrivateFiche(distributor);

    const mineBox = document.getElementById('dist-review-mine');
    const invite = document.getElementById('dist-review-invite');
    if (mineBox) mineBox.hidden = !authed || localOnly;
    if (invite) invite.hidden = authed || localOnly;
    const title = document.getElementById('dist-review-mine-title');
    if (title) title.textContent = state.mine ? 'Ton avis' : 'Donne ton avis';
    const submit = document.getElementById('dist-review-submit');
    if (submit) submit.textContent = state.mine ? 'Modifier mon avis' : 'Publier';
    const del = document.getElementById('dist-review-delete');
    if (del) del.hidden = !state.mine;
    renderStarsInput();
    updateFormState();

    const summary = document.getElementById('dist-reviews-summary');
    if (summary) {
        const r = describeRating(distributor?.reviewCount, distributor?.rating);
        summary.textContent = r.hasReviews ? `${r.score} ${r.stars} · ${distributor.reviewCount} avis` : '';
        summary.hidden = !r.hasReviews;
    }

    const list = document.getElementById('dist-reviews-list');
    if (list) {
        const uid = getCurrentUser()?.id;
        list.innerHTML = state.items.map(rv => `
            <li class="review-item${uid && rv.user_id === uid ? ' is-mine' : ''}">
                <div class="review-head">
                    <span class="review-author">${escapeHTML(rv.author_name || 'Membre DistriMatch')}${uid && rv.user_id === uid ? ' <span class="review-mine-tag">Ton avis</span>' : ''}</span>
                    <span class="review-time">${escapeHTML(timeAgo(new Date(rv.created_at).getTime()))}</span>
                </div>
                <div class="review-stars" role="img" aria-label="Note : ${Number(rv.rating)} sur 5">${generateStars(Number(rv.rating))}</div>
                ${rv.body ? `<p class="review-body">${escapeHTML(rv.body)}</p>` : ''}
            </li>`).join('');
    }

    const empty = document.getElementById('dist-reviews-empty');
    if (empty) {
        empty.textContent = distributor?.isLocalOnly
            ? 'Publie d\'abord ce distributeur pour recevoir des avis.'
            : localOnly ? 'Les avis s\'ouvrent quand le distributeur est publié.' : 'Pas encore d\'avis sur ce distributeur.';
        empty.hidden = !(state.loaded && state.total === 0);
    }
    const more = document.getElementById('dist-reviews-more');
    if (more) more.hidden = !(state.loaded && state.items.length < state.total);
}

// ============================================
// ECRITURE (compte connecte)
// ============================================

// Un envoi qui echoue pour une raison de session : on renouvelle et on renvoie
// une fois (meme logique que les signaux, EPIC-T6).
async function withSessionRetry(run) {
    let res = await run();
    const code = res.error?.code;
    if (res.error && (res.status === 401 || code === '28000' || code === 'PGRST301')) {
        try { await supabaseClient.auth.refreshSession(); } catch (e) { /* le renvoi dira pourquoi */ }
        res = await run();
    }
    return res;
}

function reportError(res) {
    console.warn('[DistriMatch] Avis refuse :', res.status, res.error?.code, res.error?.message);
    showToast(describeReviewError(res.error, res.status, navigator.onLine), 'error');
    if (res.error?.code === '28000' || res.status === 401) promptReconnect();
}

// Apres un changement : note reelle de la machine, liste et mon avis a jour
async function refreshAfterChange() {
    const distributor = currentDistributor();
    if (!distributor) return;
    try {
        const { data } = await supabaseClient
            .from('distributor_ratings')
            .select('avis, moyenne')
            .eq('distributor_id', distributor.id)
            .maybeSingle();
        distributor.reviewCount = data?.avis || 0;
        distributor.rating = Number(data?.moyenne) || 0;
    } catch (e) { /* la note se mettra a jour au prochain chargement */ }
    renderRatingHeader(distributor);
    state.items = [];
    state.loaded = false;
    await fetchPage();
    await fetchMine();
}

async function submitReview() {
    const distributor = currentDistributor();
    if (!distributor || state.busy || !supabaseClient) return;
    if (!isAuthenticated()) {
        requireAuth();
        return;
    }
    const body = document.getElementById('dist-review-body');
    const check = validateReview({ rating: state.draftRating, body: body?.value });
    if (!check.ok) {
        showToast(check.error, 'error');
        return;
    }
    state.busy = true;
    updateFormState();
    try {
        const editing = !!state.mine;
        const res = await withSessionRetry(() => editing
            ? supabaseClient.from('reviews').update(check.value).eq('id', state.mine.id).select(COLUMNS).single()
            : supabaseClient.from('reviews').insert({ distributor_id: distributor.id, ...check.value }).select(COLUMNS).single());
        if (res.error) {
            reportError(res);
            if (res.error.code === '23505') await fetchMine();   // deja un avis : on le recharge pour le modifier
            return;
        }
        showToast(editing ? 'Avis modifié, merci !' : 'Merci pour ton avis !', 'success');
        await refreshAfterChange();
    } finally {
        state.busy = false;
        updateFormState();
    }
}

async function deleteReview() {
    if (!state.mine || state.busy || !supabaseClient) return;
    const ok = await confirmDialog({
        title: 'Supprimer ton avis ?',
        message: 'Il disparaîtra de la fiche de ce distributeur.',
        confirmLabel: 'Supprimer'
    });
    if (!ok) return;
    state.busy = true;
    try {
        const id = state.mine.id;
        const res = await withSessionRetry(() => supabaseClient.from('reviews').delete().eq('id', id));
        if (res.error) {
            reportError(res);
            return;
        }
        state.mine = null;
        state.draftRating = 0;
        const body = document.getElementById('dist-review-body');
        if (body) body.value = '';
        showToast('Avis supprimé', 'default');
        await refreshAfterChange();
    } finally {
        state.busy = false;
        updateFormState();
    }
}

// Listeners poses une seule fois (l'onglet est statique, la liste re-rendue)
export function initReviews() {
    const pane = document.querySelector('[data-tab-pane="avis"]');
    if (!pane || pane.dataset.reviewsWired) return;
    pane.dataset.reviewsWired = '1';
    pane.addEventListener('click', (e) => {
        const star = e.target.closest('.review-star');
        if (star) {
            state.draftRating = Number(star.dataset.rating);
            renderStarsInput();
            updateFormState();
            return;
        }
        if (e.target.closest('#dist-review-submit')) { submitReview(); return; }
        if (e.target.closest('#dist-review-delete')) { deleteReview(); return; }
        if (e.target.closest('#dist-reviews-more')) { fetchPage(); return; }
        if (e.target.closest('#dist-review-invite-btn')) requireAuth();
    });
    document.getElementById('dist-review-body')?.addEventListener('input', updateFormState);
}
