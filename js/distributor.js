/**
 * DistriMatch - Page distributeur, CRUD produits, abonnements
 */

import { AppState, Conversations, supabaseClient } from './state.js';
import {
    escapeHTML, generateStars, formatDistance, showToast,
    updateImplicitProfile, saveToLocalStorage
, resolveProductStatus } from './utils.js';
import { updateBadges, goBackToMap } from './navigation.js';
import { updateMapMarkers } from './map.js';
import { addActivityItem, updateActivityBadge } from './activity.js';
import { generateWelcomeMessage } from './chat.js';
import { FEATURES } from './config.js';
import { checkFavoriteUpdates } from './favorites-watch.js';
import { requireAuth } from './auth.js';
import { confirmDialog } from './confirm-dialog.js';

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

export function renderProductsList(distributor, targetId = 'products-list', options = {}) {
    const productsList = document.getElementById(targetId);
    // Lecture seule par defaut sur la modal Google Maps
    const readonly = options.readonly !== undefined
        ? options.readonly
        : (targetId === 'dist-products-list');
    // EPIC-T5 : informer (toucher un aliment, ajouter des produits) est un
    // privilege de compte ; l'appelant dit si l'utilisateur est connecte.
    const canInform = options.canInform === true;
    if (!distributor || !productsList) return;

    // Memorise le conteneur courant pour que les CRUD (toggle/delete/edit)
    // re-render dans la bonne liste (sinon fige sur 'products-list').
    AppState.productsListTarget = targetId;

    if (!distributor.products || distributor.products.length === 0) {
        // En lecture, une machine sans produit invite a les ajouter (connexion
        // exigee au clic : on passe par le stylo « Modifier », UC2).
        productsList.innerHTML = `
            <div class="products-empty-state">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
                    <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                    <line x1="3" y1="6" x2="21" y2="6"/>
                    <path d="M16 10a4 4 0 01-8 0"/>
                </svg>
                <p>Aucun produit référencé pour le moment</p>
                ${readonly && canInform ? '<button type="button" class="btn-secondary-clean products-add-first" id="dist-products-add-first">Ajouter les produits</button>' : ''}
            </div>`;
        return;
    }

    productsList.innerHTML = distributor.products.map((p, index) => {
        if (readonly) return renderProductRow(p, index, canInform);
        // Mode edition : nom editable + dispo + supprimer (pas de prix).
        return `
        <div class="product-item-clean ${p.available ? 'available' : 'unavailable'}" data-index="${index}" data-product-id="${escapeHTML(String(p.id ?? ''))}">
            <div class="product-info-clean">
                <input class="product-edit-name" type="text" value="${escapeHTML(p.name)}"
                    onchange="updateProductField(${index}, 'name', this.value)" aria-label="Nom du produit">
            </div>
            <div class="product-actions-clean">
                <button class="product-availability-chip ${p.available ? 'is-available' : 'is-unavailable'}" onclick="toggleProductAvailability(${index})" aria-label="${p.available ? 'Disponible — toucher pour marquer non disponible' : 'Non disponible — toucher pour marquer disponible'}" title="${p.available ? 'Toucher pour marquer non disponible' : 'Toucher pour marquer disponible'}">
                    ${p.available ? 'Disponible' : 'Non disponible'}
                </button>
                <button class="product-btn-delete" onclick="deleteProduct(${index})" aria-label="Supprimer le produit" title="Supprimer ce produit">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
                    </svg>
                </button>
            </div>
        </div>`;
    }).join('');
}

// Un produit est signalable s'il a un id Supabase (les produits purement
// locaux, ajoutes hors ligne, ne peuvent pas recevoir de signal).
export function isSignalableProduct(p) {
    return !!p && p.id !== null && p.id !== undefined && p.id !== '' && Number.isInteger(Number(p.id));
}

