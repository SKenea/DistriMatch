/**
 * DistriMatch - Page distributeur, CRUD produits, abonnements
 */

import { AppState, Conversations, supabaseClient } from './state.js';
import {
    escapeHTML, generateStars, formatDistance, showToast,
    updateImplicitProfile, saveToLocalStorage,
    resolveProductStatus, productIconKey, describeSignalQuestion
} from './utils.js';
import { updateBadges, goBackToMap } from './navigation.js';
import { updateMapMarkers } from './map.js';
import { addActivityItem, updateActivityBadge } from './activity.js';
import { generateWelcomeMessage } from './chat.js';
import { FEATURES } from './config.js';
import { checkFavoriteUpdates } from './favorites-watch.js';
import { requireAuth } from './auth.js';

// ============================================
// PAGE DISTRIBUTEUR
// ============================================

// La fonction showDetails legacy a ete supprimee. Utiliser showInBottomSheet (js/bottomsheet.js).

// ============================================
// PHOTOS
// ============================================

function getPhotoUrl(storagePath) {
    if (!supabaseClient) return '';
    const { data } = supabaseClient.storage
        .from('distributor-photos')
        .getPublicUrl(storagePath);
    return data?.publicUrl || '';
}

export async function loadDistributorPhotos(distributorId) {
    if (!supabaseClient) return [];
    try {
        const { data, error } = await supabaseClient
            .from('distributor_photos')
            .select('storage_path, status, created_at')
            .eq('distributor_id', distributorId)
            .eq('status', 'approved')
            .order('created_at', { ascending: true })
            .limit(3);
        if (error) throw error;
        return (data || []).map(p => ({
            url: getPhotoUrl(p.storage_path),
            path: p.storage_path
        }));
    } catch (e) {
        console.warn('[DistriMatch] Erreur chargement photos:', e.message);
        return [];
    }
}

// Prefetch groupe : une seule requete pour la 1ere photo approuvee de tous
// les distributeurs charges (vignettes du side panel). Evite N requetes
// Supabase au rendu de la liste. Resultat mis en cache dans
// AppState.photoThumbs (map id -> url). Sans Supabase : cache vide, fallback
// emoji partout.
export async function loadPhotoThumbnails() {
    if (!supabaseClient) return;
    const ids = AppState.distributors.map((d) => d.id);
    if (ids.length === 0) return;
    try {
        const { data, error } = await supabaseClient
            .from('distributor_photos')
            .select('distributor_id, storage_path, created_at')
            .in('distributor_id', ids)
            .eq('status', 'approved')
            .order('created_at', { ascending: true });
        if (error) throw error;
        const thumbs = {};
        (data || []).forEach((p) => {
            // Ordre asc : on garde la premiere photo vue par distributeur.
            if (!thumbs[p.distributor_id]) {
                thumbs[p.distributor_id] = getPhotoUrl(p.storage_path);
            }
        });
        AppState.photoThumbs = thumbs;
    } catch (e) {
        console.warn('[DistriMatch] Erreur chargement vignettes photos:', e.message);
    }
}

// ============================================
// CRUD PRODUITS
// ============================================

// Liste des produits de la fiche (EPIC-T10 / T12) : cartes teintees, toujours en
// lecture ; plus de mode edition. options :
//   canInform : membre connecte sur un distributeur publie -> etiquette touchable
//               (signal), nom touchable (renommer), carte « + Ajouter un produit »
//   guest     : visiteur -> memes zones touchables, qui menent a l'invitation
//               a se connecter (js/fiche-edit.js)
export function renderProductsList(distributor, targetId = 'dist-products-list', options = {}) {
    const productsList = document.getElementById(targetId);
    const canInform = options.canInform === true;
    const guest = !canInform && options.guest === true;
    if (!distributor || !productsList) return;
    AppState.productsListTarget = targetId;
    productsList.classList.add('products-grid');

    const products = distributor.products || [];
    const empty = products.length === 0
        ? `<div class="products-empty-state">
                <p class="products-empty-title">Aucun produit référencé</p>
                <p class="products-empty-text">Personne n'a encore dit ce que vend ce distributeur.</p>
            </div>`
        : '';
    const addCard = (canInform || guest) ? renderAddCard(products.length === 0, guest) : '';
    productsList.innerHTML = empty
        + products.map((prod, index) => renderProductRow(prod, index, { canInform, guest })).join('')
        + addCard;
}

