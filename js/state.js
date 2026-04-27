/**
 * DistriMatch - Etat global et constantes
 */

export const AppState = {
    distributors: [],
    subscriptions: [],
    userLocation: null,
    currentDistributor: null,
    typeConfig: {},
    reports: 0,
    points: 0,
    mapInitialized: false,
    sidebarOpen: false,
    activeFilters: []
};

export const Conversations = {
    active: null,
    history: {},
    list: [],
    unreadCounts: {}
};

export const ActivityFeed = {
    items: [],
    filter: 'all'
};

export const UserProfile = {
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

export const NotificationPrefs = {
    enabled: true,
    quietHours: { enabled: true, start: 22, end: 8 },
    geofence: { enabled: true, radius: 1000 },
    perDistributor: {},
    followedProducts: [],
    lastNotifications: {}
};

export const NotificationQueue = {
    pending: [],
    history: []
};

export const AddMode = {
    active: false,
    marker: null,
    lat: null,
    lng: null,
    photos: null
};

// Variables carte
export let mainMap = null;
export let distributorMarkers = [];
export let userMarker = null;
export let selectedReportType = null;
export let addProductCounter = 0;

export function setMainMap(map) { mainMap = map; }
export function setDistributorMarkers(markers) { distributorMarkers = markers; }
export function setUserMarker(marker) { userMarker = marker; }
export function setSelectedReportType(type) { selectedReportType = type; }
export function incrementAddProductCounter() { return addProductCounter++; }

// Constantes
export const DISTRIBUTOR_TYPES = [
    { id: 'pizza', emoji: '🍕', name: 'Pizza' },
    { id: 'bakery', emoji: '🥖', name: 'Boulangerie' },
    { id: 'fries', emoji: '🍟', name: 'Frites' },
    { id: 'meals', emoji: '🍽️', name: 'Plats cuisines' },
    { id: 'cheese', emoji: '🧀', name: 'Fromage' },
    { id: 'dairy', emoji: '🥛', name: 'Produits laitiers' },
    { id: 'meat', emoji: '🥩', name: 'Viande' },
    { id: 'terroir', emoji: '🍯', name: 'Terroir' },
    { id: 'ice', emoji: '🧊', name: 'Glacons' },
    { id: 'general', emoji: '🏪', name: 'Mixte' },
    { id: 'other', emoji: '📦', name: 'Autre' }
];

export const STORAGE_KEY = 'snackmatch_user';
export const PROFILE_KEY = 'snackmatch_profile';
export const CONVERSATIONS_KEY = 'snackmatch_conversations';
export const ACTIVITY_KEY = 'snackmatch_activity';
export const VOTES_KEY = 'snackmatch_votes';
export const USER_DISTRIBUTORS_KEY = 'snackmatch_user_distributors';
export const NOTIFICATION_PREFS_KEY = 'snackmatch_notification_prefs';
export const NOTIFICATION_QUEUE_KEY = 'snackmatch_notification_queue';

// Cles deplacees dans js/config.js — re-exportees pour retrocompatibilite
export { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export let supabaseClient = null;
export function setSupabaseClient(client) { supabaseClient = client; }

export const NOTIFICATION_TYPES = {
    proximity: { icon: '📍', title: 'Tu es proche !', template: '{name} est a {distance}m de toi' },
    stock: { icon: '📦', title: 'Produit disponible !', template: '{product} est dispo chez {name}' },
    promo: { icon: '🎉', title: 'Promo !', template: 'Offre speciale chez {name}' }
};

export const GREETING_MESSAGES = {
    morning: ["Bonjour ! Envie d'un petit-dejeuner ?", "Hello ! Je suis ouvert, passe me voir !", "Bien dormi ? Un cafe et une viennoiserie ?", "Salut ! Commence bien ta journee avec moi !"],
    lunch: ["C'est l'heure du dejeuner ! J'ai ce qu'il te faut.", "Pause dejeuner ? Viens faire le plein !", "Tu as faim ? Je t'attends !", "Hey ! Parfait pour un bon repas de midi."],
    afternoon: ["Un petit gouter ? Je suis la !", "Envie d'un snack ? Passe me voir !", "Petit creux de l'apres-midi ?"],
    evening: ["Bonsoir ! Une petite faim en rentrant ?", "Hey ! Parfait pour un snack du soir.", "Tu passes ce soir ? J'ai des nouveautes !"],
    night: ["Envie d'un encas nocturne ? Je suis 24h/24 !", "Fringale de minuit ? Je suis la !", "Nuit blanche ? J'ai de quoi te sustenter !"]
};

export const ALERT_MESSAGES = {
    stock_back: ["Bonne nouvelle ! {product} est de retour en stock !", "Tu attendais {product} ? C'est dispo maintenant !", "Alerte restock : {product} est la !"],
    price_drop: ["Promo flash ! {product} a {newPrice} EUR au lieu de {oldPrice} EUR", "Prix reduit sur {product} ! Profites-en vite.", "Offre speciale : {product} en promo !"],
    new_product: ["Nouveau ! Decouvre {product} a {price} EUR", "J'ai une nouveaute pour toi : {product}", "Exclusivite : {product} vient d'arriver !"]
};

export const EMBEDDED_DATA = {
    distributors: [
        { id: "dist-001", name: "Pizza Express Biarritz", type: "pizza", emoji: "🍕", address: "12 Avenue de la Grande Plage, 64200 Biarritz", city: "Biarritz", lat: 43.4832, lng: -1.5586, rating: 4.5, reviewCount: 127, status: "verified", priceRange: "€€", products: [{ name: "Pizza Margherita", price: 8.50, available: true }, { name: "Pizza 4 Fromages", price: 10.00, available: true }, { name: "Pizza Basque", price: 11.00, available: true }, { name: "Pizza Vegetarienne", price: 9.50, available: false }] },
        { id: "dist-002", name: "Le Taloa du Fronton", type: "bakery", emoji: "🥖", address: "Place du Fronton, 64250 Espelette", city: "Espelette", lat: 43.3411, lng: -1.4486, rating: 4.8, reviewCount: 89, status: "verified", priceRange: "€", products: [{ name: "Taloa nature", price: 2.50, available: true }, { name: "Taloa jambon-fromage", price: 4.50, available: true }, { name: "Gateau Basque", price: 3.50, available: true }] },
        { id: "dist-003", name: "Frites Fraiches Anglet", type: "fries", emoji: "🍟", address: "Centre Commercial BAB2, 64600 Anglet", city: "Anglet", lat: 43.4784, lng: -1.5147, rating: 4.2, reviewCount: 56, status: "verified", priceRange: "€", products: [{ name: "Cornet de frites", price: 3.50, available: true }, { name: "Grande barquette", price: 5.00, available: true }, { name: "Frites sauce fromage", price: 5.50, available: true }, { name: "Frites piment d'Espelette", price: 4.50, available: true }] },
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
        ice: { label: "Glacons", emoji: "🧊", gradient: "linear-gradient(135deg, #74b9ff 0%, #a8d8ea 100%)" },
        general: { label: "Distributeur mixte", gradient: "linear-gradient(135deg, #636e72 0%, #b2bec3 100%)" },
        other: { label: "Autre", emoji: "📦", gradient: "linear-gradient(135deg, #95a5a6 0%, #7f8c8d 100%)" }
    }
};
