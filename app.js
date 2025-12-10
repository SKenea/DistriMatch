/**
 * SnackMatch V3.0 - Application PWA
 * Côte Basque - Hasparren
 */

// ============================================
// ÉTAT GLOBAL DE L'APPLICATION
// ============================================
const AppState = {
    distributors: [],
    currentIndex: 0,
    selection: [],      // IDs des distributeurs sélectionnés
    favorites: [],      // IDs des favoris (subset de selection)
    userLocation: null,
    currentView: 'explorer',
    currentDistributor: null,
    typeConfig: {},
    reports: 0,
    points: 0,
    mapInitialized: false
};

// Variables globales pour la carte
let mainMap = null;
let distributorMarkers = [];
let userMarker = null;

// Clé localStorage
const STORAGE_KEY = 'snackmatch_user';

// ============================================
// UTILITAIRES
// ============================================

/**
 * Protection XSS - Échappe les caractères HTML
 */
function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Calcule la distance entre deux points GPS (Haversine)
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Formate la distance pour l'affichage
 */
function formatDistance(km) {
    if (km < 1) {
        return `${Math.round(km * 1000)}m`;
    }
    return `${km.toFixed(1)}km`;
}

/**
 * Génère les étoiles pour une note
 */
function generateStars(rating) {
    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 >= 0.5;
    let stars = '';
    for (let i = 0; i < fullStars; i++) stars += '★';
    if (halfStar) stars += '½';
    for (let i = stars.length; i < 5; i++) stars += '☆';
    return stars;
}

/**
 * Affiche un toast de notification
 */
function showToast(message, type = 'default') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============================================
// PERSISTANCE DES DONNÉES (localStorage)
// ============================================

/**
 * Sauvegarde les données utilisateur
 */
function saveToLocalStorage() {
    const data = {
        selection: AppState.selection,
        favorites: AppState.favorites,
        reports: AppState.reports,
        points: AppState.points,
        lastUpdated: new Date().toISOString()
    };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('Erreur sauvegarde localStorage:', e);
    }
}

/**
 * Charge les données utilisateur
 */
function loadFromLocalStorage() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
            const parsed = JSON.parse(data);
            AppState.selection = parsed.selection || [];
            AppState.favorites = parsed.favorites || [];
            AppState.reports = parsed.reports || 0;
            AppState.points = parsed.points || 0;
            updateBadges();
        }
    } catch (e) {
        console.error('Erreur chargement localStorage:', e);
        // En cas d'erreur, on réinitialise
        AppState.selection = [];
        AppState.favorites = [];
    }
}

/**
 * Efface toutes les données utilisateur
 */
function clearUserData() {
    if (confirm('Êtes-vous sûr de vouloir effacer toutes vos données ?')) {
        localStorage.removeItem(STORAGE_KEY);
        AppState.selection = [];
        AppState.favorites = [];
        AppState.reports = 0;
        AppState.points = 0;
        AppState.currentIndex = 0;
        updateBadges();
        updateProfileStats();
        displayCurrentCard();
        showToast('Données effacées', 'success');
    }
}

// ============================================
// CHARGEMENT DES DONNÉES
// ============================================

/**
 * Charge les distributeurs depuis le fichier JSON
 */
async function loadDistributors() {
    try {
        const response = await fetch('data/distributors.json');
        const data = await response.json();
        AppState.distributors = data.distributors;
        AppState.typeConfig = data.typeConfig;

        // Trier par distance si géoloc disponible
        if (AppState.userLocation) {
            sortByDistance();
        }

        // Filtrer ceux déjà vus (dans sélection)
        filterSeenDistributors();

        updateRemainingInfo();
        displayCurrentCard();

    } catch (error) {
        console.error('Erreur chargement distributeurs:', error);
        showToast('Erreur de chargement des données', 'error');
    }
}

/**
 * Trie les distributeurs par distance
 */
function sortByDistance() {
    if (!AppState.userLocation) return;

    AppState.distributors.forEach(d => {
        d.distance = calculateDistance(
            AppState.userLocation.lat,
            AppState.userLocation.lng,
            d.lat,
            d.lng
        );
    });

    AppState.distributors.sort((a, b) => a.distance - b.distance);
}

/**
 * Filtre les distributeurs déjà vus
 */
function filterSeenDistributors() {
    // Garde l'index à 0, mais skip ceux déjà dans selection
    while (
        AppState.currentIndex < AppState.distributors.length &&
        AppState.selection.includes(AppState.distributors[AppState.currentIndex].id)
    ) {
        AppState.currentIndex++;
    }
}

