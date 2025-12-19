/**
 * SnackMatch V5.0 - Waze Edition
 * Bottom Navigation + Activity Feed + 6 Report Types
 * Sidebar + Carte + Modal Chat par distributeur
 * Filter chips style Google Maps
 */

// ============================================
// ETAT GLOBAL DE L'APPLICATION
// ============================================
const AppState = {
    distributors: [],
    favorites: [],
    userLocation: null,
    currentDistributor: null,
    typeConfig: {},
    reports: 0,
    points: 0,
    mapInitialized: false,
    sidebarOpen: false,
    activeFilters: []  // Filtres actifs: tableau vide = tous, sinon liste des types
};

// Systeme de conversations
const Conversations = {
    active: null,           // ID du distributeur en cours
    history: {},            // { distributorId: [messages] }
    list: []                // IDs des conversations ouvertes (ordre recent)
};

// Feed d'activite communautaire
const ActivityFeed = {
    items: [],              // Liste des activites
    filter: 'all'           // Filtre actif: all, reports, favorites
};

// Profil implicite de l'utilisateur
const UserProfile = {
    preferences: {
        types: {},
        maxDistance: null,
        priceRange: null,
        timeSlots: {}
    },
    stats: {
        totalViews: 0,
        totalFavorites: 0,
        detailsViewed: 0,
        searchQueries: [],
        conversationsStarted: 0
    },
    history: {
        lastTypes: [],
        lastVisit: null,
        visitedIds: []
    },
    confidence: 0
};

// Variables globales pour la carte
let mainMap = null;
let distributorMarkers = [];  // Map<distributorId, marker>
let userMarker = null;
let selectedReportType = null;

// Etat pour mode ajout distributeur
const AddMode = {
    active: false,
    marker: null,
    lat: null,
    lng: null
};

// Types de distributeurs disponibles
const DISTRIBUTOR_TYPES = [
    { id: 'pizza', emoji: '🍕', name: 'Pizza' },
    { id: 'bakery', emoji: '🥖', name: 'Boulangerie' },
    { id: 'fries', emoji: '🍟', name: 'Frites' },
    { id: 'meals', emoji: '🍽️', name: 'Plats cuisines' },
    { id: 'cheese', emoji: '🧀', name: 'Fromage' },
    { id: 'dairy', emoji: '🥛', name: 'Produits laitiers' },
    { id: 'meat', emoji: '🥩', name: 'Viande' },
    { id: 'terroir', emoji: '🍯', name: 'Terroir' },
    { id: 'general', emoji: '🏪', name: 'Mixte' }
];

// Cles localStorage
const STORAGE_KEY = 'snackmatch_user';
const PROFILE_KEY = 'snackmatch_profile';
const CONVERSATIONS_KEY = 'snackmatch_conversations';
const ACTIVITY_KEY = 'snackmatch_activity';
const VOTES_KEY = 'snackmatch_votes';
const USER_DISTRIBUTORS_KEY = 'snackmatch_user_distributors';

// ============================================
// UTILITAIRES
// ============================================

function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function formatDistance(km) {
    if (km < 1) return `${Math.round(km * 1000)}m`;
    return `${km.toFixed(1)}km`;
}

function generateStars(rating) {
    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 >= 0.5;
    let stars = '';
    for (let i = 0; i < fullStars; i++) stars += '★';
    if (halfStar) stars += '½';
    for (let i = stars.length; i < 5; i++) stars += '☆';
    return stars;
}

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

