/**
 * DistriMatch - Console admin (EPIC-T18 / T20, migrations 020-021)
 *
 * Reservee aux comptes de `app_admins` (entree « Admin » du menu avatar, posee
 * par js/operators.js). Maquette 3 « mixte » :
 *   - liste des demandes (etat, « À toi », nouveaux messages) ;
 *   - detail : prochaine etape (une action principale + « Autres actions »), la
 *     demande, le registre SIRENE (API publique Recherche d'entreprises, lue ici
 *     dans le navigateur : nom, adresse, etat, dirigeants, distance, verdict),
 *     puis l'echange direct ;
 *   - « Envoyer le code par courrier » : la base genere le code (rendu une seule
 *     fois) et la console prepare la carte a imprimer a l'adresse SIRENE.
 *   - exploitants accordes (Retirer, avec confirmation).
 * Les droits sont verifies par la base : chaque fonction admin_* refuse un non-admin.
 */

import { AppState, supabaseClient } from './state.js';
import {
    escapeHTML, showToast, describeOperatorStatus, OPERATOR_RELATIONS, formatSiret, assessSirene, describeOperatorRequestError
} from './utils.js';
import { confirmDialog } from './confirm-dialog.js';
import { isAdminUser, whenOperatorStateReady, renderOperatorProgress, renderOperatorThread, loadOperatorMessages } from './operators.js';

const SIRENE_URL = 'https://recherche-entreprises.api.gouv.fr/search';
let requests = [];
let currentId = null;
const sireneCache = new Map();   // siret -> resultat (ou null)

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

function needsMe(r) {
    return r.status === 'pending' || r.status === 'siret_received' || Number(r.unread) > 0;
}

export async function loadAdmin() {
    const content = document.getElementById('admin-content');
    const detail = document.getElementById('admin-detail');
    if (!content) return;
    setStatus('Chargement…');
    await whenOperatorStateReady();
    if (!isAdminUser() || !supabaseClient) {
        content.hidden = true;
        if (detail) detail.hidden = true;
        setStatus('Réservé à l’admin.');
        return;
    }
    const [reqRes, operators] = await Promise.all([
        supabaseClient.rpc('admin_operator_requests'),
        supabaseClient.rpc('admin_operators')
    ]);
    if (reqRes.error || operators.error) {
        const code = reqRes.error?.code || operators.error?.code;
        content.hidden = true;
        setStatus(code === '42501' ? 'Réservé à l’admin.' : 'Chargement impossible, réessaie plus tard.');
        return;
    }
    setStatus('');
    requests = reqRes.data || [];
    renderOperators(operators.data || []);
    if (currentId && requests.some(r => r.id === currentId)) {
        await showDetail(currentId);
    } else {
        currentId = null;
        renderRequests();
        content.hidden = false;
        if (detail) detail.hidden = true;
    }
}

