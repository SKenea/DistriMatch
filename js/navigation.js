/**
 * DistriMatch - Navigation, sidebar, recherche, filtres, profil
 */

import { AppState, Conversations, mainMap } from './state.js';
import {
    escapeHTML, formatDistance, showToast, getFilteredDistributors,
    updateImplicitProfile, getTopPreferredTypes
} from './utils.js';
import { updateMapMarkers } from './map.js';

// ============================================
// NAVIGATION PAR VUES
// ============================================

const VIEW_CONFIG = {
    favorites:               { id: 'subscriptions-view',   onShow: null },
    subscriptions:           { id: 'subscriptions-view',   onShow: null },
    profile:                 { id: 'profile-view',         onShow: null },
    activity:                { id: 'activity-view',        onShow: null },
    'notification-settings': { id: 'notification-settings' }
};

export function registerViewCallback(viewName, callback) {
    if (VIEW_CONFIG[viewName]) VIEW_CONFIG[viewName].onShow = callback;
}

export function hideAllViews() {
    document.querySelectorAll('.view-page').forEach(v => {
        v.classList.remove('view-active');
        v.classList.add('view-hidden');
    });
}

export function switchView(viewName) {
    hideAllViews();
    const config = VIEW_CONFIG[viewName];
    if (!config) return;
    const el = document.getElementById(config.id);
    el.classList.remove('view-hidden');
    el.classList.add('view-active');
    if (config.onShow) config.onShow();
}

export function switchTab(tabName) {
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    if (tabName === 'explore') {
        hideAllViews();
        if (mainMap) setTimeout(() => mainMap.invalidateSize(), 100);
    } else {
        switchView(tabName);
    }
}

export function goBackToMap() {
    switchTab('explore');
}

// ============================================
// BADGES
// ============================================

export function updateBadges() {
    // Badge favoris dans la bottom nav
    const favoritesBadge = document.getElementById('favorites-badge');
    if (favoritesBadge) {
        if (AppState.subscriptions.length > 0) {
            favoritesBadge.textContent = AppState.subscriptions.length;
            favoritesBadge.style.display = 'flex';
        } else {
            favoritesBadge.style.display = 'none';
        }
    }

    // Legacy : badge abonnements dans la top nav (si present)
    const subscriptionsBadge = document.getElementById('subscriptions-badge');
    if (subscriptionsBadge) {
        if (AppState.subscriptions.length > 0) {
            subscriptionsBadge.textContent = AppState.subscriptions.length;
            subscriptionsBadge.style.display = 'flex';
        } else {
            subscriptionsBadge.style.display = 'none';
        }
    }

    updateConversationsBadge();
}

// ============================================
// CONVERSATIONS BADGE
// ============================================

export function getTotalUnreadCount() {
    return Object.values(Conversations.unreadCounts).reduce((sum, count) => sum + count, 0);
}

export function updateConversationsBadge() {
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

// ============================================
// SIDEBAR
// ============================================

export function toggleSidebar() {
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

export function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    AppState.sidebarOpen = false;
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
}

// ============================================
// RECHERCHE
// ============================================

export function openSearch() {
    document.getElementById('search-overlay').classList.add('active');
    document.getElementById('quick-search').focus();
}

export function closeSearch() {
    document.getElementById('search-overlay').classList.remove('active');
    document.getElementById('quick-search').value = '';
    document.getElementById('search-results').innerHTML = '';
}

export function performSearch(query) {
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
// FILTRES PAR TYPE
// ============================================

export function setFilter(type) {
    if (type === 'all') {
        AppState.activeFilters = [];
    } else {
        const index = AppState.activeFilters.indexOf(type);
        if (index === -1) {
            AppState.activeFilters.push(type);
        } else {
            AppState.activeFilters.splice(index, 1);
        }
    }

    document.querySelectorAll('.filter-chip').forEach(chip => {
        const chipType = chip.dataset.type;
        if (chipType === 'all') {
            chip.classList.toggle('active', AppState.activeFilters.length === 0);
        } else {
            chip.classList.toggle('active', AppState.activeFilters.includes(chipType));
        }
    });

    updateMapMarkers(false);

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

export function initFilterChips() {
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            setFilter(chip.dataset.type);
        });
    });
}

// ============================================
// PROFIL
// ============================================

export function updateProfileStats() {
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
