/**
 * DistriMatch - Signaux de disponibilite, sur la fiche (UC11, EPIC-T2 / T10)
 *
 * Chantier 2 de docs/STRATEGIE.md : devant le distributeur, un membre dit ce
 * qu'il reste, produit par produit, ou s'il est en service, vide ou en panne.
 * Fiche v3 (EPIC-T10) : l'etat tient en une petite ligne sous le nom (mini-feu
 * + mot + age, « Mettre à jour » deplie les trois etats) ; les produits sont des
 * cartes teintees triees Dispo -> Pas d'info -> Pas dispo. EPIC-T12 (sans
 * bouton) : l'etiquette de la carte est le controle ; la toucher deplie sur la
 * carte « Toujours dispo ? » Dispo / Pas dispo. Un tap = un signal.
 *
 * Signal = privilege de compte (EPIC-T5 / T6, migration 014). Ce module ne
 * bloque jamais l'init : lecture en fire-and-forget, envoi sur clic.
 */

import { AppState, supabaseClient } from './state.js';
import {
    showToast, getDeviceId, buildAvailabilityPayload, describeRhythm, getFreshness,
    resolveMachineStatus, resolveProductStatus, isBusinessSignalError, describeSignalError,
    describeFicheHero, describeMachineNotice, productToneRank, describeMenuHeader,
    isNearDistributor, describeNearbyNudge
} from './utils.js';
import { markFicheEditUsed } from './fiche-edit.js';
import { logEvent } from './events.js';
import { rememberOwnSignal } from './favorites-watch.js';
import { isAuthenticated, promptReconnect } from './auth.js';

// Dernier signal par produit + dernier signal machine pour la fiche ouverte.
let loaded = { distributorId: null, products: {}, status: null, rhythm: [] };
let isSending = false;
// Mesure (008) : un « signal_envoye » par ouverture de fiche, meme si l'on
// signale plusieurs produits (le KPI reste comparable a l'ancienne fenetre).
let signalLoggedFor = null;
// Coup de pouce sur place (EPIC-T17) : distributeur devant lequel se trouve le
// membre (position relue a l'ouverture de la fiche) ; etat du distributeur frais ?
let nearbyFor = null;
let machineFresh = false;

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