function renderRequests() {
    const list = document.getElementById('admin-requests');
    const count = document.getElementById('admin-requests-count');
    const open = requests.filter(r => r.status !== 'approved' && r.status !== 'rejected');
    if (count) count.textContent = open.length ? `(${open.length})` : '';
    if (!list) return;
    if (!requests.length) {
        list.innerHTML = '<p class="admin-empty">Aucune demande pour l’instant.</p>';
        return;
    }
    list.innerHTML = requests.map(r => {
        const s = describeOperatorStatus(r.status);
        const unread = Number(r.unread) || 0;
        return `<button type="button" class="admin-card admin-request" data-request-id="${escapeHTML(String(r.id))}">
            <span class="admin-request-top">
                <strong class="admin-card-title">${escapeHTML(r.distributor_name)}${r.city ? ` <span class="admin-card-city">· ${escapeHTML(r.city)}</span>` : ''}</strong>
                ${unread ? `<span class="admin-unread" aria-label="${unread} nouveau(x) message(s)">${unread}</span>` : ''}
            </span>
            <span class="admin-request-meta">${escapeHTML(r.company || '')} · ${escapeHTML(OPERATOR_RELATIONS[r.relation] || '')} · ${escapeHTML(formatDay(r.last_activity))}</span>
            <span class="admin-request-tags"><span class="operator-status is-${s.tone}">${escapeHTML(s.label)}</span>${needsMe(r) ? '<span class="admin-tome">À toi</span>' : ''}</span>
        </button>`;
    }).join('');
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

// ============================================
// DETAIL D'UNE DEMANDE
// ============================================

async function fetchSirene(siret) {
    if (!siret) return null;
    if (sireneCache.has(siret)) return sireneCache.get(siret);
    try {
        const res = await fetch(`${SIRENE_URL}?q=${encodeURIComponent(siret)}&per_page=1`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const hit = (json.results || [])[0] || null;
        sireneCache.set(siret, hit);
        return hit;
    } catch (e) {
        console.warn('[DistriMatch] Registre SIRENE injoignable :', e.message);
        return undefined;   // injoignable (different de « introuvable »)
    }
}

function nextStep(r, sirene) {
    switch (r.status) {
        case 'pending':
            return { text: 'Nouvelle demande : demande le SIRET pour vérifier l’entreprise.', action: 'request-siret', label: 'Demander le SIRET' };
        case 'siret_requested':
            return { text: 'En attente du SIRET du membre.', action: 'nudge', label: 'Relancer' };
        case 'siret_received':
            if (sirene?.verdict === 'bad') return { text: 'Le registre ne confirme pas l’entreprise : regarde le détail, écris au membre ou refuse.', action: null };
            if (sirene && !sirene.diffusible) return { text: 'Adresse non diffusée par le registre : passe par l’appel (Autres actions).', action: null };
            return { text: sirene?.verdict === 'ok' ? 'Le registre est cohérent. Envoie le code par courrier à l’adresse officielle.' : 'Vérifie les points du registre, puis envoie le code par courrier.', action: 'send-mail', label: 'Envoyer le code par courrier' };
        case 'code_sent':
            return { text: `Code envoyé le ${formatDay(r.code_sent_at)}, valable jusqu’au ${formatDay(r.code_expires_at)} · ${r.code_attempts || 0} essai(s) utilisé(s).`, action: 'send-mail', label: 'Renvoyer un code par courrier', secondary: true };
        case 'approved':
            return { text: 'Exploitant vérifié.', action: null };
        default:
            return { text: `Demande refusée${r.reject_reason ? ` : ${r.reject_reason}` : ''}.`, action: null };
    }
}

function renderSireneCard(r, raw, s) {
    if (!r.siret) return '<p class="admin-empty">SIRET pas encore reçu.</p>';
    if (raw === undefined) return '<p class="admin-empty">Registre injoignable pour l’instant : réessaie plus tard.</p>';
    const verdictLabel = { ok: 'Cohérent', check: 'À vérifier', bad: 'Incohérent' }[s.verdict];
    const reasons = s.reasons.length ? ` : ${s.reasons.join(', ').toLowerCase()}` : ' : nom proche, active, établissement proche';
    return `<p class="sirene-verdict is-${s.verdict}">${escapeHTML(verdictLabel + reasons)}</p>
        <dl class="admin-card-facts">
            <dt>Raison sociale</dt><dd>${escapeHTML(s.name || '—')}</dd>
            <dt>SIRET</dt><dd>${escapeHTML(formatSiret(r.siret))}</dd>
            <dt>État</dt><dd class="${s.active ? 'is-ok' : 'is-bad'}">${s.active ? 'Active' : 'Fermée'}</dd>
            <dt>Adresse</dt><dd>${escapeHTML(s.address || 'non diffusée')}</dd>
            <dt>Dirigeants</dt><dd>${escapeHTML(s.leaders.join(', ') || '—')}</dd>
            <dt>Distance</dt><dd>${s.distanceKm === null ? '—' : `${s.distanceKm < 10 ? s.distanceKm.toFixed(1).replace('.', ',') : Math.round(s.distanceKm)} km du distributeur`}</dd>
        </dl>
        <p class="admin-source">Registre SIRENE (INSEE), annuaire public des entreprises</p>`;
}

async function showDetail(id) {
    currentId = Number(id);
    const r = requests.find(x => x.id === currentId);
    const content = document.getElementById('admin-content');
    const detail = document.getElementById('admin-detail');
    if (!r || !detail) return;
    if (content) content.hidden = true;
    detail.hidden = false;
    detail.innerHTML = '<p class="admin-status">Chargement…</p>';
    const [messages, raw] = await Promise.all([loadOperatorMessages(r.id), fetchSirene(r.siret)]);
    if (currentId !== r.id) return;
    const d = AppState.distributors.find(x => x.id === r.distributor_id) || { lat: r.lat, lng: r.lng };
    const s = raw === undefined ? null : assessSirene(raw, d, r.company, r.siret);
    const step = nextStep(r, r.siret ? s : null);
    const status = describeOperatorStatus(r.status);
    const closed = r.status === 'approved' || r.status === 'rejected';
    detail.innerHTML = `
        <button type="button" class="admin-back" data-admin-back="1">← Toutes les demandes</button>
        <div class="admin-detail-head">
            <h3>${escapeHTML(r.distributor_name)}</h3>
            <span class="operator-status is-${status.tone}">${escapeHTML(status.label)}</span>
        </div>
        ${renderOperatorProgress(r.status)}
        <section class="admin-card admin-next">
            <p class="op-todo-kicker">Prochaine étape</p>
            <p>${escapeHTML(step.text)}</p>
            ${step.action ? `<button type="button" class="${step.secondary ? 'btn-secondary-clean' : 'btn-primary-clean'}" data-admin-action="${step.action}">${escapeHTML(step.label)}</button>` : ''}
            ${closed ? '' : `<details class="admin-more">
                <summary>Autres actions</summary>
                <div class="admin-more-list">
                    ${r.siret ? '<button type="button" data-admin-action="phone">Appeler l’entreprise (code par téléphone)</button>' : ''}
                    <button type="button" data-admin-action="approve">Valider sans code (exception)</button>
                    <button type="button" class="is-danger" data-admin-action="reject">Refuser…</button>
                </div>
            </details>`}
        </section>
        <section class="admin-card">
            <h4 class="admin-card-title">La demande</h4>
            <dl class="admin-card-facts">
                <dt>Compte</dt><dd>${escapeHTML(r.email || 'inconnu')}</dd>
                <dt>Lien</dt><dd>${escapeHTML(OPERATOR_RELATIONS[r.relation] || '—')}</dd>
                <dt>Entreprise</dt><dd>${escapeHTML(r.company || '—')}</dd>
                <dt>Distributeur</dt><dd>${escapeHTML(r.distributor_name)}${r.city ? `, ${escapeHTML(r.city)}` : ''}</dd>
                <dt>Reçue</dt><dd>${escapeHTML(formatDay(r.created_at))}</dd>
            </dl>
        </section>
        <section class="admin-card">
            <h4 class="admin-card-title">Registre SIRENE</h4>
            ${renderSireneCard(r, raw, s)}
        </section>
        <h3 class="account-section-label">Échange avec le membre</h3>
        <div class="op-thread" id="admin-thread">${renderOperatorThread(r, messages, 'admin')}</div>
        <form class="op-composer" id="admin-composer">
            <label class="sr-only" for="admin-composer-input">Écrire au membre</label>
            <textarea id="admin-composer-input" name="body" rows="1" maxlength="1000" placeholder="Écrire au membre…"></textarea>
            <button type="submit" class="op-send" aria-label="Envoyer">→</button>
        </form>`;
    detail.dataset.sireneName = s?.name || '';
    detail.dataset.sireneAddress = s?.address || '';
    if (Number(r.unread) > 0) {
        supabaseClient.rpc('mark_operator_request_read', { p_request_id: r.id }).then(() => { r.unread = 0; });
    }
}

function backToList() {
    currentId = null;
    document.getElementById('admin-detail').hidden = true;
    document.getElementById('admin-content').hidden = false;
    renderRequests();
}

// Feuille du bas rattachee a la page entiere (une vue a son propre defilement :
// a l'interieur, la feuille ne descendait pas jusqu'en bas de l'ecran)
function sheetRoot() {
    let sheet = document.getElementById('admin-sheet');
    if (!sheet) {
        sheet = document.createElement('div');
        sheet.className = 'admin-sheet';
        sheet.id = 'admin-sheet';
        sheet.hidden = true;
        document.body.appendChild(sheet);
        sheet.addEventListener('click', (e) => {
            if (e.target === sheet) sheet.hidden = true;
            else handleAdminClick(e);
        });
        sheet.addEventListener('submit', handleAdminSubmit);
        sheet.addEventListener('keydown', (e) => { if (e.key === 'Escape') sheet.hidden = true; });
    }
    return sheet;
}

function openSheet(html) {
    const sheet = sheetRoot();
    sheet.innerHTML = `<div class="admin-sheet-panel" role="dialog" aria-modal="false">${html}<button type="button" class="btn-secondary-clean" data-sheet-close="1">Fermer</button></div>`;
    sheet.hidden = false;
    sheet.querySelector('button, textarea')?.focus();
}

function printCard(name, address, code) {
    const card = document.getElementById('operator-print-card');
    if (!card) return;
    card.innerHTML = `<div class="print-card">
        <p class="print-card-brand">DistriMatch</p>
        <p class="print-card-to">${escapeHTML(name)}<br>${escapeHTML(address)}</p>
        <p class="print-card-code">${escapeHTML(code.split('').join(' '))}</p>
        <p>Tape ce code dans DistriMatch, onglet « À propos » de ton distributeur, rubrique « Ta demande d’exploitant ». Il est valable 30 jours.</p>
        <p class="print-card-small">Tu n’as rien demandé ? Ignore ce courrier.</p>
    </div>`;
    window.print();
}

async function runAction(action) {
    const r = requests.find(x => x.id === currentId);
    if (!r) return;
    const detail = document.getElementById('admin-detail');
    let error = null;
    if (action === 'request-siret') {
        ({ error } = await supabaseClient.rpc('admin_request_siret', { p_id: r.id }));
        if (!error) showToast('SIRET demandé au membre', 'success');
    } else if (action === 'nudge') {
        ({ error } = await supabaseClient.rpc('post_operator_message', { p_request_id: r.id, p_body: 'Petit rappel : il me manque le SIRET de ton entreprise pour continuer la vérification.' }));
        if (!error) showToast('Relance envoyée', 'success');
    } else if (action === 'send-mail') {
        const name = detail.dataset.sireneName;
        const address = detail.dataset.sireneAddress;
        if (!address) {
            showToast('Adresse SIRENE indisponible : utilise l’appel', 'error');
            return;
        }
        const ok = await confirmDialog({ title: 'Envoyer un code par courrier ?', message: `Un code à 5 chiffres sera généré pour ${name}, ${address}. Un code précédent ne marchera plus.`, confirmLabel: 'Générer le code', danger: false });
        if (!ok) return;
        const res = await supabaseClient.rpc('admin_send_operator_code', { p_id: r.id, p_channel: 'mail', p_mail_name: name, p_mail_address: address });
        error = res.error;
        if (!error) {
            await loadAdmin();
            openSheet(`<h4>Carte à poster</h4>
                <div class="print-preview"><p><strong>${escapeHTML(name)}</strong><br>${escapeHTML(address)}</p><p class="print-card-code">${escapeHTML(String(res.data).split('').join(' '))}</p></div>
                <p class="admin-source">Ce code n’est affiché qu’une fois : imprime la carte maintenant.</p>
                <button type="button" class="btn-primary-clean" data-print="${escapeHTML(String(res.data))}">Imprimer la carte</button>`);
            return;
        }
    } else if (action === 'phone') {
        const ok = await confirmDialog({ title: 'Code par téléphone ?', message: 'Appelle le numéro officiel de l’entreprise (fiche Google, autocollant du distributeur), jamais un numéro donné par le membre, puis dicte le code.', confirmLabel: 'Générer le code', danger: false });
        if (!ok) return;
        const res = await supabaseClient.rpc('admin_send_operator_code', { p_id: r.id, p_channel: 'phone' });
        error = res.error;
        if (!error) {
            await loadAdmin();
            openSheet(`<h4>Code à dicter</h4><p class="print-card-code">${escapeHTML(String(res.data).split('').join(' '))}</p><p class="admin-source">Affiché une seule fois.</p>`);
            return;
        }
    } else if (action === 'approve') {
        const ok = await confirmDialog({ title: 'Valider sans code ?', message: 'À réserver aux cas vérifiés autrement (rencontre, appel). Le membre devient exploitant vérifié.', confirmLabel: 'Valider', danger: false });
        if (!ok) return;
        ({ error } = await supabaseClient.rpc('admin_decide_operator_request', { p_id: r.id, p_approve: true }));
        if (!error) {
            const d = AppState.distributors.find(x => x.id === r.distributor_id);
            if (d) d.hasOperator = true;
            showToast('Exploitant validé', 'success');
        }
    } else if (action === 'reject') {
        openSheet(`<h4>Refuser la demande</h4>
            <form id="admin-reject-form"><label class="operator-field">Motif (envoyé au membre)<textarea name="reason" rows="3" maxlength="300" required></textarea></label>
            <button type="submit" class="btn-danger-clean">Refuser</button></form>`);
        return;
    }
    if (error) {
        console.warn('[DistriMatch] Action admin refusee :', error.code, error.message);
        showToast(describeOperatorRequestError(error), 'error');
    }
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
    const still = document.querySelector(`#admin-operators [data-distributor-id="${CSS.escape(row.dataset.distributorId)}"]`);
    const d = AppState.distributors.find(x => x.id === row.dataset.distributorId);
    if (d) d.hasOperator = !!still;
}

function handleAdminClick(e) {
    const req = e.target.closest('[data-request-id]');
    if (req && !currentId) {
        showDetail(req.dataset.requestId);
        return;
    }
    if (e.target.closest('[data-admin-back]')) {
        backToList();
        return;
    }
    const action = e.target.closest('[data-admin-action]');
    if (action) {
        action.closest('details')?.removeAttribute('open');
        runAction(action.dataset.adminAction);
        return;
    }
    const print = e.target.closest('[data-print]');
    if (print) {
        const detail = document.getElementById('admin-detail');
        printCard(detail.dataset.sireneName, detail.dataset.sireneAddress, print.dataset.print);
        return;
    }
    if (e.target.closest('[data-sheet-close]')) {
        sheetRoot().hidden = true;
        return;
    }
    const revokeBtn = e.target.closest('[data-revoke]');
    if (revokeBtn) revoke(revokeBtn.closest('.admin-row'));
}

async function handleAdminSubmit(e) {
    e.preventDefault();
    if (e.target.id === 'admin-composer') {
        const body = e.target.body.value.trim();
        if (!body) return;
        const { error } = await supabaseClient.rpc('post_operator_message', { p_request_id: currentId, p_body: body });
        if (error) {
            showToast(describeOperatorRequestError(error), 'error');
            return;
        }
        e.target.body.value = '';
        loadAdmin();
    } else if (e.target.id === 'admin-reject-form') {
        const reason = e.target.reason.value.trim();
        if (!reason) return;
        const { error } = await supabaseClient.rpc('admin_reject_operator_request', { p_id: currentId, p_reason: reason });
        if (error) {
            showToast(describeOperatorRequestError(error), 'error');
            return;
        }
        showToast('Demande refusée', 'success');
        sheetRoot().hidden = true;
        loadAdmin();
    }
}

export function initAdmin() {
    const view = document.getElementById('admin-view');
    if (!view) return;
    view.addEventListener('click', handleAdminClick);
    view.addEventListener('submit', handleAdminSubmit);
}
