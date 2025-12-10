// ==========================================
// SNACKMATCH V3.0 - CONFIGURATION
// ==========================================

const DISTRIBUTOR_VISUALS = {
    pizza: { emoji: '🍕', gradient: 'linear-gradient(135deg, #ff6b6b 0%, #feca57 100%)', label: 'Pizza fraîche' },
    bakery: { emoji: '🥖', gradient: 'linear-gradient(135deg, #f4a261 0%, #e76f51 100%)', label: 'Boulangerie & Taloa' },
    fries: { emoji: '🍟', gradient: 'linear-gradient(135deg, #ffd166 0%, #ef476f 100%)', label: 'Frites fraîches' },
    meals: { emoji: '🍽️', gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', label: 'Plats cuisinés' },
    cheese: { emoji: '🧀', gradient: 'linear-gradient(135deg, #ffb703 0%, #fb8500 100%)', label: 'Fromage fermier' },
    dairy: { emoji: '🥛', gradient: 'linear-gradient(135deg, #e0f2fe 0%, #93c5fd 100%)', label: 'Produits laitiers' },
    agricultural: { emoji: '🥕', gradient: 'linear-gradient(135deg, #26de81 0%, #20bf6b 100%)', label: 'Produits agricoles' },
    meat: { emoji: '🥩', gradient: 'linear-gradient(135deg, #e63946 0%, #a4161a 100%)', label: 'Viande & Charcuterie' },
    terroir: { emoji: '🍯', gradient: 'linear-gradient(135deg, #ffb703 0%, #fb8500 100%)', label: 'Terroir local' },
    general: { emoji: '🏪', gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', label: 'Distributeur mixte' },
    // Missing types from getDistributorType()
    coffee: { emoji: '☕', gradient: 'linear-gradient(135deg, #6f4e37 0%, #a0522d 100%)', label: 'Café & Boissons chaudes' },
    healthy: { emoji: '🥗', gradient: 'linear-gradient(135deg, #52c234 0%, #4caf50 100%)', label: 'Produits sains' },
    snacks: { emoji: '🍿', gradient: 'linear-gradient(135deg, #ffc107 0%, #ff9800 100%)', label: 'Snacks & Encas' },
    sweet: { emoji: '🍰', gradient: 'linear-gradient(135deg, #ec407a 0%, #f06292 100%)', label: 'Pâtisseries & Douceurs' },
    drinks: { emoji: '🥤', gradient: 'linear-gradient(135deg, #42a5f5 0%, #1e88e5 100%)', label: 'Boissons fraîches' }
};

// NEW UNIFIED SYSTEM - Maps product categories (French names) to visuals
// This ensures consistency between category tags and visual representation
const CATEGORY_VISUALS = {
    "Boissons chaudes": { emoji: '☕', gradient: 'linear-gradient(135deg, #6f4e37 0%, #a0522d 100%)', label: 'Café & Boissons chaudes' },
    "Pâtisseries": { emoji: '🍰', gradient: 'linear-gradient(135deg, #ec407a 0%, #f06292 100%)', label: 'Pâtisseries & Douceurs' },
    "Boissons": { emoji: '🥤', gradient: 'linear-gradient(135deg, #42a5f5 0%, #1e88e5 100%)', label: 'Boissons fraîches' },
    "Repas": { emoji: '🍽️', gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', label: 'Plats & Repas' },
    "Snacks": { emoji: '🍿', gradient: 'linear-gradient(135deg, #ffc107 0%, #ff9800 100%)', label: 'Snacks & Encas' },
    "Healthy": { emoji: '🥗', gradient: 'linear-gradient(135deg, #52c234 0%, #4caf50 100%)', label: 'Produits sains' },
    "default": { emoji: '🏪', gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', label: 'Distributeur' }
};

const REPORT_TYPES = {
    OUT_OF_STOCK: { id: 'out_of_stock', label: 'Rupture de stock', icon: '❌', points: 10 },
    MACHINE_DOWN: { id: 'machine_down', label: 'Machine en panne', icon: '⚠️', points: 15 },
    PRICE_CHANGE: { id: 'price_change', label: 'Prix modifié', icon: '💰', points: 10 },
    NEW_PRODUCT: { id: 'new_product', label: 'Nouveau produit', icon: '✨', points: 15 },
    CLOSED: { id: 'closed', label: 'Distributeur fermé', icon: '🔒', points: 10 },
    VERIFIED: { id: 'verified', label: 'Disponibilité vérifiée', icon: '✅', points: 5 }
};

// Noms par défaut selon le type de distributeur
const defaultNamesByType = {
    pizza: "Distributeur Pizza",
    bakery: "Distributeur Pain & Taloa",
    fries: "Distributeur Frites",
    meals: "Distributeur Plats Cuisinés",
    cheese: "Distributeur Fromages",
    dairy: "Distributeur Laitier",
    agricultural: "Distributeur Produits Fermiers",
    meat: "Distributeur Viande & Charcuterie",
    terroir: "Distributeur Terroir",
    general: "Distributeur Automatique"
};

// Gammes de prix par type de distributeur (style TripAdvisor)
const priceRangesByType = {
    pizza: { symbol: "€€", range: "10-15€", level: 2 },
    bakery: { symbol: "€", range: "1-3€", level: 1 },
    fries: { symbol: "€", range: "3-5€", level: 1 },
    meals: { symbol: "€€", range: "8-12€", level: 2 },
    cheese: { symbol: "€€", range: "5-15€", level: 2 },
    dairy: { symbol: "€", range: "2-5€", level: 1 },
    agricultural: { symbol: "€", range: "2-8€", level: 1 },
    meat: { symbol: "€€€", range: "10-25€", level: 3 },
    terroir: { symbol: "€€", range: "5-20€", level: 2 },
    general: { symbol: "€-€€", range: "1-15€", level: 1.5 }
};

// Produits par défaut par type (ajoutés automatiquement)
const defaultProductsByType = {
    pizza: [
        { name: "Pizza Margherita", category: "Pizza classique" },
        { name: "Pizza 4 fromages", category: "Pizza" },
        { name: "Pizza végétarienne", category: "Pizza" }
    ],
    bakery: [
        { name: "Pain de campagne", category: "Boulangerie" },
        { name: "Taloa", category: "Spécialité basque" },
        { name: "Croissant", category: "Viennoiserie" }
    ],
    fries: [
        { name: "Frites fraîches", category: "Frites" },
        { name: "Frites belges", category: "Frites spéciales" }
    ],
    meals: [
        { name: "Plat du jour", category: "Plats cuisinés" },
        { name: "Salade composée", category: "Salades" },
        { name: "Sandwich chaud", category: "Sandwichs" }
    ],
    cheese: [
        { name: "Fromage de brebis", category: "Fromage" },
        { name: "Tomme basque", category: "Fromage local" },
        { name: "Ossau-Iraty", category: "Fromage AOP" }
    ],
    dairy: [
        { name: "Yaourt fermier", category: "Produits laitiers" },
        { name: "Lait frais", category: "Lait" },
        { name: "Fromage blanc", category: "Produits laitiers" }
    ],
    agricultural: [
        { name: "Légumes de saison", category: "Légumes" },
        { name: "Fruits locaux", category: "Fruits" },
        { name: "Œufs frais", category: "Produits fermiers" }
    ],
    meat: [
        { name: "Charcuterie artisanale", category: "Charcuterie" },
        { name: "Viande locale", category: "Viande" },
        { name: "Jambon de Bayonne", category: "Spécialité" }
    ],
    terroir: [
        { name: "Produits du terroir", category: "Spécialités locales" },
        { name: "Confiture artisanale", category: "Conserves" },
        { name: "Miel local", category: "Produits de la ruche" }
    ],
    general: [
        { name: "Produits variés", category: "Divers" },
        { name: "Snacks", category: "Snacking" }
    ]
};