// ============================================
// GÉOLOCALISATION
// ============================================

/**
 * Obtient la position de l'utilisateur
 */
function getUserLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            // Position par défaut : Bayonne
            AppState.userLocation = { lat: 43.4929, lng: -1.4748 };
            resolve(AppState.userLocation);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                AppState.userLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                resolve(AppState.userLocation);
            },
            (error) => {
                // Position par défaut : Bayonne
                AppState.userLocation = { lat: 43.4929, lng: -1.4748 };
                resolve(AppState.userLocation);
            },
            { enableHighAccuracy: true, timeout: 5000 }
        );
    });
}

// ============================================
// AFFICHAGE DES CARTES
// ============================================

/**
 * Affiche la carte du distributeur courant
 */
function displayCurrentCard() {
    const container = document.getElementById('card-container');
    const distributor = AppState.distributors[AppState.currentIndex];

    if (!distributor) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🎉</div>
                <h3>Bravo !</h3>
                <p>Vous avez découvert tous les distributeurs de la zone.</p>
            </div>
        `;
        return;
    }

    const typeConfig = AppState.typeConfig[distributor.type] || {};
    const distance = distributor.distance ? formatDistance(distributor.distance) : '?';
    const statusClass = getStatusClass(distributor.status);
    const statusLabel = getStatusLabel(distributor.status);

    container.innerHTML = `
        <div class="distributor-card-clean" id="current-card" data-id="${distributor.id}">
            <div class="card-image-clean" style="background: ${typeConfig.gradient || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'}">
                <span class="card-type-label">${escapeHTML(typeConfig.label || distributor.type)}</span>
                <span class="card-emoji">${distributor.emoji}</span>
                <div class="card-status-badge ${statusClass}">
                    <span class="status-emoji">${getStatusEmoji(distributor.status)}</span>
                    <span class="status-label">${statusLabel}</span>
                </div>
            </div>
            <div class="card-content-clean">
                <h2 class="card-title-clean">${escapeHTML(distributor.name)}</h2>
                <p class="card-address-clean">📍 ${escapeHTML(distributor.address)}</p>

                <div class="card-rating-prominent">
                    <span class="rating-stars">${generateStars(distributor.rating)}</span>
                    <span class="rating-value">${distributor.rating}</span>
                    <span class="rating-count">(${distributor.reviewCount} avis)</span>
                </div>

                <div class="card-info-grid">
                    <div class="info-item">
                        <span class="info-label">Distance</span>
                        <span class="info-value">${distance}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Prix</span>
                        <span class="info-value">${distributor.priceRange}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Produits</span>
                        <span class="info-value">${distributor.products.filter(p => p.available).length}/${distributor.products.length}</span>
                    </div>
                </div>

                <div class="card-actions-primary">
                    <button class="action-btn-card skip" onclick="skipCard()">
                        <span class="btn-icon-large">✕</span>
                        <span class="btn-label">Passer</span>
                    </button>
                    <button class="action-btn-card info" onclick="showDetails('${distributor.id}')">
                        <span class="btn-icon-large">ℹ️</span>
                        <span class="btn-label">Détails</span>
                    </button>
                    <button class="action-btn-card like" onclick="selectCard()">
                        <span class="btn-icon-large">✓</span>
                        <span class="btn-label">Sélectionner</span>
                    </button>
                </div>
            </div>
        </div>
    `;

    // Initialiser les swipe handlers
    initSwipeHandlers();
    updateDistanceInfo(distance);
}

/**
 * Obtient la classe CSS pour le statut
 */
function getStatusClass(status) {
    switch (status) {
        case 'verified': return 'status-success';
        case 'warning': return 'status-warning';
        case 'reported': return 'status-danger';
        default: return 'status-neutral';
    }
}

/**
 * Obtient le libellé du statut
 */
function getStatusLabel(status) {
    switch (status) {
        case 'verified': return 'Vérifié';
        case 'warning': return 'À vérifier';
        case 'reported': return 'Signalé';
        default: return 'Non vérifié';
    }
}

/**
 * Obtient l'emoji du statut
 */
function getStatusEmoji(status) {
    switch (status) {
        case 'verified': return '✅';
        case 'warning': return '⚠️';
        case 'reported': return '❌';
        default: return '❓';
    }
}

// ============================================
// GESTION DES SWIPES
// ============================================

let startX = 0;
let currentX = 0;
let isDragging = false;
let swipeHandlers = null;

/**
 * Initialise les handlers de swipe
 */
function initSwipeHandlers() {
    const card = document.getElementById('current-card');
    if (!card) return;

    // Nettoyer les anciens handlers
    if (swipeHandlers) {
        document.removeEventListener('mousemove', swipeHandlers.mouseMove);
        document.removeEventListener('mouseup', swipeHandlers.mouseUp);
        document.removeEventListener('touchmove', swipeHandlers.touchMove);
        document.removeEventListener('touchend', swipeHandlers.touchEnd);
    }

    const handleStart = (x) => {
        startX = x;
        isDragging = true;
        card.style.transition = 'none';
    };

    const handleMove = (x) => {
        if (!isDragging) return;
        currentX = x - startX;
        card.style.transform = `translateX(${currentX}px) rotate(${currentX * 0.05}deg)`;

        // Afficher l'indicateur
        const indicator = document.getElementById('swipe-indicator');
        if (currentX > 50) {
            indicator.textContent = '✓';
            indicator.className = 'swipe-indicator show-like';
        } else if (currentX < -50) {
            indicator.textContent = '✕';
            indicator.className = 'swipe-indicator show-skip';
        } else {
            indicator.className = 'swipe-indicator';
        }
    };

    const handleEnd = () => {
        if (!isDragging) return;
        isDragging = false;
        card.style.transition = 'transform 0.3s ease';

        const indicator = document.getElementById('swipe-indicator');
        indicator.className = 'swipe-indicator';

        if (currentX > 100) {
            // Swipe droite = Sélectionner
            card.style.transform = 'translateX(500px) rotate(30deg)';
            setTimeout(() => selectCard(), 200);
        } else if (currentX < -100) {
            // Swipe gauche = Passer
            card.style.transform = 'translateX(-500px) rotate(-30deg)';
            setTimeout(() => skipCard(), 200);
        } else {
            // Retour à la position initiale
            card.style.transform = 'translateX(0) rotate(0)';
        }

        currentX = 0;
    };

    // Mouse events
    card.addEventListener('mousedown', (e) => handleStart(e.clientX));
    swipeHandlers = {
        mouseMove: (e) => handleMove(e.clientX),
        mouseUp: handleEnd,
        touchMove: (e) => handleMove(e.touches[0].clientX),
        touchEnd: handleEnd
    };
    document.addEventListener('mousemove', swipeHandlers.mouseMove);
    document.addEventListener('mouseup', swipeHandlers.mouseUp);

    // Touch events (passive pour perf)
    card.addEventListener('touchstart', (e) => handleStart(e.touches[0].clientX), { passive: true });
    document.addEventListener('touchmove', swipeHandlers.touchMove, { passive: true });
    document.addEventListener('touchend', swipeHandlers.touchEnd);
}

// ============================================
// ACTIONS SUR LES CARTES
// ============================================

/**
 * Passe au distributeur suivant (swipe gauche)
 */
function skipCard() {
    AppState.currentIndex++;
    filterSeenDistributors();
    updateRemainingInfo();
    displayCurrentCard();
}

/**
 * Ajoute le distributeur à la sélection (swipe droite)
 */
function selectCard() {
    const distributor = AppState.distributors[AppState.currentIndex];
    if (!distributor) return;

    // Éviter les doublons
    if (!AppState.selection.includes(distributor.id)) {
        AppState.selection.push(distributor.id);
        saveToLocalStorage();
        updateBadges();
        updateMapMarkers(); // Mettre à jour les couleurs sur la carte
        showToast(`✓ ${distributor.name} ajouté à votre sélection`, 'success');
    }

    AppState.currentIndex++;
    filterSeenDistributors();
    updateRemainingInfo();
    displayCurrentCard();
}

// ============================================
// MODAL DÉTAILS
// ============================================

/**
 * Affiche les détails d'un distributeur
 */
function showDetails(id) {
    const distributor = AppState.distributors.find(d => d.id === id) ||
        getDistributorById(id);
    if (!distributor) return;

    AppState.currentDistributor = distributor;

    const typeConfig = AppState.typeConfig[distributor.type] || {};
    const modal = document.getElementById('detail-modal');
    const distance = distributor.distance ? formatDistance(distributor.distance) : 'N/A';

    document.getElementById('detail-type').innerHTML = `
        <span style="font-size: 2rem">${distributor.emoji}</span>
        <span>${escapeHTML(typeConfig.label || distributor.type)}</span>
    `;
    document.getElementById('detail-name').textContent = distributor.name;
    document.getElementById('detail-address').textContent = distributor.address;
    document.getElementById('detail-rating').textContent = generateStars(distributor.rating);
    document.getElementById('detail-reviews').textContent = `(${distributor.reviewCount} avis)`;
    document.getElementById('detail-distance').textContent = distance;

    // Liste des produits
    const productsList = document.getElementById('products-list');
    productsList.innerHTML = distributor.products.map(p => `
        <div class="product-item-clean ${p.available ? 'available' : 'unavailable'}">
            <div class="product-info-clean">
                <div class="product-name-clean">${escapeHTML(p.name)}</div>
                <div class="product-status-clean">${p.available ? '✓ Disponible' : '✗ Indisponible'}</div>
            </div>
            <div class="product-price-clean">${p.price.toFixed(2)}€</div>
        </div>
    `).join('');

    // Bouton action
    const actionBtn = document.getElementById('modal-action-btn');
    const isSelected = AppState.selection.includes(distributor.id);
    const isFavorite = AppState.favorites.includes(distributor.id);

    if (isFavorite) {
        actionBtn.innerHTML = '❤️ Favori';
        actionBtn.className = 'btn-primary-clean favorite-active';
    } else if (isSelected) {
        actionBtn.innerHTML = '✓ Sélectionné';
        actionBtn.className = 'btn-primary-clean selected-active';
    } else {
        actionBtn.innerHTML = '✓ Sélectionner';
        actionBtn.className = 'btn-primary-clean';
    }

    modal.classList.add('active');
}

/**
 * Ferme le modal de détails
 */
function closeDetailModal() {
    document.getElementById('detail-modal').classList.remove('active');
    AppState.currentDistributor = null;
}

/**
 * Obtient l'itinéraire vers un distributeur
 */
function getDirections() {
    if (!AppState.currentDistributor) return;

    const { lat, lng } = AppState.currentDistributor;

    // Validation des coordonnées
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude)) {
        showToast('Coordonnées invalides', 'error');
        return;
    }

    const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
    window.open(url, '_blank');
}

/**
 * Action du bouton modal (sélectionner/désélectionner)
 */
function toggleSelectionFromModal() {
    if (!AppState.currentDistributor) return;

    const id = AppState.currentDistributor.id;
    const index = AppState.selection.indexOf(id);

    if (index === -1) {
        AppState.selection.push(id);
        showToast(`✓ ${AppState.currentDistributor.name} ajouté`, 'success');
    } else {
        AppState.selection.splice(index, 1);
        // Retirer aussi des favoris si présent
        const favIndex = AppState.favorites.indexOf(id);
        if (favIndex !== -1) {
            AppState.favorites.splice(favIndex, 1);
        }
        showToast(`${AppState.currentDistributor.name} retiré`, 'default');
    }

    saveToLocalStorage();
    updateBadges();
    showDetails(id); // Refresh modal
}

// ============================================
// GESTION DE LA SÉLECTION
// ============================================

/**
 * Affiche la liste de la sélection
 */
function displaySelection() {
    const list = document.getElementById('selection-list');
    const empty = document.getElementById('selection-empty');
    const count = document.getElementById('selection-count');

    if (AppState.selection.length === 0) {
        list.style.display = 'none';
        empty.style.display = 'flex';
        count.textContent = '0 distributeur';
        return;
    }

    list.style.display = 'block';
    empty.style.display = 'none';
    count.textContent = `${AppState.selection.length} distributeur(s)`;

    list.innerHTML = AppState.selection.map(id => {
        const d = getDistributorById(id);
        if (!d) return '';

        const isFavorite = AppState.favorites.includes(id);
        const distance = d.distance ? formatDistance(d.distance) : '';
        const typeConfig = AppState.typeConfig[d.type] || {};

        return `
            <div class="selection-card" data-id="${d.id}">
                <div class="selection-image" style="background: ${typeConfig.gradient || '#667eea'}">
                    <span class="selection-emoji">${d.emoji}</span>
                    <button class="btn-favorite ${isFavorite ? 'active' : ''}" onclick="toggleFavorite('${d.id}', event)">
                        <span class="fav-icon-btn">${isFavorite ? '❤️' : '🤍'}</span>
                    </button>
                </div>
                <div class="selection-content" onclick="showDetails('${d.id}')">
                    <h3 class="selection-title">${escapeHTML(d.name)}</h3>
                    <p class="selection-address">${escapeHTML(d.address)}</p>
                    <div class="selection-meta">
                        <span class="selection-distance">${distance}</span>
                        <span class="selection-rating">${generateStars(d.rating)} ${d.rating}</span>
                    </div>
                </div>
                <button class="btn-remove-selection" onclick="removeFromSelection('${d.id}', event)">
                    <span>✕</span>
                </button>
            </div>
        `;
    }).join('');

    // Initialiser le swipe gauche pour supprimer
    initSelectionSwipe();
}

/**
 * Retire un distributeur de la sélection
 */
function removeFromSelection(id, event) {
    if (event) event.stopPropagation();

    const index = AppState.selection.indexOf(id);
    if (index !== -1) {
        AppState.selection.splice(index, 1);

        // Retirer aussi des favoris
        const favIndex = AppState.favorites.indexOf(id);
        if (favIndex !== -1) {
            AppState.favorites.splice(favIndex, 1);
        }

        saveToLocalStorage();
        updateBadges();
        displaySelection();
        showToast('Distributeur retiré', 'default');
    }
}

/**
 * Initialise le swipe gauche pour supprimer de la sélection
 */
function initSelectionSwipe() {
    const cards = document.querySelectorAll('.selection-card');

    cards.forEach(card => {
        let startX = 0;
        let currentX = 0;

        card.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
        }, { passive: true });

        card.addEventListener('touchmove', (e) => {
            currentX = e.touches[0].clientX - startX;
            if (currentX < 0) {
                card.style.transform = `translateX(${currentX}px)`;
                card.style.opacity = 1 + currentX / 200;
            }
        }, { passive: true });

        card.addEventListener('touchend', () => {
            if (currentX < -100) {
                const id = card.dataset.id;
                card.style.transform = 'translateX(-100%)';
                card.style.opacity = 0;
                setTimeout(() => removeFromSelection(id), 300);
            } else {
                card.style.transform = 'translateX(0)';
                card.style.opacity = 1;
            }
            currentX = 0;
        });
    });
}

// ============================================
// GESTION DES FAVORIS
// ============================================

/**
 * Toggle favori pour un distributeur
 */
function toggleFavorite(id, event) {
    if (event) event.stopPropagation();

    const index = AppState.favorites.indexOf(id);
    const distributor = getDistributorById(id);

    if (index === -1) {
        // Doit être dans la sélection d'abord
        if (!AppState.selection.includes(id)) {
            showToast('Ajoutez d\'abord à votre sélection', 'warning');
            return;
        }
        AppState.favorites.push(id);
        showToast(`❤️ ${distributor?.name || 'Distributeur'} ajouté aux favoris`, 'success');

        // Animation heartbeat
        if (event) {
            const btn = event.currentTarget;
            btn.classList.add('heartbeat');
            setTimeout(() => btn.classList.remove('heartbeat'), 600);
        }
    } else {
        AppState.favorites.splice(index, 1);
        showToast(`${distributor?.name || 'Distributeur'} retiré des favoris`, 'default');
    }

    saveToLocalStorage();
    updateBadges();
    updateMapMarkers(); // Mettre à jour les couleurs des marqueurs

    // Refresh la vue courante
    if (AppState.currentView === 'selection') {
        displaySelection();
    } else if (AppState.currentView === 'favorites') {
        displayFavorites();
    }
}

/**
 * Affiche la liste des favoris
 */
function displayFavorites() {
    const list = document.getElementById('favorites-list');
    const empty = document.getElementById('favorites-empty');
    const count = document.getElementById('favorites-count');

    if (AppState.favorites.length === 0) {
        list.style.display = 'none';
        empty.style.display = 'flex';
        count.textContent = '0 favori';
        return;
    }

    list.style.display = 'block';
    empty.style.display = 'none';
    count.textContent = `${AppState.favorites.length} favori(s)`;

    list.innerHTML = AppState.favorites.map(id => {
        const d = getDistributorById(id);
        if (!d) return '';

        const distance = d.distance ? formatDistance(d.distance) : '';
        const typeConfig = AppState.typeConfig[d.type] || {};

        return `
            <div class="favorite-card" onclick="showDetails('${d.id}')">
                <div class="favorite-image" style="background: ${typeConfig.gradient || '#667eea'}">
                    <span class="favorite-emoji">${d.emoji}</span>
                </div>
                <div class="favorite-content">
                    <h3 class="favorite-title">${escapeHTML(d.name)}</h3>
                    <p class="favorite-address">${escapeHTML(d.address)}</p>
                    <div class="favorite-meta">
                        <span class="favorite-distance">${distance}</span>
                        <span class="favorite-rating">${generateStars(d.rating)} ${d.rating}</span>
                    </div>
                </div>
                <button class="btn-unfavorite" onclick="toggleFavorite('${d.id}', event)">
                    <span>❤️</span>
                </button>
            </div>
        `;
    }).join('');
}

/**
 * Obtient un distributeur par ID
 */
function getDistributorById(id) {
    return AppState.distributors.find(d => d.id === id);
}

// ============================================
// NAVIGATION
// ============================================

/**
 * Change de vue
 */
function switchView(viewName) {
    // Masquer toutes les vues
    document.querySelectorAll('.view-page').forEach(v => {
        v.classList.remove('view-active');
        v.classList.add('view-hidden');
    });

    // Afficher la vue demandée
    const view = document.getElementById(`${viewName}-view`);
    if (view) {
        view.classList.remove('view-hidden');
        view.classList.add('view-active');
    }

    // Mettre à jour la navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.view === viewName);
    });

    AppState.currentView = viewName;

    // Mettre à jour les boutons de navigation du haut
    document.querySelectorAll('.nav-icon-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Actions spécifiques par vue
    switch (viewName) {
        case 'selection':
            displaySelection();
            break;
        case 'favorites':
            displayFavorites();
            break;
        case 'profile':
            updateProfileStats();
            break;
        case 'map':
            // Initialiser la carte au premier affichage (lazy loading)
            setTimeout(() => {
                initMainMap();
                if (mainMap) mainMap.invalidateSize();
            }, 100);
            break;
        case 'explorer':
            // Rien de spécial
            break;
    }
}

/**
 * Met à jour les badges de navigation
 */
function updateBadges() {
    const selectionBadgeBottom = document.getElementById('selection-badge-bottom');
    const favoritesBadge = document.getElementById('favorites-badge');

    // Badge sélection (dans le footer/bottom-nav)
    if (selectionBadgeBottom) {
        if (AppState.selection.length > 0) {
            selectionBadgeBottom.textContent = AppState.selection.length;
            selectionBadgeBottom.style.display = 'flex';
        } else {
            selectionBadgeBottom.style.display = 'none';
        }
    }

    // Badge favoris (dans le top-nav)
    if (favoritesBadge) {
        if (AppState.favorites.length > 0) {
            favoritesBadge.textContent = AppState.favorites.length;
            favoritesBadge.style.display = 'flex';
        } else {
            favoritesBadge.style.display = 'none';
        }
    }
}

/**
 * Met à jour l'info de distance
 */
function updateDistanceInfo(distance) {
    document.getElementById('distance-info').textContent = `📍 ${distance}`;
}

/**
 * Met à jour le compteur restant
 */
function updateRemainingInfo() {
    const remaining = AppState.distributors.length - AppState.currentIndex;
    document.getElementById('remaining-info').textContent = `${remaining} à découvrir`;
}

/**
 * Met à jour les stats du profil
 */
function updateProfileStats() {
    document.getElementById('stat-selections').textContent = AppState.selection.length;
    document.getElementById('stat-favorites').textContent = AppState.favorites.length;
    document.getElementById('stat-reports').textContent = AppState.reports;
    document.getElementById('profile-points').textContent = AppState.points;
}

// ============================================
// RECHERCHE
// ============================================

/**
 * Ouvre l'overlay de recherche
 */
function openSearch() {
    document.getElementById('search-overlay').classList.add('active');
    document.getElementById('quick-search').focus();
}

/**
 * Ferme l'overlay de recherche
 */
function closeSearch() {
    document.getElementById('search-overlay').classList.remove('active');
    document.getElementById('quick-search').value = '';
    document.getElementById('search-results').innerHTML = '';
}

/**
 * Effectue une recherche
 */
function performSearch(query) {
    const results = document.getElementById('search-results');

    if (query.length < 2) {
        results.innerHTML = '';
        return;
    }

    const q = query.toLowerCase();

    // Rechercher dans les distributeurs et les produits
    const matches = AppState.distributors.filter(d => {
        const nameMatch = d.name.toLowerCase().includes(q);
        const addressMatch = d.address.toLowerCase().includes(q);
        const productMatch = d.products.some(p => p.name.toLowerCase().includes(q));
        return nameMatch || addressMatch || productMatch;
    });

    if (matches.length === 0) {
        results.innerHTML = `
            <div class="empty-state">
                <p>Aucun résultat pour "${escapeHTML(query)}"</p>
            </div>
        `;
        return;
    }

    results.innerHTML = matches.map(d => {
        const distance = d.distance ? formatDistance(d.distance) : '';
        return `
            <div class="search-item-clean" onclick="showDetails('${d.id}'); closeSearch();">
                <div class="search-item-name">
                    <span>${d.emoji} ${escapeHTML(d.name)}</span>
                    <span class="search-item-price">${distance}</span>
                </div>
                <div class="search-item-location">${escapeHTML(d.address)}</div>
            </div>
        `;
    }).join('');
}

// ============================================
// SIGNALEMENT
// ============================================

let selectedReportType = null;

/**
 * Ouvre le modal de signalement
 */
function openReportModal(id) {
    const distributor = getDistributorById(id);
    if (!distributor) return;

    AppState.currentDistributor = distributor;

    document.getElementById('report-name').textContent = distributor.name;
    document.getElementById('report-address').textContent = distributor.address;

    // Remplir le select des produits
    const select = document.getElementById('report-product');
    select.innerHTML = distributor.products.map(p =>
        `<option value="${escapeHTML(p.name)}">${escapeHTML(p.name)}</option>`
    ).join('');

    document.getElementById('report-modal').classList.add('active');
}

/**
 * Sélectionne un type de signalement
 */
function selectReportType(type) {
    selectedReportType = type;

    // Highlight le bouton
    document.querySelectorAll('.report-type-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.type === type);
    });

    // Afficher le select produit si nécessaire
    const productSelect = document.getElementById('report-product-select');
    productSelect.style.display = ['out_of_stock', 'price_change'].includes(type) ? 'block' : 'none';

    // Activer le bouton submit
    document.getElementById('submit-report').disabled = false;
}

/**
 * Soumet le signalement
 */
function submitReport() {
    if (!selectedReportType || !AppState.currentDistributor) return;

    // Incrémenter les compteurs
    AppState.reports++;
    AppState.points += 10;
    saveToLocalStorage();
    updateProfileStats();

    showToast('Merci pour votre signalement ! +10 points', 'success');

    // Fermer le modal
    document.getElementById('report-modal').classList.remove('active');
    selectedReportType = null;
}

// ============================================
// CARTE LEAFLET
// ============================================

/**
 * Initialise la carte principale
 */
function initMainMap() {
    if (mainMap) return; // Éviter la double initialisation

    const defaultCenter = AppState.userLocation || { lat: 43.4929, lng: -1.4748 };

    mainMap = L.map('main-map', {
        zoomControl: false // On va positionner les contrôles différemment
    }).setView([defaultCenter.lat, defaultCenter.lng], 12);

    // Marquer comme initialisé pour updateMapMarkers
    AppState.mapInitialized = true;

    // Tuiles OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19
    }).addTo(mainMap);

    // Ajouter contrôle zoom en bas à gauche
    L.control.zoom({ position: 'bottomleft' }).addTo(mainMap);

    // Marqueur position utilisateur
    if (AppState.userLocation) {
        const userIcon = L.divIcon({
            className: 'user-marker-container',
            html: '<div class="user-marker"></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        userMarker = L.marker([AppState.userLocation.lat, AppState.userLocation.lng], {
            icon: userIcon,
            zIndexOffset: 1000
        }).addTo(mainMap);

        userMarker.bindPopup('<strong>📍 Vous êtes ici</strong>');
    }

    // Ajouter les marqueurs des distributeurs
    updateMapMarkers();

    console.log('Carte initialisée');
}

/**
 * Met à jour les marqueurs sur la carte
 */
function updateMapMarkers() {
    if (!mainMap || !AppState.mapInitialized) return;

    // Supprimer les anciens marqueurs
    distributorMarkers.forEach(m => mainMap.removeLayer(m));
    distributorMarkers = [];

    AppState.distributors.forEach(d => {
        const isSelected = AppState.selection.includes(d.id);
        const isFavorite = AppState.favorites.includes(d.id);

        const marker = L.marker([d.lat, d.lng], {
            icon: createDistributorIcon(d, isSelected, isFavorite)
        }).addTo(mainMap);

        marker.bindPopup(createPopupContent(d));

        // Au clic sur le marqueur, highlight et centrer
        marker.on('click', () => {
            mainMap.setView([d.lat, d.lng], 15);
        });

        distributorMarkers.push(marker);
    });

    // Ajuster la vue pour montrer tous les marqueurs
    if (distributorMarkers.length > 0) {
        const group = new L.featureGroup(distributorMarkers);
        mainMap.fitBounds(group.getBounds().pad(0.1));
    }
}

/**
 * Crée l'icône personnalisée pour un distributeur
 */
function createDistributorIcon(d, isSelected, isFavorite) {
    let color = '#6366f1'; // Couleur par défaut (primary)

    if (isFavorite) {
        color = '#ef4444'; // Rouge pour les favoris
    } else if (isSelected) {
        color = '#10b981'; // Vert pour les sélectionnés
    }

    return L.divIcon({
        className: 'distributor-marker-container',
        html: `<div class="distributor-marker-icon" style="background:${color};width:36px;height:36px;">${d.emoji}</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -20]
    });
}

