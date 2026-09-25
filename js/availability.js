/**
 * DistriMatch - Signaux de disponibilite, sur la fiche (UC11, EPIC-T2)
 *
 * Chantier 2 de docs/STRATEGIE.md : devant la machine, un client dit ce qu'il
 * reste, produit par produit, ou si la machine fonctionne, est vide ou en panne.
 * Depuis EPIC-T2 (2026-09-25) plus de fenetre a part : on touche l'aliment dans
 * la liste « Il reste quoi ? » (« Il y en a » / « Plus rien »), ou la puce a
 * droite du nom pour l'etat de la machine. Un tap = un signal.
 *
 * Contribution ANONYME (exception assumee, cf. CLAUDE.md UC11) : un horodatage
 * a poids reduit, limite par appareil et par heure cote serveur (migrations 007,
 * 011, 012 : RPC confirm_availability, correction possible dans l'heure). Ce
 * module ne bloque jamais l'init : lecture en fire-and-forget, envoi sur clic.
 */

import { AppState, supabaseClient } from './state.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import {
    showToast, getDeviceId, buildAvailabilityPayload, describeRhythm, getFreshness,
    resolveMachineStatus, resolveProductStatus, isBusinessSignalError, describeSignalError,
    describeFicheHero
} from './utils.js';
import { logEvent } from './events.js';
import { rememberOwnSignal } from './favorites-watch.js';

// Dernier signal par produit + dernier signal machine pour la fiche ouverte.
let loaded = { distributorId: null, products: {}, status: null, rhythm: [] };
let isSending = false;
// Mesure (008) : un « signal_envoye » par ouverture de fiche, meme si l'on
// signale plusieurs produits (le KPI reste comparable a l'ancienne fenetre).
let signalLoggedFor = null;

// ============================================
// LECTURE : statut machine + statut de chaque produit
// ============================================

// Fire-and-forget : l'appelant ne l'await jamais. Un Supabase absent ou
// injoignable ne produit ni erreur ni indication : la fiche reste utilisable.
// options.keep : rafraichir sans effacer l'affichage (apres un envoi).
export function loadAvailabilityForDistributor(distributorId, options = {}) {
    if (!options.keep || loaded.distributorId !== distributorId) {
        loaded = { distributorId, products: {}, status: null, rhythm: [] };
        signalLoggedFor = null;
        collapseAll();
        renderFicheStatus();
    }
    if (!supabaseClient || !distributorId) return;

    Promise.all([
        supabaseClient.from('product_availability').select('*').eq('distributor_id', distributorId),
        supabaseClient.from('distributor_status').select('*').eq('distributor_id', distributorId).limit(1),
        supabaseClient.from('product_rhythm').select('*').eq('distributor_id', distributorId)
    ]).then(([productsRes, statusRes, rhythmRes]) => {
        // La fiche a pu changer pendant la requete
        if (AppState.currentDistributor?.id !== distributorId) return;
        const products = {};
        for (const row of productsRes.data || []) products[row.product_id] = row;
        let status = (statusRes.data || [])[0] || null;
        // Apres un envoi : un signal local plus recent que la version serveur
        // (vue en retard, requete partie avant l'ecriture) reste affiche.
        if (options.keep && loaded.distributorId === distributorId) {
            for (const [id, row] of Object.entries(loaded.products)) {
                if (!products[id] || isNewer(row, products[id])) products[id] = row;
            }
            if (loaded.status && (!status || isNewer(loaded.status, status))) status = loaded.status;
        }
        loaded = { distributorId, products, status, rhythm: rhythmRes.data || [] };
        renderFicheStatus();
    }).catch(() => { /* hors ligne : pas d'indication, pas d'erreur */ });
}

function isNewer(a, b) {
    return new Date(a.created_at).getTime() > new Date(b.created_at).getTime();
}