// Met a jour la ligne d'etat sous le nom, le liseré, le rythme et chaque carte
// produit (teinte, etiquette, age, ordre). Idempotent : un re-rendu de la liste
// des produits peut le rappeler sans doublon.
export function renderFicheStatus() {
    const distributor = AppState.currentDistributor;
    if (!distributor) return;
    const machine = resolveMachineStatus(loaded.status, Object.values(loaded.products), distributor.lastVerified);

    // Choix d'etat (connecte, derriere « Mettre à jour ») : l'etat actuel est marque
    document.querySelectorAll('#dist-machine-choices .machine-choice').forEach(btn => {
        const current = btn.dataset.machine === machine.state;
        btn.classList.toggle('is-current', current);
        btn.setAttribute('aria-pressed', String(current));
    });

    // Ligne d'etat (EPIC-T10) : mini-feu + mot + age, adoucie au-dela de 2 h
    const statusLine = document.getElementById('dist-status');
    if (statusLine) {
        statusLine.dataset.state = machine.state;
        statusLine.classList.toggle('is-soft', machine.state !== 'unknown' && !machine.fresh);
    }
    machineFresh = machine.fresh;
    const word = document.getElementById('dist-status-word');
    if (word) word.textContent = machine.label;
    const detail = document.getElementById('dist-modal-verified');
    if (detail) {
        // Etat connu : « il y a 12 min » ; sinon « Vérifié il y a X » /
        // « Pas encore vérifié » (regle de fraicheur de la fiche). Le « · » est en CSS.
        // EPIC-T18 : l'etat vient d'un signal de l'exploitant -> on le dit
        const byOwner = loaded.status?.source === 'owner' && loaded.status.state === machine.state && machine.state !== 'unknown';
        detail.textContent = byOwner ? `Info de l'exploitant · ${machine.age}` : machine.age;
        const tone = machine.state === 'unknown' ? getFreshness(distributor.lastVerified).state : machine.tone;
        detail.className = `dist-modal-verified is-${tone}${machine.fresh ? ' is-fresh' : ''}`;
    }

    // Liseré unique quand le distributeur est vide / en panne (plus repete par carte)
    const notice = document.getElementById('dist-products-notice');
    if (notice) {
        const text = !(distributor.products || []).length ? '' : describeMachineNotice(machine);
        notice.textContent = text;
        notice.hidden = !text;
        notice.className = `products-notice is-${machine.state}`;
    }

    const statuses = (distributor.products || []).map(p => resolveProductStatus(p, loaded.products[p.id], machine));
    const hero = describeFicheHero(machine, statuses);
    const count = document.getElementById('dist-products-count');
    if (count) count.textContent = hero.count ? `· ${hero.count}` : '';

    const list = document.getElementById('dist-products-list');
    const rows = Array.from(document.querySelectorAll('#dist-products-list .product-row[data-product-id]'));
    const ranked = [];
    rows.forEach((row, index) => {
        const product = (distributor.products || []).find(p => String(p.id) === row.dataset.productId);
        const status = resolveProductStatus(product, loaded.products[row.dataset.productId], machine);
        row.classList.remove('is-available', 'is-absent', 'is-unknown', 'is-soft');
        row.classList.add(`is-${status.tone}`);
        if (status.tone !== 'unknown' && !status.fresh) row.classList.add('is-soft');
        const pill = row.querySelector('.product-pill');
        if (pill) {
            pill.textContent = status.label;
            pill.className = `product-pill is-${status.tone}${status.fresh ? ' is-fresh' : ''}`;
        }
        const seen = row.querySelector('.product-seen');
        if (seen) {
            // EPIC-T18 : signal de l'exploitant affiche tel quel -> « Info de l'exploitant · il y a 1 h »
            const signal = loaded.products[row.dataset.productId];
            const byOwner = signal?.source === 'owner' && /^vu /.test(status.detail);
            seen.textContent = byOwner ? `Info de l'exploitant · ${status.detail.replace(/^vu /, '')}` : status.detail;
            seen.classList.toggle('is-owner', byOwner);
        }
        // Menu de l'etiquette (EPIC-T16) : etat actuel coche ; « Actuellement : Pas
        // d'info » en tete quand c'est l'etat ; libelle accessible de l'etiquette a jour
        const header = row.querySelector('.product-choices-q');
        if (header) {
            header.textContent = describeMenuHeader(status.tone);
            header.hidden = !header.textContent;
        }
        row.querySelectorAll('.product-choice').forEach(c => {
            const current = (c.dataset.state === 'available' && status.tone === 'available')
                || (c.dataset.state === 'absent' && status.tone === 'absent');
            c.classList.toggle('is-current', current);
            c.setAttribute('aria-checked', String(current));
        });
        const statusBtn = row.querySelector('.product-status-btn:not([data-guest])');
        const name = row.querySelector('.product-name-clean')?.textContent || '';
        if (statusBtn) statusBtn.setAttribute('aria-label', `${name} : ${status.label}. Menu`);
        syncChoices(row);
        ranked.push({ row, rank: productToneRank(status.tone), index: Number(row.dataset.index ?? index) });
    });
    // Ordre des cartes : Dispo, puis Pas d'info, puis Pas dispo (stable) ; la
    // carte « + Ajouter un produit » reste en dernier.
    if (list) {
        ranked.sort((a, b) => a.rank - b.rank || a.index - b.index)
            .forEach(({ row }) => list.appendChild(row));
        const addCard = list.querySelector('#dist-product-add, #dist-add-panel');
        if (addCard) list.appendChild(addCard);
    }

    // Rythme infere (couche 2) : une phrase seulement quand les signaux la justifient.
    const rhythmEl = document.getElementById('dist-modal-rhythm');
    if (rhythmEl) {
        const phrase = describeRhythm(loaded.rhythm);
        rhythmEl.textContent = phrase || '';
        rhythmEl.className = `dist-modal-rhythm${phrase ? ' is-visible' : ''}`;
    }
    renderNearbyNudge();
}