/**
 * Crée le contenu du popup pour un distributeur
 */
function createPopupContent(d) {
    const distance = d.distance ? formatDistance(d.distance) : '';
    const isSelected = AppState.selection.includes(d.id);
    const isFavorite = AppState.favorites.includes(d.id);

    let statusBadge = '';
    if (isFavorite) {
        statusBadge = '<span style="color:#ef4444;font-weight:600;">❤️ Favori</span>';
    } else if (isSelected) {
        statusBadge = '<span style="color:#10b981;font-weight:600;">✓ Sélectionné</span>';
    }

    return `
        <div class="map-popup">
            <strong>${d.emoji} ${escapeHTML(d.name)}</strong>
            <p>${escapeHTML(d.address)}</p>
            <p>⭐ ${d.rating} ${distance ? '• ' + distance : ''}</p>
            ${statusBadge ? '<p>' + statusBadge + '</p>' : ''}
            <button onclick="showDetails('${d.id}')" class="btn-popup-view">Voir détails</button>
        </div>
    `;
}

/**
 * Centre la carte sur la position de l'utilisateur
 */
function centerMapOnUser() {
    if (mainMap && AppState.userLocation) {
        mainMap.setView([AppState.userLocation.lat, AppState.userLocation.lng], 14);
        showToast('📍 Centré sur votre position', 'success');
    } else {
        showToast('Position non disponible', 'warning');
    }
}

