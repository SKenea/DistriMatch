/**
 * DistriMatch - Exploitants d'un distributeur (EPIC-T18 / T20, migrations 020-021)
 *
 * Cote membre (maquette 3 « mixte », docs/maquettes/2026-10-02-exploitant/) :
 *   - « À propos » : « C'est ton distributeur ? » -> formulaire leger (lien,
 *     entreprise, message), sans SIRET ; ensuite un bloc « Ta demande » (statut +
 *     nouveaux messages) qui ouvre la page « Ma demande » ;
 *   - page « Ma demande » (vue operator-request) : statut, barre 4 etapes, carte
 *     « Ce qu'il te reste à faire » (SIRET quand l'equipe le demande, code recu
 *     par courrier), puis l'echange direct avec l'equipe.
 * Tag « Exploitant vérifié » sur la fiche ; « Info de l'exploitant » : availability.js.
 * Fonctions partagees avec la console (js/admin.js) : renderOperatorProgress,
 * renderOperatorThread. Etat du compte relu a la connexion ; jamais bloquant.
 */

import { AppState, supabaseClient } from './state.js';
import {
    escapeHTML, showToast, validateOperatorRequest, describeOperatorRequestError, OPERATOR_RELATIONS,
    OPERATOR_STEPS, describeOperatorStatus, isValidSiret, formatSiret, countUnreadMessages, describeCodeResult
} from './utils.js';
import { isAuthenticated, requireAuth, onAuthChange } from './auth.js';
import { switchView, registerViewCallback } from './navigation.js';

const mine = { operated: new Set(), requests: [], unread: new Map(), admin: false };
let ready = Promise.resolve();
let openRequestId = null;
let pollTimer = null;

export function isAdminUser() {
    return mine.admin;
}

export function whenOperatorStateReady() {
    return ready;
}

function activeRequestFor(distributorId) {
    return mine.requests.find(r => r.distributor_id === distributorId && r.status !== 'approved' && r.status !== 'rejected')
        || mine.requests.find(r => r.distributor_id === distributorId && r.status === 'rejected') || null;
}

// Relit l'etat du compte connecte ; remis a zero a la deconnexion.
export function refreshOperatorState() {
    mine.operated = new Set();
    mine.requests = [];
    mine.unread = new Map();
    mine.admin = false;
    if (!isAuthenticated() || !supabaseClient) {
        applyOperatorState();
        ready = Promise.resolve();
        return ready;
    }
    ready = Promise.all([
        supabaseClient.rpc('my_operated_distributors'),
        supabaseClient.from('operator_requests')
            .select('id, distributor_id, company, relation, message, siret, status, created_at, code_sent_at, code_expires_at, code_attempts, reject_reason, member_read_at')
            .order('created_at', { ascending: false }),
        supabaseClient.rpc('is_admin'),
        supabaseClient.from('operator_request_messages').select('request_id, author, created_at')
    ]).then(([operated, requests, admin, messages]) => {
        for (const row of operated.data || []) mine.operated.add(typeof row === 'string' ? row : row.my_operated_distributors);
        mine.requests = requests.data || [];
        mine.admin = admin.data === true;
        for (const r of mine.requests) {
            const own = (messages.data || []).filter(m => m.request_id === r.id);
            mine.unread.set(r.id, countUnreadMessages(own, r.member_read_at, 'member'));
        }
    }).catch(() => { /* hors ligne : rien */ }).finally(applyOperatorState);
    return ready;
}

function applyOperatorState() {
    const menuItem = document.getElementById('menu-admin');
    if (menuItem) menuItem.hidden = !mine.admin;
    renderAccountRow();
    const d = AppState.currentDistributor;
    if (d && document.getElementById('dist-modal-overlay')?.classList.contains('active')) renderOperatorSection(d);
}

// Page Compte : « Ma demande d'exploitant » si le compte en a une
function renderAccountRow() {
    const row = document.getElementById('account-operator-row');
    if (!row) return;
    const latest = mine.requests[0];
    row.hidden = !latest;
    if (!latest) return;
    const unread = mine.unread.get(latest.id) || 0;
    const label = row.querySelector('.account-row-label');
    if (label) label.textContent = unread ? `Ma demande d’exploitant · ${unread} nouveau${unread > 1 ? 'x' : ''}` : 'Ma demande d’exploitant';
    row.dataset.requestId = String(latest.id);
}

