/**
 * DistriMatch V8.0 - Supabase Edition
 * Point d'entree ES modules
 */

import {
    AppState, Conversations, UserProfile, NotificationPrefs, NotificationQueue,
    EMBEDDED_DATA, SUPABASE_URL, SUPABASE_ANON_KEY,
    STORAGE_KEY, PROFILE_KEY, CONVERSATIONS_KEY,
    NOTIFICATION_PREFS_KEY, NOTIFICATION_QUEUE_KEY,
    supabaseClient, setSupabaseClient
} from './state.js';

import {
    escapeHTML, showToast, calculateDistance,
    getUserLocation, sortByDistance,
    saveToLocalStorage, loadFromLocalStorage,
    saveProfile, loadProfile,
    saveConversations, loadConversations,
    saveNotificationPrefs, loadNotificationPrefs,
    saveNotificationQueue, loadNotificationQueue,
    loadUserDistributors, saveUserDistributor
} from './utils.js';

import { initMainMap, updateMapMarkers, centerMapOnUser, zoomIn, zoomOut } from './map.js';

import {
    switchView, switchTab, goBackToMap,
    hideAllViews, registerViewCallback,
    updateBadges, updateConversationsBadge,
    toggleSidebar, closeSidebar,
    openSearch, closeSearch, performSearch,
    initFilterChips, updateProfileStats
} from './navigation.js';

import {
    renderProductsList,
    toggleAddProductForm, submitDetailProduct,
    editProduct, saveProduct, toggleProductAvailability, deleteProduct,
    toggleSubscription, displaySubscriptions
} from './distributor.js';

import {
    openConversation, closeChatModal, handleChatInput,
    updateConversationsList, updateUnreadCounts,
    toggleChatSubscription, openReportFromChat,
    generateProactiveMessages
} from './chat.js';

import {
    loadActivityFeed, displayActivityFeed,
    updateActivityBadge, setActivityFilter,
    voteOnReport, loadReportsFromSupabase,
    openReportModal, selectReportType, submitReport
} from './activity.js';

import {
    startGeofenceMonitoring, processQueuedNotifications,
    openNotificationSettings, saveNotificationSettingsFromUI,
    updateRadiusDisplay, promptAddProductFollow,
    unfollowProduct
} from './notifications.js';

import {
    toggleAddMode, cancelAddDistributor, confirmAddDistributor,
    addProductRow, removeProductRow,
    previewAddPhotos, removeAddPhoto
} from './add-distributor.js';

import { initSidePanel, openSidePanelForType, closeSidePanel, initDistModal, openDistributorModal, closeDistModal, toggleDistAddProductForm, submitDistAddProduct } from './gmaps-ui.js';

import { initAuth, getCurrentUser, isAuthenticated, requireAuth, signOut, onAuthChange } from './auth.js';

// ============================================
// SUPABASE
// ============================================

function initSupabase() {
    try {
        if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
            setSupabaseClient(window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
            console.log('[DistriMatch] Supabase initialise');
            return true;
        }
    } catch (e) {
        console.warn('[DistriMatch] Supabase non disponible:', e.message);
    }
    setSupabaseClient(null);
    console.log('[DistriMatch] Mode hors-ligne (pas de Supabase)');
    return false;
}

async function signInAnonymously() {
    if (!supabaseClient) return null;
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            console.log('[DistriMatch] Session existante');
            return session.user;
        }
        const { data, error } = await supabaseClient.auth.signInAnonymously();
        if (error) throw error;
        console.log('[DistriMatch] Connexion anonyme OK');
        return data.user;
    } catch (e) {
        console.warn('[DistriMatch] Auth anonyme echouee:', e.message);
        return null;
    }
}

// ============================================
// CHARGEMENT DONNEES
// ============================================

async function loadDistributorsFromSupabase() {
    if (!supabaseClient) return null;
    try {
        const { data, error } = await supabaseClient
            .from('distributors')
            .select('*, products(name, price, available)');
        if (error) throw error;
        if (!data || data.length === 0) return null;

        return data.map(d => ({
            id: d.id,
            name: d.name,
            type: d.type,
            emoji: d.emoji,
            address: d.address,
            city: d.city,
            lat: d.lat,
            lng: d.lng,
            rating: parseFloat(d.rating) || 0,
            reviewCount: d.review_count || 0,
            status: d.status || 'verified',
            lastVerified: d.last_verified,
            priceRange: d.price_range,
            isUserAdded: d.is_user_added || false,
            products: (d.products || []).map(p => ({
                name: p.name,
                price: parseFloat(p.price) || 0,
                available: p.available
            }))
        }));
    } catch (e) {
        console.warn('[DistriMatch] Erreur chargement Supabase:', e.message);
        return null;
    }
}

