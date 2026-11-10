/**
 * DistriMatch - Notifications intelligentes et geofencing
 */

import { AppState, NotificationPrefs, NotificationQueue, NOTIFICATION_TYPES } from './state.js';
import {
    quietTimeToMinutes, formatQuietTime, resolveQuietRange, isInQuietRange,
    diffGeofence, escapeHTML, showToast, timeAgo,
    saveNotificationPrefs, saveNotificationQueue, normalizeName
} from './utils.js';
import { switchView } from './navigation.js';
import { activateFocusTrap, deactivateFocusTrap } from './focus-trap.js';
import { confirmDialog } from './confirm-dialog.js';
import { syncPushSubscription, refreshPushSettings, isPushActive } from './push.js';

// ============================================
// HEURES CALMES ET COOLDOWN
// ============================================

export function isQuietHours() {
    if (!NotificationPrefs.quietHours.enabled) return false;

    // NOTIF-06 : a la minute pres (« HH:MM » ou ancien nombre d'heures), valeur abimee = 22:00 / 08:00
    const now = new Date();
    const { start, end } = resolveQuietRange(NotificationPrefs.quietHours);
    return isInQuietRange(start, end, now.getHours() * 60 + now.getMinutes());
}

// NOTIF-03 : deux delais d'1 h distincts par distributeur. 'change' (vide, en panne,
// produit dispo : cle = id, comme avant) et 'proximity' (cle 'proximity:<id>').
// L'alerte de proximite, repetitive, ne retarde plus un changement de favori.
function cooldownKey(distributorId, kind) {
    return kind === 'proximity' ? `proximity:${distributorId}` : distributorId;
}

export function canNotify(distributorId, kind = 'change') {
    const lastNotif = NotificationPrefs.lastNotifications[cooldownKey(distributorId, kind)];
    if (!lastNotif) return true;

    const hoursSince = (Date.now() - lastNotif) / (1000 * 60 * 60);
    return hoursSince >= 1;
}