// Tag pres du nom + bloc de « À propos »
export function renderOperatorSection(distributor) {
    const tag = document.getElementById('dist-modal-operator');
    if (tag) tag.hidden = !distributor?.hasOperator;
    const box = document.getElementById('dist-operator');
    if (!box) return;
    if (!distributor || distributor.isLocalOnly) {
        box.hidden = true;
        box.innerHTML = '';
        return;
    }
    box.hidden = false;
    if (mine.operated.has(distributor.id)) {
        box.innerHTML = '<p class="operator-note is-ok">Tu es l’exploitant vérifié de ce distributeur : tes signaux comptent en priorité.</p>';
        return;
    }
    const req = activeRequestFor(distributor.id);
    if (req && req.status !== 'rejected') {
        const status = describeOperatorStatus(req.status);
        const unread = mine.unread.get(req.id) || 0;
        box.innerHTML = `<button type="button" class="operator-request-link" data-open-request="${req.id}">
            <span class="operator-request-link-main"><strong>Ta demande d’exploitant</strong>
            <span class="operator-status is-${status.tone}">${escapeHTML(status.label)}</span></span>
            ${unread ? `<span class="operator-unread">${unread} nouveau${unread > 1 ? 'x' : ''} message${unread > 1 ? 's' : ''}</span>` : ''}
        </button>`;
        return;
    }
    box.innerHTML = `${req?.status === 'rejected' ? `<p class="operator-note">Ta demande a été refusée${req.reject_reason ? ` : ${escapeHTML(req.reject_reason)}` : ''}.</p>` : ''}
        <button type="button" class="operator-claim" id="dist-operator-claim">C’est ton distributeur ?</button>`;
}

function openClaimForm() {
    const box = document.getElementById('dist-operator');
    const d = AppState.currentDistributor;
    if (!box || !d) return;
    const choices = Object.entries(OPERATOR_RELATIONS).map(([value, label]) =>
        `<button type="button" role="radio" aria-checked="false" class="operator-relation" data-relation="${value}">${escapeHTML(label)}<span class="dd-box" aria-hidden="true"></span></button>`).join('');
    box.innerHTML = `
        <form class="operator-form" id="dist-operator-form" novalidate>
            <p class="operator-form-title">C’est ton distributeur ?</p>
            <p class="operator-form-help">Dis-nous qui tu es. On vérifie ensuite avec toi, ici, avant de te donner le statut d’exploitant.</p>
            <p class="operator-field-label" id="dist-operator-relation-label">Ton lien avec <strong>${escapeHTML(d.name)}</strong></p>
            <div class="operator-relations" role="radiogroup" aria-labelledby="dist-operator-relation-label">${choices}</div>
            <label class="operator-field">Nom de l’entreprise
                <input type="text" name="company" maxlength="100" autocomplete="organization" required>
            </label>
            <label class="operator-field">Un mot pour l’équipe <span class="operator-optional">(facultatif)</span>
                <textarea name="message" maxlength="500" rows="2"></textarea>
            </label>
            <p class="operator-form-error" id="dist-operator-error" role="alert" hidden></p>
            <div class="operator-form-actions">
                <button type="button" class="btn-secondary-clean" id="dist-operator-cancel">Annuler</button>
                <button type="submit" class="btn-primary-clean" id="dist-operator-submit">Envoyer la demande</button>
            </div>
        </form>`;
    box.querySelector('.operator-relation')?.focus();
}

async function submitClaim(form) {
    const d = AppState.currentDistributor;
    if (!d) return;
    const values = {
        relation: form.querySelector('.operator-relation[aria-checked="true"]')?.dataset.relation || '',
        company: form.company.value,
        message: form.message.value
    };
    const errorEl = document.getElementById('dist-operator-error');
    const invalid = validateOperatorRequest(values);
    if (invalid) {
        errorEl.textContent = invalid;
        errorEl.hidden = false;
        return;
    }
    if (!supabaseClient) {
        showToast('Service indisponible, réessaie plus tard', 'error');
        return;
    }
    const submit = document.getElementById('dist-operator-submit');
    submit.disabled = true;
    let error = null;
    try {
        ({ error } = await supabaseClient.from('operator_requests').insert({
            distributor_id: d.id, relation: values.relation, company: values.company.trim(), message: values.message.trim() || null
        }));
    } catch (e) {
        error = e;
    }
    if (error && error.code !== '23505') {
        console.warn('[DistriMatch] Demande exploitant refusee :', error.code, error.message);
        errorEl.textContent = describeOperatorRequestError(error);
        errorEl.hidden = false;
        submit.disabled = false;
        return;
    }
    showToast('Demande envoyée : l’équipe te répond ici.', 'success');
    await refreshOperatorState();
    const req = activeRequestFor(d.id);
    if (req) openOperatorRequest(req.id);
}

