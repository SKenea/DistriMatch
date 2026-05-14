/**
 * DistriMatch - UI Google Maps style
 * Panneau lateral filtres + Modal distributeur a onglets
 */

import { AppState, supabaseClient } from './state.js';
import { escapeHTML, formatDistance, generateStars, calculateDistance, showToast } from './utils.js';
import { toggleSubscription, loadDistributorPhotos, renderProductsList } from './distributor.js';
import { openConversation } from './chat.js';
import { requireAuth } from './auth.js';

// ============================================
// PANNEAU LATERAL (liste filtree)
// ============================================

let currentFilter = null;

export function initSidePanel() {
    const closeBtn = document.getElementById('side-panel-close');
    closeBtn?.addEventListener('click', closeSidePanel);
}

export function openSidePanelForType(type) {
    openSidePanelForFilters(type === 'all' ? [] : [type]);
}

export function openSidePanelForFilters(types = []) {
    currentFilter = types;
    const sidebar = document.getElementById('sidebar');
    const title = document.getElementById('side-panel-title');
    const list = document.getElementById('side-panel-list');

    if (!sidebar || !list) return;

    // Construction du titre
    if (types.length === 0) {
        title.textContent = 'Tous les distributeurs';
    } else if (types.length === 1) {
        const tc = AppState.typeConfig[types[0]] || {};
        title.textContent = `${tc.emoji || '📍'} ${tc.label || types[0]}`;
    } else {
        const labels = types.map(t => AppState.typeConfig[t]?.label || t);
        title.textContent = `${labels.length} categories : ${labels.join(', ')}`;
    }

    const matches = types.length === 0
        ? AppState.distributors
        : AppState.distributors.filter(d => types.includes(d.type));

    if (matches.length === 0) {
        list.innerHTML = `<div class="side-panel-empty">Aucun distributeur dans cette categorie</div>`;
    } else {
        // Trier par distance si position connue
        const sorted = AppState.userLocation
            ? [...matches].sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity))
            : matches;

        list.innerHTML = sorted.map(d => {
            const distance = d.distance ? formatDistance(d.distance) : '';
            return `
                <div class="side-panel-item" data-id="${escapeHTML(d.id)}">
                    <div class="side-panel-item-photo">${d.emoji}</div>
                    <div class="side-panel-item-info">
                        <div class="side-panel-item-name">${escapeHTML(d.name)}</div>
                        <div class="side-panel-item-meta">
                            <span class="side-panel-item-rating">${d.rating?.toFixed(1) || '?'} ★</span>
                            ${distance ? `<span class="side-panel-item-distance">${distance}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Bind clicks sur les items
        list.querySelectorAll('.side-panel-item').forEach(item => {
            item.addEventListener('click', () => {
                openDistributorModal(item.dataset.id);
            });
        });
    }

    sidebar.classList.add('open');
}

export function closeSidePanel() {
    document.getElementById('sidebar')?.classList.remove('open');
}

// ============================================
// MODAL DISTRIBUTEUR (onglets)
// ============================================

export function initDistModal() {
    const overlay = document.getElementById('dist-modal-overlay');
    const closeBtn = document.getElementById('dist-modal-close');

    closeBtn?.addEventListener('click', closeDistModal);

    // Clic sur l'overlay (en dehors du modal) ferme
    overlay?.addEventListener('click', (e) => {
        if (e.target === overlay) closeDistModal();
    });

    // Onglets
    document.querySelectorAll('.dist-tab').forEach(tab => {
        tab.addEventListener('click', () => switchDistTab(tab.dataset.tab));
    });

    // Boutons d'action
    document.getElementById('dist-action-directions')?.addEventListener('click', () => {
        const d = AppState.currentDistributor;
        if (d) window.open(`https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}`, '_blank');
    });

    document.getElementById('dist-action-favorite')?.addEventListener('click', async () => {
        if (AppState.currentDistributor) {
            await toggleSubscription(AppState.currentDistributor.id);
            updateFavoriteButton();
            // Animation pulse 200ms apres toggle
            const btn = document.getElementById('dist-action-favorite');
            btn?.classList.remove('pulsing');
            // reflow pour relancer l'animation si on clique a nouveau
            void btn?.offsetWidth;
            btn?.classList.add('pulsing');
            btn?.addEventListener('animationend', () => btn.classList.remove('pulsing'), { once: true });
        }
    });

    // Bouton Discuter avec le bot (mode edit)
    document.getElementById('dist-open-chat')?.addEventListener('click', () => {
        if (AppState.currentDistributor) {
            openConversation(AppState.currentDistributor.id);
        }
    });

    // Bouton Partager : copie URL avec ?id=<distId>
    document.getElementById('dist-action-share')?.addEventListener('click', async () => {
        const dist = AppState.currentDistributor;
        if (!dist) return;
        const url = buildShareUrl(dist.id);
        try {
            await navigator.clipboard.writeText(url);
            showToast('Lien copie dans le presse-papier', 'success');
        } catch (e) {
            // Fallback : prompt
            window.prompt('Copie ce lien :', url);
        }
    });
}

/**
 * Construit l'URL partageable d'un distributeur.
 * Exporte pour test unitaire.
 */
