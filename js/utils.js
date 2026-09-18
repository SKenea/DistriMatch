/**
 * DistriMatch - Utilitaires et persistance
 */

import {
    AppState, Conversations, UserProfile, NotificationPrefs, NotificationQueue,
    STORAGE_KEY, PROFILE_KEY, CONVERSATIONS_KEY,
    USER_DISTRIBUTORS_KEY, NOTIFICATION_PREFS_KEY, NOTIFICATION_QUEUE_KEY,
    LEVELS
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

// Detection sommaire desktop vs mobile via userAgent. Utilisee pour
// router la capture photo : sur desktop, on ouvre une modale webcam
// (getUserMedia) car l'attribut HTML capture="environment" est ignore.
// Sur mobile, le prompt natif OS est superieur a toute UI custom.
export function isLikelyDesktop() {
    return !/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
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
    // Accessibilite WCAG 4.1.3 : les toasts d'erreur portent role="alert"
    // pour interrompre le lecteur d'ecran (assertif). Les autres heritent
    // de aria-live="polite" via le container -> annonce non-interruptive.
    if (type === 'error') {
        toast.setAttribute('role', 'alert');
    }
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

// Formatage relatif "il y a N min / h / j". Implementation unique, partagee
// par le centre de notifications et la fraicheur des distributeurs.
export function timeAgo(ts, now = Date.now()) {
    const diff = now - (ts || 0);
    const m = Math.floor(diff / 60000);
    if (m < 1) return "a l'instant";
    if (m < 60) return `il y a ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `il y a ${h} h`;
    const d = Math.floor(h / 24);
    return `il y a ${d} j`;
}

// Fraicheur d'un distributeur a partir de lastVerified (ISO Supabase, date
// courte du JSON, Date ou timestamp). La confiance = l'horodatage
// (docs/STRATEGIE.md) : on affiche toujours l'age de l'info, jamais un vert
// perime. state : 'fresh' (< 2 h), 'stale' (au-dela), 'unknown' (absent,
// invalide ou dans le futur).
export const FRESH_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export function getFreshness(lastVerified, now = Date.now()) {
    const ts = lastVerified instanceof Date ? lastVerified.getTime() : new Date(lastVerified).getTime();
    if (!lastVerified || Number.isNaN(ts) || ts > now + 60000) {
        return { state: 'unknown', label: 'Pas encore vérifié' };
    }
    const state = now - ts < FRESH_MAX_AGE_MS ? 'fresh' : 'stale';
    return { state, label: `Vérifié ${timeAgo(ts, now)}` };
}

// ============================================
// SIGNAL DE DISPO EN UN TAP (UC11)
// ============================================

// Identifiant d'appareil pour le rate limit des signaux : aleatoire, genere
// une fois, garde en localStorage. Pas d'empreinte navigateur, pas d'IP,
// aucune donnee personnelle. Memoise pour rester stable meme sans localStorage.
export const DEVICE_ID_KEY = 'snackmatch_device';
let memoDeviceId = null;

export function getDeviceId() {
    if (memoDeviceId) return memoDeviceId;
    let id = null;
    try { id = localStorage.getItem(DEVICE_ID_KEY); } catch (e) { /* localStorage indisponible */ }
    if (!id || id.length < 16) {
        id = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : `dev-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
        try { localStorage.setItem(DEVICE_ID_KEY, id); } catch (e) { /* on garde l'id en memoire */ }
    }
    memoDeviceId = id;
    return id;
}

// Payload de la RPC confirm_availability a partir des choix du panneau
// "Il reste quoi ?". choices : { [productId]: 'available' | 'absent' | 'unseen' }.
// Les produits "pas regarde" et les ids non numeriques sont exclus ; l'etat
// machine est borne a 'empty' / 'broken', sinon null.
export function buildAvailabilityPayload(distributorId, deviceId, choices = {}, machineState = null) {
    const productSignals = Object.entries(choices)
        .filter(([id, state]) => Number.isInteger(Number(id)) && (state === 'available' || state === 'absent'))
        .map(([id, state]) => ({ product_id: Number(id), state }));
    return {
        p_distributor_id: distributorId,
        p_device_hash: deviceId,
        p_product_signals: productSignals,
        p_machine_state: (machineState === 'empty' || machineState === 'broken') ? machineState : null
    };
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
        // Migration douce : les items d'historique sans flag `read` sont
        // consideres lus (pas de gros badge au 1er chargement apres MAJ).
        NotificationQueue.history = (parsed.history || []).map(n => ({
            ...n,
            read: n.read === undefined ? true : n.read
        }));
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

// Niveau "Local Guides" derive des points cumules (fonction pure).
export function getLevelInfo(points) {
    const p = Math.max(0, Number(points) || 0);
    let cur = LEVELS[0];
    for (const L of LEVELS) {
        if (p >= L.min) cur = L;
    }
    const next = LEVELS.find(L => L.min > cur.min) || null;
    return {
        level: cur.lvl,
        name: cur.name,
        points: p,
        next,
        isMax: !next,
        toNext: next ? next.min - p : 0,
        progress: next
            ? Math.min(100, Math.round((p - cur.min) / (next.min - cur.min) * 100))
            : 100
    };
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

// Compression d'image cote client (canvas + toBlob JPEG) pour reduire le
// poids avant upload. Photo smartphone moderne = 3-10 MB, compresse ici
// a ~500 KB sans perte visuelle notable (1600px de large max, qualite 0.80).
// Si le fichier n'est pas une image ou que la compression echoue, on
// retourne le fichier original (fallback transparent).
export function compressImage(file, opts = {}) {
    const maxDim = opts.maxDim || 1600;
    const quality = opts.quality !== undefined ? opts.quality : 0.80;

    return new Promise((resolve) => {
        // Garde-fou : si pas une image, on retourne tel quel
        if (!file || !file.type || !file.type.startsWith('image/')) {
            resolve(file);
            return;
        }

        const url = URL.createObjectURL(file);
        const img = new Image();

        img.onload = () => {
            try {
                // Calcule les dimensions cibles en preservant le ratio.
                let { width, height } = img;
                if (width > maxDim || height > maxDim) {
                    if (width >= height) {
                        height = Math.round(height * (maxDim / width));
                        width = maxDim;
                    } else {
                        width = Math.round(width * (maxDim / height));
                        height = maxDim;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    URL.revokeObjectURL(url);
                    if (!blob) {
                        // toBlob a echoue : fallback original
                        resolve(file);
                        return;
                    }
                    // Renomme en .jpg (toBlob produit toujours du JPEG ici)
                    const originalName = file.name || 'photo';
                    const baseName = originalName.replace(/\.[^.]+$/, '');
                    const compressed = new File([blob], `${baseName}.jpg`, {
                        type: 'image/jpeg',
                        lastModified: Date.now()
                    });
                    resolve(compressed);
                }, 'image/jpeg', quality);
            } catch (e) {
                URL.revokeObjectURL(url);
                console.warn('[DistriMatch] compressImage error:', e.message);
                resolve(file);
            }
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(file);
        };

        img.src = url;
    });
}

// ============================================
// RYTHME INFERE (docs/STRATEGIE.md, couche 2)
// ============================================
// A partir des lignes de la vue product_rhythm (une par tranche horaire
// locale : signaux_produit, pct_dispo), compose "Habituellement plein le
// matin, souvent vide l'après-midi et le soir". Une tranche est "pleine" si
// >= RHYTHM_MIN_SIGNALS signaux produit et >= 70 % de "vu dispo", "souvent
// vide" si <= 30 %. Aucune tranche qualifiee -> null : rien n'est affiche,
// jamais une phrase inventee.
export const RHYTHM_SLOTS = ['matin', 'midi', 'apres-midi', 'soir'];
export const RHYTHM_MIN_SIGNALS = 3;
const RHYTHM_LABELS = { matin: 'le matin', midi: 'à midi', 'apres-midi': 'l\'après-midi', soir: 'le soir' };

function joinSlotLabels(labels) {
    if (labels.length === 1) return labels[0];
    return `${labels.slice(0, -1).join(', ')} et ${labels[labels.length - 1]}`;
}

export function describeRhythm(rows) {
    const full = [];
    const empty = [];
    for (const slot of RHYTHM_SLOTS) {
        const row = (Array.isArray(rows) ? rows : []).find(r => r && r.tranche === slot);
        if (!row || Number(row.signaux_produit) < RHYTHM_MIN_SIGNALS) continue;
        const pct = Number(row.pct_dispo);
        if (Number.isNaN(pct)) continue;
        if (pct >= 70) full.push(RHYTHM_LABELS[slot]);
        else if (pct <= 30) empty.push(RHYTHM_LABELS[slot]);
    }
    if (!full.length && !empty.length) return null;
    const parts = [];
    if (full.length) parts.push(`Habituellement plein ${joinSlotLabels(full)}`);
    if (empty.length) parts.push(`${full.length ? 'souvent' : 'Souvent'} vide ${joinSlotLabels(empty)}`);
    return parts.join(', ');
}

// Centre geometrique d'une liste de points { lat, lng } (coordonnees
// invalides ignorees), ou null si aucun point. Sert a centrer la carte sans
// position utilisateur : aucune coordonnee en dur, le centre vient des donnees.
export function centroidOf(points) {
    const valid = (Array.isArray(points) ? points : []).filter(p =>
        p && p.lat !== null && p.lat !== '' && p.lng !== null && p.lng !== ''
            && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng))
    );
    if (valid.length === 0) return null;
    const sum = valid.reduce((acc, p) => ({ lat: acc.lat + Number(p.lat), lng: acc.lng + Number(p.lng) }), { lat: 0, lng: 0 });
    return { lat: sum.lat / valid.length, lng: sum.lng / valid.length };
}