// Carte en pointillé de fin de grille (EPIC-T12, facon Rappels / Keep) : un
// toucher la transforme en champ (js/fiche-edit.js). Visiteur : mene a la connexion.
export function renderAddCard(first = false, guest = false) {
    const label = first ? 'Ajoute le premier produit' : 'Ajouter un produit';
    return `<button type="button" class="product-add-card${first ? ' is-first' : ''}" id="dist-product-add"${guest ? ' data-guest="1"' : ''}>
            <span class="product-add-plus" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></span>
            <span class="product-add-label">${label}</span>
        </button>`;
}

// Un produit est signalable s'il a un id Supabase (les produits purement
// locaux, ajoutes hors ligne, ne peuvent pas recevoir de signal).
export function isSignalableProduct(p) {
    return !!p && p.id !== null && p.id !== undefined && p.id !== '' && Number.isInteger(Number(p.id));
}

// Pictos au trait des cartes produit (EPIC-T10), choisis par productIconKey
// (utils.js) d'apres le nom. Neutres : la couleur vient de l'etat de la carte.
const PRODUCT_ICON_PATHS = {
    basket: '<path d="M4 10h16l-1.6 8.4A2 2 0 0 1 16.4 20H7.6a2 2 0 0 1-2-1.6z"/><path d="M8.5 10 12 4.5 15.5 10M9.5 14v2.5M14.5 14v2.5"/>',
    potato: '<path d="M7.5 5.5c3.2-2.1 8.8-1.2 10.7 2.6 1.9 3.9.6 8.8-3.4 10.4-4.1 1.7-9.7.7-10.9-3.8C3 11.4 4.6 7.4 7.5 5.5z"/><path d="M9.5 10h.01M14 13.5h.01M11.5 15.5h.01"/>',
    carrot: '<path d="M15.5 8.5c1.4 1.4 1.3 3-.1 4.4L6.2 20.1c-.9.6-2-.4-1.4-1.3L12 9.6c1.4-1.4 2.9-1.5 3.5-1.1z"/><path d="M15.5 8.5 19 5M15.5 8.5 16 3.5M15.5 8.5l5 .5M9 13.5l1.5 1.5M11.5 11l1 1"/>',
    salad: '<path d="M12 20c-4.8 0-8-2.8-8-6.6 0-1.8.9-3 2-3.8.2-3 2.8-5.1 6-5.1s5.8 2.1 6 5.1c1.1.8 2 2 2 3.8 0 3.8-3.2 6.6-8 6.6z"/><path d="M12 20v-9M12 15l-3-3M12 17l3-3"/>',
    egg: '<path d="M12 3c-3.3 0-6 5-6 9.5A6 6 0 0 0 12 19a6 6 0 0 0 6-6.5C18 8 15.3 3 12 3z"/>',
    milk: '<path d="M9 3h6v3l2 3v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V9l2-3z"/><path d="M7 12h10"/>',
    cheese: '<path d="M3 17V11l12-6 6 4v8z"/><path d="M3 11h18M8 14.5h.01M14 15h.01M17 12.5h.01"/>',
    bread: '<path d="M5 11a4 4 0 0 1 3-7h8a4 4 0 0 1 3 7v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/><path d="M9 9v2M15 9v2"/>',
    pizza: '<path d="M12 21 3.5 6.5a15 15 0 0 1 17 0z"/><path d="M5.3 9.5a12 12 0 0 1 13.4 0M10 11h.01M14 13h.01M12 16h.01"/>',
    meat: '<path d="M15 4c3 0 5 2.4 5 5.3 0 4.2-4.3 7.7-8.5 7.7L9 20l-2.5-.5L6 17l2.9-2.4C7.8 10.3 11 4 15 4z"/><circle cx="15" cy="9" r="1.6"/>',
    fish: '<path d="M3 12c3-4 8-5.5 12-3.5l4-2.5v12l-4-2.5C11 17.5 6 16 3 12z"/><path d="M8 11h.01"/>',
    fruit: '<path d="M12 7c-4.5-2-8 1-8 5.5C4 17 7 21 9.5 21c1.1 0 1.6-.6 2.5-.6s1.4.6 2.5.6C17 21 20 17 20 12.5 20 8 16.5 5 12 7z"/><path d="M12 7c0-2 1-3.5 3-4"/>',
    honey: '<path d="M7 8h10v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z"/><path d="M6 5h12v3H6zM7 13h10"/>',
    ice: '<path d="M8 10a4 4 0 0 1 8 0z"/><path d="M8 10h8l-4 11z"/>',
    fries: '<path d="M6 10h12l-1.5 10h-9z"/><path d="M8 10 7 4M11 10V3M14 10l1-6M17 10l1.5-4"/>',
    drink: '<path d="M7 4h10l-1.5 16h-7z"/><path d="M7.5 9h9"/>',
    meal: '<path d="M4 13h16a8 8 0 0 1-16 0z"/><path d="M3 13h18M9 9c0-1.5 1-2 1-3.5M13 9c0-1.5 1-2 1-3.5"/>',
    generic: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>'
};

