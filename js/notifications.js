/**
 * DistriMatch - Notifications intelligentes et geofencing
 */

import { AppState, NotificationPrefs, NotificationQueue, NOTIFICATION_TYPES } from './state.js';
import {
    calculateDistance, escapeHTML, showToast,
    saveNotificationPrefs, saveNotificationQueue
} from './utils.js';
import { switchView } from './navigation.js';
import { addActivityItem } from './activity.js';
import { activateFocusTrap, deactivateFocusTrap } from './focus-trap.js';

// ============================================
// HEURES CALMES ET COOLDOWN
// ============================================

export function isQuietHours() {
    if (!NotificationPrefs.quietHours.enabled) return false;

    const now = new Date();
    const hour = now.getHours();
    const { start, end } = NotificationPrefs.quietHours;

    if (start > end) {
        return hour >= start || hour < end;
    }
    return hour >= start && hour < end;
}

export function canNotify(distributorId) {
    const lastNotif = NotificationPrefs.lastNotifications[distributorId];
    if (!lastNotif) return true;

    const hoursSince = (Date.now() - lastNotif) / (1000 * 60 * 60);
    return hoursSince >= 1;
}

export function markNotified(distributorId) {
    NotificationPrefs.lastNotifications[distributorId] = Date.now();
    saveNotificationPrefs();
}

// ============================================
// FILE D'ATTENTE
// ============================================

function queueNotification(notification) {
    NotificationQueue.pending.push({
        ...notification,
        queuedAt: Date.now()
    });
    saveNotificationQueue();
}

export function processQueuedNotifications() {
    if (isQuietHours()) return;

    const pending = [...NotificationQueue.pending];
    NotificationQueue.pending = [];

    pending.forEach(notif => {
        if (Date.now() - notif.queuedAt < 12 * 60 * 60 * 1000) {
            sendNotification(notif);
        }
    });

    saveNotificationQueue();
}

// ============================================
// GEOFENCING
// ============================================