async function loadDistributors() {
    const supabaseData = await loadDistributorsFromSupabase();
    if (supabaseData) {
        AppState.distributors = supabaseData;
        AppState.typeConfig = EMBEDDED_DATA.typeConfig;
        console.log('[DistriMatch] Donnees chargees via Supabase:', AppState.distributors.length, 'distributeurs');
    } else {
        try {
            const response = await fetch('data/distributors.json');
            if (!response.ok) throw new Error('Fetch failed');
            const data = await response.json();
            AppState.distributors = data.distributors;
            AppState.typeConfig = data.typeConfig;
            console.log('[DistriMatch] Donnees chargees via fetch:', AppState.distributors.length, 'distributeurs');
        } catch (error) {
            console.log('[DistriMatch] Mode fichier local - utilisation des donnees embarquees');
            AppState.distributors = EMBEDDED_DATA.distributors;
            AppState.typeConfig = EMBEDDED_DATA.typeConfig;
            console.log('[DistriMatch] Donnees embarquees:', AppState.distributors.length, 'distributeurs');
        }
    }

    const userDistributors = loadUserDistributors();
    if (userDistributors.length > 0) {
        AppState.distributors = [...AppState.distributors, ...userDistributors];
        console.log('[DistriMatch] Distributeurs utilisateur:', userDistributors.length);
    }

    if (AppState.userLocation) {
        sortByDistance();
    }
}

// ============================================
// CLEAR DATA
// ============================================

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
// ENREGISTREMENT CALLBACKS NAVIGATION
// ============================================

registerViewCallback('subscriptions', displaySubscriptions);
registerViewCallback('favorites', displaySubscriptions);
registerViewCallback('profile', updateProfileStats);
registerViewCallback('activity', displayActivityFeed);

// ============================================
// WINDOW GLOBALS (pour onclick inline)
// ============================================

// Carte popups — showDetails redirige vers le bottom sheet
window.showDetails = openDistributorModal;
window.openDistributorModal = openDistributorModal;
window.toggleDistAddProductForm = toggleDistAddProductForm;
window.submitDistAddProduct = submitDistAddProduct;
window.openConversation = openConversation;

// Page distributeur
window.toggleProductAvailability = toggleProductAvailability;
window.editProduct = editProduct;
window.saveProduct = saveProduct;
window.deleteProduct = deleteProduct;
window.renderProductsList = renderProductsList;
window.toggleAddProductForm = toggleAddProductForm;
window.submitDetailProduct = submitDetailProduct;

// Abonnements
window.toggleSubscription = toggleSubscription;
window.goBackToMap = goBackToMap;

// Activite
window.voteOnReport = voteOnReport;

// Navigation
window.closeSearch = closeSearch;
window.switchView = switchView;

// Notifications
window.updateRadiusDisplay = updateRadiusDisplay;
window.promptAddProductFollow = promptAddProductFollow;
window.saveNotificationSettingsFromUI = saveNotificationSettingsFromUI;
window.unfollowProduct = unfollowProduct;

// Ajout distributeur
window.addProductRow = addProductRow;
window.removeProductRow = removeProductRow;
window.previewAddPhotos = previewAddPhotos;
window.removeAddPhoto = removeAddPhoto;
window.cancelAddDistributor = cancelAddDistributor;
window.confirmAddDistributor = confirmAddDistributor;

// Etat global (pour onclick inline dans editProduct)
window.AppState = AppState;

// Auth (pour debug)
window.requireAuth = requireAuth;
window.getCurrentUser = getCurrentUser;
window.isAuthenticated = isAuthenticated;
window.signOut = signOut;

// ============================================
// GEOLOCALISATION OVERLAY
// ============================================

