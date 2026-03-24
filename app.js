/**
 * SnackMatch V7.0 - Smart Notifications Edition
 * Systeme d'abonnements avec robots proactifs
 * Notifications intelligentes: geofencing, heures calmes, alertes produits
 * Sidebar + Carte + Modal Chat par distributeur
 */

// ============================================
// ETAT GLOBAL DE L'APPLICATION
// ============================================
const AppState = {
    distributors: [],
    subscriptions: [],  // Anciennement favorites - IDs des distributeurs abonnes
    userLocation: null,
    currentDistributor: null,
    typeConfig: {},
    reports: 0,
    points: 0,
    mapInitialized: false,
    sidebarOpen: false,
    activeFilters: []  // Filtres actifs: tableau vide = tous, sinon liste des types
};

// Systeme de conversations avec notifications
const Conversations = {
    active: null,           // ID du distributeur en cours
    history: {},            // { distributorId: [messages] }
    list: [],               // IDs des conversations ouvertes (ordre recent)
    unreadCounts: {}        // { distributorId: number } - Messages non lus par conversation
};

// Feed d'activite communautaire
const ActivityFeed = {
    items: [],              // Liste des activites
    filter: 'all'           // Filtre actif: all, reports, subscriptions
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
        totalSubscriptions: 0,
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
const NOTIFICATION_PREFS_KEY = 'snackmatch_notification_prefs';
const NOTIFICATION_QUEUE_KEY = 'snackmatch_notification_queue';

// ============================================
// SYSTEME DE NOTIFICATIONS INTELLIGENTES
// ============================================

// Preferences de notifications
const NotificationPrefs = {
    enabled: true,
    quietHours: {
        enabled: true,
        start: 22,  // 22h
        end: 8      // 8h
    },
    geofence: {
        enabled: true,
        radius: 1000  // metres
    },
    perDistributor: {},  // { distributorId: { proximity: true, stock: true, promo: true } }
    followedProducts: [], // ["pizza", "croissant", ...]
    lastNotifications: {} // { distributorId: timestamp } - pour cooldown
};

// File d'attente des notifications
const NotificationQueue = {
    pending: [],  // Notifications en attente (heures calmes)
    history: []   // Historique des 50 dernieres
};

// Types de notifications disponibles
const NOTIFICATION_TYPES = {
    proximity: {
        icon: '📍',
        title: 'Tu es proche !',
        template: '{name} est a {distance}m de toi'
    },
    stock: {
        icon: '📦',
        title: 'Produit disponible !',
        template: '{product} est dispo chez {name}'
    },
    promo: {
        icon: '🎉',
        title: 'Promo !',
        template: 'Offre speciale chez {name}'
    }
};

// ============================================
// MESSAGES PROACTIFS DES ROBOTS
// ============================================

// Messages de salutation selon l'heure
const GREETING_MESSAGES = {
    morning: [
        "Bonjour ! Envie d'un petit-dejeuner ?",
        "Hello ! Je suis ouvert, passe me voir !",
        "Bien dormi ? Un cafe et une viennoiserie ?",
        "Salut ! Commence bien ta journee avec moi !"
    ],
    lunch: [
        "C'est l'heure du dejeuner ! J'ai ce qu'il te faut.",
        "Pause dejeuner ? Viens faire le plein !",
        "Tu as faim ? Je t'attends !",
        "Hey ! Parfait pour un bon repas de midi."
    ],
    afternoon: [
        "Un petit gouter ? Je suis la !",
        "Envie d'un snack ? Passe me voir !",
        "Petit creux de l'apres-midi ?"
    ],
    evening: [
        "Bonsoir ! Une petite faim en rentrant ?",
        "Hey ! Parfait pour un snack du soir.",
        "Tu passes ce soir ? J'ai des nouveautes !"
    ],
    night: [
        "Envie d'un encas nocturne ? Je suis 24h/24 !",
        "Fringale de minuit ? Je suis la !",
        "Nuit blanche ? J'ai de quoi te sustenter !"
    ]
};

// Messages d'alerte (stock, prix, nouveautes)
const ALERT_MESSAGES = {
    stock_back: [
        "Bonne nouvelle ! {product} est de retour en stock !",
        "Tu attendais {product} ? C'est dispo maintenant !",
        "Alerte restock : {product} est la !"
    ],
    price_drop: [
        "Promo flash ! {product} a {newPrice} EUR au lieu de {oldPrice} EUR",
        "Prix reduit sur {product} ! Profites-en vite.",
        "Offre speciale : {product} en promo !"
    ],
    new_product: [
        "Nouveau ! Decouvre {product} a {price} EUR",
        "J'ai une nouveaute pour toi : {product}",
        "Exclusivite : {product} vient d'arriver !"
    ]
};

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
    if (hour >= 6 && hour < 11) return 'morning';
    if (hour >= 11 && hour < 14) return 'lunch';
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
        subscriptions: AppState.subscriptions,  // Anciennement favorites
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
            // Migration automatique favorites -> subscriptions
            if (parsed.favorites && !parsed.subscriptions) {
                parsed.subscriptions = parsed.favorites;
                delete parsed.favorites;
            }
            AppState.subscriptions = parsed.subscriptions || [];
            AppState.reports = parsed.reports || 0;
            AppState.points = parsed.points || 0;
            updateBadges();
        }
    } catch (e) {
        console.error('Erreur chargement localStorage:', e);
        AppState.subscriptions = [];
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
            history: Conversations.history,
            unreadCounts: Conversations.unreadCounts  // Nouveaux messages non lus
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
            Conversations.unreadCounts = parsed.unreadCounts || {};
        }
    } catch (e) {
        console.error('Erreur chargement conversations:', e);
    }
}

