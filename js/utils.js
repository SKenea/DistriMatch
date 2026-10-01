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

// Toast avec une action (« Annuler », EPIC-T12) : reste `duration` ms, et tant
// qu'il a le focus ou le survol (lecteurs d'ecran, WCAG 2.2.1). onAction une
// seule fois ; onExpire quand il disparait sans action. Retour : { dismiss }.
export function showActionToast(message, { actionLabel = 'Annuler', onAction = null, onExpire = null, duration = 7000, type = 'default' } = {}) {
    const container = document.getElementById('toast-container');
    if (!container) {
        onExpire?.();
        return { dismiss() {} };
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type} toast-action`;
    const text = document.createElement('span');
    text.textContent = message;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action-btn';
    btn.textContent = actionLabel;
    toast.append(text, btn);
    container.appendChild(toast);

    let done = false;
    let timer = null;
    function close(acted) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
        if (acted) onAction?.();
        else onExpire?.();
    }
    function arm() {
        clearTimeout(timer);
        timer = setTimeout(() => {
            if (toast.matches(':hover') || toast.contains(document.activeElement)) arm();
            else close(false);
        }, duration);
    }
    btn.addEventListener('click', () => close(true));
    arm();
    return { dismiss: () => close(false) };
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
// Refus « metier » de la RPC confirm_availability (007, 014) : les renvoyer ne
// sert a rien. P0001 = trop de signaux pour ce compte, P0002 = machine ou
// produit inconnu, 22023 = donnees invalides, 42501 = compte bloque. Le reste
// (session expiree 28000 / 401, reseau...) merite un renouvellement de session
// puis un renvoi (EPIC-T6).
const BUSINESS_SIGNAL_CODES = ['P0001', 'P0002', '22023', '42501'];

export function isBusinessSignalError(error) {
    return !!error && BUSINESS_SIGNAL_CODES.includes(error.code);
}

// Message d'erreur d'un signal non envoye, qui dit la raison (EPIC-T3).
//   error  : erreur Supabase ({ code, message }) ou exception reseau
//   status : code HTTP de la reponse (0 si pas de reponse)
//   online : navigator.onLine
export function describeSignalError(error, status = 0, online = true) {
    const message = String(error?.message || error || '');
    if (online === false || /failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
        return 'Pas de réseau : signal non envoyé';
    }
    if (error?.code === 'P0001') return 'Trop de signaux depuis ce compte, réessaie dans une heure';
    if (error?.code === 'P0002') return "Ce distributeur n'est pas encore sur le serveur : signal non envoyé";
    if (error?.code === '42501') return 'Ce compte ne peut plus envoyer de signaux';
    if (error?.code === '28000' || status === 401) return 'Ta session a expiré : reconnecte-toi';
    const code = error?.code || status || '?';
    return `Signal non envoyé, réessaie plus tard (code ${code})`;
}

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

// Retire des machines ajoutees localement (doublons d'une machine de la base,
// ou machines publiees depuis). EPIC-T9.
export function removeUserDistributors(ids) {
    if (!ids || ids.length === 0) return;
    const keep = loadUserDistributors().filter((d) => !ids.includes(d.id));
    try {
        localStorage.setItem(USER_DISTRIBUTORS_KEY, JSON.stringify(keep));
    } catch (e) {
        console.error('Erreur mise a jour distributeurs utilisateur:', e);
    }
}

// Nom compare sans casse, accents ni espaces superflus (« Gaztainbidéa  » = « gaztainbidea »)
export function normalizeName(name) {
    return String(name || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/\u0153/g, 'oe').replace(/\u00e6/g, 'ae')   // \u00ab \u0152ufs \u00bb = \u00ab oeufs \u00bb
        .replace(/\s+/g, ' ').trim();
}

// Machines ajoutees localement qui doublonnent une machine de la base : meme
// nom (normalise) a moins de radiusM metres, et absentes de la base par leur id
// (sinon la fusion par id s'en charge deja). EPIC-T9 : une copie locale d'une
// machine deja publiee (id different, position un peu decalee) ouvrait une fiche
// que la base ne connait pas (avis / signal refuses, code 23503). Retour : ids.
export function findLocalDuplicates(localList = [], remoteList = [], radiusM = 100) {
    const remoteIds = new Set(remoteList.map((d) => d.id));
    return localList
        .filter((local) => !remoteIds.has(local.id))
        .filter((local) => remoteList.some((remote) =>
            normalizeName(remote.name) === normalizeName(local.name)
            && Number.isFinite(Number(local.lat)) && Number.isFinite(Number(remote.lat))
            && calculateDistance(Number(local.lat), Number(local.lng), Number(remote.lat), Number(remote.lng)) * 1000 < radiusM))
        .map((local) => local.id);
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
// Un seul vocabulaire (Stephane, 2026-09-25, revu le 2026-09-30 / EPIC-T10) :
//   produit : « Dispo » / « Pas dispo » / « Pas d'info » (et on signale avec
//             les memes mots : « Dispo » / « Pas dispo »)
//   distributeur : « En service » / « Vide » / « En panne » / « Pas d'info »
//   Le mot « machine » n'apparait jamais sur la fiche.
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
    working: { label: 'En service', detail: 'Vu en service' },
    empty: { label: 'Vide', detail: 'Signalé vide' },
    broken: { label: 'En panne', detail: 'Signalé en panne' }
};

// Etat de la machine a droite du nom + la ligne qui dit d'ou il vient.
//   statusRow   : derniere ligne de distributor_status (ou null)
//   productRows : lignes de product_availability de la machine
//   lastVerified: distributors.last_verified (repli de la ligne de provenance)
// Un « vu dispo » plus recent que tout signal machine prouve qu'elle marche :
// « En service » deduit. Retour : { state, label, tone, fresh, at, age, detail }
// (age : « il y a 12 min », la ligne d'etat de la fiche l'affiche apres le mot).
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
        return { state: 'unknown', label: "Pas d'info", tone: 'unknown', fresh: false, at: null, age: fresh.label, detail: fresh.label };
    }
    const info = MACHINE_LABELS[best.state];
    return {
        state: best.state,
        label: info.label,
        tone: best.state,
        fresh: now - best.at < FRESH_MAX_AGE_MS,
        at: best.at,
        age: timeAgo(best.at, now),
        detail: `${info.detail} ${timeAgo(best.at, now)}`
    };
}

// Statut d'un produit de la fiche. EPIC-T12 : une seule notion de dispo, le
// signal ; products.available (ancien mode edition) n'est plus lu.
//   product   : le produit (non lu pour l'instant, garde pour la signature)
//   signalRow : son dernier signal (product_availability) ou null
//   machine   : resultat de resolveMachineStatus (ou null)
// Une machine vide / en panne plus recente que le signal du produit l'emporte :
// on ne peut rien acheter dans une machine vide. Retour : { label, tone, fresh, detail }.
// detail = la ligne d'age de la carte, toujours remplie (EPIC-T10) ; la cause
// « vide / en panne » est dite une seule fois, par le liseré (describeMachineNotice).
export const NO_SIGNAL_DETAIL = 'aucun signal depuis 24 h';

export function resolveProductStatus(product, signalRow, machine = null, now = Date.now()) {
    const ts = rowTime(signalRow);
    const hasSignal = signalRow && (signalRow.state === 'available' || signalRow.state === 'absent') && isRecent(ts, now);
    const machineDown = machine && (machine.state === 'empty' || machine.state === 'broken') && machine.at !== null;
    if (machineDown && (!hasSignal || machine.at > ts)) {
        return {
            label: 'Pas dispo',
            tone: 'absent',
            fresh: machine.fresh,
            detail: timeAgo(machine.at, now)
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
    return { label: "Pas d'info", tone: 'unknown', fresh: false, detail: NO_SIGNAL_DETAIL };
}

// En-tete du menu de l'etiquette (EPIC-T16) : « Pas d'info » n'est pas un choix
// (c'est l'absence de signal recent) ; on le dit en tete quand c'est l'etat actuel.
export function describeMenuHeader(tone) {
    return tone === 'available' || tone === 'absent' ? '' : "Actuellement : Pas d'info";
}

// Nom de produit saisi sur la fiche (EPIC-T12) : espaces reduits, 60 caracteres
// au plus. Doublon = meme nom normalise qu'un autre produit de la fiche.
export const PRODUCT_NAME_MAX = 60;

export function cleanProductName(raw) {
    return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, PRODUCT_NAME_MAX);
}

export function isDuplicateProductName(name, products = [], exceptId = null) {
    const n = normalizeName(name);
    return !!n && products.some(p => p && p.id !== exceptId && normalizeName(p.name) === n);
}

// Produits courants par type de distributeur (EPIC-T13), du plus frequent au moins
// frequent : les 4 premiers absents de la fiche sont proposes en pastilles, le reste
// sert aux suggestions du champ « Autre… ». Aucun produit regional (pas de
// territoire en dur, cf. CLAUDE.md) ; type sans liste = pas de pastilles.
export const PRODUCT_SUGGESTIONS = {
    agricultural: ['Pommes de terre', 'Carottes', 'Salades', 'Œufs', 'Panier de légumes', 'Tomates', 'Oignons', 'Pommes', 'Courgettes', 'Fruits de saison', 'Poireaux', 'Fraises'],
    terroir: ['Fromage', 'Miel', 'Confiture', 'Charcuterie', 'Œufs', 'Jus de fruits', 'Pâté', 'Yaourts', 'Vin', 'Cidre'],
    bakery: ['Baguette', 'Pain de campagne', 'Croissants', 'Pains au chocolat', 'Pain complet', 'Brioche', 'Chouquettes', 'Pain aux céréales'],
    cheese: ['Fromage de vache', 'Fromage de chèvre', 'Fromage de brebis', 'Fromage blanc', 'Tomme', 'Yaourts', 'Beurre', 'Lait'],
    dairy: ['Lait', 'Yaourts', 'Beurre', 'Fromage blanc', 'Crème', 'Fromage de vache', 'Fromage de chèvre', 'Fromage de brebis'],
    pizza: ['Margherita', 'Reine', '4 fromages', 'Chorizo', 'Végétarienne', 'Calzone'],
    meat: ['Steaks hachés', 'Saucisses', 'Poulet', 'Côtes de porc', 'Merguez', 'Rôti', 'Jambon', 'Pâté'],
    fries: ['Frites', 'Grande frite', 'Sauce', 'Nuggets', 'Boisson'],
    meals: ['Lasagnes', 'Hachis parmentier', 'Gratin dauphinois', 'Couscous', 'Chili con carne', 'Salade composée'],
    ice: ['Sac de glaçons (2 kg)', 'Sac de glaçons (5 kg)', 'Glace pilée'],
    general: ['Œufs', 'Lait', 'Pain', 'Fromage', 'Jus de fruits', 'Miel']
};

// Nom compare pour savoir si un produit est deja sur la fiche : sans casse ni
// accents, sans la precision entre parentheses (« Pommes de terre (2 kg) » =
// « Pommes de terre », mais pas « Pommes »).
function productKey(name) {
    return normalizeName(String(name || '').replace(/\([^)]*\)/g, ' '))
        .split(' ').map(w => w.replace(/[sx]$/, '')).join(' ');   // « Oeuf » = « Œufs »
}

function notOnFiche(existing) {
    const keys = new Set((existing || []).map(p => productKey(p && p.name)));
    return (name) => !keys.has(productKey(name));
}

// Pastilles d'ajout : les `limit` premiers produits courants du type, absents de la fiche.
export function suggestProducts(type, existing = [], limit = 4) {
    return (PRODUCT_SUGGESTIONS[type] || []).filter(notOnFiche(existing)).slice(0, limit);
}

// Suggestions du champ « Autre… » : correspondance au debut d'un mot, sans casse ni
// accents ; la liste du type d'abord, puis les autres ; sans doublon ni produit
// deja sur la fiche.
export function searchProductSuggestions(query, type, existing = [], limit = 5) {
    const q = normalizeName(query);
    if (!q) return [];
    const absent = notOnFiche(existing);
    const pool = [...(PRODUCT_SUGGESTIONS[type] || []), ...Object.values(PRODUCT_SUGGESTIONS).flat()];
    const seen = new Set();
    const out = [];
    for (const name of pool) {
        const key = productKey(name);
        if (seen.has(key)) continue;
        seen.add(key);
        if (!absent(name)) continue;
        if (!(` ${normalizeName(name)}`).includes(` ${q}`)) continue;
        out.push(name);
        if (out.length >= limit) break;
    }
    return out;
}

// Ordre des cartes produit (EPIC-T10) : Dispo, puis Pas d'info, puis Pas dispo.
const PRODUCT_TONE_RANK = { available: 0, unknown: 1, absent: 2 };

export function productToneRank(tone) {
    return PRODUCT_TONE_RANK[tone] ?? 1;
}

// Liseré unique au-dessus des cartes quand le distributeur est vide ou en panne
// (EPIC-T10) : la cause n'est plus repetee sur chaque carte. '' sinon.
export function describeMachineNotice(machine) {
    if (!machine || machine.at === null || machine.at === undefined) return '';
    if (machine.state === 'empty') return `Distributeur signalé vide ${machine.age} : les produits sont probablement épuisés.`;
    if (machine.state === 'broken') return `Distributeur signalé en panne ${machine.age}.`;
    return '';
}

// Picto d'un produit d'apres son nom (EPIC-T10) : mots-cles sans accents ni
// casse, au debut d'un mot, du plus precis au plus general (« pommes de terre »
// avant « pomme »).
// Aucun territoire en dur : des aliments courants ; 'generic' si rien ne colle.
const PRODUCT_ICON_RULES = [
    ['potato', ['pomme de terre', 'pommes de terre', 'patate']],
    ['carrot', ['carotte']],
    ['salad', ['salade', 'laitue', 'mache', 'epinard']],
    ['basket', ['panier', 'legume', 'soupe', 'tomate', 'oignon', 'courgette', 'poireau', 'haricot', 'chou']],
    ['egg', ['oeuf', 'œuf']],
    ['milk', ['lait', 'yaourt', 'yogourt', 'creme', 'beurre']],
    ['pizza', ['pizza']],
    ['cheese', ['fromage', 'tomme', 'brebis', 'chevre', 'comte']],
    ['bread', ['pain', 'baguette', 'viennoiserie', 'croissant', 'brioche']],
    ['meat', ['viande', 'boeuf', 'porc', 'agneau', 'veau', 'volaille', 'poulet', 'saucisse', 'jambon', 'charcuterie', 'terrine', 'burger']],
    ['fish', ['poisson', 'thon', 'saumon', 'crevette']],
    ['fruit', ['pomme', 'poire', 'fraise', 'cerise', 'fruit', 'kiwi', 'peche', 'abricot', 'prune', 'raisin']],
    ['honey', ['miel', 'confiture']],
    ['ice', ['glace', 'sorbet', 'esquimau']],
    ['fries', ['frite']],
    ['drink', ['jus', 'boisson', 'cidre', 'vin', 'biere', 'eau', 'soda', 'cafe', 'the ']],
    ['meal', ['plat', 'repas', 'sandwich', 'wrap', 'lasagne']]
];

export function productIconKey(name) {
    const n = ` ${normalizeName(name)} `;
    for (const [key, words] of PRODUCT_ICON_RULES) {
        if (words.some(w => n.includes(` ${w}`))) return key;
    }
    return 'generic';
}

// Fiche (EPIC-T4 / T5) : chaque information a une seule place.
//   bandeau : la machine marche-t-elle ? (couleur + etat en tres grand)
//   titre de la liste : ce qu'il y a (« 3 sur 5 dispo », vide si rien de connu)
//   machine  : resolveMachineStatus(...)
//   statuses : resolveProductStatus(...) de chaque produit de la fiche
export function describeFicheHero(machine, statuses = []) {
    const tone = machine?.tone || 'unknown';
    const kpi = machine?.label || "Pas d'info";
    const known = statuses.filter(s => s && s.tone !== 'unknown');
    if (statuses.length === 0 || known.length === 0) return { tone, kpi, count: '' };
    const dispo = statuses.filter(s => s && s.tone === 'available').length;
    return { tone, kpi, count: `${dispo} sur ${statuses.length} dispo` };
}

// ============================================
// AVIS (EPIC-T8)
// ============================================

export const REVIEW_BODY_MAX = 500;

// Libelle de la note d'une machine, calcule depuis les vrais avis (vue
// distributor_ratings). Retour : { hasReviews, score, stars, count, label }.
//   describeRating(12, 4.58) -> { hasReviews: true, score: '4.6', stars: '★★★★½', count: '(12)', label: '4.6 ★★★★½ (12)' }
//   describeRating(0, null)  -> { hasReviews: false, ..., label: "Pas encore d'avis" }
export function describeRating(avis, moyenne) {
    const n = Number(avis) || 0;
    const m = Number(moyenne);
    if (n <= 0 || !Number.isFinite(m) || m <= 0) {
        return { hasReviews: false, score: '', stars: '', count: '', label: "Pas encore d'avis" };
    }
    const rounded = Math.round(m * 10) / 10;
    const score = rounded.toFixed(1);
    const stars = generateStars(rounded);
    const count = `(${n})`;
    return { hasReviews: true, score, stars, count, label: `${score} ${stars} ${count}` };
}

// Validation d'un avis avant envoi (la base revalide) : note entiere 1..5,
// commentaire facultatif de REVIEW_BODY_MAX caracteres au plus (espaces retires,
// vide -> null). Retour : { ok, error, value: { rating, body } }.
export function validateReview({ rating, body } = {}) {
    const r = Number(rating);
    if (!Number.isInteger(r) || r < 1 || r > 5) {
        return { ok: false, error: 'Choisis une note de 1 à 5 étoiles', value: null };
    }
    const text = typeof body === 'string' ? body.trim() : '';
    if (text.length > REVIEW_BODY_MAX) {
        return { ok: false, error: `Ton commentaire dépasse ${REVIEW_BODY_MAX} caractères`, value: null };
    }
    return { ok: true, error: null, value: { rating: r, body: text || null } };
}

// Message d'un avis refuse par la base (migration 016), qui dit la raison.
export function describeReviewError(error, status = 0, online = true) {
    const message = String(error?.message || error || '');
    if (online === false || /failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
        return 'Pas de réseau : avis non publié';
    }
    if (error?.code === '23505') return 'Tu as déjà donné ton avis sur ce distributeur : tu peux le modifier';
    if (error?.code === '23503') return "Ce distributeur n'est pas encore sur le serveur : avis non publié";
    if (error?.code === 'P0001') return "Trop d'avis depuis ce compte, réessaie dans une heure";
    if (error?.code === '42501' && /publier/i.test(message)) return "Ce compte ne peut plus publier d'avis";
    if (error?.code === '28000' || status === 401) return 'Ta session a expiré : reconnecte-toi';
    if (error?.code === '23514') return 'Avis invalide : note de 1 à 5, 500 caractères au plus';
    return `Avis non publié, réessaie plus tard (code ${error?.code || status || '?'})`;
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
        // Provenance (018) : 'user' (membre), 'osm' (import OpenStreetMap), 'demo'
        source: d.source || (d.is_demo === true ? 'demo' : 'user'),
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
