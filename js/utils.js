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
    if (m < 1) return "à l'instant";
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
// machine est borne a 'empty' / 'broken' / 'working' (migration 011), sinon null.
// Etats machine acceptes par la RPC confirm_availability (007 + 011)
const MACHINE_STATES = ['empty', 'broken', 'working'];

export function buildAvailabilityPayload(distributorId, deviceId, choices = {}, machineState = null) {
    const productSignals = Object.entries(choices)
        .filter(([id, state]) => Number.isInteger(Number(id)) && (state === 'available' || state === 'absent'))
        .map(([id, state]) => ({ product_id: Number(id), state }));
    return {
        p_distributor_id: distributorId,
        p_device_hash: deviceId,
        p_product_signals: productSignals,
        p_machine_state: MACHINE_STATES.includes(machineState) ? machineState : null
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
        NotificationQueue.history = (parsed.history || []).map((n, i) => ({
            ...n,
            read: n.read === undefined ? true : n.read,
            // Identifiant stable pour la suppression (anciennes entrees sans id)
            id: n.id || `n-${n.timestamp || 0}-legacy${i}`
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
            reject(new Error('Géolocalisation non supportée'));
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

// ============================================
// FICHE : DISPO OU PAS, EN UN COUP D'OEIL (EPIC-T2)
// ============================================
// Un seul vocabulaire (retour de Stephane, 2026-09-25) :
//   produit : « Dispo » / « Pas dispo » / « Pas d'info »
//   machine : « Fonctionne » / « Vide » / « En panne » / « Pas d'info »
// Le mot repond a la question, la couleur dit la confiance : vive si le signal a
// moins de 2 h (fresh), grisee jusqu'a 24 h, « Pas d'info » au-dela
// (docs/STRATEGIE.md : jamais un vert perime).
export const SIGNAL_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function rowTime(row) {
    const ts = row && row.created_at ? new Date(row.created_at).getTime() : NaN;
    return Number.isNaN(ts) ? NaN : ts;
}

function isRecent(ts, now) {
    return !Number.isNaN(ts) && ts <= now + 60000 && now - ts < SIGNAL_MAX_AGE_MS;
}

const MACHINE_LABELS = {
    working: { label: 'Fonctionne', detail: 'Vue en marche' },
    empty: { label: 'Vide', detail: 'Signalée vide' },
    broken: { label: 'En panne', detail: 'Signalée en panne' }
};

// Etat de la machine a droite du nom + la ligne qui dit d'ou il vient.
//   statusRow   : derniere ligne de distributor_status (ou null)
//   productRows : lignes de product_availability de la machine
//   lastVerified: distributors.last_verified (repli de la ligne de provenance)
// Un « vu dispo » plus recent que tout signal machine prouve qu'elle marche :
// « Fonctionne » deduit. Retour : { state, label, tone, fresh, at, detail }.
export function resolveMachineStatus(statusRow, productRows = [], lastVerified = null, now = Date.now()) {
    let best = null;
    const machineTs = rowTime(statusRow);
    if (statusRow && MACHINE_LABELS[statusRow.state] && isRecent(machineTs, now)) {
        best = { state: statusRow.state, at: machineTs };
    }
    for (const row of productRows || []) {
        const ts = rowTime(row);
        if (row.state === 'available' && isRecent(ts, now) && (!best || ts > best.at)) {
            best = { state: 'working', at: ts };
        }
    }
    if (!best) {
        const fresh = getFreshness(lastVerified, now);
        return { state: 'unknown', label: "Pas d'info", tone: 'unknown', fresh: false, at: null, detail: fresh.label };
    }
    const info = MACHINE_LABELS[best.state];
    return {
        state: best.state,
        label: info.label,
        tone: best.state,
        fresh: now - best.at < FRESH_MAX_AGE_MS,
        at: best.at,
        detail: `${info.detail} ${timeAgo(best.at, now)}`
    };
}

// Statut d'un produit de la fiche.
//   product   : { available } (available === false : marque « Non disponible » en edition)
//   signalRow : son dernier signal (product_availability) ou null
//   machine   : resultat de resolveMachineStatus (ou null)
// Une machine vide / en panne plus recente que le signal du produit l'emporte :
// on ne peut rien acheter dans une machine vide. Retour : { label, tone, fresh, detail }.
export function resolveProductStatus(product, signalRow, machine = null, now = Date.now()) {
    if (product && product.available === false) {
        return { label: 'Pas dispo', tone: 'absent', fresh: false, detail: '' };
    }
    const ts = rowTime(signalRow);
    const hasSignal = signalRow && (signalRow.state === 'available' || signalRow.state === 'absent') && isRecent(ts, now);
    const machineDown = machine && (machine.state === 'empty' || machine.state === 'broken') && machine.at !== null;
    if (machineDown && (!hasSignal || machine.at > ts)) {
        return {
            label: 'Pas dispo',
            tone: 'absent',
            fresh: machine.fresh,
            detail: machine.state === 'empty' ? 'Machine vide' : 'Machine en panne'
        };
    }
    if (hasSignal) {
        return {
            label: signalRow.state === 'available' ? 'Dispo' : 'Pas dispo',
            tone: signalRow.state === 'available' ? 'available' : 'absent',
            fresh: now - ts < FRESH_MAX_AGE_MS,
            detail: `vu ${timeAgo(ts, now)}`
        };
    }
    return { label: "Pas d'info", tone: 'unknown', fresh: false, detail: '' };
}

// Ligne Supabase (snake_case, produits imbriques) -> distributeur de l'app
// (camelCase). isDemo vient de distributors.is_demo (migration 010) : true
// = fiche du jeu de donnees factice ; absent (migration pas encore passee)
// = reel. Le front ne l'ecrit jamais.
export function mapDistributorRow(d) {
    return {
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
        isDemo: d.is_demo === true,
        products: (d.products || []).map(p => ({
            id: p.id,   // id Supabase : requis pour les signaux de dispo (UC11)
            name: p.name,
            price: parseFloat(p.price) || 0,
            available: p.available
        }))
    };
}

// ============================================
// FAVORIS : CE QUI A CHANGE SUR UNE MACHINE SUIVIE
// ============================================

const FAVORITE_SIGNAL_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function signalTime(row) {
    const ts = row && row.created_at ? new Date(row.created_at).getTime() : NaN;
    return Number.isNaN(ts) ? 0 : ts;
}

// Compare le dernier etat VU d'une machine en favori (previous, stocke sur
// l'appareil) a son etat ACTUEL (current : lignes des vues distributor_status
// et product_availability de la migration 007). Fonction pure.
//   previous : { machineState, machineAt, products: { [productId]: { state, at } } } | undefined
//   current  : { machine: row | null, products: [row] }
//   options  : { now, followedProducts: ['pain', ...] (minuscules), productNames: { [productId]: nom } }
// Retour : { event, snapshot }. event = null ou { type, at, product? }, un seul par
// passage, le plus important d'abord : broken > empty > stock (produit suivi vu
// dispo) > restock (de nouveau dispo apres un vide, une panne ou un "vu absent").
// Premier passage (previous absent) : on memorise sans rien notifier. Un signal
// de plus de 24 h ne notifie pas.
export function diffFavoriteSignals(previous, current, options = {}) {
    const now = options.now ?? Date.now();
    const followed = (options.followedProducts || []).map(p => String(p).toLowerCase().trim()).filter(Boolean);
    const productNames = options.productNames || {};
    const machine = current?.machine || null;
    const rows = current?.products || [];

    const snapshot = {
        machineState: machine ? machine.state : null,
        machineAt: signalTime(machine),
        products: {}
    };
    for (const row of rows) {
        snapshot.products[row.product_id] = { state: row.state, at: signalTime(row) };
    }
    if (!previous) return { event: null, snapshot };

    const isFresh = (ts) => ts > 0 && now - ts < FAVORITE_SIGNAL_MAX_AGE_MS;
    const candidates = [];
    // "De nouveau dispo" apres un vide / une panne : seulement pour le PREMIER
    // "vu dispo" qui suit, sinon chaque signal suivant re-notifierait.
    const alreadyBack = Object.values(previous.products || {})
        .some(p => p.state === 'available' && p.at > (previous.machineAt || 0));
    const machineWasDown = (previous.machineState === 'empty' || previous.machineState === 'broken') && !alreadyBack;

    if (machine && snapshot.machineAt > (previous.machineAt || 0) && isFresh(snapshot.machineAt)) {
        if (machine.state === 'broken' || machine.state === 'empty') {
            candidates.push({ rank: machine.state === 'broken' ? 0 : 1, type: machine.state, at: snapshot.machineAt });
        } else if (machine.state === 'working' && machineWasDown) {
            // « Ça fonctionne » apres un vide / une panne : de nouveau en service
            candidates.push({ rank: 3, type: 'working', at: snapshot.machineAt });
        }
    }

    for (const row of rows) {
        const at = signalTime(row);
        const seen = (previous.products || {})[row.product_id];
        if (row.state !== 'available' || at <= (seen?.at || 0) || !isFresh(at)) continue;
        // Un "vu dispo" plus ancien que le dernier "vide / en panne" ne dit rien
        if (at <= snapshot.machineAt) continue;
        const name = productNames[row.product_id] || '';
        const lower = name.toLowerCase();
        if (name && followed.some(f => lower.includes(f))) {
            candidates.push({ rank: 2, type: 'stock', at, product: name });
        } else if (seen?.state === 'absent' || machineWasDown) {
            candidates.push({ rank: 3, type: 'restock', at, product: name });
        }
    }

    if (candidates.length === 0) return { event: null, snapshot };
    candidates.sort((a, b) => a.rank - b.rank || b.at - a.at);
    const { rank, ...event } = candidates[0];
    return { event, snapshot };
}