// Met a jour la puce machine, la ligne de provenance sous le nom, le rythme
// et le statut de chaque produit. Idempotent : un re-rendu de la liste des
// produits peut le rappeler sans doublon.
export function renderFicheStatus() {
    const distributor = AppState.currentDistributor;
    if (!distributor) return;
    const machine = resolveMachineStatus(loaded.status, Object.values(loaded.products), distributor.lastVerified);

    const chip = document.getElementById('dist-machine-chip');
    if (chip) {
        chip.className = `machine-chip is-${machine.tone}${machine.fresh ? ' is-fresh' : ''}`;
        chip.setAttribute('aria-label', `État de la machine : ${machine.label}. Toucher pour le signaler`);
        const label = document.getElementById('dist-machine-chip-label');
        if (label) label.textContent = machine.label;
    }
    const detail = document.getElementById('dist-modal-verified');
    if (detail) {
        detail.textContent = machine.detail;
        // Sans etat machine : la ligne « Vérifié il y a X » garde sa regle
        // (vert < 2 h, italique si jamais verifie).
        const tone = machine.state === 'unknown'
            ? getFreshness(distributor.lastVerified).state
            : `${machine.tone}${machine.fresh ? ' is-fresh' : ''}`;
        detail.className = `dist-modal-verified is-${tone}`;
    }

    // Bandeau d'etat (EPIC-T4) : couleur de l'etat, info cle en tres grand
    const statuses = (distributor.products || []).map(p => resolveProductStatus(p, loaded.products[p.id], machine));
    const hero = describeFicheHero(machine, statuses);
    const heroEl = document.getElementById('dist-hero');
    if (heroEl) {
        heroEl.classList.remove('is-working', 'is-empty', 'is-broken', 'is-unknown');
        heroEl.classList.add(`is-${hero.tone}`);
    }
    const kpi = document.getElementById('dist-hero-kpi');
    if (kpi) kpi.textContent = hero.kpi;

    document.querySelectorAll('#dist-products-list .product-row[data-product-id]').forEach(row => {
        const product = (distributor.products || []).find(p => String(p.id) === row.dataset.productId);
        const status = resolveProductStatus(product, loaded.products[row.dataset.productId], machine);
        row.classList.remove('is-available', 'is-absent', 'is-unknown');
        row.classList.add(`is-${status.tone}`);
        const pill = row.querySelector('.product-pill');
        if (pill) {
            pill.textContent = status.label;
            pill.className = `product-pill is-${status.tone}${status.fresh ? ' is-fresh' : ''}`;
        }
        const seen = row.querySelector('.product-seen');
        if (seen) seen.textContent = status.detail;
    });

    // En-tete « Il reste quoi ? » : seulement en lecture ; la consigne seulement
    // s'il y a au moins un produit qu'on peut signaler.
    const head = document.getElementById('dist-products-head');
    if (head) head.hidden = !!AppState.modalEditMode;
    const hint = document.getElementById('dist-products-hint');
    if (hint) hint.hidden = !document.querySelector('#dist-products-list .product-row-main[aria-expanded]');

    // Rythme infere (couche 2) : une phrase seulement quand les signaux la justifient.
    const rhythmEl = document.getElementById('dist-modal-rhythm');
    if (rhythmEl) {
        const phrase = describeRhythm(loaded.rhythm);
        rhythmEl.textContent = phrase || '';
        rhythmEl.className = `dist-modal-rhythm${phrase ? ' is-visible' : ''}`;
    }
}

// ============================================
// SIGNALER : toucher un aliment, ou la puce machine
// ============================================

function collapseAll(except = null) {
    document.querySelectorAll('#dist-products-list .product-row-main[aria-expanded="true"]').forEach(btn => {
        if (btn === except) return;
        btn.setAttribute('aria-expanded', 'false');
        const choices = btn.parentElement?.querySelector('.product-choices');
        if (choices) choices.hidden = true;
    });
    if (except !== 'machine') setMachineChoicesOpen(false);
}

function setMachineChoicesOpen(open) {
    const chip = document.getElementById('dist-machine-chip');
    const choices = document.getElementById('dist-machine-choices');
    if (!chip || !choices) return;
    chip.setAttribute('aria-expanded', String(open));
    choices.hidden = !open;
}

function toggleProductRow(btn) {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    collapseAll(btn);
    btn.setAttribute('aria-expanded', String(open));
    const choices = btn.parentElement?.querySelector('.product-choices');
    if (choices) choices.hidden = !open;
    if (open) choices?.querySelector('.product-choice')?.focus();
}

// Listeners poses une seule fois : la liste est re-rendue a chaque ouverture
// de fiche -> delegation sur les conteneurs persistants.
export function initFicheSignals() {
    const list = document.getElementById('dist-products-list');
    if (list && !list.dataset.signalsWired) {
        list.dataset.signalsWired = '1';
        list.addEventListener('click', (e) => {
            // Machine sans produit : on passe par le stylo « Modifier » de la
            // fiche, qui garde la verification de connexion (UC2).
            if (e.target.closest('#dist-products-add-first')) {
                document.getElementById('dist-action-edit')?.click();
                return;
            }
            const choice = e.target.closest('.product-choice');
            if (choice) {
                const row = choice.closest('.product-row');
                sendSignal({ productId: row?.dataset.productId, state: choice.dataset.state });
                return;
            }
            const main = e.target.closest('button.product-row-main');
            if (main) toggleProductRow(main);
        });
    }

    const chip = document.getElementById('dist-machine-chip');
    if (chip && !chip.dataset.signalsWired) {
        chip.dataset.signalsWired = '1';
        chip.addEventListener('click', () => {
            const open = chip.getAttribute('aria-expanded') !== 'true';
            collapseAll('machine');
            setMachineChoicesOpen(open);
            if (open) document.querySelector('#dist-machine-choices .machine-choice')?.focus();
        });
        document.getElementById('dist-machine-choices')?.addEventListener('click', (e) => {
            const choice = e.target.closest('.machine-choice');
            if (choice) sendSignal({ machine: choice.dataset.machine });
        });
    }
}

