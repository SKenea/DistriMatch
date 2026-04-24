/**
 * DistriMatch - Page distributeur, CRUD produits, abonnements
 */

import { AppState, Conversations, supabaseClient } from './state.js';
import {
    escapeHTML, generateStars, formatDistance, showToast,
    updateImplicitProfile, saveToLocalStorage
} from './utils.js';
import {
    switchTab, switchView, updateBadges, goBackToMap
} from './navigation.js';
import { updateMapMarkers } from './map.js';
import { addActivityItem, updateActivityBadge } from './activity.js';
import {
    generateWelcomeMessage, updateConversationsList,
    updateChatSubscribeButton
} from './chat.js';
import { requireAuth } from './auth.js';

// ============================================
// PAGE DISTRIBUTEUR
// ============================================

export function showDetails(id) {
    const distributor = AppState.distributors.find(d => d.id === id);
    if (!distributor) return;

    AppState.currentDistributor = distributor;
    updateImplicitProfile('view_details', { type: distributor.type, id: distributor.id });
    updateImplicitProfile('time_activity', {});

    const typeConfig = AppState.typeConfig[distributor.type] || {};
    const distance = distributor.distance ? formatDistance(distributor.distance) : 'N/A';

    document.getElementById('detail-type').innerHTML = `
        <span style="font-size: 1.5rem">${distributor.emoji}</span>
        <span>${escapeHTML(typeConfig.label || distributor.type)}</span>
    `;
    document.getElementById('detail-name').textContent = distributor.name;
    document.getElementById('detail-address').textContent = distributor.address;
    document.getElementById('detail-rating').textContent = generateStars(distributor.rating);
    document.getElementById('detail-reviews').textContent = `(${distributor.reviewCount} avis)`;
    document.getElementById('detail-distance').textContent = distance;

    renderProductsList(distributor);

    const subBtn = document.getElementById('btn-subscribe');
    const isSubscribed = AppState.subscriptions.includes(distributor.id);
    subBtn.textContent = isSubscribed ? 'Abonne' : "S'abonner";
    subBtn.className = isSubscribed ? 'btn-primary-clean subscribed-active' : 'btn-primary-clean';

    // Charger les photos
    const photosSection = document.getElementById('detail-photos');
    const photosGallery = document.getElementById('detail-photos-gallery');
    photosSection.style.display = 'none';
    photosGallery.innerHTML = '';

    loadDistributorPhotos(distributor.id).then(photos => {
        if (photos.length > 0) {
            photosGallery.innerHTML = photos.map(p =>
                `<div class="photo-gallery-item"><img src="${p.url}" alt="Photo distributeur" loading="lazy"></div>`
            ).join('');
            photosSection.style.display = 'block';
        }
    });

    // Afficher le contenu, masquer le placeholder
    const pageContent = document.getElementById('distributor-page-content');
    const emptyState = document.getElementById('distributor-empty');
    const addForm = document.getElementById('add-product-form');
    if (pageContent) pageContent.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';
    if (addForm) addForm.style.display = 'none';

    // Activer l'onglet et naviguer vers la page (legacy, si tab-distributor existe)
    const tabDistributor = document.getElementById('tab-distributor');
    if (tabDistributor) {
        tabDistributor.classList.remove('nav-tab-disabled');
        if (document.getElementById('distributor-view')?.classList.contains('view-hidden')) {
            switchTab('distributor');
        }
    }
}

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

// ============================================
// CRUD PRODUITS
// ============================================

