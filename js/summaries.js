/**
 * DistriMatch - Etat et stock de chaque distributeur, pour la carte et la liste (EPIC-T19)
 *
 * Deux lectures anonymes au chargement (vues distributor_status et
 * product_availability, toutes les fiches), mises a jour par la fiche ouverte
 * apres un signal (setSummaryFor). Le resume reprend les regles de la fiche
 * (describeDistributorSummary, utils.js) : meme etat, meme stock.
 * Un evenement « distrimatch:summaries » previent la carte et la liste.
 * Fire-and-forget : Supabase absent = anneaux « Pas d'info ».
 */

import { supabaseClient } from './state.js';
import { describeDistributorSummary } from './utils.js';

export const SUMMARIES_EVENT = 'distrimatch:summaries';
const raw = new Map();   // id -> { status, products: { [product_id]: row } }

export function getDistributorSummary(distributor) {
    const r = raw.get(distributor?.id);
    return describeDistributorSummary(distributor, r?.status || null, r?.products || {});
}

function notify(ids) {
    document.dispatchEvent(new CustomEvent(SUMMARIES_EVENT, { detail: { ids } }));
}

// Apres un signal sur la fiche ouverte : la pastille suit sans recharger.
export function setSummaryFor(distributorId, status, products) {
    if (!distributorId) return;
    raw.set(distributorId, { status: status || null, products: { ...(products || {}) } });
    notify([distributorId]);
}

export async function loadSignalSummaries() {
    if (!supabaseClient) return;
    try {
        const [statusRes, productsRes] = await Promise.all([
            supabaseClient.from('distributor_status').select('distributor_id, state, source, created_at'),
            supabaseClient.from('product_availability').select('distributor_id, product_id, state, source, created_at')
        ]);
        if (statusRes.error || productsRes.error) return;
        raw.clear();
        for (const row of statusRes.data || []) raw.set(row.distributor_id, { status: row, products: {} });
        for (const row of productsRes.data || []) {
            if (!raw.has(row.distributor_id)) raw.set(row.distributor_id, { status: null, products: {} });
            raw.get(row.distributor_id).products[row.product_id] = row;
        }
        notify(null);
    } catch (e) {
        /* hors ligne : anneaux « Pas d'info » */
    }
}

// Anneau d'etat (EPIC-T19, maquette 2-feuille) : couleur = etat du distributeur,
// partie pleine = part des produits dispo (plein sans produit liste, ou vide /
// en panne) ; « Pas d'info » = pointille gris, reconnaissable sans la couleur.
const RING_COLORS = { working: '#16A34A', empty: '#EA580C', broken: '#DC2626', unknown: '#94A3B8' };

export function renderStatusRing(summary, className = 'status-ring') {
    const color = RING_COLORS[summary?.state] || RING_COLORS.unknown;
    const r = 19;
    const c = 2 * Math.PI * r;
    if (!summary || summary.state === 'unknown') {
        return `<svg class="${className}" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="${r}" fill="none" stroke="${color}" stroke-width="4" stroke-dasharray="5 4"/></svg>`;
    }
    const arc = Math.max(0, Math.min(1, summary.fill)) * c;
    const track = `<circle cx="22" cy="22" r="${r}" fill="none" stroke="${color}" stroke-opacity="0.28" stroke-width="4"/>`;
    const fill = arc > 0
        ? `<circle cx="22" cy="22" r="${r}" fill="none" stroke="${color}" stroke-width="4" stroke-dasharray="${arc.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 22 22)"/>`
        : '';
    return `<svg class="${className}" viewBox="0 0 44 44" aria-hidden="true">${track}${fill}</svg>`;
}