// QR colle sur la machine (&confirm=1) : on arrive sur la liste « Il reste
// quoi ? », consigne mise en avant ; sans produit a signaler, on ouvre
// directement les choix de l'etat de la machine.
export function focusSignalFromQr() {
    const signalable = document.querySelector('#dist-products-list .product-row-main[aria-expanded]');
    if (!signalable) {
        setMachineChoicesOpen(true);
        document.getElementById('dist-machine-choices')?.scrollIntoView({ block: 'center' });
        return;
    }
    const hint = document.getElementById('dist-products-hint');
    document.getElementById('dist-products-head')?.scrollIntoView({ block: 'start' });
    if (hint) {
        hint.classList.remove('is-highlighted');
        void hint.offsetWidth;   // relancer l'animation
        hint.classList.add('is-highlighted');
    }
}

// Client anonyme, sans session, cree a la demande : renvoi d'un signal que la
// session du telephone a fait echouer (EPIC-T3, constat terrain Android). Le
// signal n'exige pas de compte (UC11), il ne doit jamais etre bloque par elle.
let anonClient = null;

function getAnonClient() {
    if (anonClient) return anonClient;
    if (typeof window === 'undefined' || !window.supabase?.createClient) return null;
    anonClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'distrimatch-anon-signal' }
    });
    return anonClient;
}

async function callConfirm(client, payload) {
    try {
        return await client.rpc('confirm_availability', payload);
    } catch (e) {
        return { data: null, error: e, status: 0 };
    }
}

// Envoi normal ; en cas d'echec non metier, un renvoi anonyme.
async function confirmWithFallback(payload) {
    const first = await callConfirm(supabaseClient, payload);
    if (!first.error || isBusinessSignalError(first.error)) return first;
    const anon = getAnonClient();
    if (!anon) return first;
    console.warn('[DistriMatch] Signal refuse (session ?), renvoi anonyme :', first.status, first.error?.code, first.error?.message);
    return callConfirm(anon, payload);
}

// Un tap = un signal : { productId, state } pour un aliment, { machine } pour
// l'etat de la machine. Mise a jour immediate de l'affichage, puis resynchro.
async function sendSignal({ productId = null, state = null, machine = null }) {
    const distributor = AppState.currentDistributor;
    if (!distributor || isSending) return;
    if (!supabaseClient) {
        showToast('Signal non envoyé : service indisponible, réessaie plus tard', 'error');
        return;
    }
    const choices = productId !== null ? { [productId]: state } : {};
    const payload = buildAvailabilityPayload(distributor.id, getDeviceId(), choices, machine);
    if (payload.p_product_signals.length === 0 && !payload.p_machine_state) return;

    isSending = true;
    setBusy(true);
    try {
        const { data, error, status } = await confirmWithFallback(payload);
        if (error) {
            console.warn('[DistriMatch] Signal de dispo refuse :', status, error?.code, error?.message || error);
            showToast(describeSignalError(error, status, navigator.onLine), 'error');
            return;
        }

        if (data && data.inserted > 0) {
            const now = new Date().toISOString();
            if (productId !== null) {
                loaded.products[productId] = { distributor_id: distributor.id, product_id: Number(productId), state, created_at: now };
            }
            if (payload.p_machine_state) {
                loaded.status = { distributor_id: distributor.id, state: payload.p_machine_state, created_at: now };
            }
            // La RPC a rafraichi last_verified cote serveur : on aligne la memoire
            distributor.lastVerified = now;
            showToast('Merci ! Ton signal aide les suivants', 'success');
            if (signalLoggedFor !== distributor.id) {
                signalLoggedFor = distributor.id;
                logEvent('signal_envoye', { distributorId: distributor.id });   // mesure (008)
            }
        } else {
            showToast('Déjà signalé il y a moins d\'une heure, merci quand même', 'default');
        }
        collapseAll();
        renderFicheStatus();
        loadAvailabilityForDistributor(distributor.id, { keep: true });
        rememberOwnSignal(distributor.id);   // pas de notification de son propre signal
    } catch (e) {
        // Erreur d'affichage apres un envoi reussi : le signal est parti
        console.warn('[DistriMatch] Mise a jour de la fiche apres signal :', e?.message || e);
    } finally {
        isSending = false;
        setBusy(false);
    }
}

function setBusy(busy) {
    document.querySelectorAll('#dist-products-list .product-choice, #dist-machine-choices .machine-choice').forEach(b => {
        b.disabled = busy;
    });
}
