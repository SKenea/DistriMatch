/**
 * DistriMatch - Mesure du pilote (migration 008, RPC log_event)
 *
 * docs/STRATEGIE.md : les seuils go/no-go du pilote (5 % des scans QR
 * produisent un signal, 30 % des machines avec un signal < 7 j) ne se
 * verifient qu'avec une mesure. Cinq evenements, envoyes en fire-and-forget :
 * app_ouverte, qr_scan, fiche_ouverte, signal_envoye, itineraire.
 *
 * Identifiant (PRIV-05) : un tirage aleatoire limite a la session de l'onglet
 * (sessionStorage, getSessionId), distinct de tout autre identifiant et jamais
 * envoye avec un signal : la mesure ne se relie pas a un compte. C'est une
 * donnee de mesure d'audience (pseudonyme) : la base efface les evenements
 * de plus de 13 mois (032). La source vaut 'qr' (sticker sur la machine) ou
 * 'organic'. La table events n'a ni lecture ni ecriture directe : tout passe
 * par la RPC, qui ignore les distributeurs inconnus et coupe le spam cote
 * serveur. La mesure ne doit JAMAIS casser l'app : pas d'await bloquant, pas
 * d'erreur visible, no-op sans client Supabase.
 */

import { supabaseClient } from './state.js';

export const EVENT_TYPES = ['app_ouverte', 'fiche_ouverte', 'qr_scan', 'signal_envoye', 'itineraire', 'alerte_abonnee'];
export const ENTRY_SOURCE_KEY = 'distrimatch_src';
export const DEFAULT_SOURCE = 'organic';

// Memorise l'origine de la visite (&src=qr) pour la session, avant tout
// nettoyage d'URL. Retourne la source lue, ou null si l'URL n'en porte pas.
export function rememberEntrySource(search) {
    const src = new URLSearchParams(search || '').get('src');
    if (!src) return null;
    try { sessionStorage.setItem(ENTRY_SOURCE_KEY, src); } catch (e) { /* sessionStorage indisponible */ }
    return src;
}

export function getEntrySource() {
    try { return sessionStorage.getItem(ENTRY_SOURCE_KEY) || DEFAULT_SOURCE; } catch (e) { return DEFAULT_SOURCE; }
}

// Identifiant de la mesure (PRIV-05) : aleatoire, limite a la session de
// l'onglet (sessionStorage), jamais en localStorage ni avec un signal. Une
// nouvelle session (onglet ou app rouverts) en tire un nouveau. sessionStorage
// bloque : un identifiant en memoire, le temps de la page.
export const SESSION_ID_KEY = 'distrimatch_session';
let memoSessionId = null;

function newSessionId() {
    return (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `ses-${Date.now().toString(36)}-${Math.random().toString(36).slice(2).padEnd(12, '0')}`;
}

export function getSessionId() {
    try {
        const stored = sessionStorage.getItem(SESSION_ID_KEY);
        if (stored && stored.length >= 16) return stored;
        const id = newSessionId();
        sessionStorage.setItem(SESSION_ID_KEY, id);
        return id;
    } catch (e) {
        if (!memoSessionId) memoSessionId = newSessionId();
        return memoSessionId;
    }
}

// Arguments de la RPC log_event, ou null si le type est inconnu : on n'envoie
// jamais un evenement que le serveur refuserait. p_device_hash est le nom du
// parametre de la RPC (008) : il porte l'identifiant de session.
// signal_envoye : identifiant a usage unique (newSessionId, jamais enregistre).
// L'heure et le distributeur le rapprochent du signal, enregistre avec le
// compte : il ne doit pas porter l'identifiant de la session.
export function buildEventArgs(type, { distributorId = null, source = null } = {}, sessionId = type === 'signal_envoye' ? newSessionId() : getSessionId()) {
    if (!EVENT_TYPES.includes(type)) return null;
    return {
        p_type: type,
        p_device_hash: sessionId,
        p_distributor_id: distributorId || null,
        p_source: source || getEntrySource()
    };
}

export function logEvent(type, options = {}) {
    if (!supabaseClient) return;
    const args = buildEventArgs(type, options);
    if (!args) return;
    Promise.resolve()
        .then(() => supabaseClient.rpc('log_event', args))
        .then(({ error }) => { if (error) console.debug('[DistriMatch] Evenement non enregistre :', error.message); })
        .catch(() => { /* la mesure ne casse jamais l'app */ });
}