// ============================================
// RENDUS PARTAGES (membre et console)
// ============================================

export function renderOperatorProgress(status) {
    const s = describeOperatorStatus(status);
    if (status === 'rejected') return '<p class="operator-progress-rejected">Demande refusée</p>';
    return `<ol class="operator-progress" aria-label="Étape ${s.step} sur 4 : ${escapeHTML(s.label)}">${OPERATOR_STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < s.step || status === 'approved' ? 'done' : n === s.step ? 'current' : 'todo';
        return `<li class="is-${state}"${state === 'current' ? ' aria-current="step"' : ''}><span class="operator-progress-dot" aria-hidden="true"></span>${escapeHTML(label)}</li>`;
    }).join('')}</ol>`;
}

function formatWhen(iso) {
    try {
        return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return '';
    }
}

// Fil : la demande en premiere bulle, puis les messages (membre / equipe / evenements)
export function renderOperatorThread(request, messages, me = 'member') {
    const intro = `<div class="op-msg is-member${me === 'member' ? ' is-mine' : ''}">
        <span class="op-msg-meta">${me === 'member' ? 'Toi' : 'Membre'} · ${escapeHTML(formatWhen(request.created_at))}</span>
        <div class="op-msg-bubble"><dl class="op-msg-facts"><dt>Lien</dt><dd>${escapeHTML(OPERATOR_RELATIONS[request.relation] || '')}</dd><dt>Entreprise</dt><dd>${escapeHTML(request.company || '')}</dd></dl>${request.message ? `<p>${escapeHTML(request.message)}</p>` : ''}</div>
    </div>`;
    const rows = messages.map(m => {
        if (m.author === 'system') return `<p class="op-msg-event"><span>${escapeHTML(m.body)} · ${escapeHTML(formatWhen(m.created_at))}</span></p>`;
        const mineMsg = m.author === me;
        const who = m.author === 'admin' ? 'Équipe DistriMatch' : (me === 'member' ? 'Toi' : 'Membre');
        return `<div class="op-msg is-${m.author}${mineMsg ? ' is-mine' : ''}">
            <span class="op-msg-meta">${escapeHTML(mineMsg && me === 'member' ? 'Toi' : who)} · ${escapeHTML(formatWhen(m.created_at))}</span>
            <div class="op-msg-bubble"><p>${escapeHTML(m.body)}</p></div>
        </div>`;
    }).join('');
    return intro + rows;
}

export async function loadOperatorMessages(requestId) {
    if (!supabaseClient) return [];
    const { data } = await supabaseClient.from('operator_request_messages')
        .select('id, author, body, created_at').eq('request_id', requestId).order('created_at', { ascending: true });
    return data || [];
}

// ============================================
// PAGE « MA DEMANDE » (membre)
// ============================================

