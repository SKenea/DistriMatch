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
// Un chargement plus ancien qui finit apres un plus recent ne doit rien ecraser
let loadSeq = 0;

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

function isNewerRow(a, b) {
    return new Date(a.created_at).getTime() > new Date(b.created_at).getTime();
}

function summaryKey(entry) {
    const s = entry.status;
    const products = Object.keys(entry.products).sort()
        .map(id => `${id}:${entry.products[id].state}@${entry.products[id].created_at}@${entry.products[id].source}`);
    return `${s ? `${s.state}@${s.created_at}@${s.source}` : ''}|${products.join(',')}`;
}

// Veille des favoris (NOTIF-02) : etat frais de quelques fiches (lignes des vues
// distributor_status / product_availability). Une ligne deja connue plus recente
// (signal envoye, vue en retard) est gardee. Un seul evenement, et seulement si
// quelque chose a change (chaque evenement redessine toutes les pastilles).
export function mergeSummaries(statusRows, productRows, ids) {
    const changed = [];
    for (const id of ids || []) {
        const before = raw.get(id) || { status: null, products: {} };
        let status = (statusRows || []).find(row => row.distributor_id === id) || null;
        if (before.status && (!status || isNewerRow(before.status, status))) status = before.status;
        const products = { ...before.products };
        for (const row of productRows || []) {
            if (row.distributor_id !== id) continue;
            const known = products[row.product_id];
            if (!known || !isNewerRow(known, row)) products[row.product_id] = row;
        }
        const next = { status, products };
        if (summaryKey(next) === summaryKey(before)) continue;
        raw.set(id, next);
        changed.push(id);
    }
    if (changed.length > 0) notify(changed);
}

export async function loadSignalSummaries() {
    if (!supabaseClient) return;
    const seq = ++loadSeq;
    try {
        const [statusRes, productsRes] = await Promise.all([
            supabaseClient.from('distributor_status').select('distributor_id, state, source, created_at'),
            supabaseClient.from('product_availability').select('distributor_id, product_id, state, source, created_at')
        ]);
        if (seq !== loadSeq || statusRes.error || productsRes.error) return;
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

// A11Y-03 : Vide et En panne se reconnaissent aussi sans la couleur (WCAG 1.4.1) : un petit
// signe en bas a droite de la pastille de la carte (decision Stephane 2026-11-10). En service
// et Pas d'info : rien (anneau qui se remplit, pointille). La liste ecrit deja le mot.
const STATUS_SIGNS = { empty: '−', broken: '!' };

export function renderStatusSign(summary) {
    const sign = STATUS_SIGNS[summary?.state];
    return sign ? `<span class="distributor-pin-sign is-${summary.state}" aria-hidden="true">${sign}</span>` : '';
}
