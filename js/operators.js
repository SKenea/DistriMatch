/**
 * DistriMatch - Exploitants d'un distributeur (EPIC-T18, migration 020)
 *
 * Un membre connecte demande le statut d'exploitant d'une fiche depuis « À
 * propos » (societe + telephone ou SIRET) ; l'admin valide depuis la page admin
 * (js/admin.js). Une fiche qui a un exploitant porte le tag « Exploitant
 * vérifié » ; les signaux de l'exploitant (source 'owner') l'emportent sur un
 * signal contraire a moins de 30 min d'ecart (vues de la base) et s'affichent
 * « Info de l'exploitant » (js/availability.js).
 *
 * Etat du compte (exploitant de quelles fiches, demandes en attente, admin ?)
 * relu a la connexion ; jamais bloquant : Supabase absent = rien.
 */

import { AppState, supabaseClient } from './state.js';
import { escapeHTML, showToast, validateOperatorRequest, describeOperatorRequestError } from './utils.js';
import { isAuthenticated, requireAuth, onAuthChange } from './auth.js';

const mine = { operated: new Set(), pending: new Set(), admin: false };
// Derniere relecture en cours : la page admin l'attend avant de decider
let ready = Promise.resolve();

export function isAdminUser() {
    return mine.admin;
}

export function whenOperatorStateReady() {
    return ready;
}

// Relit l'etat du compte connecte ; remis a zero a la deconnexion.
export function refreshOperatorState() {
    mine.operated = new Set();
    mine.pending = new Set();
    mine.admin = false;
    if (!isAuthenticated() || !supabaseClient) {
        applyOperatorState();
        ready = Promise.resolve();
        return ready;
    }
    ready = Promise.all([
        supabaseClient.rpc('my_operated_distributors'),
        supabaseClient.from('operator_requests').select('distributor_id, status').eq('status', 'pending'),
        supabaseClient.rpc('is_admin')
    ]).then(([operated, pending, admin]) => {
        for (const row of operated.data || []) mine.operated.add(typeof row === 'string' ? row : row.my_operated_distributors);
        for (const row of pending.data || []) mine.pending.add(row.distributor_id);
        mine.admin = admin.data === true;
    }).catch(() => { /* hors ligne : rien */ }).finally(applyOperatorState);
    return ready;
}

function applyOperatorState() {
    const menuItem = document.getElementById('menu-admin');
    if (menuItem) menuItem.hidden = !mine.admin;
    const d = AppState.currentDistributor;
    if (d && document.getElementById('dist-modal-overlay')?.classList.contains('active')) renderOperatorSection(d);
}

// Tag pres du nom + bloc « C'est ton distributeur ? » de « À propos ».
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
    if (mine.pending.has(distributor.id)) {
        box.innerHTML = '<p class="operator-note">Demande envoyée : en attente de validation.</p>';
        return;
    }
    box.innerHTML = '<button type="button" class="operator-claim" id="dist-operator-claim">C’est ton distributeur ?</button>';
}

function openClaimForm() {
    const box = document.getElementById('dist-operator');
    const d = AppState.currentDistributor;
    if (!box || !d) return;
    box.innerHTML = `
        <form class="operator-form" id="dist-operator-form" novalidate>
            <p class="operator-form-title">Tu exploites <strong>${escapeHTML(d.name)}</strong> ?</p>
            <p class="operator-form-help">Après vérification, ton statut d’exploitant donne la priorité à tes signaux sur cette fiche.</p>
            <label class="operator-field">Société
                <input type="text" name="company" maxlength="100" autocomplete="organization" required>
            </label>
            <label class="operator-field">Téléphone ou SIRET
                <input type="text" name="contact" maxlength="100" autocomplete="tel" inputmode="text" required>
            </label>
            <p class="operator-form-error" id="dist-operator-error" role="alert" hidden></p>
            <div class="operator-form-actions">
                <button type="button" class="btn-secondary-clean" id="dist-operator-cancel">Annuler</button>
                <button type="submit" class="btn-primary-clean" id="dist-operator-submit">Envoyer</button>
            </div>
        </form>`;
    box.querySelector('input[name="company"]').focus();
}

async function submitClaim(form) {
    const d = AppState.currentDistributor;
    if (!d) return;
    const values = { company: form.company.value, contact: form.contact.value };
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
            distributor_id: d.id, company: values.company.trim(), contact: values.contact.trim()
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
    // 23505 : une demande attend deja pour cette fiche, c'est le meme resultat
    mine.pending.add(d.id);
    renderOperatorSection(d);
    showToast('Demande envoyée : nous te recontactons pour vérifier.', 'success');
}

export function initOperators() {
    onAuthChange(() => refreshOperatorState());
    refreshOperatorState();
    const box = document.getElementById('dist-operator');
    if (!box) return;
    box.addEventListener('click', (e) => {
        if (e.target.closest('#dist-operator-claim')) {
            if (!isAuthenticated()) {
                requireAuth();
                return;
            }
            openClaimForm();
        } else if (e.target.closest('#dist-operator-cancel')) {
            renderOperatorSection(AppState.currentDistributor);
        }
    });
    box.addEventListener('submit', (e) => {
        e.preventDefault();
        submitClaim(e.target);
    });
}
