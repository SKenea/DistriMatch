// DistriMatch - Notifications app fermee (EPIC-T25).
// Abonnement SANS compte, lie au telephone (RPC push_subscribe, migration 024) :
// le serveur connait les favoris, les produits suivis et les heures calmes de CET
// appareil, et rien d'autre. La fonction serveur push-notify envoie, le service
// worker (sw.js, sans cache) affiche. On ne demande la permission qu'au premier
// favori ou depuis les reglages, jamais a l'ouverture de l'app.

import { AppState, NotificationPrefs, supabaseClient } from './state.js';
import { VAPID_PUBLIC_KEY } from './config.js';
import { showToast, saveNotificationPrefs, urlBase64ToUint8Array, needsHomeScreenForPush } from './utils.js';
import { confirmDialog } from './confirm-dialog.js';

const ASKED_KEY = 'distrimatch_push_asked';

export function isPushSupported() {
    return typeof window !== 'undefined' && 'serviceWorker' in navigator
        && 'PushManager' in window && 'Notification' in window;
}

function isStandalone() {
    return window.navigator.standalone === true
        || (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches);
}

export function pushNeedsHomeScreen() {
    return needsHomeScreenForPush(navigator.userAgent, isStandalone());
}

function permission() {
    return 'Notification' in window ? Notification.permission : 'unsupported';
}

function readAsked() {
    try { return localStorage.getItem(ASKED_KEY) === '1'; } catch (e) { return false; }
}

function markAsked() {
    try { localStorage.setItem(ASKED_KEY, '1'); } catch (e) { /* stockage bloque */ }
}

async function currentSubscription() {
    if (!isPushSupported()) return null;
    const registration = await navigator.serviceWorker.getRegistration();
    return registration ? registration.pushManager.getSubscription() : null;
}

function subscriptionParams(subscription) {
    const { endpoint, keys } = subscription.toJSON();
    const quiet = NotificationPrefs.quietHours;
    return {
        p_endpoint: endpoint,
        p_p256dh: keys.p256dh,
        p_auth: keys.auth,
        p_favorites: AppState.subscriptions.map(String),
        p_followed: [...NotificationPrefs.followedProducts],
        p_quiet_start: quiet.enabled ? quiet.start : null,
        p_quiet_end: quiet.enabled ? quiet.end : null,
        p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    };
}

async function sendToServer(subscription) {
    if (!supabaseClient) return;
    const { error } = NotificationPrefs.enabled
        ? await supabaseClient.rpc('push_subscribe', subscriptionParams(subscription))
        : await supabaseClient.rpc('push_unsubscribe', { p_endpoint: subscription.endpoint });
    if (error) throw error;
}

// Favoris, produits suivis, heures calmes ou compte changes : le serveur suit.
export async function syncPushSubscription() {
    if (!isPushSupported() || !NotificationPrefs.push || permission() !== 'granted') return;
    try {
        const subscription = await currentSubscription();
        if (subscription) await sendToServer(subscription);
    } catch (e) {
        console.warn('[DistriMatch] Abonnement aux notifications non mis a jour :', e?.message || e);
    }
}

function showHomeScreenGuide() {
    return confirmDialog({
        title: 'Ajoute DistriMatch à ton écran d’accueil',
        message: 'Sur iPhone, les notifications arrivent seulement depuis l’écran d’accueil : touche Partager, puis « Sur l’écran d’accueil ». Ouvre ensuite DistriMatch depuis cette icône.',
        confirmLabel: 'Compris',
        cancelLabel: 'Fermer',
        danger: false
    });
}

export async function enablePush() {
    if (pushNeedsHomeScreen()) {
        await showHomeScreenGuide();
        return false;
    }
    if (!isPushSupported()) {
        showToast('Les notifications ne sont pas disponibles sur ce navigateur', 'info');
        return false;
    }
    try {
        const result = await Notification.requestPermission();
        if (result !== 'granted') {
            NotificationPrefs.push = false;
            saveNotificationPrefs();
            showToast('Notifications bloquées : tu peux les réactiver dans les réglages du navigateur', 'info');
            return false;
        }
        const registration = await navigator.serviceWorker.register('./sw.js');
        await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription()
            || await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });
        NotificationPrefs.push = true;
        saveNotificationPrefs();
        await sendToServer(subscription);
        showToast('C’est noté : tu seras prévenu même app fermée', 'success');
        return true;
    } catch (e) {
        console.warn('[DistriMatch] Activation des notifications impossible :', e?.message || e);
        showToast('Impossible d’activer les notifications pour le moment', 'error');
        return false;
    }
}

export async function disablePush() {
    NotificationPrefs.push = false;
    saveNotificationPrefs();
    try {
        const subscription = await currentSubscription();
        if (!subscription) return;
        if (supabaseClient) await supabaseClient.rpc('push_unsubscribe', { p_endpoint: subscription.endpoint });
        await subscription.unsubscribe();
    } catch (e) {
        console.warn('[DistriMatch] Desabonnement incomplet :', e?.message || e);
    }
}

// Premier favori : une seule invitation (ou le guide iPhone), jamais redemandee.
export async function maybeOfferPush() {
    if (NotificationPrefs.push && permission() === 'granted') {
        syncPushSubscription();
        return;
    }
    if (readAsked()) return;
    if (pushNeedsHomeScreen()) {
        markAsked();
        await showHomeScreenGuide();
        return;
    }
    if (!isPushSupported() || permission() === 'denied') return;
    markAsked();
    const ok = await confirmDialog({
        title: 'Être prévenu même app fermée ?',
        message: 'Quand tes favoris changent (vide, en panne, produit dispo), ton téléphone te prévient, même si DistriMatch est fermé.',
        confirmLabel: 'Oui, préviens-moi',
        cancelLabel: 'Plus tard',
        danger: false
    });
    if (ok) await enablePush();
}

// Reglages des notifications : interrupteur « Prévenu même app fermée ».
export function refreshPushSettings() {
    const toggle = document.getElementById('push-enabled');
    const hint = document.getElementById('push-state');
    if (!toggle || !hint) return;
    const perm = isPushSupported() ? permission() : 'unsupported';
    toggle.checked = Boolean(NotificationPrefs.push) && perm === 'granted';
    toggle.disabled = perm === 'denied' || (perm === 'unsupported' && !pushNeedsHomeScreen());
    if (pushNeedsHomeScreen()) {
        hint.textContent = 'Sur iPhone : ajoute d’abord DistriMatch à ton écran d’accueil (Partager, puis « Sur l’écran d’accueil »).';
    } else if (perm === 'unsupported') {
        hint.textContent = 'Pas disponible sur ce navigateur.';
    } else if (perm === 'denied') {
        hint.textContent = 'Bloquées dans le navigateur : à réactiver dans ses réglages.';
    } else {
        hint.textContent = 'Tes favoris te préviennent, même si DistriMatch est fermé.';
    }
}

export function initPushSettings() {
    const toggle = document.getElementById('push-enabled');
    if (!toggle || toggle.dataset.wired) return;
    toggle.dataset.wired = '1';
    toggle.addEventListener('change', async () => {
        if (toggle.checked) await enablePush();
        else await disablePush();
        refreshPushSettings();
    });
}