function initGeolocationOverlay() {
    return new Promise((resolve) => {
        const overlay = document.getElementById('geoloc-overlay');
        const btn = document.getElementById('geoloc-btn');
        const errorEl = document.getElementById('geoloc-error');

        if (!overlay || !btn) {
            getUserLocation().catch(() => {}).finally(resolve);
            return;
        }

        btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.innerHTML = '<span class="geoloc-spinner"></span> Localisation...';
            errorEl.style.display = 'none';

            try {
                await getUserLocation();
                overlay.classList.add('hidden');
                overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
                resolve();
            } catch (err) {
                let message = 'Impossible d\'obtenir ta position.';
                let helpHtml = '';
                if (err.code === 1) {
                    // PERMISSION_DENIED : instructions adaptees mobile/desktop
                    const isMobile = /Mobi|Android|iPhone/i.test(navigator.userAgent);
                    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
                    message = 'Geolocalisation refusee';
                    if (isIOS) {
                        helpHtml = `
                            <strong>Comment reactiver sur iPhone :</strong>
                            <ol style="margin: 0.5rem 0 0; padding-left: 1.25rem; text-align: left;">
                                <li>Ouvre <em>Reglages</em> > <em>Safari</em> > <em>Localisation</em></li>
                                <li>Choisis <em>Demander</em> ou <em>Autoriser</em></li>
                                <li>Reviens sur cette page et reessaie</li>
                            </ol>
                        `;
                    } else if (isMobile) {
                        helpHtml = `
                            <strong>Comment reactiver sur Android :</strong>
                            <ol style="margin: 0.5rem 0 0; padding-left: 1.25rem; text-align: left;">
                                <li>Touche l'icone cadenas a gauche de l'URL</li>
                                <li>Permissions > Localisation > Autoriser</li>
                                <li>Recharge la page</li>
                            </ol>
                        `;
                    } else {
                        helpHtml = `
                            <strong>Comment reactiver :</strong>
                            <ol style="margin: 0.5rem 0 0; padding-left: 1.25rem; text-align: left;">
                                <li>Clique sur l'icone cadenas a gauche de l'URL</li>
                                <li>Reglages du site > Localisation > Autoriser</li>
                                <li>Recharge la page</li>
                            </ol>
                        `;
                    }
                } else if (err.code === 2) {
                    message = 'Position indisponible. Verifie que le GPS de ton appareil est active.';
                } else if (err.code === 3) {
                    message = 'Delai depasse. Verifie ta connexion et reessaie.';
                }
                errorEl.innerHTML = `<strong>${message}</strong>${helpHtml ? '<br>' + helpHtml : ''}`;
                errorEl.style.display = 'block';
                btn.disabled = false;
                btn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="3 11 22 2 13 21 11 13 3 11"/>
                    </svg>
                    Reessayer`;
            }
        });
    });
}

// ============================================
// INITIALISATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DistriMatch V8.0 - Supabase Edition - Initialisation...');

    // Initialiser Supabase
    initSupabase();
    await signInAnonymously();
    await initAuth();

    // Charger les donnees locales
    loadFromLocalStorage(updateBadges);
    loadProfile();
    loadConversations();
    loadActivityFeed();
    loadNotificationPrefs();
    loadNotificationQueue();

    // Attendre la geolocalisation via l'overlay
    await initGeolocationOverlay();

    // Charger les distributeurs (Supabase > fetch JSON > embarque)
    await loadDistributors();

    // Charger les signalements communautaires depuis Supabase
    await loadReportsFromSupabase();

    // Initialiser la carte
    initMainMap();

    // Initialiser le bottom sheet
    initSidePanel();
    initDistModal();

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
        }, 2000);
    }

    // Demarrer la surveillance geofence
    startGeofenceMonitoring();

    // Traiter les notifications en attente
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

    // Indicateur auth + bouton logout
    const updateAuthUI = (user) => {
        const indicator = document.getElementById('auth-indicator');
        const text = document.getElementById('auth-indicator-text');
        const logoutBtn = document.getElementById('logout-btn');
        if (!indicator || !text) return;
        if (user && !user.is_anonymous) {
            indicator.classList.add('logged-in');
            text.textContent = user.email;
            logoutBtn.style.display = 'inline-flex';
        } else {
            indicator.classList.remove('logged-in');
            text.textContent = 'Non connecte';
            logoutBtn.style.display = 'none';
        }
    };
    updateAuthUI(getCurrentUser());
    onAuthChange(updateAuthUI);
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        await signOut();
    });

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

    // Boutons zoom +/-
    document.getElementById('btn-zoom-in')?.addEventListener('click', zoomIn);
    document.getElementById('btn-zoom-out')?.addEventListener('click', zoomOut);

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

    // Modal signalement (close + submit)
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
            closeSearch();
            closeChatModal();
            closeSidebar();
            document.getElementById('report-modal').classList.remove('active');
            switchTab('explore');
        }
    });

    console.log('DistriMatch V8.0 - Pret !');
});