export function renderProductsList(distributor, targetId = 'products-list') {
    const productsList = document.getElementById(targetId);
    if (!distributor || !productsList) return;

    if (!distributor.products || distributor.products.length === 0) {
        productsList.innerHTML = `
            <div class="products-empty-state">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
                    <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                    <line x1="3" y1="6" x2="21" y2="6"/>
                    <path d="M16 10a4 4 0 01-8 0"/>
                </svg>
                <p>Aucun produit reference pour le moment</p>
            </div>`;
        return;
    }

    productsList.innerHTML = distributor.products.map((p, index) => `
        <div class="product-item-clean ${p.available ? 'available' : 'unavailable'}" data-index="${index}">
            <div class="product-info-clean">
                <div class="product-name-clean">${escapeHTML(p.name)}</div>
            </div>
            <div class="product-actions-clean">
                <div class="product-price-clean">${p.price.toFixed(2)}€</div>
                <button class="product-btn-toggle" onclick="toggleProductAvailability(${index})" title="${p.available ? 'Marquer indisponible' : 'Marquer disponible'}">
                    ${p.available ? '✓' : '✗'}
                </button>
                <button class="product-btn-edit" onclick="editProduct(${index})" title="Modifier">✎</button>
                <button class="product-btn-delete" onclick="deleteProduct(${index})" title="Supprimer">×</button>
            </div>
        </div>
    `).join('');
}

export function toggleAddProductForm() {
    const form = document.getElementById('add-product-form');
    form.style.display = form.style.display === 'none' ? 'flex' : 'none';
    if (form.style.display === 'flex') {
        document.getElementById('detail-product-name').value = '';
        document.getElementById('detail-product-price').value = '';
        document.getElementById('detail-product-name').focus();
    }
}