function renderTodo(req) {
    const d = AppState.distributors.find(x => x.id === req.distributor_id);
    const day = (iso) => iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '';
    switch (req.status) {
        case 'pending':
            return '<h3>L’équipe regarde ta demande</h3><p>Elle te répond ici, en général sous 2 jours. Tu peux lui écrire dessous.</p>';
        case 'siret_requested':
            return `<h3>Donne le SIRET de ton entreprise</h3>
                <p>14 chiffres, sur un Kbis ou une facture. Il reste privé : seule l’équipe le voit.</p>
                <form class="op-todo-form" id="op-siret-form" novalidate>
                    <label class="operator-field">SIRET
                        <input type="text" name="siret" inputmode="numeric" autocomplete="off" maxlength="17" placeholder="123 456 789 00012" required>
                    </label>
                    <p class="operator-form-error" id="op-siret-error" role="alert" hidden></p>
                    <button type="submit" class="btn-primary-clean">Envoyer le SIRET</button>
                </form>`;
        case 'siret_received':
            return '<h3>SIRET reçu : l’équipe vérifie l’entreprise</h3><p>Un code va t’être envoyé par courrier à l’adresse officielle de l’entreprise.</p>';
        case 'code_sent':
            return `<h3>Tape le code reçu par courrier</h3>
                <p>Envoyé le ${escapeHTML(day(req.code_sent_at))} à l’adresse officielle de l’entreprise : il arrive en 2 à 5 jours ouvrés.</p>
                <form class="op-todo-form" id="op-code-form" novalidate>
                    <label class="op-code-label" for="op-code-input">Code à 5 chiffres</label>
                    <div class="op-code">
                        <input id="op-code-input" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="5" pattern="[0-9]{5}" aria-describedby="op-code-help">
                        <span class="op-code-boxes" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
                    </div>
                    <p class="op-code-help" id="op-code-help">Valable jusqu’au ${escapeHTML(day(req.code_expires_at))} · ${Math.max(0, 5 - (req.code_attempts || 0))} essais restants</p>
                    <p class="operator-form-error" id="op-code-error" role="alert" hidden></p>
                    <button type="submit" class="btn-primary-clean">Valider le code</button>
                </form>`;
        case 'approved':
            return `<h3>Tu es l’exploitant vérifié${d ? ` de ${escapeHTML(d.name)}` : ''}</h3><p>Le badge apparaît sur la fiche et tes signaux comptent en priorité.</p>`;
        case 'rejected':
            return `<h3>Demande refusée</h3><p>${escapeHTML(req.reject_reason || 'L’équipe n’a pas pu vérifier le lien avec l’entreprise.')}</p>`;
        default:
            return '';
    }
}

export async function openOperatorRequest(requestId) {
    openRequestId = Number(requestId);
    if (document.getElementById('dist-modal-overlay')?.classList.contains('active')) document.getElementById('dist-modal-close')?.click();
    switchView('operator-request');
    await renderOperatorRequestView();
    // L'action du moment d'abord : la page s'ouvre en haut
    document.getElementById('operator-request-view')?.scrollTo?.(0, 0);
}

async function renderOperatorRequestView() {
    const view = document.getElementById('operator-request-content');
    const req = mine.requests.find(r => r.id === openRequestId);
    if (!view || !req) return;
    const d = AppState.distributors.find(x => x.id === req.distributor_id);
    const status = describeOperatorStatus(req.status);
    const messages = await loadOperatorMessages(req.id);
    if (openRequestId !== req.id) return;
    view.innerHTML = `
        <div class="op-head">
            <p class="op-head-sub">${escapeHTML(OPERATOR_RELATIONS[req.relation] || '')} · ${escapeHTML(d?.name || '')}</p>
            <span class="operator-status is-${status.tone}">${escapeHTML(status.label)}</span>
        </div>
        ${renderOperatorProgress(req.status)}
        <section class="op-todo is-${req.status}" aria-labelledby="op-todo-title"><p class="op-todo-kicker" id="op-todo-title">Ce qu’il te reste à faire</p>${renderTodo(req)}</section>
        <h3 class="account-section-label op-thread-title">Échange avec l’équipe <span>réponse visible ici, sans e-mail</span></h3>
        <div class="op-thread" id="op-thread" aria-live="polite">${renderOperatorThread(req, messages, 'member')}</div>`;
    document.getElementById('op-composer')?.removeAttribute('hidden');
    // Lu : on remet le compteur a zero
    if ((mine.unread.get(req.id) || 0) > 0 && supabaseClient) {
        supabaseClient.rpc('mark_operator_request_read', { p_request_id: req.id }).then(() => {
            mine.unread.set(req.id, 0);
            renderAccountRow();
        });
    }
}

async function submitSiret(form) {
    const errorEl = document.getElementById('op-siret-error');
    const value = form.siret.value;
    if (!isValidSiret(value)) {
        errorEl.textContent = 'SIRET invalide : vérifie les 14 chiffres.';
        errorEl.hidden = false;
        return;
    }
    const { error } = await supabaseClient.rpc('submit_operator_siret', { p_request_id: openRequestId, p_siret: value });
    if (error) {
        errorEl.textContent = describeOperatorRequestError(error);
        errorEl.hidden = false;
        return;
    }
    showToast('SIRET envoyé', 'success');
    await refreshOperatorState();
    renderOperatorRequestView();
}

