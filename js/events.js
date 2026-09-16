/**
 * DistriMatch - Mesure du pilote (migration 008, RPC log_event)
 *
 * docs/STRATEGIE.md : les seuils go/no-go du pilote (5 % des scans QR
 * produisent un signal, 30 % des machines avec un signal < 7 j) ne se
 * verifient qu'avec une mesure. Cinq evenements, envoyes en fire-and-forget :
 * app_ouverte, qr_scan, fiche_ouverte, signal_envoye, itineraire.
 *
 * Aucune donnee personnelle : l'appareil est identifie par getDeviceId()
 * (aleatoire local, comme pour les signaux), la source vaut 'qr' (sticker sur
 * la machine) ou 'organic'. La table events n'a ni lecture ni ecriture
 * directe : tout passe par la RPC, qui ignore les distributeurs inconnus et
 * coupe le spam cote serveur. La mesure ne doit JAMAIS casser l'app : pas
 * d'await bloquant, pas d'erreur visible, no-op sans client Supabase.
 */

import { supabaseClient } from './state.js';
import { getDeviceId } from './utils.js';

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

// Arguments de la RPC log_event, ou null si le type est inconnu : on n'envoie
// jamais un evenement que le serveur refuserait.
export function buildEventArgs(type, { distributorId = null, source = null } = {}, deviceId = getDeviceId()) {
    if (!EVENT_TYPES.includes(type)) return null;
    return {
        p_type: type,
        p_device_hash: deviceId,
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
