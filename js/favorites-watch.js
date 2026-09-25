/**
 * DistriMatch - Veille des favoris
 *
 * "On s'abonne a un distributeur et on recoit des notifications dans son centre
 * de notifications." Pas de push ni de Realtime pour l'instant : a l'ouverture
 * de l'app, au retour sur l'onglet, puis toutes les 5 minutes, on lit le dernier
 * signal de chaque machine en favori (vues distributor_status et
 * product_availability, migration 007, lecture anonyme) et on le compare au
 * dernier etat vu sur cet appareil (NotificationPrefs.lastSeenSignals).
 * Un changement = une notification (js/notifications.js : heures calmes,
 * cooldown d'1 h par machine, cloche, bandeau, historique).
 *
 * Ne bloque jamais l'init : tout est fire-and-forget, un Supabase absent ou
 * injoignable ne produit ni erreur ni notification.
 */

import { AppState, NotificationPrefs, supabaseClient } from './state.js';
import { diffFavoriteSignals, saveNotificationPrefs } from './utils.js';
import { canNotify, notifyFavoriteEvent } from './notifications.js';

const WATCH_INTERVAL_MS = 5 * 60 * 1000;

let isChecking = false;
let rerunRequested = false;
let isStarted = false;
// Machines dont le prochain etat est a memoriser sans notifier : celles ou
// l'utilisateur vient lui-meme d'envoyer un signal (on ne notifie pas
// quelqu'un de ce qu'il vient de dire, retour terrain 2026-09-25).
const silentIds = new Set();

function groupByDistributor(rows) {
    const groups = {};
    for (const row of rows || []) {
        (groups[row.distributor_id] = groups[row.distributor_id] || []).push(row);
    }
    return groups;
}

// Retourne une promesse (pratique pour les tests) mais ne rejette jamais :
// les appelants ne l'attendent pas. options.silentIds : machines a memoriser
// sans notifier. Un appel pendant un controle en cours n'est pas perdu : un
// nouveau controle part a la fin (favori ajoute, signal envoye entre-temps).
export async function checkFavoriteUpdates(options = {}) {
    for (const id of options.silentIds || []) silentIds.add(id);
    if (isChecking) {
        rerunRequested = true;
        return [];
    }
    const ids = [...AppState.subscriptions];
    if (ids.length === 0 || !supabaseClient) {
        silentIds.clear();
        return [];
    }

    isChecking = true;
    const silent = new Set(silentIds);
    silentIds.clear();
    const sent = [];
    try {
        const [statusRes, productsRes] = await Promise.all([
            supabaseClient.from('distributor_status').select('*').in('distributor_id', ids),
            supabaseClient.from('product_availability').select('*').in('distributor_id', ids)
        ]);
        if (statusRes.error || productsRes.error) return sent;

        const machines = groupByDistributor(statusRes.data);
        const products = groupByDistributor(productsRes.data);
        if (!NotificationPrefs.lastSeenSignals) NotificationPrefs.lastSeenSignals = {};
        const seen = NotificationPrefs.lastSeenSignals;

        for (const id of ids) {
            // Favori retire pendant la requete, ou fiche pas encore chargee
            if (!AppState.subscriptions.includes(id)) continue;
            const distributor = AppState.distributors.find(d => d.id === id);
            if (!distributor) continue;

            const productNames = {};
            for (const p of distributor.products || []) productNames[p.id] = p.name;

            const { event, snapshot } = diffFavoriteSignals(
                seen[id],
                { machine: (machines[id] || [])[0] || null, products: products[id] || [] },
                { followedProducts: NotificationPrefs.followedProducts, productNames }
            );
            // Signal envoye par l'utilisateur lui-meme : on memorise, sans notifier
            if (silent.has(id)) {
                seen[id] = snapshot;
                continue;
            }
            // Cooldown en cours : on ne memorise pas, l'evenement repassera au
            // prochain controle au lieu d'etre perdu.
            if (event && !canNotify(id)) continue;

            seen[id] = snapshot;
            if (event) {
                notifyFavoriteEvent(distributor, event);
                sent.push({ distributorId: id, ...event });
            }
        }

        // Menage : un favori retire ne garde pas d'etat
        for (const id of Object.keys(seen)) {
            if (!AppState.subscriptions.includes(id)) delete seen[id];
        }
        saveNotificationPrefs();
    } catch (e) {
        console.warn('[DistriMatch] Veille des favoris indisponible :', e?.message || e);
    } finally {
        isChecking = false;
        if (rerunRequested) {
            rerunRequested = false;
            checkFavoriteUpdates();
        }
    }
    return sent;
}

// Apres un signal envoye depuis la fiche : si la machine est en favori, son
// nouvel etat devient l'etat vu, sans notification.
export function rememberOwnSignal(distributorId) {
    if (!AppState.subscriptions.includes(distributorId)) return;
    checkFavoriteUpdates({ silentIds: [distributorId] });
}

export function startFavoritesWatch() {
    checkFavoriteUpdates();
    if (isStarted) return;
    isStarted = true;

    setInterval(() => {
        if (document.visibilityState === 'visible') checkFavoriteUpdates();
    }, WATCH_INTERVAL_MS);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkFavoriteUpdates();
    });
}