async function submitCode(form) {
    const errorEl = document.getElementById('op-code-error');
    const code = form.code.value.replace(/\D/g, '');
    if (code.length !== 5) {
        errorEl.textContent = 'Le code a 5 chiffres.';
        errorEl.hidden = false;
        return;
    }
    const { data, error } = await supabaseClient.rpc('verify_operator_code', { p_request_id: openRequestId, p_code: code });
    if (error) {
        errorEl.textContent = describeOperatorRequestError(error);
        errorEl.hidden = false;
        return;
    }
    if (!data?.ok) {
        errorEl.textContent = describeCodeResult(data);
        errorEl.hidden = false;
        form.code.value = '';
        syncCodeBoxes(form.code);
        const req = mine.requests.find(r => r.id === openRequestId);
        if (req && Number.isFinite(data?.left)) req.code_attempts = 5 - data.left;
        return;
    }
    const req = mine.requests.find(r => r.id === openRequestId);
    const d = req && AppState.distributors.find(x => x.id === req.distributor_id);
    if (d) d.hasOperator = true;
    showToast('Tu es l’exploitant vérifié !', 'success');
    await refreshOperatorState();
    renderOperatorRequestView();
}

async function sendMemberMessage(form) {
    const body = form.body.value.trim();
    if (!body || !openRequestId) return;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    const { error } = await supabaseClient.rpc('post_operator_message', { p_request_id: openRequestId, p_body: body });
    btn.disabled = false;
    if (error) {
        showToast(describeOperatorRequestError(error), 'error');
        return;
    }
    form.body.value = '';
    renderOperatorRequestView();
}

// Les 5 cases suivent le champ unique (one-time-code)
function syncCodeBoxes(input) {
    const boxes = input.parentElement?.querySelectorAll('.op-code-boxes i') || [];
    const digits = input.value.replace(/\D/g, '').slice(0, 5);
    if (input.value !== digits) input.value = digits;
    boxes.forEach((b, i) => {
        b.textContent = digits[i] || '';
        b.classList.toggle('is-active', i === Math.min(digits.length, 4) && document.activeElement === input);
    });
}

export function initOperators() {
    onAuthChange(() => refreshOperatorState());
    refreshOperatorState();
    registerViewCallback('operator-request', () => {
        clearInterval(pollTimer);
        // Pas de push : on relit le fil toutes les 30 s tant que la page est ouverte
        pollTimer = setInterval(() => {
            if (!document.getElementById('operator-request-view')?.classList.contains('view-active')) {
                clearInterval(pollTimer);
                return;
            }
            refreshOperatorState().then(renderOperatorRequestView);
        }, 30000);
    });
    const box = document.getElementById('dist-operator');
    box?.addEventListener('click', (e) => {
        if (e.target.closest('#dist-operator-claim')) {
            if (!isAuthenticated()) {
                requireAuth();
                return;
            }
            openClaimForm();
            return;
        }
        const relation = e.target.closest('.operator-relation');
        if (relation) {
            box.querySelectorAll('.operator-relation').forEach(b => b.setAttribute('aria-checked', String(b === relation)));
            return;
        }
        const open = e.target.closest('[data-open-request]');
        if (open) {
            openOperatorRequest(open.dataset.openRequest);
            return;
        }
        if (e.target.closest('#dist-operator-cancel')) renderOperatorSection(AppState.currentDistributor);
    });
    box?.addEventListener('submit', (e) => {
        e.preventDefault();
        submitClaim(e.target);
    });
    document.getElementById('account-operator-row')?.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.requestId;
        if (id) openOperatorRequest(id);
    });
    const view = document.getElementById('operator-request-view');
    view?.addEventListener('submit', (e) => {
        e.preventDefault();
        if (e.target.id === 'op-siret-form') submitSiret(e.target);
        else if (e.target.id === 'op-code-form') submitCode(e.target);
        else if (e.target.id === 'op-composer') sendMemberMessage(e.target);
    });
    view?.addEventListener('input', (e) => {
        if (e.target.id === 'op-code-input') syncCodeBoxes(e.target);
        if (e.target.name === 'siret') {
            const pos = e.target.value.length;
            e.target.value = formatSiret(e.target.value);
            if (pos === e.target.value.length) e.target.setSelectionRange(pos, pos);
        }
    });
    view?.addEventListener('focusin', (e) => { if (e.target.id === 'op-code-input') syncCodeBoxes(e.target); });
    view?.addEventListener('focusout', (e) => { if (e.target.id === 'op-code-input') syncCodeBoxes(e.target); });
}