function getTimeSlot() {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 14) return 'lunch';
    if (hour >= 14 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 22) return 'evening';
    return 'night';
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'maintenant';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}min`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

// Helper pour obtenir les distributeurs filtres
function getFilteredDistributors() {
    if (AppState.activeFilters.length === 0) {
        return AppState.distributors;
    }
    return AppState.distributors.filter(d => AppState.activeFilters.includes(d.type));
}

// ============================================
// PERSISTANCE DES DONNEES
// ============================================

function saveToLocalStorage() {
    const data = {
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

function loadFromLocalStorage() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
            const parsed = JSON.parse(data);
            AppState.favorites = parsed.favorites || [];
            AppState.reports = parsed.reports || 0;
            AppState.points = parsed.points || 0;
            updateBadges();
        }
    } catch (e) {
        console.error('Erreur chargement localStorage:', e);
        AppState.favorites = [];
    }
}

function saveProfile() {
    try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(UserProfile));
    } catch (e) {
        console.error('Erreur sauvegarde profil:', e);
    }
}

function loadProfile() {
    try {
        const data = localStorage.getItem(PROFILE_KEY);
        if (data) {
            const parsed = JSON.parse(data);
            Object.assign(UserProfile, parsed);
        }
    } catch (e) {
        console.error('Erreur chargement profil:', e);
    }
}

function saveConversations() {
    try {
        const data = {
            list: Conversations.list,
            history: Conversations.history
        };
        localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('Erreur sauvegarde conversations:', e);
    }
}

function loadConversations() {
    try {
        const data = localStorage.getItem(CONVERSATIONS_KEY);
        if (data) {
            const parsed = JSON.parse(data);
            Conversations.list = parsed.list || [];
            Conversations.history = parsed.history || {};
        }
    } catch (e) {
        console.error('Erreur chargement conversations:', e);
    }
}

function clearUserData() {
    if (confirm('Effacer toutes tes donnees ?')) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(PROFILE_KEY);
        localStorage.removeItem(CONVERSATIONS_KEY);
        AppState.favorites = [];
        AppState.reports = 0;
        AppState.points = 0;
        Conversations.list = [];
        Conversations.history = {};
        Conversations.active = null;
        Object.assign(UserProfile, {
            preferences: { types: {}, maxDistance: null, priceRange: null, timeSlots: {} },
            stats: { totalViews: 0, totalFavorites: 0, detailsViewed: 0, searchQueries: [], conversationsStarted: 0 },
            history: { lastTypes: [], lastVisit: null, visitedIds: [] },
            confidence: 0
        });
        updateBadges();
        updateProfileStats();
        updateMapMarkers();
        updateConversationsList();
        closeChatModal();
        showToast('Donnees effacees', 'success');
    }
}

// ============================================
// PROFIL IMPLICITE
// ============================================

function updateImplicitProfile(action, data) {
    switch (action) {
        case 'view_details':
            UserProfile.stats.detailsViewed++;
            if (data.type) {
                UserProfile.preferences.types[data.type] = (UserProfile.preferences.types[data.type] || 0) + 1;
                UserProfile.history.lastTypes.unshift(data.type);
                if (UserProfile.history.lastTypes.length > 10) UserProfile.history.lastTypes.pop();
            }
            if (data.id && !UserProfile.history.visitedIds.includes(data.id)) {
                UserProfile.history.visitedIds.push(data.id);
            }
            break;

        case 'add_favorite':
            UserProfile.stats.totalFavorites++;
            if (data.type) {
                UserProfile.preferences.types[data.type] = (UserProfile.preferences.types[data.type] || 0) + 3;
            }
            break;

        case 'start_conversation':
            UserProfile.stats.conversationsStarted++;
            if (data.type) {
                UserProfile.preferences.types[data.type] = (UserProfile.preferences.types[data.type] || 0) + 2;
            }
            break;

        case 'search':
            UserProfile.stats.searchQueries.push(data.query);
            if (UserProfile.stats.searchQueries.length > 20) UserProfile.stats.searchQueries.shift();
            break;

        case 'time_activity':
            const slot = getTimeSlot();
            UserProfile.preferences.timeSlots[slot] = (UserProfile.preferences.timeSlots[slot] || 0) + 1;
            break;
    }

    const actions = UserProfile.stats.detailsViewed +
                   UserProfile.stats.totalFavorites * 2 +
                   UserProfile.stats.conversationsStarted;
    UserProfile.confidence = Math.min(100, Math.round(actions * 5));

    UserProfile.history.lastVisit = new Date().toISOString();
    saveProfile();
}

function getTopPreferredTypes(limit = 3) {
    const types = UserProfile.preferences.types;
    return Object.entries(types)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([type]) => type);
}

// ============================================
// CHARGEMENT DES DONNEES
// ============================================

// Donnees embarquees pour fonctionner sans serveur (mode file://)
const EMBEDDED_DATA = {
    distributors: [
        { id: "dist-001", name: "Pizza Express Biarritz", type: "pizza", emoji: "🍕", address: "12 Avenue de la Grande Plage, 64200 Biarritz", city: "Biarritz", lat: 43.4832, lng: -1.5586, rating: 4.5, reviewCount: 127, status: "verified", priceRange: "€€", products: [{ name: "Pizza Margherita", price: 8.50, available: true }, { name: "Pizza 4 Fromages", price: 10.00, available: true }, { name: "Pizza Basque", price: 11.00, available: true }, { name: "Pizza Vegetarienne", price: 9.50, available: false }] },
        { id: "dist-002", name: "Le Taloa du Fronton", type: "bakery", emoji: "🥖", address: "Place du Fronton, 64250 Espelette", city: "Espelette", lat: 43.3411, lng: -1.4486, rating: 4.8, reviewCount: 89, status: "verified", priceRange: "€", products: [{ name: "Taloa nature", price: 2.50, available: true }, { name: "Taloa jambon-fromage", price: 4.50, available: true }, { name: "Gateau Basque", price: 3.50, available: true }] },
        { id: "dist-003", name: "Frites Fraiches Anglet", type: "fries", emoji: "🍟", address: "Centre Commercial BAB2, 64600 Anglet", city: "Anglet", lat: 43.4784, lng: -1.5147, rating: 4.2, reviewCount: 56, status: "verified", priceRange: "€", products: [{ name: "Cornet de frites", price: 3.50, available: true }, { name: "Grande barquette", price: 5.00, available: true }] },
        { id: "dist-004", name: "Fromages de Brebis Urrugne", type: "cheese", emoji: "🧀", address: "Route de Saint-Jean-de-Luz, 64122 Urrugne", city: "Urrugne", lat: 43.3628, lng: -1.6997, rating: 4.9, reviewCount: 203, status: "verified", priceRange: "€€€", products: [{ name: "Ossau-Iraty AOP", price: 8.00, available: true }, { name: "Tome de brebis", price: 12.00, available: true }] },
        { id: "dist-005", name: "Plats Cuisines Bayonne", type: "meals", emoji: "🍽️", address: "15 Rue Port-Neuf, 64100 Bayonne", city: "Bayonne", lat: 43.4929, lng: -1.4748, rating: 4.3, reviewCount: 78, status: "verified", priceRange: "€€", products: [{ name: "Axoa de veau", price: 9.50, available: true }, { name: "Poulet basquaise", price: 8.50, available: true }] },
        { id: "dist-006", name: "Lait Frais Hasparren", type: "dairy", emoji: "🥛", address: "Chemin de la Ferme, 64240 Hasparren", city: "Hasparren", lat: 43.3842, lng: -1.3056, rating: 4.6, reviewCount: 42, status: "verified", priceRange: "€", products: [{ name: "Lait frais entier", price: 1.80, available: true }, { name: "Yaourt nature (x4)", price: 3.20, available: true }] },
        { id: "dist-007", name: "Legumes Bio Cambo", type: "agricultural", emoji: "🥕", address: "Route des Thermes, 64250 Cambo-les-Bains", city: "Cambo-les-Bains", lat: 43.3592, lng: -1.4003, rating: 4.7, reviewCount: 91, status: "verified", priceRange: "€€", products: [{ name: "Panier legumes saison", price: 12.00, available: true }, { name: "Pommes de terre", price: 4.50, available: true }] },
        { id: "dist-008", name: "Charcuterie Aldudes", type: "meat", emoji: "🥩", address: "Place de l'Eglise, 64430 Les Aldudes", city: "Les Aldudes", lat: 43.0972, lng: -1.4306, rating: 4.8, reviewCount: 156, status: "verified", priceRange: "€€€", products: [{ name: "Jambon de Bayonne", price: 9.00, available: true }, { name: "Saucisson sec", price: 7.50, available: true }] },
        { id: "dist-009", name: "Miel & Terroir Ainhoa", type: "terroir", emoji: "🍯", address: "Rue Principale, 64250 Ainhoa", city: "Ainhoa", lat: 43.3047, lng: -1.4722, rating: 4.9, reviewCount: 67, status: "verified", priceRange: "€€", products: [{ name: "Miel de montagne", price: 12.00, available: true }, { name: "Piment d'Espelette AOP", price: 8.00, available: true }] },
        { id: "dist-010", name: "Distributeur Mixte St-Jean", type: "general", emoji: "🏪", address: "Boulevard Thiers, 64500 Saint-Jean-de-Luz", city: "Saint-Jean-de-Luz", lat: 43.3883, lng: -1.6603, rating: 4.1, reviewCount: 234, status: "verified", priceRange: "€€", products: [{ name: "Sandwich jambon-beurre", price: 4.50, available: true }, { name: "Salade composee", price: 6.00, available: true }] },
        { id: "dist-011", name: "Pizza Guethary Plage", type: "pizza", emoji: "🍕", address: "Avenue du General de Gaulle, 64210 Guethary", city: "Guethary", lat: 43.4242, lng: -1.6097, rating: 4.4, reviewCount: 98, status: "verified", priceRange: "€€", products: [{ name: "Pizza Royale", price: 11.00, available: true }, { name: "Pizza Surfeur", price: 12.00, available: true }] },
        { id: "dist-012", name: "Boulangerie Auto Bidart", type: "bakery", emoji: "🥖", address: "Avenue de la Plage, 64210 Bidart", city: "Bidart", lat: 43.4375, lng: -1.5917, rating: 4.6, reviewCount: 145, status: "warning", priceRange: "€", products: [{ name: "Baguette tradition", price: 1.40, available: true }, { name: "Croissant pur beurre", price: 1.30, available: true }] },
        { id: "dist-015", name: "Poissonnerie Express Socoa", type: "meat", emoji: "🐟", address: "Port de Socoa, 64122 Ciboure", city: "Ciboure", lat: 43.3897, lng: -1.6803, rating: 4.8, reviewCount: 112, status: "verified", priceRange: "€€€", products: [{ name: "Thon rouge", price: 14.00, available: true }, { name: "Chipirons frais", price: 9.00, available: true }] },
        { id: "dist-017", name: "Fromagerie Larressore", type: "cheese", emoji: "🧀", address: "Place du Village, 64480 Larressore", city: "Larressore", lat: 43.3694, lng: -1.4389, rating: 4.6, reviewCount: 48, status: "verified", priceRange: "€€", products: [{ name: "Tomme fermiere", price: 10.00, available: true }, { name: "Fromage affine 6 mois", price: 14.00, available: true }] },
        { id: "dist-020", name: "Plats Maison Hendaye", type: "meals", emoji: "🍽️", address: "Boulevard de la Plage, 64700 Hendaye", city: "Hendaye", lat: 43.3617, lng: -1.7739, rating: 4.4, reviewCount: 82, status: "verified", priceRange: "€€", products: [{ name: "Marmitako", price: 10.00, available: true }, { name: "Ttoro", price: 12.00, available: true }] },
        { id: "dist-024", name: "Frites Gare Bayonne", type: "fries", emoji: "🍟", address: "Place de la Gare, 64100 Bayonne", city: "Bayonne", lat: 43.4958, lng: -1.4722, rating: 3.8, reviewCount: 203, status: "warning", priceRange: "€", products: [{ name: "Frites classiques", price: 3.00, available: true }, { name: "Frites XL", price: 4.50, available: true }] }
    ],
    typeConfig: {
        pizza: { label: "Pizza fraiche", gradient: "linear-gradient(135deg, #ff6b6b 0%, #feca57 100%)" },
        bakery: { label: "Boulangerie & Taloa", gradient: "linear-gradient(135deg, #cd853f 0%, #daa520 100%)" },
        fries: { label: "Frites fraiches", gradient: "linear-gradient(135deg, #f9ca24 0%, #f0932b 100%)" },
        meals: { label: "Plats cuisines", gradient: "linear-gradient(135deg, #6c5ce7 0%, #a29bfe 100%)" },
        cheese: { label: "Fromage fermier", gradient: "linear-gradient(135deg, #fdcb6e 0%, #e17055 100%)" },
        dairy: { label: "Produits laitiers", gradient: "linear-gradient(135deg, #81ecec 0%, #74b9ff 100%)" },
        agricultural: { label: "Produits agricoles", gradient: "linear-gradient(135deg, #00b894 0%, #55efc4 100%)" },
        meat: { label: "Viande & Charcuterie", gradient: "linear-gradient(135deg, #d63031 0%, #e17055 100%)" },
        terroir: { label: "Terroir local", gradient: "linear-gradient(135deg, #e17055 0%, #fdcb6e 100%)" },
        general: { label: "Distributeur mixte", gradient: "linear-gradient(135deg, #636e72 0%, #b2bec3 100%)" }
    }
};

async function loadDistributors() {
    try {
        // Essayer fetch, sinon utiliser les donnees embarquees
        const response = await fetch('data/distributors.json');
        if (!response.ok) throw new Error('Fetch failed');
        const data = await response.json();
        AppState.distributors = data.distributors;
        AppState.typeConfig = data.typeConfig;
        console.log('[SnackMatch] Donnees chargees via fetch:', AppState.distributors.length, 'distributeurs');
    } catch (error) {
        console.log('[SnackMatch] Mode fichier local - utilisation des donnees embarquees');
        AppState.distributors = EMBEDDED_DATA.distributors;
        AppState.typeConfig = EMBEDDED_DATA.typeConfig;
        console.log('[SnackMatch] Donnees embarquees:', AppState.distributors.length, 'distributeurs');
    }

    // Ajouter les distributeurs utilisateur
    const userDistributors = loadUserDistributors();
    if (userDistributors.length > 0) {
        AppState.distributors = [...AppState.distributors, ...userDistributors];
        console.log('[SnackMatch] Distributeurs utilisateur:', userDistributors.length);
    }

    if (AppState.userLocation) {
        sortByDistance();
    }
}

// Charger les distributeurs ajoutes par l'utilisateur
function loadUserDistributors() {
    try {
        return JSON.parse(localStorage.getItem(USER_DISTRIBUTORS_KEY)) || [];
    } catch (e) {
        console.error('Erreur chargement distributeurs utilisateur:', e);
        return [];
    }
}

// Sauvegarder un distributeur utilisateur
function saveUserDistributor(distributor) {
    const existing = loadUserDistributors();
    existing.push(distributor);
    try {
        localStorage.setItem(USER_DISTRIBUTORS_KEY, JSON.stringify(existing));
    } catch (e) {
        console.error('Erreur sauvegarde distributeur:', e);
    }
}

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

// ============================================
// GEOLOCALISATION
// ============================================

function getUserLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
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
            () => {
                AppState.userLocation = { lat: 43.4929, lng: -1.4748 };
                resolve(AppState.userLocation);
            },
            { enableHighAccuracy: true, timeout: 5000 }
        );
    });
}

// ============================================
// CARTE LEAFLET
// ============================================

function initMainMap() {
    if (mainMap) return;

    const defaultCenter = AppState.userLocation || { lat: 43.4929, lng: -1.4748 };

    mainMap = L.map('main-map', {
        zoomControl: false
    }).setView([defaultCenter.lat, defaultCenter.lng], 13);

    AppState.mapInitialized = true;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19
    }).addTo(mainMap);

    L.control.zoom({ position: 'bottomleft' }).addTo(mainMap);

    if (AppState.userLocation) {
        const userIcon = L.divIcon({
            className: 'user-marker-container',
            html: '<div class="user-marker"></div>',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });

        userMarker = L.marker([AppState.userLocation.lat, AppState.userLocation.lng], {
            icon: userIcon,
            zIndexOffset: 1000
        }).addTo(mainMap);

        userMarker.bindPopup('<strong>Vous etes ici</strong>');
    }

    updateMapMarkers();
    console.log('[SnackMatch] Carte initialisee avec', AppState.distributors.length, 'distributeurs');
}

function updateMapMarkers(fitBounds = true) {
    if (!mainMap || !AppState.mapInitialized) return;

    distributorMarkers.forEach(m => mainMap.removeLayer(m));
    distributorMarkers = [];

    // Filtrer les distributeurs selon les filtres actifs
    const filteredDistributors = getFilteredDistributors();

    filteredDistributors.forEach(d => {
        const isFavorite = AppState.favorites.includes(d.id);
        const hasConversation = Conversations.list.includes(d.id);

        const marker = L.marker([d.lat, d.lng], {
            icon: createDistributorIcon(d, isFavorite)
        }).addTo(mainMap);

        // Stocker l'ID pour recherche rapide
        marker.distributorId = d.id;

        marker.bindPopup(createPopupContent(d, hasConversation));

        marker.on('click', () => {
            mainMap.setView([d.lat, d.lng], 15);
        });

        distributorMarkers.push(marker);
    });

    if (fitBounds && distributorMarkers.length > 0) {
        const group = new L.featureGroup(distributorMarkers);
        mainMap.fitBounds(group.getBounds().pad(0.1));
    }
}

function createDistributorIcon(d, isFavorite) {
    const color = isFavorite ? '#ef4444' : '#6366f1';

    return L.divIcon({
        className: 'distributor-marker-container',
        html: `<div class="distributor-marker-icon" style="background:${color};width:36px;height:36px;">${d.emoji}</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -20]
    });
}

