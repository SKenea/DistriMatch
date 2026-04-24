/**
 * DistriMatch - Ajout de distributeur
 */

import {
    AppState, AddMode, DISTRIBUTOR_TYPES,
    mainMap, supabaseClient,
    incrementAddProductCounter
} from './state.js';
import {
    escapeHTML, showToast, calculateDistance,
    saveToLocalStorage, saveUserDistributor
} from './utils.js';
import { updateMapMarkers } from './map.js';
import { addActivityItem, updateActivityBadge } from './activity.js';
import { requireAuth } from './auth.js';

// ============================================
// MODE AJOUT
// ============================================

export async function toggleAddMode() {
    if (AddMode.active) {
        cancelAddDistributor();
        return;
    }
    if (!(await requireAuth())) return;

    AddMode.active = true;
    document.getElementById('btn-add-distributor').classList.add('active');
    document.getElementById('placement-hint').classList.add('visible');
    document.getElementById('main-map').style.cursor = 'crosshair';

    mainMap.once('click', onMapClickForPlacement);
}

function onMapClickForPlacement(e) {
    if (!AddMode.active) return;

    AddMode.lat = e.latlng.lat;
    AddMode.lng = e.latlng.lng;

    AddMode.marker = L.marker(e.latlng, {
        icon: L.divIcon({
            className: 'new-distributor-marker',
            html: '📍',
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        }),
        draggable: true
    }).addTo(mainMap);

    AddMode.marker.bindPopup(getAddPopupContent(), {
        closeOnClick: false,
        autoClose: false,
        minWidth: 250
    }).openPopup();

    AddMode.marker.on('dragend', function(e) {
        const pos = e.target.getLatLng();
        AddMode.lat = pos.lat;
        AddMode.lng = pos.lng;
    });

    document.getElementById('placement-hint').classList.remove('visible');
    document.getElementById('main-map').style.cursor = '';
}

function getAddPopupContent() {
    const options = DISTRIBUTOR_TYPES.map(t =>
        `<option value="${t.id}">${t.emoji} ${t.name}</option>`
    ).join('');

    return `
        <div class="add-distributor-popup">
            <h4>Nouveau distributeur</h4>
            <select id="new-dist-type">${options}</select>
            <input type="text" id="new-dist-name" placeholder="Nom du distributeur" required>
            <input type="text" id="new-dist-address" placeholder="Adresse (optionnel)">
            <div class="add-products-section">
                <div class="add-products-header">
                    <span>Produits</span>
                    <button type="button" class="btn-add-product-row" onclick="addProductRow()">+ Ajouter</button>
                </div>
                <div id="add-products-list"></div>
            </div>
            <div class="photo-upload-section">
                <label class="photo-upload-label" for="new-dist-photos">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                    </svg>
                    Photos (max 3)
                </label>
                <input type="file" id="new-dist-photos" accept="image/*" multiple style="display:none" onchange="previewAddPhotos(this)">
                <div id="photo-preview-container" class="photo-preview-container"></div>
            </div>
            <div class="popup-actions">
                <button class="btn-cancel" onclick="cancelAddDistributor()">Annuler</button>
                <button class="btn-confirm" onclick="confirmAddDistributor()">Ajouter</button>
            </div>
        </div>
    `;
}

// ============================================
// PRODUITS FORMULAIRE
// ============================================

export function addProductRow() {
    const list = document.getElementById('add-products-list');
    if (!list) return;
    const count = list.querySelectorAll('.product-row').length;
    if (count >= 10) {
        showToast('Maximum 10 produits', 'warning');
        return;
    }
    const id = incrementAddProductCounter();
    const row = document.createElement('div');
    row.className = 'product-row';
    row.dataset.rowId = id;
    row.innerHTML = `
        <input type="text" class="product-name-input" placeholder="Nom du produit" required>
        <input type="number" class="product-price-input" placeholder="Prix" step="0.10" min="0">
        <button type="button" class="product-remove-row" onclick="removeProductRow(${id})">&times;</button>
    `;
    list.appendChild(row);
}

export function removeProductRow(id) {
    const row = document.querySelector(`.product-row[data-row-id="${id}"]`);
    if (row) row.remove();
}

function getProductsFromForm() {
    const rows = document.querySelectorAll('#add-products-list .product-row');
    const products = [];
    rows.forEach(row => {
        const name = row.querySelector('.product-name-input')?.value.trim();
        const price = parseFloat(row.querySelector('.product-price-input')?.value) || 0;
        if (name) {
            products.push({ name, price, available: true });
        }
    });
    return products;
}

// ============================================
// PHOTOS
// ============================================

export function renderPhotoPreview() {
    const container = document.getElementById('photo-preview-container');
    if (!container || !AddMode.photos) return;

    container.innerHTML = AddMode.photos.map((file, i) => {
        const url = URL.createObjectURL(file);
        return `
            <div class="photo-preview-item">
                <img src="${url}" alt="Photo ${i + 1}">
                <button class="photo-remove-btn" onclick="removeAddPhoto(${i})" type="button">&times;</button>
            </div>
        `;
    }).join('');
}