export async function submitDetailProduct() {
    if (!(await requireAuth())) return;

    const name = document.getElementById('detail-product-name').value.trim();
    const price = parseFloat(document.getElementById('detail-product-price').value) || 0;

    if (!name || !AppState.currentDistributor) return;

    const product = { name, price, available: true };

    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient.from('products').insert({
                distributor_id: AppState.currentDistributor.id,
                name: name,
                price: price,
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
    renderProductsList(AppState.currentDistributor);

    document.getElementById('detail-product-name').value = '';
    document.getElementById('detail-product-price').value = '';
    document.getElementById('add-product-form').style.display = 'none';

    showToast(`${escapeHTML(name)} ajoute !`, 'success');
}

export function editProduct(index) {
    const distributor = AppState.currentDistributor;
    if (!distributor) return;
    const product = distributor.products[index];
    if (!product) return;

    const productsList = document.getElementById('products-list');
    const item = productsList.querySelectorAll('.product-item-clean')[index];
    if (!item) return;

    item.innerHTML = `
        <div class="product-edit-row">
            <input type="text" class="product-edit-name" value="${escapeHTML(product.name)}">
            <input type="number" class="product-edit-price" value="${product.price}" step="0.10" min="0">
            <button class="product-btn-save" onclick="saveProduct(${index})">✓</button>
            <button class="product-btn-cancel-edit" onclick="renderProductsList(AppState.currentDistributor)">✗</button>
        </div>
    `;
    item.querySelector('.product-edit-name').focus();
}

export async function saveProduct(index) {
    if (!(await requireAuth())) return;

    const distributor = AppState.currentDistributor;
    if (!distributor) return;
    const product = distributor.products[index];
    if (!product) return;

    const productsList = document.getElementById('products-list');
    const item = productsList.querySelectorAll('.product-item-clean')[index];
    const newName = item.querySelector('.product-edit-name').value.trim();
    const newPrice = parseFloat(item.querySelector('.product-edit-price').value) || 0;

    if (!newName) return;

    if (supabaseClient && product.dbId) {
        try {
            const { error } = await supabaseClient.from('products')
                .update({ name: newName, price: newPrice })
                .eq('id', product.dbId);
            if (error) throw error;
            console.log('[DistriMatch] Produit modifie sur Supabase:', newName);
        } catch (e) {
            console.warn('[DistriMatch] Erreur modification produit:', e.message);
        }
    } else if (supabaseClient) {
        try {
            const { error } = await supabaseClient.from('products')
                .update({ name: newName, price: newPrice })
                .eq('distributor_id', distributor.id)
                .eq('name', product.name);
            if (error) throw error;
            console.log('[DistriMatch] Produit modifie sur Supabase:', newName);
        } catch (e) {
            console.warn('[DistriMatch] Erreur modification produit:', e.message);
        }
    }

    product.name = newName;
    product.price = newPrice;
    renderProductsList(distributor);
    showToast('Produit modifie', 'success');
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
    renderProductsList(distributor);
    showToast(newAvailable ? 'Produit disponible' : 'Produit indisponible', 'default');
}

export async function deleteProduct(index) {
    if (!(await requireAuth())) return;

    const distributor = AppState.currentDistributor;
    if (!distributor) return;
    const product = distributor.products[index];
    if (!product) return;

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
    renderProductsList(distributor);
    showToast('Produit supprime', 'default');
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

export function getDirections() {
    if (!AppState.currentDistributor) return;
    getDirectionsTo(AppState.currentDistributor);
}

// ============================================
// ABONNEMENTS
// ============================================

export async function toggleSubscription(id, event) {
    if (event) event.stopPropagation();
    if (!(await requireAuth())) return;

    const index = AppState.subscriptions.indexOf(id);
    const distributor = AppState.distributors.find(d => d.id === id);

    if (index === -1) {
        AppState.subscriptions.push(id);
        updateImplicitProfile('add_favorite', { type: distributor?.type });
        addActivityItem('subscription', id);
        showToast(`Tu es maintenant abonne a ${distributor?.name || 'ce distributeur'}`, 'success');
        generateWelcomeMessage(id);
    } else {
        AppState.subscriptions.splice(index, 1);
        addActivityItem('unsubscription', id);
        showToast(`Tu ne recevras plus d'alertes de ${distributor?.name || 'ce distributeur'}`, 'default');
    }

    saveToLocalStorage();
    updateBadges();
    updateMapMarkers(false);
    updateActivityBadge();

    if (document.getElementById('subscriptions-view').classList.contains('view-active')) {
        displaySubscriptions();
    }

    // Rafraichir le bouton subscribe (legacy detail page) si present
    if (AppState.currentDistributor && AppState.currentDistributor.id === id) {
        const subBtn = document.getElementById('btn-subscribe');
        if (subBtn) {
            const isNowSubscribed = AppState.subscriptions.includes(id);
            subBtn.textContent = isNowSubscribed ? 'Abonne' : "S'abonner";
            subBtn.className = isNowSubscribed ? 'btn-primary-clean subscribed-active' : 'btn-primary-clean';
        }
    }
}

export function toggleSubscriptionFromModal() {
    if (AppState.currentDistributor) {
        toggleSubscription(AppState.currentDistributor.id);
    }
}

export function displaySubscriptions() {
    const list = document.getElementById('subscriptions-list');
    const empty = document.getElementById('subscriptions-empty');
    const count = document.getElementById('subscriptions-count');

    if (AppState.subscriptions.length === 0) {
        list.style.display = 'none';
        empty.style.display = 'flex';
        count.textContent = '0 abonnement';
        return;
    }

    list.style.display = 'block';
    empty.style.display = 'none';
    count.textContent = `${AppState.subscriptions.length} favori(s)`;

    list.innerHTML = AppState.subscriptions.map(id => {
        const d = AppState.distributors.find(dist => dist.id === id);
        if (!d) return '';

        const distance = d.distance ? formatDistance(d.distance) : '';
        const typeConfig = AppState.typeConfig[d.type] || {};
        const unreadCount = Conversations.unreadCounts[id] || 0;

        return `
            <div class="subscription-card" onclick="openConversation('${d.id}'); goBackToMap();">
                ${unreadCount > 0 ? `<span class="unread-indicator">${unreadCount} nouveau(x)</span>` : ''}
                <div class="subscription-image" style="background: ${typeConfig.gradient || '#6366f1'}">
                    <span class="subscription-emoji">${d.emoji}</span>
                </div>
                <div class="subscription-content">
                    <h3 class="subscription-title">${escapeHTML(d.name)} <span class="subscribed-icon">🔔</span></h3>
                    <p class="subscription-address">${escapeHTML(d.address)}</p>
                    <div class="subscription-meta">
                        <span class="subscription-distance">${distance}</span>
                        <span class="subscription-rating">${generateStars(d.rating)} ${d.rating}</span>
                    </div>
                </div>
                <button class="btn-unsubscribe" onclick="toggleSubscription('${d.id}', event)" title="Se desabonner">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                </button>
            </div>
        `;
    }).join('');
}