export function buildShareUrl(distId) {
    const base = (typeof window !== 'undefined' && window.location)
        ? `${window.location.origin}${window.location.pathname}`
        : 'https://skenea.github.io/DistriMatch/';
    return `${base}?id=${encodeURIComponent(distId)}`;
}

export function openModalFromUrlParam() {
    if (typeof window === 'undefined' || !window.location) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) return;

    if (AppState.distributors.find(d => d.id === id)) {
        openDistributorModal(id);
    } else {
        showToast('Distributeur introuvable', 'error');
    }

    // Nettoyer l'URL pour eviter une re-ouverture au rafraichissement
    if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname);
    }
}

export function openDistributorModal(id, editMode = false) {
    const distributor = AppState.distributors.find(d => d.id === id);
    if (!distributor) return;

    AppState.currentDistributor = distributor;
    AppState.modalEditMode = editMode;

    const typeConfig = AppState.typeConfig[distributor.type] || {};
    const distance = distributor.distance ? formatDistance(distributor.distance) : '';

    // Header
    document.getElementById('dist-modal-name').textContent = distributor.name;
    document.getElementById('dist-modal-rating').textContent =
        `${(distributor.rating || 0).toFixed(1)} ${generateStars(distributor.rating || 0)}`;
    document.getElementById('dist-modal-reviews').textContent = `(${distributor.reviewCount || 0})`;
    document.getElementById('dist-modal-type').textContent = `${distributor.emoji} ${typeConfig.label || distributor.type}`;

    // A propos
    document.getElementById('dist-apropos-address').textContent = distributor.address || 'Adresse inconnue';
    document.getElementById('dist-apropos-distance').textContent = distance || 'Distance non disponible';
    const addedRow = document.getElementById('dist-apropos-added-row');
    if (addedRow) addedRow.style.display = distributor.isUserAdded ? 'flex' : 'none';

    // Produits : mode edit (boutons CRUD) ou readonly
    renderProductsList(distributor, 'dist-products-list', { readonly: !editMode });

    // En mode edit, afficher la section "+ Ajouter produit" + "Discuter"
    const addSection = document.getElementById('dist-products-add-section');
    if (addSection) addSection.style.display = editMode ? 'block' : 'none';
    const chatSection = document.getElementById('dist-chat-section');
    if (chatSection) chatSection.style.display = editMode ? 'block' : 'none';

    // Photos
    const photoSection = document.getElementById('dist-modal-photo');
    const photoGallery = document.getElementById('dist-modal-photos-gallery');
    photoSection.style.display = 'none';
    photoGallery.innerHTML = '';

    loadDistributorPhotos(distributor.id).then(photos => {
        if (photos.length > 0) {
            photoGallery.innerHTML = photos.map(p =>
                `<div class="photo-gallery-item"><img src="${p.url}" alt="Photo distributeur" loading="lazy"></div>`
            ).join('');
            photoSection.style.display = 'block';
        }
    });

    // Boutons
    updateFavoriteButton();

    // Ouvrir l'onglet Produits par defaut
    switchDistTab('produits');

    // Afficher la modal
    document.getElementById('dist-modal-overlay')?.classList.add('active');
}

export function closeDistModal() {
    document.getElementById('dist-modal-overlay')?.classList.remove('active');
}

function switchDistTab(tabName) {
    document.querySelectorAll('.dist-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });
    document.querySelectorAll('.dist-tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.dataset.tabPane === tabName);
    });
}

function updateFavoriteButton() {
    const dist = AppState.currentDistributor;
    if (!dist) return;
    const isFav = AppState.subscriptions.includes(dist.id);
    const btn = document.getElementById('dist-action-favorite');
    const label = document.getElementById('dist-action-favorite-label');
    if (btn) {
        btn.classList.toggle('favorited', isFav);
        btn.setAttribute('aria-label', isFav ? 'Retirer des favoris' : 'Ajouter aux favoris');
    }
    if (label) label.textContent = isFav ? 'Retirer' : 'Favori';
}

// ============================================
// FORMULAIRE AJOUT PRODUIT (mode edit)
// ============================================

export function toggleDistAddProductForm() {
    const form = document.getElementById('dist-add-product-form');
    if (!form) return;
    const showing = form.style.display !== 'none';
    form.style.display = showing ? 'none' : 'flex';
    if (!showing) {
        document.getElementById('dist-add-product-name').value = '';
        document.getElementById('dist-add-product-price').value = '';
        document.getElementById('dist-add-product-name').focus();
    }
}

export async function submitDistAddProduct() {
    if (!(await requireAuth())) return;

    const name = document.getElementById('dist-add-product-name').value.trim();
    const price = parseFloat(document.getElementById('dist-add-product-price').value) || 0;

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
        } catch (e) {
            console.warn('[DistriMatch] Erreur ajout produit:', e.message);
        }
    }

    AppState.currentDistributor.products.push(product);
    renderProductsList(AppState.currentDistributor, 'dist-products-list', { readonly: false });

    document.getElementById('dist-add-product-name').value = '';
    document.getElementById('dist-add-product-price').value = '';
    document.getElementById('dist-add-product-form').style.display = 'none';

    showToast(`${escapeHTML(name)} ajoute !`, 'success');
}
