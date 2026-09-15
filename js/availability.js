/**
 * DistriMatch - Signaux de disponibilite en un tap (UC11)
 *
 * Chantier 2 de docs/STRATEGIE.md : devant la machine, un client dit ce qu'il
 * reste ("Il reste quoi ?", produit par produit) ou que la machine est vide /
 * en panne. Contribution ANONYME (exception assumee, cf. CLAUDE.md UC11) : un
 * horodatage a poids reduit, limite par appareil et par heure cote serveur
 * (migration 007, RPC confirm_availability). Ce module ne bloque jamais l'init :
 * lecture en fire-and-forget, envoi uniquement sur clic.
 */

import { AppState, supabaseClient } from './state.js';
import { escapeHTML, showToast, timeAgo, getFreshness, getDeviceId, buildAvailabilityPayload } from './utils.js';
import { activateFocusTrap, deactivateFocusTrap } from './focus-trap.js';

// Meme regle que la fraicheur : vert < 2 h. Bandeau machine : signal < 24 h.
const SEEN_FRESH_MS = 2 * 60 * 60 * 1000;
const STATUS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const PRODUCT_STATES = ['available', 'absent', 'unseen'];
const STATE_LABELS = { available: 'Vu dispo', absent: 'Vu absent', unseen: 'Pas regardé' };

// Dernier signal par produit + dernier signal machine pour la fiche ouverte.
let loaded = { distributorId: null, products: {}, status: null };
// Choix en cours dans le panneau : { [productId]: 'available' | 'absent' | 'unseen' }
let choices = {};
let machineState = null;   // 'empty' | 'broken' | null
let isSending = false;

// ============================================
// LECTURE : "vu dispo il y a X" + bandeau machine
// ============================================

// Fire-and-forget : l'appelant ne l'await jamais. Un Supabase absent ou
// injoignable ne produit ni erreur ni indication : la fiche reste utilisable.
export function loadAvailabilityForDistributor(distributorId) {
    loaded = { distributorId, products: {}, status: null };
    renderAvailabilityHints();
    if (!supabaseClient || !distributorId) return;

    Promise.all([
        supabaseClient.from('product_availability').select('*').eq('distributor_id', distributorId),
        supabaseClient.from('distributor_status').select('*').eq('distributor_id', distributorId).limit(1)
    ]).then(([productsRes, statusRes]) => {
        // La fiche a pu changer pendant la requete
        if (AppState.currentDistributor?.id !== distributorId) return;
        const products = {};
        for (const row of productsRes.data || []) products[row.product_id] = row;
        loaded = { distributorId, products, status: (statusRes.data || [])[0] || null };
        renderAvailabilityHints();
    }).catch(() => { /* hors ligne : pas d'indication, pas d'erreur */ });
}

function signalTs(row) {
    return row && row.created_at ? new Date(row.created_at).getTime() : NaN;
}

// Ecrit "vu dispo il y a 12 min" a cote de chaque produit de la fiche et le
// bandeau "Signalée vide il y a 40 min" en tete. Idempotent : un re-rendu de
// la liste des produits peut le rappeler sans doublon.
export function renderAvailabilityHints() {
    document.querySelectorAll('#dist-products-list .product-item-clean[data-product-id]').forEach(item => {
        const row = loaded.products[item.dataset.productId];
        let hint = item.querySelector('.product-seen');
        const ts = signalTs(row);
        if (!row || Number.isNaN(ts)) {
            if (hint) hint.remove();
            return;
        }
        if (!hint) {
            // Sous le nom du produit (colonne de gauche), pas colle a "Disponible"
            hint = document.createElement('span');
            (item.querySelector('.product-info-clean') || item).appendChild(hint);
        }
        const fresh = Date.now() - ts < SEEN_FRESH_MS;
        hint.textContent = `${row.state === 'available' ? 'vu dispo' : 'vu absent'} ${timeAgo(ts)}`;
        hint.className = `product-seen is-${row.state} ${fresh ? 'is-fresh' : 'is-stale'}`;
    });

    const banner = document.getElementById('dist-status-banner');
    if (!banner) return;
    const status = loaded.status;
    const ts = signalTs(status);
    if (!status || Number.isNaN(ts) || Date.now() - ts >= STATUS_MAX_AGE_MS) {
        banner.textContent = '';
        banner.className = 'dist-status-banner';
        return;
    }
    const when = timeAgo(ts);
    banner.textContent = status.state === 'broken' ? `En panne signalée ${when}` : `Signalée vide ${when}`;
    banner.className = `dist-status-banner is-visible is-${status.state}`;
}

// ============================================
// PANNEAU "IL RESTE QUOI ?"
// ============================================

function getModal() {
    return document.getElementById('availability-modal');
}

export function openAvailabilityPanel() {
    const distributor = AppState.currentDistributor;
    const modal = getModal();
    if (!distributor || !modal) return;

    choices = {};
    machineState = null;
    renderPanel(distributor);
    modal.classList.add('active');
    activateFocusTrap(modal, closeAvailabilityPanel);
    wirePanelOnce(modal);
}