// ============================================
// COUP DE POUCE SUR PLACE (EPIC-T17)
// ============================================
// Membre connecte devant le distributeur (15 m, precision GPS comprise) : on
// l'invite a mettre a jour ce qui date (signal de plus de 2 h ou aucun). Rien
// n'est envoye tout seul. Appele a l'ouverture de la fiche et a la connexion.
export function checkNearbyForFiche(distributor) {
    nearbyFor = null;
    renderNearbyNudge();
    if (!distributor || distributor.isLocalOnly || !isAuthenticated() || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
        if (AppState.currentDistributor?.id !== distributor.id) return;
        const position = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        nearbyFor = isNearDistributor(position, distributor) ? distributor.id : null;
        renderNearbyNudge();
    }, () => { /* position refusee ou indisponible : pas de coup de pouce */ },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
}

function renderNearbyNudge() {
    const d = AppState.currentDistributor;
    const near = !!d && nearbyFor === d.id && isAuthenticated();
    const rows = Array.from(document.querySelectorAll('#dist-products-list .product-row[data-product-id]'));
    let staleProducts = 0;
    rows.forEach(row => {
        const check = near && !!row.querySelector('.product-status-btn:not([data-guest])')
            && !row.querySelector('.product-pill.is-fresh');
        row.classList.toggle('needs-check', check);
        if (check) staleProducts++;
    });
    document.getElementById('dist-product-add')?.classList.toggle('needs-check', near && rows.length === 0);
    const machineStale = near && !machineFresh;
    document.getElementById('dist-status-update')?.classList.toggle('needs-check', machineStale);
    const nudge = document.getElementById('dist-products-nudge');
    if (!nudge) return;
    const text = near ? describeNearbyNudge({ staleProducts, productCount: rows.length, machineStale }) : '';
    const textEl = nudge.querySelector('.products-nudge-text');
    if (textEl) textEl.textContent = text;
    nudge.hidden = !text;
}

// ============================================
// SIGNALER : toucher un aliment, ou la puce machine
// ============================================

// « Dispo / Pas dispo » d'une carte : visibles seulement quand le membre a
// touche l'etiquette (data-open) ; plus rien d'affiche d'office (EPIC-T12).
function syncChoices(row) {
    const btn = row.querySelector('.product-status-btn:not([data-guest])');
    const choices = row.querySelector('.product-choices');
    if (!btn || !choices) return;
    const open = row.dataset.open === '1';
    choices.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    row.classList.toggle('is-open', open);
}

function collapseAll(exceptRow = null) {
    document.querySelectorAll('#dist-products-list .product-row[data-open="1"]').forEach(row => {
        if (row === exceptRow) return;
        delete row.dataset.open;
        syncChoices(row);
    });
    collapseMachineChoices();
}

export function collapseProductChoices() {
    collapseAll();
}

function toggleProductRow(btn) {
    const row = btn.closest('.product-row');
    if (!row) return;
    const open = row.dataset.open !== '1';
    collapseAll(row);
    if (open) row.dataset.open = '1';
    else delete row.dataset.open;
    syncChoices(row);
    if (open) row.querySelector('.product-choice, .product-menu-action')?.focus();
}

// « Mettre à jour » (connecte) deplie / replie les trois etats du distributeur
function setMachineChoicesOpen(open) {
    const toggle = document.getElementById('dist-status-update');
    const choices = document.getElementById('dist-machine-choices');
    if (!toggle || !choices) return;
    toggle.setAttribute('aria-expanded', String(open));
    choices.hidden = !open;
}

function collapseMachineChoices() {
    setMachineChoicesOpen(false);
}

export function openMachineChoices() {
    setMachineChoicesOpen(true);
    document.querySelector('#dist-machine-choices .machine-choice')?.focus();
}