// Ligne produit de la fiche en lecture (EPIC-T2) : nom + « vu il y a X » a
// gauche, statut « Dispo / Pas dispo / Pas d'info » a droite. Connecte
// (EPIC-T5) : toucher la ligne deplie « Il y en a / Plus rien »
// (js/availability.js envoie le signal). Visiteur : lecture seule.
// Statut initial sans signal ; availability.js le met a jour au chargement.
export function renderProductRow(p, index, canInform = false) {
    const status = resolveProductStatus(p, null);
    const id = escapeHTML(String(p.id ?? ''));
    const name = escapeHTML(p.name);
    const pill = `<span class="product-pill is-${status.tone}${status.fresh ? ' is-fresh' : ''}">${escapeHTML(status.label)}</span>`;
    const text = `<span class="product-row-text"><span class="product-name-clean">${name}</span><span class="product-seen">${escapeHTML(status.detail)}</span></span>`;
    if (!canInform || !isSignalableProduct(p)) {
        return `
        <div class="product-item-clean product-row is-${status.tone}" data-index="${index}" data-product-id="${id}">
            <div class="product-row-main">${text}${pill}</div>
        </div>`;
    }
    return `
        <div class="product-item-clean product-row is-${status.tone}" data-index="${index}" data-product-id="${id}">
            <button type="button" class="product-row-main" aria-expanded="false" aria-controls="product-choices-${id}">${text}${pill}</button>
            <div class="product-choices" id="product-choices-${id}" role="group" aria-label="${name} : il en reste ?" hidden>
                <button type="button" class="product-choice is-yes" data-state="available">✓ Il y en a</button>
                <button type="button" class="product-choice is-no" data-state="absent">✗ Plus rien</button>
            </div>
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

// Edition directe du nom d'un produit (au change/blur). Plus de prix.
export async function updateProductField(index, field, rawValue) {
    if (field !== 'name') return;
    if (!(await requireAuth())) return;

    const distributor = AppState.currentDistributor;
    if (!distributor) return;
    const product = distributor.products[index];
    if (!product) return;

    const oldName = product.name;
    const newName = String(rawValue).trim();
    if (!newName || newName === product.name) {
        renderProductsList(distributor, AppState.productsListTarget, { readonly: false });
        return;
    }

    if (supabaseClient) {
        try {
            if (product.dbId) {
                await supabaseClient.from('products')
                    .update({ name: newName }).eq('id', product.dbId);
            } else {
                await supabaseClient.from('products')
                    .update({ name: newName })
                    .eq('distributor_id', distributor.id).eq('name', oldName);
            }
            console.log('[DistriMatch] Produit modifie sur Supabase:', newName);
        } catch (e) {
            console.warn('[DistriMatch] Erreur modification produit:', e.message);
        }
    }

    product.name = newName;
    showToast('Produit modifié', 'success');
}

export async function toggleProductAvailability(index) {
    if (!(await requireAuth())) return;

    const distributor = AppState.currentDistributor;
    if (!distributor) return;
    const product = distributor.products[index];
    if (!product) return;

    const newAvailable = !product.available;

    if (supabaseClient) {
        try {
            if (product.dbId) {
                await supabaseClient.from('products')
                    .update({ available: newAvailable })
                    .eq('id', product.dbId);
            } else {
                await supabaseClient.from('products')
                    .update({ available: newAvailable })
                    .eq('distributor_id', distributor.id)
                    .eq('name', product.name);
            }
            console.log('[DistriMatch] Disponibilite modifiee:', product.name, newAvailable);
        } catch (e) {
            console.warn('[DistriMatch] Erreur toggle disponibilite:', e.message);
        }
    }

    product.available = newAvailable;
    renderProductsList(distributor, AppState.productsListTarget, { readonly: false });
    showToast(newAvailable ? 'Produit disponible' : 'Produit indisponible', 'default');
}

export async function deleteProduct(index) {
    const distributor = AppState.currentDistributor;
    if (!distributor) return;
    const product = distributor.products[index];
    if (!product) return;

    const ok = await confirmDialog({
        title: 'Supprimer ce produit ?',
        message: `« ${product.name} » sera retiré de la fiche pour tout le monde.`,
        confirmLabel: 'Supprimer'
    });
    if (!ok) return;

    if (!(await requireAuth())) return;

    if (supabaseClient) {
        try {
            if (product.dbId) {
                await supabaseClient.from('products').delete().eq('id', product.dbId);
            } else {
                await supabaseClient.from('products')
                    .delete()
                    .eq('distributor_id', distributor.id)
                    .eq('name', product.name);
            }
            console.log('[DistriMatch] Produit supprime sur Supabase:', product.name);
        } catch (e) {
            console.warn('[DistriMatch] Erreur suppression produit:', e.message);
        }
    }

    distributor.products.splice(index, 1);
    renderProductsList(distributor, AppState.productsListTarget, { readonly: false });
    showToast('Produit supprimé', 'default');
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
