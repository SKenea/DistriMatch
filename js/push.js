// DistriMatch - Notifications app fermee (EPIC-T25).
// Abonnement SANS compte, lie au telephone (RPC push_subscribe, migration 024) :
// le serveur connait les favoris, les produits suivis et les heures calmes de CET
// appareil, et rien d'autre. La fonction serveur push-notify envoie, le service
// worker (sw.js, sans cache) affiche. On ne demande la permission qu'au premier
// favori ou depuis les reglages, jamais a l'ouverture de l'app.

import { AppState, NotificationPrefs, supabaseClient } from './state.js';
import { VAPID_PUBLIC_KEY } from './config.js';
import { showToast, showActionToast, saveNotificationPrefs, urlBase64ToUint8Array, needsHomeScreenForPush, shouldHintHomeScreenFavorites } from './utils.js';
import { confirmDialog } from './confirm-dialog.js';

export const ASKED_KEY = 'distrimatch_push_asked';
export const HOME_SCREEN_SEEN_KEY = 'distrimatch_home_screen_seen';   // BUG-04 : indice deja montre
// Bornes de push_subscribe (migration 026) : au-dela, le serveur refuse tout l'abonnement.
const PUSH_MAX_FAVORITES = 200;
const PUSH_MAX_FOLLOWED = 30;
const PUSH_MAX_PRODUCT_LENGTH = 60;

export function isPushSupported() {
    return typeof window !== 'undefined' && 'serviceWorker' in navigator
        && 'PushManager' in window && 'Notification' in window;
}

export function isStandalone() {
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

export function subscriptionParams(subscription) {
    const { endpoint, keys } = subscription.toJSON();
    const quiet = NotificationPrefs.quietHours;
    return {
        p_endpoint: endpoint,
        p_p256dh: keys.p256dh,
        p_auth: keys.auth,
        p_favorites: AppState.subscriptions.map(String).slice(0, PUSH_MAX_FAVORITES),
        p_followed: NotificationPrefs.followedProducts.slice(0, PUSH_MAX_FOLLOWED).map(p => String(p).slice(0, PUSH_MAX_PRODUCT_LENGTH)),
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

// PRIV-06 : push_subscribe garde le compte deja memorise (024, 026). A la deconnexion
// (signOut, auth.js, AVANT la fin de session), on efface l'abonnement : la
// synchronisation qui suit la deconnexion le recree sans compte.
export async function forgetPushAccount() {
    if (!supabaseClient || !isPushSupported() || !NotificationPrefs.push || permission() !== 'granted') return;
    try {
        const subscription = await currentSubscription();
        if (!subscription) return;
        const { error } = await supabaseClient.rpc('push_unsubscribe', { p_endpoint: subscription.endpoint });
        if (error) throw error;
    } catch (e) {
        console.warn('[DistriMatch] Abonnement aux notifications encore lie au compte :', e?.message || e);
    }
}

// PRIV-06 : effacement cote serveur pas confirme (hors ligne, projet en pause) : l'adresse
// est gardee ici et renvoyee plus tard (retryPendingUnsubscribe). Cle volontairement hors
// de la liste de « Effacer mes données » (app.js) : elle sert a finir l'effacement.
export const PENDING_UNSUBSCRIBE_KEY = 'distrimatch_push_pending_unsubscribe';

async function deleteOnServer(endpoint) {
    if (!supabaseClient) return false;
    try {
        const { error } = await supabaseClient.rpc('push_unsubscribe', { p_endpoint: endpoint });
        return !error;
    } catch (e) {
        return false;
    }
}

// Au demarrage et au retour du reseau : renvoie un effacement reste en attente
export async function retryPendingUnsubscribe() {
    let endpoint = null;
    try { endpoint = localStorage.getItem(PENDING_UNSUBSCRIBE_KEY); } catch (e) { return false; }
    if (!endpoint) return false;
    if (!(await deleteOnServer(endpoint))) return false;
    try { localStorage.removeItem(PENDING_UNSUBSCRIBE_KEY); } catch (e) { /* stockage bloque */ }
    return true;
}

function showHomeScreenGuide() {
    return confirmDialog({
        title: 'Ajoute DistriMatch à ton écran d’accueil',
        message: 'Sur iPhone, les notifications arrivent seulement depuis l’écran d’accueil : touche Partager, puis « Sur l’écran d’accueil ». Ouvre ensuite DistriMatch depuis cette icône et remets-y ton distributeur en favori : l’app de l’écran d’accueil a ses propres favoris.',
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
        const endpoint = subscription.endpoint;
        // PRIV-06 : le resultat est lu ; un echec est retente plus tard
        if (!(await deleteOnServer(endpoint))) {
            try { localStorage.setItem(PENDING_UNSUBSCRIBE_KEY, endpoint); } catch (e) { /* stockage bloque */ }
            console.warn('[DistriMatch] Abonnement pas encore efface sur le serveur : nouvel essai plus tard');
        }
        await subscription.unsubscribe();   // plus rien n'arrive sur ce telephone
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

// App de l'ecran d'accueil sur iPhone, premier lancement sans favori (BUG-04) : un
// indice une seule fois. L'invitation aux notifications vient ensuite au premier coeur
// (maybeOfferPush), jamais a l'ouverture.
export function maybeHintHomeScreenFavorites() {
    let seen;
    try { seen = localStorage.getItem(HOME_SCREEN_SEEN_KEY) === '1'; } catch (e) { return; }
    if (!shouldHintHomeScreenFavorites(navigator.userAgent, isStandalone(), AppState.subscriptions.length, seen)) return;
    try { localStorage.setItem(HOME_SCREEN_SEEN_KEY, '1'); } catch (e) { return; }
    showActionToast('Bienvenue dans l’app ! Touche le cœur de ton distributeur préféré pour le retrouver ici et activer ses notifications.', {
        actionLabel: 'OK',
        duration: 8000
    });
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