function createPopupContent(d, hasConversation) {
    const distance = d.distance ? formatDistance(d.distance) : '';
    const isFavorite = AppState.favorites.includes(d.id);

    return `
        <div class="map-popup">
            <strong>${d.emoji} ${escapeHTML(d.name)}</strong>
            <p>${escapeHTML(d.address)}</p>
            <p>★ ${d.rating} ${distance ? '- ' + distance : ''}</p>
            ${isFavorite ? '<p style="color:#ef4444;font-weight:600;">Favori</p>' : ''}
            <button onclick="openConversation('${d.id}')" class="btn-popup-chat" aria-label="${hasConversation ? 'Reprendre la conversation avec' : 'Discuter avec'} ${escapeHTML(d.name)}">
                ${hasConversation ? 'Reprendre' : 'Discuter'}
            </button>
        </div>
    `;
}

function centerMapOnUser() {
    if (mainMap && AppState.userLocation) {
        mainMap.setView([AppState.userLocation.lat, AppState.userLocation.lng], 14);
        showToast('Centre sur ta position', 'success');
    } else {
        showToast('Position non disponible', 'warning');
    }
}

function highlightOnMap(id) {
    const d = AppState.distributors.find(d => d.id === id);
    if (d && mainMap) {
        mainMap.setView([d.lat, d.lng], 16);

        // Trouver le marqueur par son ID stocke
        const marker = distributorMarkers.find(m => m.distributorId === id);
        if (marker) {
            marker.openPopup();
        }
    }
}