export function markNotified(distributorId, kind = 'change') {
    NotificationPrefs.lastNotifications[cooldownKey(distributorId, kind)] = Date.now();
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

// NOTIF-04 : au-dela de 12 h, une notification retenue ne sonne plus ; elle est rangee
// non lue dans le centre (avant : perdue). Une alerte de proximite perimee est jetee.
const QUEUE_ALERT_MAX_MS = 12 * 60 * 60 * 1000;

export function processQueuedNotifications() {
    if (isQuietHours() || !NotificationQueue.pending.length) return;

    const pending = [...NotificationQueue.pending];
    NotificationQueue.pending = [];

    let archived = false;
    pending.forEach(notif => {
        if (Date.now() - notif.queuedAt < QUEUE_ALERT_MAX_MS) {
            sendNotification(notif);
        } else if (notif.type !== 'proximity' && NotificationPrefs.enabled) {
            archiveNotification(notif);
            archived = true;
        }
    });

    saveNotificationQueue();
    if (!archived) return;
    if (isNotificationsViewOpen()) openNotificationsView();
    else updateNotificationsBadge();
}

// Rangee dans le centre, sans bandeau, son ni vibration
function archiveNotification(notif) {
    notif.read = false;
    ensureNotificationId(notif);
    NotificationQueue.history.unshift(notif);
    if (NotificationQueue.history.length > 50) NotificationQueue.history.pop();
}

// ============================================
// MINUTERIE : GEOFENCING ET FILE DES HEURES CALMES (NOTIF-04)
// ============================================

const NOTIFICATION_TICK_MS = 30000;
let notificationTimer = null;
// Dans le rayon ou non, par favori, au dernier passage ; null = pas de reference
// (demarrage, onglet cache, reglage coupe, heures calmes) : la mesure suivante sert
// de reference, sans alerte. Un rayon change dans les reglages = nouvelle reference.
let geofenceInside = null;
let geofenceRadius = null;

// Une seule minuterie, posee au demarrage quels que soient les reglages : ils sont
// relus a chaque passage (reactives, ou remis par "Effacer mes donnees", ils
// s'appliquent sans redemarrer)
export function startGeofenceMonitoring() {
    if (notificationTimer) return;
    notificationTimer = setInterval(notificationTick, NOTIFICATION_TICK_MS);
}

// Un passage, dans l'onglet visible seulement (un seul onglet agit) : la file des
// heures calmes part si elles sont finies, puis la position est relue si l'alerte
// de proximite est active
export function notificationTick() {
    const visible = document.visibilityState === 'visible';
    if (visible) processQueuedNotifications();
    const active = NotificationPrefs.enabled && NotificationPrefs.geofence.enabled && !isQuietHours();
    if (!active || !visible || !navigator.geolocation) {
        geofenceInside = null;
        return;
    }
    navigator.geolocation.getCurrentPosition(
        checkNearbySubscriptions,
        (err) => console.log('Erreur géoloc pour geofence:', err.message),
        { enableHighAccuracy: false, timeout: 10000 }
    );
}

// Alerte a l'arrivee seulement (diffGeofence, utils.js). canNotify reste le garde-fou
// entre deux fenetres visibles : la marque de l'autre onglet arrive par l'ecouteur
// storage d'app.js (BUG-13)
function checkNearbySubscriptions(position) {
    const radius = NotificationPrefs.geofence.radius;
    if (radius !== geofenceRadius) {
        geofenceInside = null;
        geofenceRadius = radius;
    }
    const favorites = AppState.subscriptions
        .filter(id => NotificationPrefs.perDistributor[id]?.proximity !== false)
        .map(id => AppState.distributors.find(d => d.id === id))
        .filter(Boolean);
    const { inside, entered } = diffGeofence(geofenceInside, favorites, position.coords, radius);
    geofenceInside = inside;
    entered.forEach(({ distributor, distanceMeters }) => {
        if (canNotify(distributor.id, 'proximity')) {
            triggerProximityNotification(distributor, distanceMeters);
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

    // NOTIF-04 : une arrivee ne se signale pas apres coup (plus de mise en file)
    if (isQuietHours()) return;

    sendNotification(notification);
}

// Changement sur une machine en favori (js/favorites-watch.js).
// event : { type: 'empty' | 'broken' | 'working' | 'stock' | 'restock', at, product? }
// L'horodatage est celui du SIGNAL : le centre affiche "il y a 40 min" par
// rapport au moment ou quelqu'un l'a vu, pas au moment ou l'app l'a appris.
export function buildFavoriteMessage(distributorName, event) {
    const product = event.product || 'Un produit';
    switch (event.type) {
        case 'broken': return `${distributorName} : signalé en panne`;
        case 'working': return `${distributorName} : de nouveau en service`;
        case 'empty': return `${distributorName} : signalé vide`;
        case 'stock': return `${product} vu dispo chez ${distributorName}`;
        default: return `${product} de nouveau vu dispo chez ${distributorName}`;
    }
}

export function notifyFavoriteEvent(distributor, event) {
    const notification = {
        type: event.type,
        distributorId: distributor.id,
        distributorName: distributor.name,
        message: buildFavoriteMessage(distributor.name, event),
        timestamp: event.at || Date.now()
    };
    if (event.product) notification.product = event.product;

    // NOTIF-03 : notifications app fermee en service sur cet appareil : le serveur
    // (push-notify) a deja alerte, heures calmes comprises. L'app garde la ligne du
    // centre et la pastille, sans seconde alerte et sans file d'attente.
    if (isPushActive()) {
        sendNotification(notification, { silent: true });
        return;
    }

    if (isQuietHours()) {
        queueNotification(notification);
        return;
    }

    sendNotification(notification);
}

// Une notification mene a la fiche de la machine (le chat est inactif).
function openNotificationTarget(distributorId) {
    if (typeof window !== 'undefined' && typeof window.openDistributorModal === 'function') {
        window.openDistributorModal(distributorId);
    }
}

// ============================================
// ENVOI
// ============================================

// Identifiant stable d'une notification (les anciennes n'en ont pas : il est
// pose au premier affichage et sauvegarde avec la file).
export function ensureNotificationId(notif) {
    if (!notif.id) notif.id = `n-${notif.timestamp || Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return notif.id;
}

function isNotificationsViewOpen() {
    return !!document.getElementById('notifications-view')?.classList.contains('view-active');
}

// options.silent (NOTIF-03) : centre et pastille seulement, sans notification systeme,
// ni bandeau, ni vibration (la notification app fermee du serveur est deja arrivee).
function sendNotification(notif, options = {}) {
    if (!NotificationPrefs.enabled) return;

    notif.read = false;
    notif.timestamp = notif.timestamp || Date.now();
    ensureNotificationId(notif);
    NotificationQueue.history.unshift(notif);
    if (NotificationQueue.history.length > 50) {
        NotificationQueue.history.pop();
    }
    saveNotificationQueue();

    // Vraie notification navigateur si la permission est DEJA accordee (reglages ou
    // invitation du premier favori), sinon bandeau in-app. NOTIF-05 : jamais de
    // demande de permission ici (minuterie, sans toucher de l'utilisateur).
    const supported = typeof window !== 'undefined' && 'Notification' in window;
    if (options.silent) {
        // Rien a afficher : une seule alerte par changement
    } else if (supported && Notification.permission === 'granted') {
        try {
            const typeInfo = NOTIFICATION_TYPES[notif.type] || NOTIFICATION_TYPES.proximity;
            // NOTIF-07 : meme tag que la notification du serveur (distrimatch-<id>) ; une notification
            // qui remplace celle du meme favori sonne / vibre aussi (renotify, jamais sans tag)
            const tag = notif.distributorId ? `distrimatch-${notif.distributorId}` : '';
            const n = new Notification(typeInfo.title, {
                body: notif.message,
                icon: 'images/icon-192.png',
                tag,
                renotify: Boolean(tag)
            });
            n.onclick = () => {
                window.focus();
                openNotificationTarget(notif.distributorId);
                n.close();
            };
        } catch (e) {
            showNotificationBanner(notif);
        }
    } else {
        showNotificationBanner(notif);
    }

    if (navigator.vibrate && !options.silent) {
        navigator.vibrate(200);
    }

    markNotified(notif.distributorId, notif.type === 'proximity' ? 'proximity' : 'change');
    // Page Notifications ouverte : la liste suit en direct (retour terrain
    // 2026-09-25 : une liste figee faisait supprimer la mauvaise ligne).
    if (isNotificationsViewOpen()) {
        openNotificationsView();
    } else {
        updateNotificationsBadge();
    }

}

// ============================================
// CENTRE DE NOTIFICATIONS (cloche)
// ============================================

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

// timeAgo() vit dans utils.js (partage avec la fraicheur des distributeurs).

const TRASH_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`;

function renderNotificationsList() {
    const list = document.getElementById('notifications-list');
    const empty = document.getElementById('notifications-empty');
    const clearBtn = document.getElementById('clear-notifications');
    if (!list) return;
    // Delegation posee une seule fois : une ligne ouvre la fiche de la machine
    if (!list.dataset.wired) {
        list.dataset.wired = '1';
        list.addEventListener('click', (e) => {
            const del = e.target.closest('.notif-item-delete');
            if (del) {
                deleteNotification(del.dataset.notifId);
                return;
            }
            const row = e.target.closest('.notif-item-open');
            if (row && row.dataset.distributorId) openNotificationTarget(row.dataset.distributorId);
        });
    }
    const items = NotificationQueue.history;
    if (clearBtn) clearBtn.style.display = items.length ? 'inline-flex' : 'none';
    if (!items.length) {
        list.innerHTML = '';
        if (empty) empty.style.display = 'flex';
        return;
    }
    if (empty) empty.style.display = 'none';
    list.innerHTML = items.map((n) => {
        ensureNotificationId(n);
        const typeInfo = NOTIFICATION_TYPES[n.type] || NOTIFICATION_TYPES.proximity;
        // NOTIF-07 : une ligne non lue se voit (fond blanc + pastille, css) et s'entend (« Nouveau : »)
        const unreadLabel = n.read ? '' : 'Nouveau : ';
        return `
            <div class="notif-item ${n.read ? '' : 'unread'}">
                <button type="button" class="notif-item-open" data-distributor-id="${escapeHTML(String(n.distributorId ?? ''))}" aria-label="${escapeHTML(`${unreadLabel}${typeInfo.title} : ${n.message || ''}. Ouvrir la fiche`)}">
                    <span class="notif-item-icon" aria-hidden="true">${typeInfo.icon}</span>
                    <span class="notif-item-body">
                        <strong>${escapeHTML(typeInfo.title)}</strong>
                        <span class="notif-item-text">${escapeHTML(n.message || '')}</span>
                        <span class="notif-item-time">${timeAgo(n.timestamp)}</span>
                    </span>
                </button>
                <button type="button" class="notif-item-delete" data-notif-id="${escapeHTML(n.id)}" aria-label="Supprimer cette notification" title="Supprimer">${TRASH_SVG}</button>
            </div>`;
    }).join('');
}

// Suppression par identifiant stable (plus par position : une liste qui a
// bouge entre l'affichage et le clic retirait une autre ligne).
export function deleteNotification(id) {
    const index = NotificationQueue.history.findIndex(n => n.id === id);
    if (index === -1) return;
    NotificationQueue.history.splice(index, 1);
    saveNotificationQueue();
    renderNotificationsList();
    updateNotificationsBadge();
}

export async function clearAllNotifications() {
    const ok = await confirmDialog({
        title: 'Effacer toutes les notifications ?',
        message: 'Le centre de notifications sera vidé sur cet appareil.',
        confirmLabel: 'Tout effacer'
    });
    if (!ok) return;
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

// NOTIF-07 : le bandeau (repli sans notification systeme) est pose dans la zone
// #notification-banner-region (role="status", index.html) pour etre annonce aux lecteurs
// d'ecran ; il reste 7 s, et tant qu'il est survole ou qu'il a le focus (motif de
// showActionToast, utils.js). Retire alors qu'il avait le focus : le focus revient ou il etait.
export const BANNER_DURATION = 7000;

export function showNotificationBanner(notif) {
    const typeInfo = NOTIFICATION_TYPES[notif.type] || NOTIFICATION_TYPES.proximity;
    const region = document.getElementById('notification-banner-region') || document.body;
    const previousFocus = document.activeElement;

    const banner = document.createElement('div');
    banner.className = 'notification-banner';
    banner.innerHTML = `
        <span class="notif-icon" aria-hidden="true">${typeInfo.icon}</span>
        <div class="notif-content">
            <strong>${escapeHTML(typeInfo.title)}</strong>
            <p>${escapeHTML(notif.message)}</p>
        </div>
        <button type="button" class="notif-action">
            Voir
        </button>
        <button type="button" class="notif-close" aria-label="Fermer la notification">&times;</button>
    `;

    region.appendChild(banner);
    const distributorId = String(notif.distributorId);
    let removed = false;
    let timer = null;

    function removeBanner() {
        if (removed) return;
        removed = true;
        clearTimeout(timer);
        const hadFocus = banner.contains(document.activeElement);
        banner.remove();
        if (hadFocus && previousFocus && previousFocus.isConnected && typeof previousFocus.focus === 'function') {
            previousFocus.focus();
        }
    }

    function armBanner() {
        clearTimeout(timer);
        timer = setTimeout(function expireBanner() {
            if (banner.matches(':hover') || banner.contains(document.activeElement)) {
                armBanner();
                return;
            }
            banner.classList.remove('show');
            setTimeout(removeBanner, 300);
        }, BANNER_DURATION);
    }

    banner.querySelector('.notif-action').addEventListener('click', function openFromBanner() {
        window.openDistributorModal(distributorId);
        removeBanner();
    });
    banner.querySelector('.notif-close').addEventListener('click', removeBanner);

    setTimeout(() => banner.classList.add('show'), 10);
    armBanner();
}

// ============================================
// PRODUITS SUIVIS
// ============================================

export function followProduct(productName) {
    const normalized = productName.toLowerCase().trim();
    // NOTIF-02 : « oeufs » et « Œufs » sont le meme produit suivi
    if (!NotificationPrefs.followedProducts.some(p => normalizeName(p) === normalizeName(normalized))) {
        NotificationPrefs.followedProducts.push(normalized);
        saveNotificationPrefs();
        showToast(`Tu seras notifié pour "${productName}"`, 'success');
        updateFollowedProductsList();
        syncPushSubscription();
    }
}

export function unfollowProduct(productName) {
    const normalized = productName.toLowerCase().trim();
    NotificationPrefs.followedProducts = NotificationPrefs.followedProducts
        .filter(p => p !== normalized);
    saveNotificationPrefs();
    showToast(`Produit "${productName}" retire`, 'info');
    updateFollowedProductsList();
    syncPushSubscription();
}

function updateFollowedProductsList() {
    const container = document.getElementById('followed-products-list');
    if (!container) return;

    if (NotificationPrefs.followedProducts.length === 0) {
        container.innerHTML = '<p class="empty-message">Aucun produit suivi</p>';
        return;
    }

    container.innerHTML = NotificationPrefs.followedProducts.map(product => `
        <span class="followed-product-chip">
            ${escapeHTML(product)}
            <button class="remove-btn" aria-label="Retirer ${escapeHTML(product)} des produits suivis" data-product="${escapeHTML(product)}">&times;</button>
        </span>
    `).join('');
    // Boutons neufs a chaque rendu : un ecouteur chacun, sans cumul (SEC-02 : plus de onclick)
    container.querySelectorAll('.remove-btn[data-product]').forEach(function bindRemove(btn) {
        btn.addEventListener('click', function removeFollowed() { unfollowProduct(btn.dataset.product); });
    });
}

// ============================================
// PARAMETRES UI
// ============================================

// NOTIF-06 : chaque reglage est enregistre des qu'il change (plus de bouton « Sauvegarder » :
// Retour ou Echap perdaient les changements). Ecouteurs poses une seule fois.
const AUTO_SAVED_SETTINGS = ['notif-enabled', 'quiet-hours-enabled', 'quiet-start', 'quiet-end', 'geofence-enabled', 'geofence-radius'];

function wireNotificationSettings(settingsView) {
    if (settingsView.dataset.wired) return;
    settingsView.dataset.wired = '1';
    AUTO_SAVED_SETTINGS.forEach(function wireSetting(id) {
        document.getElementById(id)?.addEventListener('change', function saveSetting() { saveNotificationSettingsFromUI(); });
    });
}

// Heure « HH:MM » d'un champ, minutes comprises. Vide ou incomplete : l'heure precedente
// revient dans le champ et on le dit (jamais de NaN enregistre ni envoye au serveur).
function readQuietTimeInput(id, previousMinutes) {
    const input = document.getElementById(id);
    const minutes = quietTimeToMinutes(input.value);
    if (minutes !== null) return formatQuietTime(minutes);
    const kept = formatQuietTime(previousMinutes);
    input.value = kept;
    showToast(`Heure incomplète : on garde ${kept}`, 'info');
    return kept;
}

export function openNotificationSettings() {
    const settingsView = document.getElementById('notification-settings');
    if (!settingsView) return;
    wireNotificationSettings(settingsView);

    document.getElementById('notif-enabled').checked = NotificationPrefs.enabled;
    document.getElementById('quiet-hours-enabled').checked = NotificationPrefs.quietHours.enabled;
    const quiet = resolveQuietRange(NotificationPrefs.quietHours);
    document.getElementById('quiet-start').value = formatQuietTime(quiet.start);
    document.getElementById('quiet-end').value = formatQuietTime(quiet.end);
    document.getElementById('geofence-enabled').checked = NotificationPrefs.geofence.enabled;
    document.getElementById('geofence-radius').value = NotificationPrefs.geofence.radius;
    document.getElementById('radius-value').textContent = `${NotificationPrefs.geofence.radius / 1000} km`;

    updateFollowedProductsList();
    refreshPushSettings();

    switchView('notification-settings');
}

export function saveNotificationSettingsFromUI() {
    NotificationPrefs.enabled = document.getElementById('notif-enabled').checked;
    NotificationPrefs.quietHours.enabled = document.getElementById('quiet-hours-enabled').checked;

    const previous = resolveQuietRange(NotificationPrefs.quietHours);
    NotificationPrefs.quietHours.start = readQuietTimeInput('quiet-start', previous.start);
    NotificationPrefs.quietHours.end = readQuietTimeInput('quiet-end', previous.end);

    NotificationPrefs.geofence.enabled = document.getElementById('geofence-enabled').checked;
    NotificationPrefs.geofence.radius = parseInt(document.getElementById('geofence-radius').value);

    saveNotificationPrefs();
    syncPushSubscription();
    refreshPushSettings();   // NOTIF-05 : « Notifications activées » coupe aussi l'app fermee
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