function saveNotificationPrefs() {
    try {
        localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(NotificationPrefs));
    } catch (e) {
        console.error('Erreur sauvegarde prefs notifications:', e);
    }
}

function loadNotificationPrefs() {
    try {
        const data = localStorage.getItem(NOTIFICATION_PREFS_KEY);
        if (data) {
            const parsed = JSON.parse(data);
            Object.assign(NotificationPrefs, parsed);
        }
    } catch (e) {
        console.error('Erreur chargement prefs notifications:', e);
    }
}

function saveNotificationQueue() {
    try {
        localStorage.setItem(NOTIFICATION_QUEUE_KEY, JSON.stringify(NotificationQueue));
    } catch (e) {
        console.error('Erreur sauvegarde queue notifications:', e);
    }
}

function loadNotificationQueue() {
    try {
        const data = localStorage.getItem(NOTIFICATION_QUEUE_KEY);
        if (data) {
            const parsed = JSON.parse(data);
            NotificationQueue.pending = parsed.pending || [];
            NotificationQueue.history = parsed.history || [];
        }
    } catch (e) {
        console.error('Erreur chargement queue notifications:', e);
    }
}

function clearUserData() {
    if (confirm('Effacer toutes tes donnees ?')) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(PROFILE_KEY);
        localStorage.removeItem(CONVERSATIONS_KEY);
        localStorage.removeItem(NOTIFICATION_PREFS_KEY);
        localStorage.removeItem(NOTIFICATION_QUEUE_KEY);
        AppState.subscriptions = [];
        AppState.reports = 0;
        AppState.points = 0;
        Conversations.list = [];
        Conversations.history = {};
        Conversations.active = null;
        // Reset notification prefs
        Object.assign(NotificationPrefs, {
            enabled: true,
            quietHours: { enabled: true, start: 22, end: 8 },
            geofence: { enabled: true, radius: 1000 },
            perDistributor: {},
            followedProducts: [],
            lastNotifications: {}
        });
        NotificationQueue.pending = [];
        NotificationQueue.history = [];
        Object.assign(UserProfile, {
            preferences: { types: {}, maxDistance: null, priceRange: null, timeSlots: {} },
            stats: { totalViews: 0, totalSubscriptions: 0, detailsViewed: 0, searchQueries: [], conversationsStarted: 0 },
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
            UserProfile.stats.totalSubscriptions++;
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
                   UserProfile.stats.totalSubscriptions * 2 +
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
        const isSubscribed = AppState.subscriptions.includes(d.id);
        const hasConversation = Conversations.list.includes(d.id);

        const marker = L.marker([d.lat, d.lng], {
            icon: createDistributorIcon(d, isSubscribed)
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

function createDistributorIcon(d, isSubscribed) {
    const color = isSubscribed ? '#ef4444' : '#6366f1';

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
    const isSubscribed = AppState.subscriptions.includes(d.id);

    return `
        <div class="map-popup">
            <strong>${d.emoji} ${escapeHTML(d.name)}</strong>
            <p>${escapeHTML(d.address)}</p>
            <p>★ ${d.rating} ${distance ? '- ' + distance : ''}</p>
            ${isSubscribed ? '<p style="color:#6366f1;font-weight:600;">🔔 Abonne</p>' : ''}
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

    // Marquer les messages comme lus a l'ouverture
    markConversationAsRead(distributorId);

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
    updateChatSubscribeButton(bot.id);

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
                    { text: 'Abonnement', action: 'subscribe' }
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

            case 'subscribe':
            case 'Abonnement':
                toggleSubscription(distributorId);
                const isSub = AppState.subscriptions.includes(distributorId);
                response = isSub ? 'Tu es maintenant abonne ! Je t\'enverrai des alertes.' : 'Tu ne recevras plus mes alertes.';
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

    // Trier: abonnes en premier, puis par message le plus recent
    const sortedList = [...Conversations.list].sort((a, b) => {
        const aSubscribed = AppState.subscriptions.includes(a);
        const bSubscribed = AppState.subscriptions.includes(b);

        // Abonnes en premier
        if (aSubscribed && !bSubscribed) return -1;
        if (!aSubscribed && bSubscribed) return 1;

        // Puis par message le plus recent
        const aHistory = Conversations.history[a] || [];
        const bHistory = Conversations.history[b] || [];
        const aLast = aHistory[aHistory.length - 1]?.timestamp || 0;
        const bLast = bHistory[bHistory.length - 1]?.timestamp || 0;
        return bLast - aLast;
    });

    list.innerHTML = sortedList.map(id => {
        const d = AppState.distributors.find(dist => dist.id === id);
        if (!d) return '';

        const history = Conversations.history[id] || [];
        const lastMsg = history[history.length - 1];
        const preview = lastMsg ? lastMsg.text.substring(0, 25) + (lastMsg.text.length > 25 ? '...' : '') : 'Nouvelle conversation';
        const time = lastMsg ? formatTime(lastMsg.timestamp) : '';
        const isActive = Conversations.active === id;
        const isSubscribed = AppState.subscriptions.includes(id);
        const unreadCount = Conversations.unreadCounts[id] || 0;

        return `
            <div class="conversation-item ${isActive ? 'active' : ''} ${isSubscribed ? 'subscribed' : ''}" onclick="openConversation('${id}')">
                <div class="conversation-avatar">${d.emoji}</div>
                <div class="conversation-info">
                    <div class="conversation-name">
                        ${escapeHTML(d.name)}
                        ${isSubscribed ? '<span class="subscribed-icon">🔔</span>' : ''}
                    </div>
                    <div class="conversation-preview ${unreadCount > 0 ? 'unread' : ''}">${escapeHTML(preview)}</div>
                </div>
                <div class="conversation-meta">
                    <span class="conversation-time">${time}</span>
                    ${unreadCount > 0 ? `<span class="conversation-badge">${unreadCount}</span>` : ''}
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

    const subBtn = document.getElementById('btn-subscribe');
    const isSubscribed = AppState.subscriptions.includes(distributor.id);
    subBtn.textContent = isSubscribed ? 'Abonne' : "S'abonner";
    subBtn.className = isSubscribed ? 'btn-primary-clean subscribed-active' : 'btn-primary-clean';

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
// ABONNEMENTS (ex-FAVORIS)
// ============================================

function toggleSubscription(id, event) {
    if (event) event.stopPropagation();

    const index = AppState.subscriptions.indexOf(id);
    const distributor = AppState.distributors.find(d => d.id === id);

    if (index === -1) {
        AppState.subscriptions.push(id);
        updateImplicitProfile('add_favorite', { type: distributor?.type });
        addActivityItem('subscription', id);
        showToast(`Tu es maintenant abonne a ${distributor?.name || 'ce distributeur'}`, 'success');
        // Generer un message de bienvenue du robot
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

    if (AppState.currentDistributor && AppState.currentDistributor.id === id) {
        showDetails(id);
    }
}

function toggleSubscriptionFromModal() {
    if (AppState.currentDistributor) {
        toggleSubscription(AppState.currentDistributor.id);
    }
}

function toggleChatSubscription() {
    if (!Conversations.active) return;

    const id = Conversations.active;
    toggleSubscription(id);
    updateChatSubscribeButton(id);
}

function updateChatSubscribeButton(distributorId) {
    const btn = document.getElementById('chat-subscribe');
    if (!btn) return;

    const isSubscribed = AppState.subscriptions.includes(distributorId);
    btn.classList.toggle('is-subscribed', isSubscribed);
    btn.setAttribute('aria-label', isSubscribed ? 'Se desabonner' : "S'abonner");
}

function displaySubscriptions() {
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
    count.textContent = `${AppState.subscriptions.length} abonnement(s)`;

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

// ============================================
// MESSAGES PROACTIFS ET NOTIFICATIONS
// ============================================

// Calculer le nombre total de messages non lus
function getTotalUnreadCount() {
    return Object.values(Conversations.unreadCounts).reduce((sum, count) => sum + count, 0);
}

// Mettre a jour les compteurs de messages non lus
function updateUnreadCounts() {
    Conversations.unreadCounts = {};

    Object.keys(Conversations.history).forEach(distributorId => {
        const messages = Conversations.history[distributorId];
        const unread = messages.filter(m => m.type === 'bot' && m.read === false).length;
        if (unread > 0) {
            Conversations.unreadCounts[distributorId] = unread;
        }
    });
}

// Marquer une conversation comme lue
function markConversationAsRead(distributorId) {
    const messages = Conversations.history[distributorId] || [];
    messages.forEach(m => {
        if (m.type === 'bot') m.read = true;
    });
    delete Conversations.unreadCounts[distributorId];
    saveConversations();
    updateConversationsBadge();
}

// Mettre a jour le badge global des conversations
function updateConversationsBadge() {
    const total = getTotalUnreadCount();
    const sidebarTitle = document.querySelector('.sidebar-title');

    if (sidebarTitle) {
        if (total > 0) {
            sidebarTitle.innerHTML = `Mes conversations <span class="sidebar-badge">${total}</span>`;
        } else {
            sidebarTitle.textContent = 'Mes conversations';
        }
    }
}

// Generer un message de bienvenue lors de l'abonnement
function generateWelcomeMessage(distributorId) {
    const distributor = AppState.distributors.find(d => d.id === distributorId);
    if (!distributor) return;

    const welcomeMessages = [
        `Super ! Tu es maintenant abonne. Je t'enverrai des alertes sur les nouveautes et les promos !`,
        `Bienvenue ! Je te tiendrai au courant des stocks et des bonnes affaires.`,
        `Merci de t'abonner ! Tu seras le premier informe des nouveaux produits.`
    ];

    const text = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
    addProactiveMessage(distributorId, { text, category: 'welcome' });
}

// Ajouter un message proactif a une conversation
function addProactiveMessage(distributorId, messageData) {
    const distributor = AppState.distributors.find(d => d.id === distributorId);
    if (!distributor) return;

    const msg = {
        type: 'bot',
        text: messageData.text,
        timestamp: Date.now(),
        read: false,
        proactive: true,
        category: messageData.category || 'info'
    };

    if (!Conversations.history[distributorId]) {
        Conversations.history[distributorId] = [];
    }
    Conversations.history[distributorId].push(msg);

    // Ajouter a la liste des conversations si pas present
    if (!Conversations.list.includes(distributorId)) {
        Conversations.list.unshift(distributorId);
    } else {
        // Remonter en haut de la liste
        Conversations.list = Conversations.list.filter(id => id !== distributorId);
        Conversations.list.unshift(distributorId);
    }

    // Mettre a jour le compteur non lus
    Conversations.unreadCounts[distributorId] = (Conversations.unreadCounts[distributorId] || 0) + 1;

    saveConversations();
    updateConversationsList();
    updateConversationsBadge();
}

// Generer les messages proactifs pour tous les abonnements
function generateProactiveMessages() {
    const now = Date.now();
    const timeSlot = getTimeSlot();

    AppState.subscriptions.forEach(distributorId => {
        const distributor = AppState.distributors.find(d => d.id === distributorId);
        if (!distributor) return;

        const history = Conversations.history[distributorId] || [];
        const lastMessage = history[history.length - 1];
        const lastMessageTime = lastMessage?.timestamp || 0;
        const hoursSinceLastMessage = (now - lastMessageTime) / (1000 * 60 * 60);

        // Generer un message de salutation si pas de message depuis 4h+
        if (hoursSinceLastMessage >= 4) {
            const greeting = generateGreetingMessage(distributor, timeSlot);
            if (greeting) {
                addProactiveMessage(distributorId, greeting);
            }
        }

        // Simuler une alerte stock (30% de chance pour la demo)
        if (Math.random() < 0.3 && hoursSinceLastMessage >= 2) {
            const alert = generateStockAlert(distributor);
            if (alert) {
                addProactiveMessage(distributorId, alert);
            }
        }
    });
}

// Generer un message de salutation contextuel
function generateGreetingMessage(distributor, timeSlot) {
    const messages = GREETING_MESSAGES[timeSlot] || GREETING_MESSAGES.morning;
    const text = messages[Math.floor(Math.random() * messages.length)];
    return { text, category: `greeting_${timeSlot}` };
}

// Generer une alerte stock simulee
function generateStockAlert(distributor) {
    if (!distributor.products || distributor.products.length === 0) return null;

    // Choisir un produit au hasard
    const product = distributor.products[Math.floor(Math.random() * distributor.products.length)];

    // Simuler differents types d'alertes
    const alertTypes = ['stock_back', 'new_product'];
    const alertType = alertTypes[Math.floor(Math.random() * alertTypes.length)];

    const templates = ALERT_MESSAGES[alertType];
    if (!templates) return null;

    let text = templates[Math.floor(Math.random() * templates.length)];
    text = text.replace('{product}', product.name);
    text = text.replace('{price}', product.price || '?');

    return { text, category: alertType };
}

// ============================================
// PROFIL
// ============================================

function updateProfileStats() {
    const statSubscriptions = document.getElementById('stat-subscriptions');
    const statReports = document.getElementById('stat-reports');
    const statConversations = document.getElementById('stat-conversations');
    const pointsValue = document.getElementById('profile-points');

    if (statSubscriptions) statSubscriptions.textContent = AppState.subscriptions.length;
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

    if (viewName === 'subscriptions') {
        document.getElementById('subscriptions-view').classList.remove('view-hidden');
        document.getElementById('subscriptions-view').classList.add('view-active');
        displaySubscriptions();
    } else if (viewName === 'profile') {
        document.getElementById('profile-view').classList.remove('view-hidden');
        document.getElementById('profile-view').classList.add('view-active');
        updateProfileStats();
    } else if (viewName === 'activity') {
        document.getElementById('activity-view').classList.remove('view-hidden');
        document.getElementById('activity-view').classList.add('view-active');
        displayActivityFeed();
    } else if (viewName === 'notification-settings') {
        document.getElementById('notification-settings').classList.remove('view-hidden');
        document.getElementById('notification-settings').classList.add('view-active');
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
    const subscriptionsBadge = document.getElementById('subscriptions-badge');

    if (subscriptionsBadge) {
        if (AppState.subscriptions.length > 0) {
            subscriptionsBadge.textContent = AppState.subscriptions.length;
            subscriptionsBadge.style.display = 'flex';
        } else {
            subscriptionsBadge.style.display = 'none';
        }
    }

    // Mettre a jour le badge des conversations avec messages non lus
    updateConversationsBadge();
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
    } else if (ActivityFeed.filter === 'subscriptions') {
        filtered = ActivityFeed.items.filter(i => i.type === 'subscription' || i.type === 'unsubscription' || i.type === 'favorite' || i.type === 'unfavorite');
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
        } else if (item.type === 'subscription' || item.type === 'favorite') {
            icon = '🔔';
            iconClass = 'subscription';
            text = `Abonne a <strong>${escapeHTML(item.distributorName)}</strong>`;
        } else if (item.type === 'unsubscription' || item.type === 'unfavorite') {
            icon = '🔕';
            iconClass = 'subscription';
            text = `Desabonne de <strong>${escapeHTML(item.distributorName)}</strong>`;
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
// SYSTEME DE NOTIFICATIONS INTELLIGENTES
// ============================================

// Verification si on est dans les heures calmes
function isQuietHours() {
    if (!NotificationPrefs.quietHours.enabled) return false;

    const now = new Date();
    const hour = now.getHours();
    const { start, end } = NotificationPrefs.quietHours;

    // Gere le cas ou start > end (ex: 22h - 8h)
    if (start > end) {
        return hour >= start || hour < end;
    }
    return hour >= start && hour < end;
}

// Verification cooldown anti-spam (1h entre notifications pour meme distributeur)
function canNotify(distributorId) {
    const lastNotif = NotificationPrefs.lastNotifications[distributorId];
    if (!lastNotif) return true;

    const hoursSince = (Date.now() - lastNotif) / (1000 * 60 * 60);
    return hoursSince >= 1; // 1 heure minimum entre notifications
}

// Marquer comme notifie
function markNotified(distributorId) {
    NotificationPrefs.lastNotifications[distributorId] = Date.now();
    saveNotificationPrefs();
}

// Mettre en file d'attente (heures calmes)
function queueNotification(notification) {
    NotificationQueue.pending.push({
        ...notification,
        queuedAt: Date.now()
    });
    saveNotificationQueue();
}

// Traiter les notifications en attente
function processQueuedNotifications() {
    if (isQuietHours()) return;

    const pending = [...NotificationQueue.pending];
    NotificationQueue.pending = [];

    pending.forEach(notif => {
        // Ne pas envoyer si trop vieux (> 12h)
        if (Date.now() - notif.queuedAt < 12 * 60 * 60 * 1000) {
            sendNotification(notif);
        }
    });

    saveNotificationQueue();
}

// Demarrer la surveillance geofence
function startGeofenceMonitoring() {
    if (!navigator.geolocation) {
        console.log('Geolocalisation non supportee');
        return;
    }

    if (!NotificationPrefs.enabled || !NotificationPrefs.geofence.enabled) {
        console.log('Geofencing desactive');
        return;
    }

    // Surveiller position toutes les 30 secondes
    setInterval(() => {
        if (!NotificationPrefs.enabled || !NotificationPrefs.geofence.enabled) return;
        if (isQuietHours()) return;

        navigator.geolocation.getCurrentPosition(
            checkNearbySubscriptions,
            (err) => console.log('Erreur geoloc pour geofence:', err.message),
            { enableHighAccuracy: false, timeout: 10000 }
        );
    }, 30000);

    console.log('Surveillance geofence demarree');
}

// Verifier distributeurs proches
function checkNearbySubscriptions(position) {
    const userLat = position.coords.latitude;
    const userLng = position.coords.longitude;

    AppState.subscriptions.forEach(id => {
        const dist = AppState.distributors.find(d => d.id === id);
        if (!dist) return;

        // Verifier si notifications activees pour ce distributeur
        const prefs = NotificationPrefs.perDistributor[id];
        if (prefs && prefs.proximity === false) return;

        const distance = calculateDistance(userLat, userLng, dist.lat, dist.lng);
        const distanceMeters = distance * 1000;

        if (distanceMeters <= NotificationPrefs.geofence.radius) {
            if (canNotify(id)) {
                triggerProximityNotification(dist, Math.round(distanceMeters));
            }
        }
    });
}

// Declencher notification de proximite
function triggerProximityNotification(distributor, distanceMeters) {
    const notification = {
        type: 'proximity',
        distributorId: distributor.id,
        distributorName: distributor.name,
        message: `${distributor.name} est a ${distanceMeters}m de toi`,
        timestamp: Date.now()
    };

    if (isQuietHours()) {
        queueNotification(notification);
        return;
    }

    sendNotification(notification);
}

// Suivre un produit
function followProduct(productName) {
    const normalized = productName.toLowerCase().trim();
    if (!NotificationPrefs.followedProducts.includes(normalized)) {
        NotificationPrefs.followedProducts.push(normalized);
        saveNotificationPrefs();
        showToast(`Tu seras notifie pour "${productName}"`, 'success');
        updateFollowedProductsList();
    }
}

// Ne plus suivre un produit
function unfollowProduct(productName) {
    const normalized = productName.toLowerCase().trim();
    NotificationPrefs.followedProducts = NotificationPrefs.followedProducts
        .filter(p => p !== normalized);
    saveNotificationPrefs();
    showToast(`Produit "${productName}" retire`, 'info');
    updateFollowedProductsList();
}

// Mettre a jour la liste des produits suivis dans l'UI
function updateFollowedProductsList() {
    const container = document.getElementById('followed-products-list');
    if (!container) return;

    if (NotificationPrefs.followedProducts.length === 0) {
        container.innerHTML = '<p class="empty-message">Aucun produit suivi</p>';
        return;
    }

    container.innerHTML = NotificationPrefs.followedProducts.map(product => {
        const safeAttr = escapeHTML(product).replace(/'/g, '&#39;');
        return `
        <span class="followed-product-chip">
            ${escapeHTML(product)}
            <button class="remove-btn" onclick="unfollowProduct('${safeAttr}')">&times;</button>
        </span>
    `;
    }).join('');
}

// Declencher notification produit disponible
function triggerProductNotification(distributor, product) {
    const notification = {
        type: 'stock',
        distributorId: distributor.id,
        distributorName: distributor.name,
        product: product,
        message: `${product} est dispo chez ${distributor.name}`,
        timestamp: Date.now()
    };

    if (isQuietHours()) {
        queueNotification(notification);
        return;
    }

    sendNotification(notification);
}

// Envoyer une notification
function sendNotification(notif) {
    if (!NotificationPrefs.enabled) return;

    // Ajouter a l'historique
    NotificationQueue.history.unshift(notif);
    if (NotificationQueue.history.length > 50) {
        NotificationQueue.history.pop();
    }
    saveNotificationQueue();

    // Afficher dans l'app
    showNotificationBanner(notif);

    // Vibration legere si supporte
    if (navigator.vibrate) {
        navigator.vibrate(200);
    }

    // Marquer comme notifie
    markNotified(notif.distributorId);

    // Ajouter au feed d'activite
    addActivityItem('notification', notif.distributorId, {
        subtype: notif.type,
        message: notif.message
    });
}

// Afficher banner de notification
function showNotificationBanner(notif) {
    const typeInfo = NOTIFICATION_TYPES[notif.type] || NOTIFICATION_TYPES.proximity;

    const banner = document.createElement('div');
    banner.className = 'notification-banner';
    banner.innerHTML = `
        <span class="notif-icon">${typeInfo.icon}</span>
        <div class="notif-content">
            <strong>${typeInfo.title}</strong>
            <p>${escapeHTML(notif.message)}</p>
        </div>
        <button class="notif-action" onclick="openConversation('${notif.distributorId}'); this.closest('.notification-banner').remove();">
            Voir
        </button>
        <button class="notif-close" onclick="this.closest('.notification-banner').remove();">&times;</button>
    `;

    document.body.appendChild(banner);

    // Animation entree
    setTimeout(() => banner.classList.add('show'), 10);

    // Auto-disparition apres 5s
    setTimeout(() => {
        if (banner.parentNode) {
            banner.classList.remove('show');
            setTimeout(() => {
                if (banner.parentNode) banner.remove();
            }, 300);
        }
    }, 5000);
}

// Ouvrir les parametres de notifications
function openNotificationSettings() {
    const settingsView = document.getElementById('notification-settings');
    if (!settingsView) return;

    // Remplir les valeurs actuelles
    document.getElementById('notif-enabled').checked = NotificationPrefs.enabled;
    document.getElementById('quiet-hours-enabled').checked = NotificationPrefs.quietHours.enabled;
    document.getElementById('quiet-start').value = `${String(NotificationPrefs.quietHours.start).padStart(2, '0')}:00`;
    document.getElementById('quiet-end').value = `${String(NotificationPrefs.quietHours.end).padStart(2, '0')}:00`;
    document.getElementById('geofence-enabled').checked = NotificationPrefs.geofence.enabled;
    document.getElementById('geofence-radius').value = NotificationPrefs.geofence.radius;
    document.getElementById('radius-value').textContent = `${NotificationPrefs.geofence.radius / 1000} km`;

    // Mettre a jour la liste des produits suivis
    updateFollowedProductsList();

    // Afficher la vue
    switchView('notification-settings');
}

// Sauvegarder les parametres depuis l'UI
function saveNotificationSettingsFromUI() {
    NotificationPrefs.enabled = document.getElementById('notif-enabled').checked;
    NotificationPrefs.quietHours.enabled = document.getElementById('quiet-hours-enabled').checked;

    const startTime = document.getElementById('quiet-start').value;
    const endTime = document.getElementById('quiet-end').value;
    NotificationPrefs.quietHours.start = parseInt(startTime.split(':')[0]);
    NotificationPrefs.quietHours.end = parseInt(endTime.split(':')[0]);

    NotificationPrefs.geofence.enabled = document.getElementById('geofence-enabled').checked;
    NotificationPrefs.geofence.radius = parseInt(document.getElementById('geofence-radius').value);

    saveNotificationPrefs();
    showToast('Parametres sauvegardes', 'success');
}

// Mettre a jour l'affichage du rayon
function updateRadiusDisplay() {
    const value = document.getElementById('geofence-radius').value;
    document.getElementById('radius-value').textContent = `${value / 1000} km`;
}

// Ajouter un produit a suivre via prompt
function promptAddProductFollow() {
    const product = prompt('Quel produit veux-tu suivre ?');
    if (product && product.trim()) {
        followProduct(product.trim());
    }
}

// ============================================
// INITIALISATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('SnackMatch V7.0 - Smart Notifications Edition - Initialisation...');

    // Charger les donnees
    loadFromLocalStorage();
    loadProfile();
    loadConversations();
    loadActivityFeed();
    loadNotificationPrefs();
    loadNotificationQueue();

    // Obtenir la geolocalisation
    await getUserLocation();

    // Charger les distributeurs
    await loadDistributors();

    // Initialiser la carte
    initMainMap();

    // Initialiser les filtres
    initFilterChips();

    // Mettre a jour les compteurs de messages non lus
    updateUnreadCounts();

    // Mettre a jour la liste des conversations
    updateConversationsList();

    // Generer les messages proactifs pour les abonnements
    if (AppState.subscriptions.length > 0) {
        setTimeout(() => {
            generateProactiveMessages();
        }, 2000); // Attendre 2s pour que tout soit charge
    }

    // Demarrer la surveillance geofence
    startGeofenceMonitoring();

    // Traiter les notifications en attente (si fin heures calmes)
    processQueuedNotifications();

    // Mettre a jour le badge des conversations
    updateConversationsBadge();

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
    document.getElementById('back-from-subscriptions')?.addEventListener('click', goBackToMap);
    document.getElementById('back-from-profile')?.addEventListener('click', goBackToMap);
    document.getElementById('back-from-activity')?.addEventListener('click', goBackToMap);
    document.getElementById('back-from-notif-settings')?.addEventListener('click', () => switchView('profile'));

    // Bouton parametres notifications depuis profil
    document.getElementById('notification-settings-btn')?.addEventListener('click', openNotificationSettings);

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
    document.getElementById('chat-subscribe').addEventListener('click', toggleChatSubscription);
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
    document.getElementById('btn-subscribe').addEventListener('click', toggleSubscriptionFromModal);
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

    console.log('SnackMatch V7.0 - Pret !');
});