export function renderProductIcon(name) {
    const paths = PRODUCT_ICON_PATHS[productIconKey(name)] || PRODUCT_ICON_PATHS.generic;
    return `<span class="product-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg></span>`;
}

// Carte produit de la fiche (EPIC-T10 / T12, maquette « carte teintée ») : picto +
// etiquette en haut, nom (toujours en noir), ligne d'age ; toute la carte prend la
// teinte de l'etat (classe is-available / is-absent / is-unknown).
// Connecte (EPIC-T12, sans bouton « Modifier ») :
//   - l'etiquette EST le controle : la toucher deplie sur la carte « Dispo / Pas
//     dispo » (js/availability.js envoie le signal) ;
//   - le nom est touchable : il devient un champ (js/fiche-edit.js : renommer,
//     nom vide = retirer) ; appui long sur la carte = menu Renommer / Retirer.
// Visiteur : l'etiquette mene a l'invitation a se connecter. Statut initial sans
// signal ; availability.js le met a jour au chargement.
const CHEVRON = '<svg class="product-status-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

export function renderProductRow(p, index, { canInform = false, guest = false } = {}) {
    const status = resolveProductStatus(p, null);
    const id = escapeHTML(String(p.id ?? ''));
    const name = escapeHTML(p.name);
    const signalable = canInform && isSignalableProduct(p);
    const pill = `<span class="product-pill is-${status.tone}${status.fresh ? ' is-fresh' : ''}">${escapeHTML(status.label)}</span>`;
    let status_ = pill;
    if (signalable) {
        status_ = `<button type="button" class="product-status-btn" aria-expanded="false" aria-controls="product-choices-${id}" aria-label="${name} : ${escapeHTML(status.label)}. Signaler">${pill}${CHEVRON}</button>`;
    } else if (guest) {
        status_ = `<button type="button" class="product-status-btn" data-guest="1" aria-label="${name} : ${escapeHTML(status.label)}. Connecte-toi pour signaler">${pill}</button>`;
    }
    const nameEl = canInform
        ? `<button type="button" class="product-name-btn product-name-clean" aria-label="Renommer ${name}">${name}</button>`
        : `<span class="product-name-clean">${name}</span>`;
    const choices = signalable
        ? `<div class="product-choices" id="product-choices-${id}" role="group" aria-label="${name} : signaler" hidden>
                <p class="product-choices-q">${escapeHTML(describeSignalQuestion(status.tone))}</p>
                <div class="product-choices-row">
                    <button type="button" class="product-choice is-yes" data-state="available">Dispo</button>
                    <button type="button" class="product-choice is-no" data-state="absent">Pas dispo</button>
                </div>
            </div>`
        : '';
    return `
        <div class="product-item-clean product-row is-${status.tone}" data-index="${index}" data-product-id="${id}"${canInform ? ' data-editable="1"' : ''}>
            <div class="product-row-main">
                <span class="product-card-top">${renderProductIcon(p.name)}${status_}</span>
                <span class="product-row-text">${nameEl}<span class="product-seen">${escapeHTML(status.detail)}</span></span>
            </div>
            ${choices}
        </div>`;
}

export function toggleAddProductForm() {
    const form = document.getElementById('bs-add-product-form');
    if (!form) return;
    form.style.display = form.style.display === 'none' ? 'flex' : 'none';
    if (form.style.display === 'flex') {
        document.getElementById('bs-detail-product-name').value = '';
        document.getElementById('bs-detail-product-name').focus();
    }
}