// ============================================
// SYSTEME DE CONVERSATIONS
// ============================================

function getDistributorBot(distributorId) {
    const d = AppState.distributors.find(dist => dist.id === distributorId);
    if (!d) return null;

    const typeConfig = AppState.typeConfig[d.type] || {};

    return {
        id: distributorId,
        name: d.name,
        avatar: d.emoji,
        greeting: `Salut ! Je suis le bot de ${d.name}. Comment je peux t'aider ?`,
        quickReplies: [
            { text: 'Produits', action: 'products' },
            { text: 'Prix', action: 'prices' },
            { text: 'Itineraire', action: 'directions' },
            { text: 'Infos', action: 'info' }
        ],
        distributor: d,
        typeConfig: typeConfig
    };
}

function openConversation(distributorId) {
    const bot = getDistributorBot(distributorId);
    if (!bot) return;

    Conversations.active = distributorId;

    // Ajouter a la liste si pas deja present
    if (!Conversations.list.includes(distributorId)) {
        Conversations.list.unshift(distributorId);
        updateImplicitProfile('start_conversation', { type: bot.distributor.type });
    } else {
        // Remonter en haut de la liste
        Conversations.list = Conversations.list.filter(id => id !== distributorId);
        Conversations.list.unshift(distributorId);
    }

    // Initialiser l'historique si vide
    if (!Conversations.history[distributorId]) {
        Conversations.history[distributorId] = [];
        addBotMessageToConversation(distributorId, bot.greeting);
    }

    saveConversations();
    displayChatModal(bot);
    updateConversationsList();
    closeSidebar();
}

function displayChatModal(bot) {
    const modal = document.getElementById('chat-modal');
    const avatar = document.getElementById('chat-avatar');
    const name = document.getElementById('chat-name');
    const status = document.getElementById('chat-status');
    const messages = document.getElementById('chat-messages');
    const quickReplies = document.getElementById('chat-quick-replies');

    avatar.textContent = bot.avatar;
    name.textContent = bot.name;
    status.textContent = 'En ligne';

    // Afficher les messages de la conversation
    messages.innerHTML = '';
    const history = Conversations.history[bot.id] || [];
    history.forEach(msg => {
        addChatMessageToDOM(msg.type, msg.type === 'bot' ? bot.avatar : '👤', msg.text);
    });

    // Quick replies
    quickReplies.innerHTML = '';
    bot.quickReplies.forEach(reply => {
        const btn = document.createElement('button');
        btn.className = 'quick-reply-btn';
        btn.textContent = reply.text;
        btn.onclick = () => handleQuickReply(reply.action, bot);
        quickReplies.appendChild(btn);
    });

    modal.classList.add('active');

    // Mettre a jour le bouton favori
    updateChatFavoriteButton(bot.id);

    // Scroll en bas
    setTimeout(() => {
        messages.scrollTop = messages.scrollHeight;
    }, 100);
}

function closeChatModal() {
    document.getElementById('chat-modal').classList.remove('active');
    Conversations.active = null;
}

function addChatMessageToDOM(type, avatar, text) {
    const container = document.getElementById('chat-messages');
    const msg = document.createElement('div');
    msg.className = `chat-message ${type}`;
    msg.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">${escapeHTML(text)}</div>
    `;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
}

function addBotMessageToConversation(distributorId, text) {
    const msg = { type: 'bot', text, timestamp: Date.now() };
    if (!Conversations.history[distributorId]) {
        Conversations.history[distributorId] = [];
    }
    Conversations.history[distributorId].push(msg);
    saveConversations();
    return msg;
}

function addUserMessageToConversation(distributorId, text) {
    const msg = { type: 'user', text, timestamp: Date.now() };
    if (!Conversations.history[distributorId]) {
        Conversations.history[distributorId] = [];
    }
    Conversations.history[distributorId].push(msg);
    saveConversations();
    return msg;
}

function handleQuickReply(action, bot) {
    const quickReplies = document.getElementById('chat-quick-replies');
    quickReplies.innerHTML = '';
    handleDistributorAction(action, bot);
}

function handleDistributorAction(action, bot) {
    const d = bot.distributor;
    const distributorId = bot.id;

    addUserMessageToConversation(distributorId, action);
    addChatMessageToDOM('user', '👤', action);

    setTimeout(() => {
        let response = '';
        let newReplies = [];

        switch (action) {
            case 'products':
            case 'Produits':
                const productsList = d.products.map(p =>
                    `${p.available ? '✓' : '✗'} ${p.name}`
                ).join('\n');
                response = `Voici mes produits :\n${productsList}`;
                newReplies = [
                    { text: 'Prix', action: 'prices' },
                    { text: 'Itineraire', action: 'directions' }
                ];
                break;

            case 'prices':
            case 'Prix':
                const pricesList = d.products.map(p =>
                    `${p.name} : ${p.price.toFixed(2)}€`
                ).join('\n');
                response = `Mes tarifs :\n${pricesList}`;
                newReplies = [
                    { text: 'Produits', action: 'products' },
                    { text: 'Itineraire', action: 'directions' }
                ];
                break;

            case 'directions':
            case 'Itineraire':
                response = `Je suis situe : ${d.address}. Je t'ouvre l'itineraire !`;
                getDirectionsTo(d);
                newReplies = [
                    { text: 'Produits', action: 'products' },
                    { text: 'Favori', action: 'favorite' }
                ];
                break;

            case 'info':
            case 'Infos':
                response = `${d.name}\n${d.address}\nNote : ${d.rating}/5 (${d.reviewCount} avis)\n${d.distance ? 'Distance : ' + formatDistance(d.distance) : ''}`;
                newReplies = [
                    { text: 'Produits', action: 'products' },
                    { text: 'Itineraire', action: 'directions' }
                ];
                break;

            case 'favorite':
            case 'Favori':
                toggleFavorite(distributorId);
                const isFav = AppState.favorites.includes(distributorId);
                response = isFav ? 'Ajoute a tes favoris !' : 'Retire de tes favoris.';
                newReplies = [
                    { text: 'Produits', action: 'products' },
                    { text: 'Itineraire', action: 'directions' }
                ];
                break;

            default:
                response = processNaturalMessage(action, d);
                newReplies = [
                    { text: 'Produits', action: 'products' },
                    { text: 'Prix', action: 'prices' },
                    { text: 'Itineraire', action: 'directions' }
                ];
        }

        addBotMessageToConversation(distributorId, response);
        addChatMessageToDOM('bot', bot.avatar, response);

        // Update quick replies
        const quickReplies = document.getElementById('chat-quick-replies');
        quickReplies.innerHTML = '';
        newReplies.forEach(reply => {
            const btn = document.createElement('button');
            btn.className = 'quick-reply-btn';
            btn.textContent = reply.text;
            btn.onclick = () => handleQuickReply(reply.action, bot);
            quickReplies.appendChild(btn);
        });

    }, 400);
}

function processNaturalMessage(text, distributor) {
    const lower = text.toLowerCase();

    if (lower.includes('pizza') || lower.includes('mange')) {
        return `J'ai plein de bonnes choses ! Voici mes produits : ${distributor.products.slice(0, 3).map(p => p.name).join(', ')}...`;
    }

    if (lower.includes('prix') || lower.includes('combien') || lower.includes('cher')) {
        const cheapest = distributor.products.reduce((min, p) => p.price < min.price ? p : min);
        return `Le moins cher : ${cheapest.name} a ${cheapest.price.toFixed(2)}€`;
    }

    if (lower.includes('ou') || lower.includes('adresse') || lower.includes('trouv')) {
        return `Tu me trouves : ${distributor.address}`;
    }

    if (lower.includes('merci') || lower.includes('super') || lower.includes('cool')) {
        return "De rien ! A bientot !";
    }

    return `Je n'ai pas bien compris. Demande-moi les produits, les prix ou l'itineraire !`;
}