// Listeners poses une seule fois : la liste est re-rendue a chaque ouverture
// de fiche -> delegation sur les conteneurs persistants.
export function initFicheSignals() {
    const list = document.getElementById('dist-products-list');
    if (list && !list.dataset.signalsWired) {
        list.dataset.signalsWired = '1';
        list.addEventListener('click', (e) => {
            const choice = e.target.closest('.product-choice');
            if (choice) {
                const row = choice.closest('.product-row');
                sendSignal({ productId: row?.dataset.productId, state: choice.dataset.state });
                return;
            }
            // L'etiquette est le controle (EPIC-T12) ; visiteur : js/fiche-edit.js
            const statusBtn = e.target.closest('.product-status-btn:not([data-guest])');
            if (statusBtn) toggleProductRow(statusBtn);
        });
        // Echap ou toucher ailleurs referme sans rien envoyer
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            const open = document.querySelector('#dist-products-list .product-row[data-open="1"]');
            if (!open) return;
            e.stopPropagation();
            collapseAll();
            open.querySelector('.product-status-btn')?.focus();
        }, true);
        document.addEventListener('pointerdown', (e) => {
            const open = document.querySelector('#dist-products-list .product-row[data-open="1"]');
            if (open && !open.contains(e.target)) collapseAll();
        });
    }

    const machineChoices = document.getElementById('dist-machine-choices');
    if (machineChoices && !machineChoices.dataset.signalsWired) {
        machineChoices.dataset.signalsWired = '1';
        machineChoices.addEventListener('click', (e) => {
            const choice = e.target.closest('.machine-choice');
            if (choice) sendSignal({ machine: choice.dataset.machine });
        });
    }

    const toggle = document.getElementById('dist-status-update');
    if (toggle && !toggle.dataset.signalsWired) {
        toggle.dataset.signalsWired = '1';
        toggle.addEventListener('click', () => {
            const open = toggle.getAttribute('aria-expanded') !== 'true';
            if (open) openMachineChoices();
            else collapseMachineChoices();
        });
    }
}

function pulse(el) {
    if (!el) return;
    el.classList.remove('is-highlighted');
    void el.offsetWidth;   // relancer l'animation
    el.classList.add('is-highlighted');
}

// QR colle sur le distributeur (&confirm=1). Visiteur : l'encadre de connexion
// mis en avant (informer est un privilege de compte, EPIC-T5). Connecte : la
// liste « Il reste quoi ? », ou les trois etats (deplies) s'il n'a pas de produit.
export function focusSignalFromQr() {
    if (!isAuthenticated()) {
        const invite = document.getElementById('dist-login-invite');
        invite?.scrollIntoView({ block: 'center' });
        pulse(invite);
        return;
    }
    const signalable = document.querySelector('#dist-products-list .product-status-btn:not([data-guest])');
    if (!signalable) {
        openMachineChoices();
        const machineChoices = document.getElementById('dist-machine-choices');
        machineChoices?.scrollIntoView({ block: 'center' });
        pulse(machineChoices);
        return;
    }
    document.getElementById('dist-products-head')?.scrollIntoView({ block: 'start' });
    pulse(document.getElementById('dist-products-hint'));
}

async function callConfirm(client, payload) {
    try {
        return await client.rpc('confirm_availability', payload);
    } catch (e) {
        return { data: null, error: e, status: 0 };
    }
}

// Envoi normal ; en cas d'echec non metier (session expiree, reseau...), on
// renouvelle la session puis on renvoie une fois (EPIC-T6). Plus de renvoi
// anonyme : la base exige un compte (migration 014, anti-abus).
async function confirmWithRefresh(payload) {
    const first = await callConfirm(supabaseClient, payload);
    if (!first.error || isBusinessSignalError(first.error)) return first;
    console.warn('[DistriMatch] Signal refuse, renouvellement de session :', first.status, first.error?.code, first.error?.message);
    try {
        await supabaseClient.auth.refreshSession();
    } catch (e) { /* pas de session a renouveler : le renvoi dira pourquoi */ }
    return callConfirm(supabaseClient, payload);
}

// Un tap = un signal : { productId, state } pour un aliment, { machine } pour
// l'etat de la machine. Mise a jour immediate de l'affichage, puis resynchro.
async function sendSignal({ productId = null, state = null, machine = null }) {
    const distributor = AppState.currentDistributor;
    if (!distributor || isSending) return;
    // Informer est un privilege de compte (EPIC-T5) : l'interface ne le propose
    // qu'aux connectes ; garde-fou si un controle restait affiche.
    if (!isAuthenticated()) return;
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
        const { data, error, status } = await confirmWithRefresh(payload);
        if (error) {
            console.warn('[DistriMatch] Signal de dispo refuse :', status, error?.code, error?.message || error);
            showToast(describeSignalError(error, status, navigator.onLine), 'error');
            // Session morte : on propose de se reconnecter tout de suite
            if (error?.code === '28000' || status === 401) promptReconnect();
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
            markFicheEditUsed();   // l'indice de premier usage a servi
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