export async function submitDetailProduct() {
    if (!(await requireAuth())) return;

    const name = document.getElementById('bs-detail-product-name').value.trim();

    if (!name || !AppState.currentDistributor) return;

    const product = { name, available: true };

    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient.from('products').insert({
                distributor_id: AppState.currentDistributor.id,
                name: name,
                available: true
            }).select('id').single();
            if (error) throw error;
            product.dbId = data.id;
            console.log('[DistriMatch] Produit ajoute sur Supabase:', name);
        } catch (e) {
            console.warn('[DistriMatch] Erreur ajout produit Supabase:', e.message);
        }
    }

    AppState.currentDistributor.products.push(product);
    renderProductsList(AppState.currentDistributor, 'bs-products-list');

    document.getElementById('bs-detail-product-name').value = '';
    document.getElementById('bs-add-product-form').style.display = 'none';

    showToast(`${escapeHTML(name)} ajouté !`, 'success');
}

// ============================================
// ITINERAIRE
// ============================================

export function getDirectionsTo(distributor) {
    if (!distributor) return;
    const { lat, lng } = distributor;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    window.open(url, '_blank');
}

// ============================================
// ABONNEMENTS
// ============================================

export async function toggleSubscription(id, event) {
    if (event) event.stopPropagation();
    // Favori = etat purement local (localStorage), pas d'email requis.
    // L'edition d'un distributeur (produits) garde requireAuth, elle.

    const index = AppState.subscriptions.indexOf(id);
    const distributor = AppState.distributors.find(d => d.id === id);

    if (index === -1) {
        AppState.subscriptions.push(id);
        updateImplicitProfile('add_favorite', { type: distributor?.type });
        addActivityItem('subscription', id);
        showToast('Ajouté à tes favoris : tu seras prévenu si ça change', 'success');
        if (FEATURES.chat) generateWelcomeMessage(id);
        // Memorise l'etat actuel de la machine : les notifications ne partent
        // que sur un changement ulterieur (pas de rafale a l'abonnement).
        checkFavoriteUpdates();
    } else {
        AppState.subscriptions.splice(index, 1);
        addActivityItem('unsubscription', id);
        showToast(`Retiré de tes favoris : ${distributor?.name || 'ce distributeur'}`, 'default');
    }

    saveToLocalStorage();
    updateBadges();
    updateMapMarkers(false);
    updateActivityBadge();

    if (document.getElementById('subscriptions-view').classList.contains('view-active')) {
        displaySubscriptions();
    }
}

export function displaySubscriptions() {
    const list = document.getElementById('subscriptions-list');
    const empty = document.getElementById('subscriptions-empty');
    const count = document.getElementById('subscriptions-count');

    if (AppState.subscriptions.length === 0) {
        list.style.display = 'none';
        empty.style.display = 'flex';
        count.textContent = '0 favori';
        return;
    }

    list.style.display = 'block';
    empty.style.display = 'none';
    count.textContent = `${AppState.subscriptions.length} favori${AppState.subscriptions.length > 1 ? 's' : ''}`;

    list.innerHTML = AppState.subscriptions.map(id => {
        const d = AppState.distributors.find(dist => dist.id === id);
        if (!d) return '';

        const distance = d.distance ? formatDistance(d.distance) : '';
        const typeConfig = AppState.typeConfig[d.type] || {};
        // Messages du bot non lus : sans objet tant que le chat est inactif
        const unreadCount = FEATURES.chat ? (Conversations.unreadCounts[id] || 0) : 0;

        return `
            <div class="subscription-card" onclick="openDistributorModal('${d.id}', false, true)">
                ${unreadCount > 0 ? `<span class="unread-indicator">${unreadCount} nouveau(x)</span>` : ''}
                <div class="subscription-image" style="background: ${typeConfig.gradient || '#E63946'}">
                    <span class="subscription-emoji">${d.emoji}</span>
                </div>
                <div class="subscription-content">
                    <h3 class="subscription-title">${escapeHTML(d.name)} <span class="subscribed-icon">🔔</span></h3>
                    <p class="subscription-address">${escapeHTML(d.address)}</p>
                    <div class="subscription-meta">
                        <span class="subscription-distance">${distance}</span>
                        ${(d.reviewCount ?? 0) > 0
                            ? `<span class="subscription-rating">${generateStars(d.rating)} ${d.rating}</span>`
                            : `<span class="subscription-rating subscription-rating--new">Nouveau</span>`}
                    </div>
                </div>
                <button class="btn-unsubscribe" aria-label="Retirer des favoris" onclick="toggleSubscription('${d.id}', event)" title="Retirer des favoris">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                </button>
            </div>
        `;
    }).join('');
}