export function closeAvailabilityPanel() {
    const modal = getModal();
    if (!modal) return;
    modal.classList.remove('active');
    deactivateFocusTrap(modal);
}

// Produits de la fiche ayant un id Supabase : les produits purement locaux
// (ajoutes hors ligne) ne peuvent pas recevoir de signal.
function signalableProducts(distributor) {
    return (distributor.products || []).filter(p =>
        p.id !== null && p.id !== undefined && p.id !== '' && Number.isInteger(Number(p.id))
    );
}

function renderPanel(distributor) {
    const list = document.getElementById('availability-products');
    const products = signalableProducts(distributor);
    list.innerHTML = products.length === 0
        ? '<p class="availability-empty">Aucun produit référencé ici : tu peux quand même signaler la machine vide ou en panne.</p>'
        : products.map(p => `
            <div class="availability-row" data-product-id="${escapeHTML(String(p.id))}">
                <span class="availability-name">${escapeHTML(p.name)}</span>
                <div class="availability-seg" role="group" aria-label="${escapeHTML(p.name)}">
                    ${PRODUCT_STATES.map(s => `<button type="button" class="availability-seg-btn${s === 'unseen' ? ' is-selected' : ''}" data-state="${s}" aria-pressed="${s === 'unseen'}">${STATE_LABELS[s]}</button>`).join('')}
                </div>
            </div>`).join('');

    document.querySelectorAll('#availability-modal .availability-machine-btn').forEach(b => {
        b.classList.remove('is-selected');
        b.setAttribute('aria-pressed', 'false');
    });
    updateSubmitState();
}

function hasSomethingToSend() {
    return machineState !== null || Object.values(choices).some(s => s === 'available' || s === 'absent');
}

function updateSubmitState() {
    const btn = document.getElementById('availability-submit');
    if (btn) btn.disabled = !hasSomethingToSend() || isSending;
}

// Listeners poses une seule fois : la modale est statique, la liste des
// produits est re-rendue a chaque ouverture -> delegation sur le conteneur.
function wirePanelOnce(modal) {
    if (modal.dataset.wired) return;
    modal.dataset.wired = '1';

    document.getElementById('availability-products').addEventListener('click', (e) => {
        const btn = e.target.closest('.availability-seg-btn');
        if (!btn) return;
        const row = btn.closest('.availability-row');
        choices[row.dataset.productId] = btn.dataset.state;
        row.querySelectorAll('.availability-seg-btn').forEach(b => {
            const on = b === btn;
            b.classList.toggle('is-selected', on);
            b.setAttribute('aria-pressed', String(on));
        });
        updateSubmitState();
    });

    modal.querySelectorAll('.availability-machine-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Exclusifs, et un second clic desactive
            machineState = machineState === btn.dataset.machine ? null : btn.dataset.machine;
            modal.querySelectorAll('.availability-machine-btn').forEach(b => {
                const on = b.dataset.machine === machineState;
                b.classList.toggle('is-selected', on);
                b.setAttribute('aria-pressed', String(on));
            });
            updateSubmitState();
        });
    });

    document.getElementById('availability-submit').addEventListener('click', submitAvailability);
    document.getElementById('availability-cancel').addEventListener('click', closeAvailabilityPanel);
    document.getElementById('availability-close').addEventListener('click', closeAvailabilityPanel);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeAvailabilityPanel(); });
}

// ============================================
// ENVOI (RPC confirm_availability, sans auth : UC11)
// ============================================

async function submitAvailability() {
    const distributor = AppState.currentDistributor;
    if (!distributor || isSending || !hasSomethingToSend()) return;
    if (!supabaseClient) {
        showToast('Signal non envoyé : service indisponible, réessaie plus tard', 'error');
        return;
    }

    isSending = true;
    updateSubmitState();
    try {
        const payload = buildAvailabilityPayload(distributor.id, getDeviceId(), choices, machineState);
        const { data, error } = await supabaseClient.rpc('confirm_availability', payload);
        if (error) throw error;

        if (data && data.inserted > 0) {
            // La RPC a rafraichi last_verified cote serveur : on aligne la memoire
            // pour que le badge "Vérifié il y a" passe au vert tout de suite.
            distributor.lastVerified = new Date().toISOString();
            const verifiedEl = document.getElementById('dist-modal-verified');
            if (verifiedEl) {
                const fresh = getFreshness(distributor.lastVerified);
                verifiedEl.textContent = fresh.label;
                verifiedEl.className = `dist-modal-verified is-${fresh.state}`;
            }
            showToast('Merci ! Ton signal aide les suivants', 'success');
        } else {
            showToast('Déjà signalé il y a moins d\'une heure, merci quand même', 'default');
        }
        closeAvailabilityPanel();
        loadAvailabilityForDistributor(distributor.id);
    } catch (e) {
        console.warn('[DistriMatch] Signal de dispo refuse :', e?.message || e);
        showToast('Signal non envoyé, réessaie plus tard', 'error');
    } finally {
        isSending = false;
        updateSubmitState();
    }
}