/**
 * Centre la carte sur un distributeur spécifique
 */
function centerMapOnDistributor(id) {
    const d = getDistributorById(id);
    if (mainMap && d) {
        mainMap.setView([d.lat, d.lng], 16);

        // Ouvrir le popup du marqueur correspondant
        distributorMarkers.forEach(marker => {
            const latLng = marker.getLatLng();
            if (latLng.lat === d.lat && latLng.lng === d.lng) {
                marker.openPopup();
            }
        });
    }
}

// ============================================
// INITIALISATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('SnackMatch V3.0 - Initialisation...');

    // Charger les données utilisateur
    loadFromLocalStorage();

    // Obtenir la géolocalisation
    await getUserLocation();

    // Charger les distributeurs
    await loadDistributors();

    // Event listeners navigation (ancienne bottom-nav, au cas où)
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            switchView(item.dataset.view);
        });
    });

    // Event listeners navigation du haut (nouveaux boutons)
    document.querySelectorAll('.nav-icon-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchView(btn.dataset.view);
        });
    });

    // Event listener logo (retour à explorer)
    const logo = document.querySelector('.logo[data-view]');
    if (logo) {
        logo.addEventListener('click', () => {
            switchView(logo.dataset.view);
        });
    }

    // Event listener bouton centrer carte
    document.getElementById('center-map').addEventListener('click', centerMapOnUser);

    // Event listeners recherche
    document.getElementById('search-toggle').addEventListener('click', openSearch);
    document.getElementById('close-search').addEventListener('click', closeSearch);
    document.getElementById('quick-search').addEventListener('input', (e) => {
        performSearch(e.target.value);
    });

    // Event listeners modals
    document.getElementById('close-detail').addEventListener('click', closeDetailModal);
    document.getElementById('get-directions').addEventListener('click', getDirections);
    document.getElementById('modal-action-btn').addEventListener('click', toggleSelectionFromModal);

    document.getElementById('close-report').addEventListener('click', () => {
        document.getElementById('report-modal').classList.remove('active');
    });

    document.querySelectorAll('.report-type-btn').forEach(btn => {
        btn.addEventListener('click', () => selectReportType(btn.dataset.type));
    });

    document.getElementById('submit-report').addEventListener('click', submitReport);

    // Event listener profil
    document.getElementById('clear-data-btn').addEventListener('click', clearUserData);

    // Fermer modals avec Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeDetailModal();
            closeSearch();
            document.getElementById('report-modal').classList.remove('active');
        }
    });

    console.log('SnackMatch V3.0 - Prêt !');
});