function handleChatInput(text) {
    if (!text.trim() || !Conversations.active) return;

    const bot = getDistributorBot(Conversations.active);
    if (bot) {
        handleDistributorAction(text, bot);
    }
}

function updateConversationsList() {
    const list = document.getElementById('conversations-list');

    if (Conversations.list.length === 0) {
        list.innerHTML = `
            <div class="empty-conversations">
                <div class="empty-icon">💬</div>
                <p>Aucune conversation</p>
                <small>Clique sur un distributeur sur la carte pour lui parler</small>
            </div>
        `;
        return;
    }

    list.innerHTML = Conversations.list.map(id => {
        const d = AppState.distributors.find(dist => dist.id === id);
        if (!d) return '';

        const history = Conversations.history[id] || [];
        const lastMsg = history[history.length - 1];
        const preview = lastMsg ? lastMsg.text.substring(0, 25) + (lastMsg.text.length > 25 ? '...' : '') : 'Nouvelle conversation';
        const time = lastMsg ? formatTime(lastMsg.timestamp) : '';
        const isActive = Conversations.active === id;

        return `
            <div class="conversation-item ${isActive ? 'active' : ''}" onclick="openConversation('${id}')">
                <div class="conversation-avatar">${d.emoji}</div>
                <div class="conversation-info">
                    <div class="conversation-name">${escapeHTML(d.name)}</div>
                    <div class="conversation-preview">${escapeHTML(preview)}</div>
                </div>
                <div class="conversation-meta">
                    <span class="conversation-time">${time}</span>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// FILTRES PAR TYPE
// ============================================

function setFilter(type) {
    if (type === 'all') {
        // "Tous" remet a zero les filtres
        AppState.activeFilters = [];
    } else {
        // Toggle le type dans le tableau
        const index = AppState.activeFilters.indexOf(type);
        if (index === -1) {
            // Ajouter le filtre
            AppState.activeFilters.push(type);
        } else {
            // Retirer le filtre
            AppState.activeFilters.splice(index, 1);
        }
    }

    // Mettre a jour l'UI des chips
    document.querySelectorAll('.filter-chip').forEach(chip => {
        const chipType = chip.dataset.type;
        if (chipType === 'all') {
            // "Tous" est actif si aucun filtre selectionne
            chip.classList.toggle('active', AppState.activeFilters.length === 0);
        } else {
            chip.classList.toggle('active', AppState.activeFilters.includes(chipType));
        }
    });

    // Mettre a jour les marqueurs sans recentrer la carte
    updateMapMarkers(false);

    // Afficher un toast avec le compte
    const count = getFilteredDistributors().length;
    if (AppState.activeFilters.length === 0) {
        showToast(`Tous : ${count} distributeur(s)`, 'default');
    } else if (AppState.activeFilters.length === 1) {
        const label = AppState.typeConfig[AppState.activeFilters[0]]?.label || AppState.activeFilters[0];
        showToast(`${label} : ${count} distributeur(s)`, 'default');
    } else {
        showToast(`${AppState.activeFilters.length} filtres : ${count} distributeur(s)`, 'default');
    }
}

function initFilterChips() {
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            setFilter(chip.dataset.type);
        });
    });
}

// ============================================
// SIDEBAR
// ============================================

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    AppState.sidebarOpen = !AppState.sidebarOpen;

    if (AppState.sidebarOpen) {
        sidebar.classList.add('open');
        overlay.classList.add('active');
    } else {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
    }
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    AppState.sidebarOpen = false;
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
}

// ============================================
// MODAL DETAILS
// ============================================

function showDetails(id) {
    const distributor = AppState.distributors.find(d => d.id === id);
    if (!distributor) return;

    AppState.currentDistributor = distributor;
    updateImplicitProfile('view_details', { type: distributor.type, id: distributor.id });
    updateImplicitProfile('time_activity', {});

    const typeConfig = AppState.typeConfig[distributor.type] || {};
    const modal = document.getElementById('detail-modal');
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

    const productsList = document.getElementById('products-list');
    productsList.innerHTML = distributor.products.map(p => `
        <div class="product-item-clean ${p.available ? 'available' : 'unavailable'}">
            <div class="product-info-clean">
                <div class="product-name-clean">${escapeHTML(p.name)}</div>
            </div>
            <div class="product-price-clean">${p.price.toFixed(2)}€</div>
        </div>
    `).join('');

    const favBtn = document.getElementById('btn-favorite');
    const isFavorite = AppState.favorites.includes(distributor.id);
    favBtn.textContent = isFavorite ? 'Retirer' : 'Favori';
    favBtn.className = isFavorite ? 'btn-primary-clean favorite-active' : 'btn-primary-clean';

    modal.classList.add('active');
}

function closeDetailModal() {
    document.getElementById('detail-modal').classList.remove('active');
    AppState.currentDistributor = null;
}

function getDirectionsTo(distributor) {
    if (!distributor) return;
    const { lat, lng } = distributor;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    window.open(url, '_blank');
}

function getDirections() {
    if (!AppState.currentDistributor) return;
    getDirectionsTo(AppState.currentDistributor);
}

// ============================================
// FAVORIS
// ============================================

function toggleFavorite(id, event) {
    if (event) event.stopPropagation();

    const index = AppState.favorites.indexOf(id);
    const distributor = AppState.distributors.find(d => d.id === id);

    if (index === -1) {
        AppState.favorites.push(id);
        updateImplicitProfile('add_favorite', { type: distributor?.type });
        addActivityItem('favorite', id);
        showToast(`${distributor?.name || 'Distributeur'} ajoute aux favoris`, 'success');
    } else {
        AppState.favorites.splice(index, 1);
        addActivityItem('unfavorite', id);
        showToast(`${distributor?.name || 'Distributeur'} retire des favoris`, 'default');
    }

    saveToLocalStorage();
    updateBadges();
    updateMapMarkers();
    updateActivityBadge();

    if (document.getElementById('favorites-view').classList.contains('view-active')) {
        displayFavorites();
    }

    if (AppState.currentDistributor && AppState.currentDistributor.id === id) {
        showDetails(id);
    }
}

function toggleFavoriteFromModal() {
    if (AppState.currentDistributor) {
        toggleFavorite(AppState.currentDistributor.id);
    }
}

function toggleChatFavorite() {
    if (!Conversations.active) return;

    const id = Conversations.active;
    toggleFavorite(id);
    updateChatFavoriteButton(id);
}

function updateChatFavoriteButton(distributorId) {
    const btn = document.getElementById('chat-favorite');
    if (!btn) return;

    const isFavorite = AppState.favorites.includes(distributorId);
    btn.classList.toggle('is-favorite', isFavorite);
    btn.setAttribute('aria-label', isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris');
}

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
        const d = AppState.distributors.find(dist => dist.id === id);
        if (!d) return '';

        const distance = d.distance ? formatDistance(d.distance) : '';
        const typeConfig = AppState.typeConfig[d.type] || {};

        return `
            <div class="favorite-card" onclick="openConversation('${d.id}'); goBackToMap();">
                <div class="favorite-image" style="background: ${typeConfig.gradient || '#6366f1'}">
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
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                    </svg>
                </button>
            </div>
        `;
    }).join('');
}

// ============================================
// PROFIL
// ============================================

function updateProfileStats() {
    const statFavorites = document.getElementById('stat-favorites');
    const statReports = document.getElementById('stat-reports');
    const statConversations = document.getElementById('stat-conversations');
    const pointsValue = document.getElementById('profile-points');

    if (statFavorites) statFavorites.textContent = AppState.favorites.length;
    if (statReports) statReports.textContent = AppState.reports;
    if (statConversations) statConversations.textContent = Conversations.list.length;
    if (pointsValue) pointsValue.textContent = AppState.points;

    displayDetectedPreferences();
}

function displayDetectedPreferences() {
    const container = document.getElementById('profile-preferences-list');
    if (!container) return;

    const topTypes = getTopPreferredTypes(5);

    if (topTypes.length === 0) {
        container.innerHTML = '<span class="preference-tag">Explore pour que je te connaisse mieux !</span>';
        return;
    }

    container.innerHTML = topTypes.map((type, index) => {
        const config = AppState.typeConfig[type] || {};
        const label = config.label || type;
        const isStrong = index === 0;
        return `<span class="preference-tag ${isStrong ? 'strong' : ''}">${label}</span>`;
    }).join('');
}

// ============================================
// NAVIGATION
// ============================================

function switchView(viewName) {
    document.querySelectorAll('.view-page').forEach(v => {
        v.classList.remove('view-active');
        v.classList.add('view-hidden');
    });

    if (viewName === 'favorites') {
        document.getElementById('favorites-view').classList.remove('view-hidden');
        document.getElementById('favorites-view').classList.add('view-active');
        displayFavorites();
    } else if (viewName === 'profile') {
        document.getElementById('profile-view').classList.remove('view-hidden');
        document.getElementById('profile-view').classList.add('view-active');
        updateProfileStats();
    } else if (viewName === 'activity') {
        document.getElementById('activity-view').classList.remove('view-hidden');
        document.getElementById('activity-view').classList.add('view-active');
        displayActivityFeed();
    }
}

function goBackToMap() {
    document.querySelectorAll('.view-page').forEach(v => {
        v.classList.remove('view-active');
        v.classList.add('view-hidden');
    });

    // Mettre a jour la bottom nav
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === 'explore');
    });

    if (mainMap) {
        setTimeout(() => mainMap.invalidateSize(), 100);
    }
}

function updateBadges() {
    const favoritesBadge = document.getElementById('favorites-badge');

    if (favoritesBadge) {
        if (AppState.favorites.length > 0) {
            favoritesBadge.textContent = AppState.favorites.length;
            favoritesBadge.style.display = 'flex';
        } else {
            favoritesBadge.style.display = 'none';
        }
    }
}

// ============================================
// RECHERCHE
// ============================================

function openSearch() {
    document.getElementById('search-overlay').classList.add('active');
    document.getElementById('quick-search').focus();
}

function closeSearch() {
    document.getElementById('search-overlay').classList.remove('active');
    document.getElementById('quick-search').value = '';
    document.getElementById('search-results').innerHTML = '';
}

function performSearch(query) {
    const results = document.getElementById('search-results');

    if (query.length < 2) {
        results.innerHTML = '';
        return;
    }

    updateImplicitProfile('search', { query });
    const q = query.toLowerCase();

    const matches = AppState.distributors.filter(d => {
        const nameMatch = d.name.toLowerCase().includes(q);
        const addressMatch = d.address.toLowerCase().includes(q);
        const productMatch = d.products.some(p => p.name.toLowerCase().includes(q));
        return nameMatch || addressMatch || productMatch;
    });

    if (matches.length === 0) {
        results.innerHTML = `
            <div class="empty-state">
                <p>Aucun resultat pour "${escapeHTML(query)}"</p>
            </div>
        `;
        return;
    }

    results.innerHTML = matches.map(d => {
        const distance = d.distance ? formatDistance(d.distance) : '';
        return `
            <div class="search-item-clean" onclick="openConversation('${d.id}'); closeSearch();">
                <div class="search-item-name">
                    <span>${d.emoji} ${escapeHTML(d.name)}</span>
                </div>
                <div class="search-item-location">${escapeHTML(d.address)} ${distance ? '- ' + distance : ''}</div>
            </div>
        `;
    }).join('');
}

// ============================================
// SIGNALEMENT
// ============================================

function openReportFromChat() {
    if (!Conversations.active) return;
    const distributor = AppState.distributors.find(d => d.id === Conversations.active);
    if (!distributor) return;
    AppState.currentDistributor = distributor;
    openReportModal();
}

function openReportModal() {
    if (!AppState.currentDistributor) return;

    const distributor = AppState.currentDistributor;

    document.getElementById('report-name').textContent = distributor.name;
    document.getElementById('report-address').textContent = distributor.address;

    const select = document.getElementById('report-product');
    select.innerHTML = distributor.products.map(p =>
        `<option value="${escapeHTML(p.name)}">${escapeHTML(p.name)}</option>`
    ).join('');

    document.getElementById('report-modal').classList.add('active');
}

function selectReportType(type) {
    selectedReportType = type;

    document.querySelectorAll('.report-type-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.type === type);
    });

    const productSelect = document.getElementById('report-product-select');
    productSelect.style.display = ['out_of_stock', 'price_change'].includes(type) ? 'block' : 'none';

    document.getElementById('submit-report').disabled = false;
}

function submitReport() {
    if (!selectedReportType || !AppState.currentDistributor) return;

    // Obtenir les points du bouton selectionne
    const selectedBtn = document.querySelector(`.report-type-btn[data-type="${selectedReportType}"]`);
    const points = parseInt(selectedBtn?.dataset.points || '10');

    AppState.reports++;
    AppState.points += points;
    saveToLocalStorage();
    updateProfileStats();

    // Ajouter a l'activite
    addActivityItem('report', AppState.currentDistributor.id, {
        type: selectedReportType,
        points: points
    });

    showToast(`Merci pour ton signalement ! +${points} points`, 'success');

    document.getElementById('report-modal').classList.remove('active');
    selectedReportType = null;
    updateActivityBadge();
}

// ============================================
// FEED ACTIVITE
// ============================================

function saveActivityFeed() {
    try {
        localStorage.setItem(ACTIVITY_KEY, JSON.stringify(ActivityFeed.items));
    } catch (e) {
        console.error('Erreur sauvegarde activite:', e);
    }
}

function loadActivityFeed() {
    try {
        const data = localStorage.getItem(ACTIVITY_KEY);
        if (data) {
            ActivityFeed.items = JSON.parse(data) || [];
        }
    } catch (e) {
        console.error('Erreur chargement activite:', e);
        ActivityFeed.items = [];
    }
}

function addActivityItem(type, distributorId, details = {}) {
    const d = AppState.distributors.find(dist => dist.id === distributorId);
    if (!d) return;

    const item = {
        id: Date.now(),
        type: type,  // 'report', 'favorite', 'unfavorite'
        distributorId: distributorId,
        distributorName: d.name,
        distributorEmoji: d.emoji,
        details: details,
        timestamp: Date.now(),
        // Champs votes (pour reports uniquement)
        confirmations: 0,
        denials: 0,
        userVote: null,  // 'confirm' | 'deny' | null
        resolved: false
    };

    ActivityFeed.items.unshift(item);

    // Garder les 50 derniers
    if (ActivityFeed.items.length > 50) {
        ActivityFeed.items = ActivityFeed.items.slice(0, 50);
    }

    saveActivityFeed();
}

function getReportLabel(type) {
    const labels = {
        'out_of_stock': 'Rupture de stock',
        'machine_down': 'Machine en panne',
        'price_change': 'Prix modifie',
        'new_product': 'Nouveau produit',
        'closed': 'Ferme',
        'verified': 'Tout est OK'
    };
    return labels[type] || type;
}

function displayActivityFeed() {
    const list = document.getElementById('activity-list');
    const empty = document.getElementById('activity-empty');
    const count = document.getElementById('activity-count');

    // Filtrer selon le filtre actif
    let filtered = ActivityFeed.items;
    if (ActivityFeed.filter === 'reports') {
        filtered = ActivityFeed.items.filter(i => i.type === 'report');
    } else if (ActivityFeed.filter === 'favorites') {
        filtered = ActivityFeed.items.filter(i => i.type === 'favorite' || i.type === 'unfavorite');
    }

    count.textContent = `${filtered.length} action(s)`;

    if (filtered.length === 0) {
        list.innerHTML = '';
        empty.style.display = 'flex';
        return;
    }

    empty.style.display = 'none';

    list.innerHTML = filtered.map(item => {
        let icon = '';
        let iconClass = '';
        let text = '';

        if (item.type === 'report') {
            icon = '⚠️';
            iconClass = item.details.type === 'verified' ? 'verified' : 'report';
            text = `Signalement <strong>${getReportLabel(item.details.type)}</strong> sur ${escapeHTML(item.distributorName)}`;
        } else if (item.type === 'favorite') {
            icon = '❤️';
            iconClass = 'favorite';
            text = `Ajoute <strong>${escapeHTML(item.distributorName)}</strong> en favoris`;
        } else if (item.type === 'unfavorite') {
            icon = '💔';
            iconClass = 'favorite';
            text = `Retire <strong>${escapeHTML(item.distributorName)}</strong> des favoris`;
        } else if (item.type === 'new_distributor') {
            icon = '📍';
            iconClass = 'verified';
            text = `Nouveau distributeur <strong>${escapeHTML(item.details.name || item.distributorName)}</strong> ajoute`;
        }

        const pointsHtml = item.details.points ? `<span class="activity-points">+${item.details.points} pts</span>` : '';

        // Boutons de vote uniquement pour les reports non resolus
        let votesHtml = '';
        if (item.type === 'report' && !item.resolved) {
            const confirmClass = item.userVote === 'confirm' ? 'voted' : '';
            const denyClass = item.userVote === 'deny' ? 'voted' : '';
            votesHtml = `
                <div class="activity-votes">
                    <button class="vote-btn confirm ${confirmClass}" onclick="voteOnReport(${item.id}, 'confirm')" ${item.userVote ? 'disabled' : ''}>
                        Confirmer <span>${item.confirmations || 0}</span>
                    </button>
                    <button class="vote-btn deny ${denyClass}" onclick="voteOnReport(${item.id}, 'deny')" ${item.userVote ? 'disabled' : ''}>
                        Infirmer <span>${item.denials || 0}</span>
                    </button>
                </div>
            `;
        } else if (item.type === 'report' && item.resolved) {
            const result = item.confirmations >= item.denials ? 'Confirme' : 'Infirme';
            const resultClass = item.confirmations >= item.denials ? 'confirmed' : 'denied';
            votesHtml = `<div class="activity-resolved ${resultClass}">${result} par la communaute</div>`;
        }

        return `
            <div class="activity-item" data-id="${item.id}">
                <div class="activity-icon ${iconClass}">${icon}</div>
                <div class="activity-content">
                    <div class="activity-text">${text}</div>
                    <div class="activity-meta">
                        <span class="activity-time">${formatTime(item.timestamp)}</span>
                        ${pointsHtml}
                    </div>
                    ${votesHtml}
                </div>
            </div>
        `;
    }).join('');
}

function updateActivityBadge() {
    const badge = document.getElementById('activity-badge');
    const recentCount = ActivityFeed.items.filter(i =>
        Date.now() - i.timestamp < 24 * 60 * 60 * 1000
    ).length;

    if (recentCount > 0) {
        badge.textContent = recentCount > 9 ? '9+' : recentCount;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

function setActivityFilter(filter) {
    ActivityFeed.filter = filter;

    // Update active state
    document.querySelectorAll('.activity-filter').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    displayActivityFeed();
}

function voteOnReport(activityId, voteType) {
    const item = ActivityFeed.items.find(i => i.id === activityId);
    if (!item || item.userVote || item.resolved) return;

    // Enregistrer le vote
    item.userVote = voteType;
    if (voteType === 'confirm') {
        item.confirmations = (item.confirmations || 0) + 1;
    } else {
        item.denials = (item.denials || 0) + 1;
    }

    // Verifier si le signalement est resolu (3+ votes d'un cote)
    checkReportResolution(item);

    // Donner des points pour le vote
    AppState.points += 2;
    saveToLocalStorage();

    saveActivityFeed();
    displayActivityFeed();
    showToast(`Vote enregistre ! +2 points`, 'success');
}

function checkReportResolution(item) {
    const THRESHOLD = 3;

    if (item.confirmations >= THRESHOLD) {
        item.resolved = true;
        showToast(`Signalement confirme par la communaute !`, 'success');
    } else if (item.denials >= THRESHOLD) {
        item.resolved = true;
        showToast(`Signalement infirme par la communaute`, 'warning');
    }
}

function getUnverifiedReportsForDistributor(distributorId) {
    return ActivityFeed.items.filter(item =>
        item.type === 'report' &&
        item.distributorId === distributorId &&
        !item.resolved
    ).length;
}

// ============================================
// AJOUT DISTRIBUTEUR
// ============================================

function toggleAddMode() {
    if (AddMode.active) {
        cancelAddDistributor();
        return;
    }

    AddMode.active = true;
    document.getElementById('btn-add-distributor').classList.add('active');
    document.getElementById('placement-hint').classList.add('visible');
    document.getElementById('main-map').style.cursor = 'crosshair';

    // Ecouter le clic sur la carte
    mainMap.once('click', onMapClickForPlacement);
}

function onMapClickForPlacement(e) {
    if (!AddMode.active) return;

    AddMode.lat = e.latlng.lat;
    AddMode.lng = e.latlng.lng;

    // Creer marker temporaire
    AddMode.marker = L.marker(e.latlng, {
        icon: L.divIcon({
            className: 'new-distributor-marker',
            html: '📍',
            iconSize: [40, 40],
            iconAnchor: [20, 20]
        }),
        draggable: true
    }).addTo(mainMap);

    // Ouvrir popup avec formulaire
    AddMode.marker.bindPopup(getAddPopupContent(), {
        closeOnClick: false,
        autoClose: false,
        minWidth: 250
    }).openPopup();

    // Mettre a jour coords si marker deplace
    AddMode.marker.on('dragend', function(e) {
        const pos = e.target.getLatLng();
        AddMode.lat = pos.lat;
        AddMode.lng = pos.lng;
    });

    // Cacher le hint
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
            <div class="popup-actions">
                <button class="btn-cancel" onclick="cancelAddDistributor()">Annuler</button>
                <button class="btn-confirm" onclick="confirmAddDistributor()">Ajouter</button>
            </div>
        </div>
    `;
}

function cancelAddDistributor() {
    if (AddMode.marker) {
        mainMap.removeLayer(AddMode.marker);
    }
    AddMode.active = false;
    AddMode.marker = null;
    AddMode.lat = null;
    AddMode.lng = null;

    // Reset UI
    document.getElementById('btn-add-distributor').classList.remove('active');
    document.getElementById('placement-hint').classList.remove('visible');
    document.getElementById('main-map').style.cursor = '';
    mainMap.off('click', onMapClickForPlacement);
}

function confirmAddDistributor() {
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

    const newDistributor = {
        id: `user-${Date.now()}`,
        name: name,
        type: type,
        emoji: typeInfo?.emoji || '🏪',
        lat: AddMode.lat,
        lng: AddMode.lng,
        address: address || 'Adresse a completer',
        city: 'A verifier',
        rating: 5.0,
        reviewCount: 0,
        products: [],
        isUserAdded: true,
        addedAt: Date.now(),
        addedBy: 'user'
    };

    // Sauvegarder en localStorage
    saveUserDistributor(newDistributor);

    // Ajouter a la liste en memoire
    AppState.distributors.push(newDistributor);

    // Calculer distance si position disponible
    if (AppState.userLocation) {
        newDistributor.distance = calculateDistance(
            AppState.userLocation.lat,
            AppState.userLocation.lng,
            newDistributor.lat,
            newDistributor.lng
        );
    }

    // Supprimer le marker temporaire et rafraichir la carte
    mainMap.removeLayer(AddMode.marker);
    updateMapMarkers(false);

    // Reset mode
    AddMode.active = false;
    AddMode.marker = null;
    AddMode.lat = null;
    AddMode.lng = null;

    document.getElementById('btn-add-distributor').classList.remove('active');

    // Feedback
    showToast(`${escapeHTML(newDistributor.name)} ajoute !`, 'success');

    // Points pour l'ajout
    AppState.points += 20;

    // Ajouter a l'activite
    addActivityItem('new_distributor', newDistributor.id, { name: newDistributor.name, points: 20 });
    saveToLocalStorage();
    updateActivityBadge();
}

// ============================================
// BOTTOM NAVIGATION
// ============================================

function switchTab(tabName) {
    // Update tab active state
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Handle view switching
    if (tabName === 'explore') {
        // Fermer toutes les vues, retour carte
        document.querySelectorAll('.view-page').forEach(v => {
            v.classList.remove('view-active');
            v.classList.add('view-hidden');
        });

        // Rafraichir la carte
        if (mainMap) {
            setTimeout(() => mainMap.invalidateSize(), 100);
        }
    } else if (tabName === 'activity') {
        switchView('activity');
        displayActivityFeed();
    }
}

// ============================================
// INITIALISATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('SnackMatch V4.5 - Initialisation...');

    // Charger les donnees
    loadFromLocalStorage();
    loadProfile();
    loadConversations();
    loadActivityFeed();

    // Obtenir la geolocalisation
    await getUserLocation();

    // Charger les distributeurs
    await loadDistributors();

    // Initialiser la carte
    initMainMap();

    // Initialiser les filtres
    initFilterChips();

    // Mettre a jour la liste des conversations
    updateConversationsList();

    // Event listeners navigation
    document.querySelectorAll('.nav-icon-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchView(btn.dataset.view);
        });
    });

    // Logo = retour a la carte
    document.getElementById('logo-home').addEventListener('click', goBackToMap);

    // Sidebar toggle (mobile)
    document.getElementById('sidebar-toggle').addEventListener('click', toggleSidebar);
    document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

    // Boutons retour
    document.getElementById('back-from-favorites')?.addEventListener('click', goBackToMap);
    document.getElementById('back-from-profile')?.addEventListener('click', goBackToMap);
    document.getElementById('back-from-activity')?.addEventListener('click', goBackToMap);

    // Bottom navigation
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Activity filters
    document.querySelectorAll('.activity-filter').forEach(btn => {
        btn.addEventListener('click', () => setActivityFilter(btn.dataset.filter));
    });

    // Update activity badge
    updateActivityBadge();

    // Centrer la carte
    document.getElementById('center-map').addEventListener('click', centerMapOnUser);

    // Ajout distributeur
    document.getElementById('btn-add-distributor')?.addEventListener('click', toggleAddMode);
    document.getElementById('placement-cancel')?.addEventListener('click', cancelAddDistributor);

    // Recherche
    document.getElementById('search-toggle').addEventListener('click', openSearch);
    document.getElementById('close-search').addEventListener('click', closeSearch);
    document.getElementById('quick-search').addEventListener('input', (e) => {
        performSearch(e.target.value);
    });

    // Chat modal
    document.getElementById('chat-close').addEventListener('click', closeChatModal);
    document.getElementById('chat-back').addEventListener('click', closeChatModal);
    document.getElementById('chat-favorite').addEventListener('click', toggleChatFavorite);
    document.getElementById('chat-report').addEventListener('click', openReportFromChat);

    document.getElementById('chat-send').addEventListener('click', () => {
        const input = document.getElementById('chat-input');
        handleChatInput(input.value);
        input.value = '';
    });

    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleChatInput(e.target.value);
            e.target.value = '';
        }
    });

    // Modals details
    document.getElementById('close-detail').addEventListener('click', closeDetailModal);
    document.getElementById('get-directions').addEventListener('click', getDirections);
    document.getElementById('btn-favorite').addEventListener('click', toggleFavoriteFromModal);
    document.getElementById('btn-report').addEventListener('click', openReportModal);

    document.getElementById('close-report').addEventListener('click', () => {
        document.getElementById('report-modal').classList.remove('active');
    });

    document.querySelectorAll('.report-type-btn').forEach(btn => {
        btn.addEventListener('click', () => selectReportType(btn.dataset.type));
    });

    document.getElementById('submit-report').addEventListener('click', submitReport);

    // Profil
    document.getElementById('clear-data-btn').addEventListener('click', clearUserData);

    // Escape pour fermer
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeDetailModal();
            closeSearch();
            closeChatModal();
            closeSidebar();
            document.getElementById('report-modal').classList.remove('active');
            goBackToMap();
        }
    });

    console.log('SnackMatch V4.5 - Pret !');
});