export function previewAddPhotos(input) {
    AddMode.photos = Array.from(input.files).slice(0, 3);
    renderPhotoPreview();
}

export function removeAddPhoto(index) {
    if (!AddMode.photos) return;
    AddMode.photos.splice(index, 1);
    renderPhotoPreview();
}

async function uploadDistributorPhotos(distributorId, files) {
    if (!supabaseClient || !files || files.length === 0) return [];

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return [];

    const uploadedPaths = [];

    for (let i = 0; i < Math.min(files.length, 3); i++) {
        try {
            const file = files[i];
            const ext = file.name.split('.').pop().toLowerCase();
            const path = `${session.user.id}/${distributorId}_${Date.now()}_${i}.${ext}`;

            const { error } = await supabaseClient.storage
                .from('distributor-photos')
                .upload(path, file, { contentType: file.type });

            if (error) throw error;

            await supabaseClient.from('distributor_photos').insert({
                distributor_id: distributorId,
                user_id: session.user.id,
                storage_path: path,
                status: 'approved'
            });

            uploadedPaths.push(path);
            console.log('[DistriMatch] Photo uploadee:', path);
        } catch (e) {
            console.warn('[DistriMatch] Erreur upload photo:', e.message);
        }
    }

    return uploadedPaths;
}

// ============================================
// CONFIRMER / ANNULER
// ============================================

export function cancelAddDistributor() {
    if (AddMode.marker) {
        mainMap.removeLayer(AddMode.marker);
    }
    AddMode.active = false;
    AddMode.marker = null;
    AddMode.lat = null;
    AddMode.lng = null;

    document.getElementById('btn-add-distributor').classList.remove('active');
    document.getElementById('placement-hint').classList.remove('visible');
    document.getElementById('main-map').style.cursor = '';
    mainMap.off('click', onMapClickForPlacement);
}

export async function confirmAddDistributor() {
    const typeSelect = document.getElementById('new-dist-type');
    const nameInput = document.getElementById('new-dist-name');
    const addressInput = document.getElementById('new-dist-address');

    if (!typeSelect || !nameInput) return;

    const type = typeSelect.value;
    const name = nameInput.value.trim();
    const address = addressInput ? addressInput.value.trim() : '';

    if (!name) {
        showToast('Nom requis', 'error');
        return;
    }

    const typeInfo = DISTRIBUTOR_TYPES.find(t => t.id === type);
    const products = getProductsFromForm();

    const distId = `user-${Date.now()}`;
    const newDistributor = {
        id: distId,
        name: name,
        type: type,
        emoji: typeInfo?.emoji || '🏪',
        lat: AddMode.lat,
        lng: AddMode.lng,
        address: address || 'Adresse a completer',
        city: 'A verifier',
        rating: 5.0,
        reviewCount: 0,
        products: products,
        isUserAdded: true,
        addedAt: Date.now(),
        addedBy: 'user'
    };

    if (supabaseClient) {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            const userId = session?.user?.id || null;
            const { error } = await supabaseClient.from('distributors').insert({
                id: distId,
                name: name,
                type: type,
                emoji: typeInfo?.emoji || '🏪',
                lat: AddMode.lat,
                lng: AddMode.lng,
                address: address || 'Adresse a completer',
                city: 'A verifier',
                rating: 5.0,
                review_count: 0,
                status: 'verified',
                price_range: '€',
                is_user_added: true,
                added_by: userId
            });
            if (error) throw error;
            console.log('[DistriMatch] Distributeur ajoute sur Supabase:', distId);

            if (products.length > 0) {
                const productRows = products.map(p => ({
                    distributor_id: distId,
                    name: p.name,
                    price: p.price,
                    available: true
                }));
                const { error: prodError } = await supabaseClient.from('products').insert(productRows);
                if (prodError) {
                    console.warn('[DistriMatch] Erreur ajout produits:', prodError.message);
                } else {
                    console.log('[DistriMatch] Produits ajoutes:', products.length);
                }
            }

            if (AddMode.photos && AddMode.photos.length > 0) {
                await uploadDistributorPhotos(distId, AddMode.photos);
            }
        } catch (e) {
            console.warn('[DistriMatch] Erreur ajout Supabase:', e.message);
        }
    }

    AddMode.photos = null;

    saveUserDistributor(newDistributor);

    AppState.distributors.push(newDistributor);

    if (AppState.userLocation) {
        newDistributor.distance = calculateDistance(
            AppState.userLocation.lat,
            AppState.userLocation.lng,
            newDistributor.lat,
            newDistributor.lng
        );
    }

    mainMap.removeLayer(AddMode.marker);
    updateMapMarkers(false);

    AddMode.active = false;
    AddMode.marker = null;
    AddMode.lat = null;
    AddMode.lng = null;

    document.getElementById('btn-add-distributor').classList.remove('active');

    showToast(`${escapeHTML(newDistributor.name)} ajoute !`, 'success');

    AppState.points += 20;

    addActivityItem('new_distributor', newDistributor.id, { name: newDistributor.name, points: 20 });
    saveToLocalStorage();
    updateActivityBadge();
}