export function startGeofenceMonitoring() {
    if (!navigator.geolocation) {
        console.log('Geolocalisation non supportee');
        return;
    }

    if (!NotificationPrefs.enabled || !NotificationPrefs.geofence.enabled) {
        console.log('Geofencing desactive');
        return;
    }

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

function checkNearbySubscriptions(position) {
    const userLat = position.coords.latitude;
    const userLng = position.coords.longitude;

    AppState.subscriptions.forEach(id => {
        const dist = AppState.distributors.find(d => d.id === id);
        if (!dist) return;

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

// ============================================
// DECLENCHEURS
// ============================================

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

export function triggerProductNotification(distributor, product) {
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

// ============================================
// ENVOI
// ============================================

function sendNotification(notif) {
    if (!NotificationPrefs.enabled) return;

    notif.read = false;
    notif.timestamp = notif.timestamp || Date.now();
    NotificationQueue.history.unshift(notif);
    if (NotificationQueue.history.length > 50) {
        NotificationQueue.history.pop();
    }
    saveNotificationQueue();

    // Vraie notification navigateur si permission accordee, sinon bandeau
    // in-app (fallback : zero regression si refus / non supporte).
    const supported = typeof window !== 'undefined' && 'Notification' in window;
    if (supported && Notification.permission === 'default'
        && NotificationPrefs.enabled) {
        // Demande paresseuse au 1er envoi
        requestNotificationPermission();
    }
    if (supported && Notification.permission === 'granted') {
        try {
            const typeInfo = NOTIFICATION_TYPES[notif.type] || NOTIFICATION_TYPES.proximity;
            const n = new Notification(typeInfo.title, {
                body: notif.message,
                icon: 'images/icon-192.png',
                tag: notif.distributorId
            });
            n.onclick = () => {
                window.focus();
                if (typeof window.openConversation === 'function') {
                    window.openConversation(notif.distributorId);
                }
                n.close();
            };
        } catch (e) {
            showNotificationBanner(notif);
        }
    } else {
        showNotificationBanner(notif);
    }

    if (navigator.vibrate) {
        navigator.vibrate(200);
    }

    markNotified(notif.distributorId);
    updateNotificationsBadge();

    addActivityItem('notification', notif.distributorId, {
        subtype: notif.type,
        message: notif.message
    });
}

// ============================================
// CENTRE DE NOTIFICATIONS (cloche)
// ============================================

export function requestNotificationPermission() {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'default') return;
    try {
        Notification.requestPermission();
    } catch (e) { /* Safari ancien : API callback only, ignore */ }
}

export function getUnreadCount() {
    return NotificationQueue.history.filter(n => n.read === false).length;
}

export function updateNotificationsBadge() {
    const badge = document.getElementById('notifications-badge');
    if (!badge) return;
    const count = getUnreadCount();
    if (count > 0) {
        badge.textContent = count > 9 ? '9+' : String(count);
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

function timeAgo(ts) {
    const diff = Date.now() - (ts || 0);
    const m = Math.floor(diff / 60000);
    if (m < 1) return "a l'instant";
    if (m < 60) return `il y a ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `il y a ${h} h`;
    const d = Math.floor(h / 24);
    return `il y a ${d} j`;
}

const TRASH_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;

function renderNotificationsList() {
    const list = document.getElementById('notifications-list');
    const empty = document.getElementById('notifications-empty');
    const clearBtn = document.getElementById('clear-notifications');
    if (!list) return;
    const items = NotificationQueue.history;
    if (clearBtn) clearBtn.style.display = items.length ? 'inline-flex' : 'none';
    if (!items.length) {
        list.innerHTML = '';
        if (empty) empty.style.display = 'flex';
        return;
    }
    if (empty) empty.style.display = 'none';
    list.innerHTML = items.map((n, index) => {
        const typeInfo = NOTIFICATION_TYPES[n.type] || NOTIFICATION_TYPES.proximity;
        return `
            <div class="notif-item ${n.read ? '' : 'unread'}">
                <span class="notif-item-icon">${typeInfo.icon}</span>
                <div class="notif-item-body">
                    <strong>${escapeHTML(typeInfo.title)}</strong>
                    <p>${escapeHTML(n.message || '')}</p>
                    <span class="notif-item-time">${timeAgo(n.timestamp)}</span>
                </div>
                <button class="notif-item-delete" aria-label="Supprimer cette notification" title="Supprimer" onclick="deleteNotification(${index})">${TRASH_SVG}</button>
            </div>`;
    }).join('');
}

export function deleteNotification(index) {
    if (index < 0 || index >= NotificationQueue.history.length) return;
    NotificationQueue.history.splice(index, 1);
    saveNotificationQueue();
    renderNotificationsList();
    updateNotificationsBadge();
}

export function clearAllNotifications() {
    if (typeof confirm === 'function'
        && !confirm('Effacer toutes les notifications ?')) return;
    NotificationQueue.history = [];
    saveNotificationQueue();
    renderNotificationsList();
    updateNotificationsBadge();
}

export function openNotificationsView() {
    renderNotificationsList();
    // Marquer tout lu apres affichage
    let changed = false;
    NotificationQueue.history.forEach(n => {
        if (n.read === false) { n.read = true; changed = true; }
    });
    if (changed) saveNotificationQueue();
    updateNotificationsBadge();
}

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
        <button class="notif-close" aria-label="Fermer la notification" onclick="this.closest('.notification-banner').remove();">&times;</button>
    `;

    document.body.appendChild(banner);

    setTimeout(() => banner.classList.add('show'), 10);

    setTimeout(() => {
        if (banner.parentNode) {
            banner.classList.remove('show');
            setTimeout(() => {
                if (banner.parentNode) banner.remove();
            }, 300);
        }
    }, 5000);
}

// ============================================
// PRODUITS SUIVIS
// ============================================

export function followProduct(productName) {
    const normalized = productName.toLowerCase().trim();
    if (!NotificationPrefs.followedProducts.includes(normalized)) {
        NotificationPrefs.followedProducts.push(normalized);
        saveNotificationPrefs();
        showToast(`Tu seras notifie pour "${productName}"`, 'success');
        updateFollowedProductsList();
    }
}

export function unfollowProduct(productName) {
    const normalized = productName.toLowerCase().trim();
    NotificationPrefs.followedProducts = NotificationPrefs.followedProducts
        .filter(p => p !== normalized);
    saveNotificationPrefs();
    showToast(`Produit "${productName}" retire`, 'info');
    updateFollowedProductsList();
}

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
            <button class="remove-btn" aria-label="Retirer ${escapeHTML(product)} des produits suivis" onclick="unfollowProduct('${safeAttr}')">&times;</button>
        </span>
    `;
    }).join('');
}

// ============================================
// PARAMETRES UI
// ============================================

export function openNotificationSettings() {
    const settingsView = document.getElementById('notification-settings');
    if (!settingsView) return;

    document.getElementById('notif-enabled').checked = NotificationPrefs.enabled;
    document.getElementById('quiet-hours-enabled').checked = NotificationPrefs.quietHours.enabled;
    document.getElementById('quiet-start').value = `${String(NotificationPrefs.quietHours.start).padStart(2, '0')}:00`;
    document.getElementById('quiet-end').value = `${String(NotificationPrefs.quietHours.end).padStart(2, '0')}:00`;
    document.getElementById('geofence-enabled').checked = NotificationPrefs.geofence.enabled;
    document.getElementById('geofence-radius').value = NotificationPrefs.geofence.radius;
    document.getElementById('radius-value').textContent = `${NotificationPrefs.geofence.radius / 1000} km`;

    updateFollowedProductsList();
    refreshNotifPermissionLabel();

    switchView('notification-settings');
}

export function refreshNotifPermissionLabel() {
    const label = document.getElementById('notif-permission-state');
    const btn = document.getElementById('notif-permission-btn');
    if (!label) return;
    const supported = typeof window !== 'undefined' && 'Notification' in window;
    const perm = supported ? Notification.permission : 'unsupported';
    const map = {
        granted: 'Notifications navigateur : activees',
        denied: 'Notifications navigateur : bloquees (a reactiver dans le navigateur). Repli sur le bandeau in-app.',
        default: 'Notifications navigateur : non autorisees',
        unsupported: 'Notifications navigateur non supportees ici. Repli sur le bandeau in-app.'
    };
    label.textContent = map[perm] || map.default;
    if (btn) btn.style.display = (perm === 'default') ? 'inline-flex' : 'none';
}

export function askNotifPermissionFromUI() {
    requestNotificationPermission();
    // requestPermission peut etre async (promesse) ou callback ; on
    // rafraichit apres un court delai pour refleter le choix.
    setTimeout(refreshNotifPermissionLabel, 300);
}

export function saveNotificationSettingsFromUI() {
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

export function updateRadiusDisplay() {
    const value = document.getElementById('geofence-radius').value;
    document.getElementById('radius-value').textContent = `${value / 1000} km`;
}

// Fermeture de la modale "Suivre un produit" : retire l'etat actif et relache
// le focus-trap (rend le focus au bouton declencheur).
function closeProductFollowModal() {
    const modal = document.getElementById('product-follow-modal');
    if (!modal) return;
    modal.classList.remove('active');
    deactivateFocusTrap(modal);
}

// Remplace le prompt() natif (boite systeme non stylable, hostile mobile) par
// une modale maison coherente avec le design, accessible (focus-trap + Echap)
// et validee (non vide, longueur bornee via maxlength=50 sur l'input).
export function promptAddProductFollow() {
    const modal = document.getElementById('product-follow-modal');
    const input = document.getElementById('product-follow-input');
    const form = document.getElementById('product-follow-form');
    if (!modal || !input || !form) return;

    input.value = '';
    modal.classList.add('active');
    activateFocusTrap(modal, closeProductFollowModal);

    // Listeners poses une seule fois (la modale est statique et reutilisee).
    if (form.dataset.wired) return;
    form.dataset.wired = '1';

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const value = input.value.trim();
        if (!value) return;
        followProduct(value);
        closeProductFollowModal();
    });
    document.getElementById('product-follow-cancel').addEventListener('click', closeProductFollowModal);
    document.getElementById('product-follow-close').addEventListener('click', closeProductFollowModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeProductFollowModal();
    });
}
