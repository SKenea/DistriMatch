/**
 * DistriMatch - Utilitaires et persistance
 */

import {
    AppState, Conversations, UserProfile, NotificationPrefs, NotificationQueue,
    STORAGE_KEY, PROFILE_KEY, CONVERSATIONS_KEY,
    USER_DISTRIBUTORS_KEY, NOTIFICATION_PREFS_KEY, NOTIFICATION_QUEUE_KEY
} from './state.js';

// ============================================
// UTILITAIRES
// ============================================

export function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export function formatDistance(km) {
    if (km < 1) return `${Math.round(km * 1000)}m`;
    return `${km.toFixed(1)}km`;
}

export function generateStars(rating) {
    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 >= 0.5;
    let stars = '';
    for (let i = 0; i < fullStars; i++) stars += '★';
    if (halfStar) stars += '½';
    for (let i = stars.length; i < 5; i++) stars += '☆';
    return stars;
}

export function showToast(message, type = 'default') {
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

export function getTimeSlot() {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 11) return 'morning';
    if (hour >= 11 && hour < 14) return 'lunch';
    if (hour >= 14 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 22) return 'evening';
    return 'night';
}

export function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'maintenant';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}min`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function getFilteredDistributors() {
    if (AppState.activeFilters.length === 0) {
        return AppState.distributors;
    }
    return AppState.distributors.filter(d => AppState.activeFilters.includes(d.type));
}

// ============================================
// PERSISTANCE GENERIQUE
// ============================================

export function saveStore(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.error(`Erreur sauvegarde ${key}:`, e);
    }
}

export function loadStore(key) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    } catch (e) {
        console.error(`Erreur chargement ${key}:`, e);
        return null;
    }
}

// ============================================
// PERSISTANCE DOMAINE
// ============================================

export function saveToLocalStorage() {
    saveStore(STORAGE_KEY, {
        subscriptions: AppState.subscriptions,
        reports: AppState.reports,
        points: AppState.points,
        lastUpdated: new Date().toISOString()
    });
}

export function loadFromLocalStorage(updateBadgesFn) {
    const parsed = loadStore(STORAGE_KEY);
    if (parsed) {
        if (parsed.favorites && !parsed.subscriptions) {
            parsed.subscriptions = parsed.favorites;
        }
        AppState.subscriptions = parsed.subscriptions || [];
        AppState.reports = parsed.reports || 0;
        AppState.points = parsed.points || 0;
        if (updateBadgesFn) updateBadgesFn();
    }
}

export function saveProfile() { saveStore(PROFILE_KEY, UserProfile); }

export function loadProfile() {
    const parsed = loadStore(PROFILE_KEY);
    if (parsed) Object.assign(UserProfile, parsed);
}

export function saveConversations() {
    saveStore(CONVERSATIONS_KEY, {
        list: Conversations.list,
        history: Conversations.history,
        unreadCounts: Conversations.unreadCounts
    });
}

export function loadConversations() {
    const parsed = loadStore(CONVERSATIONS_KEY);
    if (parsed) {
        Conversations.list = parsed.list || [];
        Conversations.history = parsed.history || {};
        Conversations.unreadCounts = parsed.unreadCounts || {};
    }
}

export function saveNotificationPrefs() { saveStore(NOTIFICATION_PREFS_KEY, NotificationPrefs); }

export function loadNotificationPrefs() {
    const parsed = loadStore(NOTIFICATION_PREFS_KEY);
    if (parsed) Object.assign(NotificationPrefs, parsed);
}

export function saveNotificationQueue() { saveStore(NOTIFICATION_QUEUE_KEY, NotificationQueue); }

export function loadNotificationQueue() {
    const parsed = loadStore(NOTIFICATION_QUEUE_KEY);
    if (parsed) {
        NotificationQueue.pending = parsed.pending || [];
        NotificationQueue.history = parsed.history || [];
    }
}

export function loadUserDistributors() {
    try {
        return JSON.parse(localStorage.getItem(USER_DISTRIBUTORS_KEY)) || [];
    } catch (e) {
        console.error('Erreur chargement distributeurs utilisateur:', e);
        return [];
    }
}

export function saveUserDistributor(distributor) {
    // Upsert par id : evite les doublons en localStorage si la fonction est
    // appelee 2 fois pour le meme distributeur (double soumission, retry,
    // re-ajout). On remplace l'entree existante plutot que d'empiler.
    const existing = loadUserDistributors().filter((d) => d.id !== distributor.id);
    existing.push(distributor);
    try {
        localStorage.setItem(USER_DISTRIBUTORS_KEY, JSON.stringify(existing));
    } catch (e) {
        console.error('Erreur sauvegarde distributeur:', e);
    }
}

export function sortByDistance() {
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
// PROFIL IMPLICITE
// ============================================

export function updateImplicitProfile(action, data) {
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

export function getTopPreferredTypes(limit = 3) {
    const types = UserProfile.preferences.types;
    return Object.entries(types)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([type]) => type);
}

// ============================================
// GEOLOCALISATION
// ============================================

export function getUserLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocalisation non supportee'));
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
            (error) => reject(error),
            { enableHighAccuracy: true, timeout: 10000 }
        );
    });
}
