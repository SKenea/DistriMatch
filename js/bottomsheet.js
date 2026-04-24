/**
 * DistriMatch - Bottom Sheet (Google Maps style)
 * Gere l'affichage peek/full et les interactions touch/click
 */

import { AppState } from './state.js';
import { escapeHTML, formatDistance, showToast, generateStars } from './utils.js';
import { toggleSubscription, renderProductsList, loadDistributorPhotos } from './distributor.js';
import { openConversation } from './chat.js';
import { openReportModal } from './activity.js';

// ============================================
// ETAT DU BOTTOM SHEET
// ============================================

let currentState = 'hidden'; // 'hidden' | 'peek' | 'full'
let touchStartY = 0;
let touchDeltaY = 0;

// ============================================
// INITIALISATION
// ============================================

export function initBottomSheet() {
    const sheet = document.getElementById('bottom-sheet');
    const drag = document.getElementById('bottom-sheet-drag');
    const peek = document.getElementById('bottom-sheet-peek');

    if (!sheet || !drag) return;

    // Clic sur le peek ou le drag handle -> toggle peek/full
    peek.addEventListener('click', () => {
        if (currentState === 'peek') setBottomSheetState('full');
    });

    drag.addEventListener('click', () => {
        if (currentState === 'full') setBottomSheetState('peek');
        else if (currentState === 'peek') setBottomSheetState('full');
    });

    // Touch gestures
    drag.addEventListener('touchstart', onTouchStart, { passive: true });
    drag.addEventListener('touchmove', onTouchMove, { passive: true });
    drag.addEventListener('touchend', onTouchEnd);

    // Boutons dans le bottom sheet
    document.getElementById('bs-btn-report').addEventListener('click', () => {
        if (AppState.currentDistributor) {
            openReportModal(AppState.currentDistributor.id);
        }
    });

    document.getElementById('bs-get-directions').addEventListener('click', () => {
        if (AppState.currentDistributor) {
            const d = AppState.currentDistributor;
            window.open(`https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}`, '_blank');
        }
    });

    document.getElementById('bs-btn-chat').addEventListener('click', () => {
        if (AppState.currentDistributor) {
            openConversation(AppState.currentDistributor.id);
        }
    });

    // Favoris (peek et full)
    document.getElementById('peek-favorite').addEventListener('click', (e) => {
        e.stopPropagation();
        if (AppState.currentDistributor) {
            toggleSubscription(AppState.currentDistributor.id);
            updateFavoriteButtons();
        }
    });

    document.getElementById('bs-favorite').addEventListener('click', (e) => {
        e.stopPropagation();
        if (AppState.currentDistributor) {
            toggleSubscription(AppState.currentDistributor.id);
            updateFavoriteButtons();
        }
    });

    // Clic en dehors du bottom sheet -> fermer
    document.getElementById('main-map').addEventListener('click', (e) => {
        if (currentState !== 'hidden' && !e.target.closest('.leaflet-popup')) {
            closeBottomSheet();
        }
    });
}

// ============================================
// GESTION DES ETATS
// ============================================

export function setBottomSheetState(state) {
    const sheet = document.getElementById('bottom-sheet');
    if (!sheet) return;

    sheet.classList.remove('bs-peek', 'bs-full');

    if (state === 'peek') {
        sheet.classList.add('bs-peek');
    } else if (state === 'full') {
        sheet.classList.add('bs-full');
    }

    currentState = state;
}

export function closeBottomSheet() {
    setBottomSheetState('hidden');
    AppState.currentDistributor = null;
}

export function getBottomSheetState() {
    return currentState;
}

// ============================================
// AFFICHER UN DISTRIBUTEUR
// ============================================

export function showInBottomSheet(id) {
    const distributor = AppState.distributors.find(d => d.id === id);
    if (!distributor) return;

    AppState.currentDistributor = distributor;

    const typeConfig = AppState.typeConfig[distributor.type] || {};
    const distance = distributor.distance ? formatDistance(distributor.distance) : '';

    // Peek content
    document.getElementById('peek-emoji').textContent = distributor.emoji;
    document.getElementById('peek-name').textContent = distributor.name;
    document.getElementById('peek-meta').textContent =
        `${typeConfig.label || distributor.type}${distance ? ' — ' + distance : ''} — ★ ${distributor.rating}`;

    // Full content
    document.getElementById('bs-detail-type').innerHTML = `
        <span style="font-size: 1.5rem">${distributor.emoji}</span>
        <span>${escapeHTML(typeConfig.label || distributor.type)}</span>
    `;
    document.getElementById('bs-detail-name').textContent = distributor.name;
    document.getElementById('bs-detail-address').textContent = distributor.address;
    document.getElementById('bs-detail-rating').textContent = generateStars(distributor.rating);
    document.getElementById('bs-detail-reviews').textContent = `(${distributor.reviewCount} avis)`;
    document.getElementById('bs-detail-distance').textContent = distance || 'N/A';

    // Produits
    renderProductsList(distributor, 'bs-products-list');

    // Photos
    const photosSection = document.getElementById('bs-detail-photos');
    const photosGallery = document.getElementById('bs-detail-photos-gallery');
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

    // Favoris
    updateFavoriteButtons();

    // Ouvrir en peek
    setBottomSheetState('peek');
}

// ============================================
// FAVORIS (COEUR)
// ============================================

function updateFavoriteButtons() {
    if (!AppState.currentDistributor) return;
    const isFav = AppState.subscriptions.includes(AppState.currentDistributor.id);

    const peekBtn = document.getElementById('peek-favorite');
    const fullBtn = document.getElementById('bs-favorite');

    [peekBtn, fullBtn].forEach(btn => {
        if (btn) {
            btn.classList.toggle('favorited', isFav);
            btn.setAttribute('aria-label', isFav ? 'Retirer des favoris' : 'Ajouter aux favoris');
        }
    });
}

// ============================================
// TOUCH GESTURES
// ============================================

function onTouchStart(e) {
    touchStartY = e.touches[0].clientY;
    touchDeltaY = 0;
}

function onTouchMove(e) {
    touchDeltaY = e.touches[0].clientY - touchStartY;
}

function onTouchEnd() {
    const threshold = 50;

    if (currentState === 'peek' && touchDeltaY < -threshold) {
        // Swipe up -> full
        setBottomSheetState('full');
    } else if (currentState === 'peek' && touchDeltaY > threshold) {
        // Swipe down -> close
        closeBottomSheet();
    } else if (currentState === 'full' && touchDeltaY > threshold) {
        // Swipe down -> peek
        setBottomSheetState('peek');
    }

    touchStartY = 0;
    touchDeltaY = 0;
}
