/**
 * DistriMatch - Tableau de bord du pilote (vues kpi_* de la migration 008)
 *
 * docs/STRATEGIE.md : le pilote se juge sur des chiffres, pas sur une
 * impression. KPI directeur = % de machines avec un signal < 24 h ; seuils
 * go/no-go a 3 mois : 30 % des machines avec un signal < 7 j, 5 % des scans
 * QR qui produisent un signal. Lecture anonyme d'agregats (jamais une ligne
 * brute). Aucun territoire en dur : les vues comptent ce qu'il y a en base.
 */

import { supabaseClient } from './state.js';
import { escapeHTML, getFreshness } from './utils.js';

export const PILOT_THRESHOLDS = { coverage7d: 30, contribution: 5 };
const DAYS_SHOWN = 7;
const TOP_SHOWN = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

// Pourcentage entier, ou null quand le denominateur est nul : on n'affiche
// pas un "0 %" qui ne veut rien dire.
export function percent(numerator, denominator) {
    const den = num(denominator);
    if (den <= 0) return null;
    return Math.round(100 * num(numerator) / den);
}

export function formatPercent(pct) {
    return pct === null || pct === undefined ? '—' : `${pct} %`;
}

// Modele du tableau de bord a partir des lignes brutes des vues. Pur : les
// tests DOM le nourrissent avec des donnees fixes.
export function buildStatsModel({ coverage = null, contribution = null, signalsDaily = [], topDistributors = [] } = {}, now = Date.now()) {
    const cov = coverage || {};
    const con = contribution || {};
    const machines = num(cov.machines);
    const signals30d = num(cov.signaux_30j);

    // Signaux par jour (toutes sources confondues), 7 jours, les jours sans
    // signal a 0 : la vue est en dates UTC, on compare en UTC.
    const byDay = {};
    for (const row of signalsDaily || []) {
        if (!row || !row.jour) continue;
        byDay[row.jour] = (byDay[row.jour] || 0) + num(row.signaux);
    }
    const daily = [];
    for (let i = 0; i < DAYS_SHOWN; i++) {
        const day = new Date(now - i * DAY_MS).toISOString().slice(0, 10);
        daily.push({ day, n: byDay[day] || 0 });
    }

    const top = (topDistributors || []).slice(0, TOP_SHOWN).map(row => ({
        id: row.id,
        name: row.name || row.id,
        opened: num(row.fiches_ouvertes_30j),
        signals: num(row.signaux_30j),
        freshness: getFreshness(row.last_verified, now),
        isDemo: row.is_demo === true
    }));

    return {
        empty: machines === 0 && signals30d === 0,
        machines,
        coverage24h: { pct: percent(cov.machines_signal_24h, machines), n: num(cov.machines_signal_24h) },
        coverage7d: { pct: percent(cov.machines_signal_7j, machines), n: num(cov.machines_signal_7j), threshold: PILOT_THRESHOLDS.coverage7d },
        contribution: { pct: percent(con.signaux_via_qr_30j, con.scans_qr_30j), n: num(con.signaux_via_qr_30j), scans: num(con.scans_qr_30j), threshold: PILOT_THRESHOLDS.contribution },
        qrShare: { pct: percent(con.fiches_via_qr_30j, con.fiches_ouvertes_30j), n: num(con.fiches_via_qr_30j), opened: num(con.fiches_ouvertes_30j) },
        signals30d,
        routes30d: num(con.itineraires_30j),
        // Fiches fictives (distributors.is_demo, migration 010) ; null si la vue ne l'expose pas encore
        machinesDemo: cov.machines_demo == null ? null : num(cov.machines_demo),
        daily,
        top
    };
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function thresholdClass(pct, threshold) {
    if (pct === null) return '';
    return pct >= threshold ? 'is-ok' : 'is-ko';
}

function formatDay(day) {
    try {
        return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    } catch (e) {
        return day;
    }
}

// Rend le modele dans #stats-view. message : etat vide explicite (service
// indisponible, chargement, aucune donnee) a la place des cartes.
export function renderStatsView(model, message = null) {
    const emptyEl = document.getElementById('stats-empty');
    const content = document.getElementById('stats-content');
    if (!emptyEl || !content) return;

    const text = message || (model.empty ? 'Pas encore de données : le tableau de bord se remplit avec les premiers signaux.' : null);
    emptyEl.textContent = text || '';
    emptyEl.hidden = !text;
    content.hidden = !!text;
    if (text) return;

    setText('stats-coverage-24h', formatPercent(model.coverage24h.pct));
    setText('stats-coverage-detail', `${model.coverage24h.n} machine${model.coverage24h.n > 1 ? 's' : ''} sur ${model.machines}`);
    const demoNote = document.getElementById('stats-demo-note');
    if (demoNote) {
        const n = model.machinesDemo;
        demoNote.textContent = n > 0 ? `dont ${n} de démo (données fictives)` : '';
        demoNote.hidden = !(n > 0);
    }
    const threshold = document.getElementById('stats-coverage-threshold');
    if (threshold) {
        threshold.textContent = `Seuil du pilote à 3 mois : ${model.coverage7d.threshold} % des machines avec un signal de moins de 7 j · aujourd'hui ${formatPercent(model.coverage7d.pct)}`;
        threshold.className = `stats-threshold ${thresholdClass(model.coverage7d.pct, model.coverage7d.threshold)}`.trim();
    }

    setText('stats-contrib-rate', formatPercent(model.contribution.pct));
    setText('stats-contrib-detail', `${model.contribution.n} signaux pour ${model.contribution.scans} scans · seuil ${model.contribution.threshold} %`);
    const contribCell = document.getElementById('stats-contrib-cell');
    if (contribCell) contribCell.className = `stats-cell ${thresholdClass(model.contribution.pct, model.contribution.threshold)}`.trim();
    setText('stats-qr-share', formatPercent(model.qrShare.pct));
    setText('stats-qr-detail', `${model.qrShare.n} sur ${model.qrShare.opened} fiches ouvertes`);
    setText('stats-signals-30j', String(model.signals30d));
    setText('stats-routes-30j', String(model.routes30d));

    const dailyEl = document.getElementById('stats-daily');
    if (dailyEl) {
        const max = Math.max(1, ...model.daily.map(d => d.n));
        dailyEl.innerHTML = model.daily.map(d => `
            <li class="stats-row">
                <span class="stats-row-label">${escapeHTML(formatDay(d.day))}</span>
                <span class="stats-bar" aria-hidden="true"><span class="stats-bar-fill" style="width:${Math.round(100 * d.n / max)}%"></span></span>
                <span class="stats-row-value">${d.n}</span>
            </li>`).join('');
    }

    const topEl = document.getElementById('stats-top');
    if (topEl) {
        topEl.innerHTML = model.top.length
            ? model.top.map(t => `
            <li class="stats-row">
                <span class="stats-row-label"><span class="stats-row-name">${escapeHTML(t.name)}${t.isDemo ? ' <span class="demo-tag">Démo</span>' : ''}</span><span class="stats-row-sub is-${t.freshness.state}">${escapeHTML(t.freshness.label)}</span></span>
                <span class="stats-row-value">${t.opened}<span class="stats-row-unit"> ${t.opened > 1 ? 'vues' : 'vue'}</span> · ${t.signals}<span class="stats-row-unit"> ${t.signals > 1 ? 'signaux' : 'signal'}</span></span>
            </li>`).join('')
            : '<li class="stats-row stats-row--empty">Aucune fiche ouverte sur 30 jours</li>';
    }
}

// Chargement a l'ouverture de la vue (callback onShow, jamais await par
// l'appelant). Quatre vues en parallele ; une erreur = etat vide explicite.
export function loadStats() {
    if (!supabaseClient) {
        renderStatsView(buildStatsModel(), 'Service indisponible : les chiffres du pilote viennent de Supabase.');
        return;
    }
    renderStatsView(buildStatsModel(), 'Chargement…');
    Promise.all([
        supabaseClient.from('kpi_coverage').select('*').limit(1),
        supabaseClient.from('kpi_contribution').select('*').limit(1),
        supabaseClient.from('kpi_signals_daily').select('*'),
        supabaseClient.from('kpi_top_distributors').select('*').order('fiches_ouvertes_30j', { ascending: false }).limit(TOP_SHOWN)
    ]).then(([cov, con, daily, top]) => {
        const failed = [cov, con, daily, top].find(r => r.error);
        if (failed) throw failed.error;
        renderStatsView(buildStatsModel({
            coverage: (cov.data || [])[0] || null,
            contribution: (con.data || [])[0] || null,
            signalsDaily: daily.data || [],
            topDistributors: top.data || []
        }));
    }).catch(e => {
        console.warn('[DistriMatch] Tableau de bord indisponible :', e?.message || e);
        renderStatsView(buildStatsModel(), 'Chiffres indisponibles pour le moment, réessaie plus tard.');
    });
}
