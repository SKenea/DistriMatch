/**
 * DistriMatch - Aides partagees des tests fonctionnels (tests/functional/*.spec.js)
 *
 * Tests FONCTIONNELS : l'app tourne dans un vrai navigateur (Playwright), sur
 * http://localhost:8080, mais le serveur est SIMULE la ou il faut un resultat
 * maitrise (page.route sur les RPC et les vues Supabase). Rapides, reproductibles,
 * ils verifient les criteres d'acceptation des user stories du BACKLOG.
 * Les tests E2E sans aucune simulation sont dans tests/e2e/.
 */
import { expect } from '@playwright/test';


export const BASE_URL = 'http://localhost:8080';

// Mesure (008) : la RPC log_event est interceptee dans TOUS les tests, aucun vrai
// evenement n'atteint Supabase. captureEvents() renvoie la liste des appels.
export const EVENTS_ROUTE = '**/rest/v1/rpc/log_event';

export async function captureEvents(page, status = 200) {
    const events = [];
    await page.route(EVENTS_ROUTE, route => {
        const body = route.request().postDataJSON() || {};
        events.push({ type: body.p_type, distributorId: body.p_distributor_id, source: body.p_source, device: body.p_device_hash, raw: body });
        route.fulfill({ status, contentType: 'application/json', body: 'null' });
    });
    return events;
}

// ============================================
// HELPERS
// ============================================

export async function setupApp(page, context) {
    await captureEvents(page);
    await context.grantPermissions(['geolocation'], { origin: BASE_URL });
    await context.setGeolocation({ latitude: 43.4929, longitude: -1.4748 });
    await page.goto(BASE_URL);
    await page.waitForSelector('#geoloc-btn', { state: 'visible', timeout: 10000 });
    await page.click('#geoloc-btn');

    try {
        await page.waitForSelector('#geoloc-overlay.hidden', { timeout: 10000 });
    } catch {
        await page.evaluate(() => {
            if (window.AppState) window.AppState.userLocation = { lat: 43.4929, lng: -1.4748 };
            document.getElementById('geoloc-overlay')?.classList.add('hidden');
        });
    }

    await page.waitForFunction(
        () => window.AppState?.distributors?.length > 0,
        { timeout: 50000 }
    );
}

export async function openDistModal(page, index = 0) {
    await page.evaluate((i) => {
        const d = window.AppState.distributors[i];
        window.openDistributorModal(d.id);
    }, index);
    await page.waitForSelector('#dist-modal-overlay.active', { timeout: 5000 });
}

// EPIC-T5 : informer / modifier sont des privileges de compte. En local, le
// magic link ne peut pas aboutir : window.__testLogin() (js/auth.js,
// localhost uniquement) simule un compte connecte.
export async function loginForTest(page) {
    await page.evaluate(() => window.__testLogin());
}

// ============================================
// 13. SIGNAL DE DISPO EN UN TAP (UC11, chantier 2)
// ============================================
// Aucun vrai signal n'est envoye : la RPC est interceptee par page.route.

export const RPC_ROUTE = '**/rest/v1/rpc/confirm_availability';

// Fiche ouverte sur une machine qui a au moins un produit signalable (id
// Supabase). Retourne { id, productId }.
export async function openSignalableFiche(page, { login = true } = {}) {
    if (login) await loginForTest(page);
    const first = await page.evaluate(() => {
        const ok = (p) => p && p.id !== null && p.id !== undefined && p.id !== '' && Number.isInteger(Number(p.id));
        const d = window.AppState.distributors.find(x => (x.products || []).some(ok));
        return d ? { id: d.id, productId: String(d.products.find(ok).id) } : null;
    });
    expect(first).not.toBeNull();
    await page.evaluate(id => window.openDistributorModal(id), first.id);
    await page.waitForSelector('#dist-modal-overlay.active', { timeout: 5000 });
    return first;
}

// Signale le premier aliment depuis sa ligne : toucher la ligne, puis le choix.
export async function signalFirstProduct(page, state = 'available') {
    await page.locator('#dist-products-list button.product-row-main').first().click();
    await page.locator(`#dist-products-list .product-choices:not([hidden]) .product-choice[data-state="${state}"]`).click();
}

// Vues de lecture des signaux (007) interceptees : l'etat de depart est maitrise.
export async function routeSignals(page, { status = [], products = [] } = {}) {
    await page.route(url => url.pathname.endsWith('/rest/v1/distributor_status'), route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(status) }));
    await page.route(url => url.pathname.endsWith('/rest/v1/product_availability'), route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(products) }));
}

export const minutesAgoIso = (m) => new Date(Date.now() - m * 60000).toISOString();

// ============================================
// 14. CIBLES TACTILES >= 44 px (WCAG 2.5.5, iOS HIG, Material)
// ============================================
// Mesure la zone effective de chaque element interactif visible : sa boite,
// le <label> qui l'enveloppe (toggles), ou son pseudo-element ::after
// d'extension (base.css, "cibles tactiles"). Ecrans : carte + side panel,
// fiche + "Il reste quoi ?", chat, compte, notifications, profil, reglages
// notifs, favoris, activite.

export const TARGET_MIN = 44;
// Hors perimetre : attribution Leaflet (tiers) et marqueur de position (non actionnable)
export const TARGET_ALLOWLIST = ['.leaflet-control-attribution', '.user-marker-container'];

export async function collectSmallTargets(page, screen) {
    await page.waitForTimeout(400);
    return page.evaluate(({ min, allow, screen }) => {
        const sel = 'button, a[href], [role="button"], input, select, .filter-chip, .nav-tab';
        const out = [];
        for (const el of document.querySelectorAll(sel)) {
            if (allow.some(s => el.matches(s) || el.closest(s))) continue;
            if (el.type === 'hidden' || el.type === 'file') continue;
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
            // Une vue glissee hors ecran n'est pas testable sur cet ecran
            if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) continue;
            const label = el.closest('label');
            const base = label ? label.getBoundingClientRect() : r;
            let w = base.width;
            let h = base.height;
            const ps = getComputedStyle(el, '::after');
            if (ps.content !== 'none' && ps.position === 'absolute') {
                const pw = parseFloat(ps.width);
                const ph = parseFloat(ps.height);
                if (pw > 0) w = Math.max(w, pw);
                if (ph > 0) h = Math.max(h, ph);
            }
            if (w < min - 0.5 || h < min - 0.5) {
                const key = (el.id ? '#' + el.id : '') + '.' + String(el.className || '').trim().split(/\s+/).slice(0, 2).join('.');
                out.push(`${screen} ${key} ${Math.round(w)}x${Math.round(h)}`);
            }
        }
        return out;
    }, { min: TARGET_MIN, allow: TARGET_ALLOWLIST, screen });
}

// ============================================
// 17. RYTHME INFERE (vue product_rhythm, couche 2)
// ============================================
// La vue est interceptee : un profil boulangerie donne la phrase attendue sous
// la fraicheur ; sans lignes, rien n'est affiche (jamais une phrase inventee).

export const RHYTHM_ROUTE = '**/rest/v1/product_rhythm*';

// ============================================
// 18. TABLEAU DE BORD DU PILOTE (vues kpi_*, js/stats.js)
// ============================================
// Les vues sont interceptees ; on verifie les chiffres, le seuil, la
// navigation Compte -> tableau de bord -> retour, l'etat vide, et l'absence
// de debordement en 390 px.

export const KPI_ROUTE = '**/rest/v1/kpi_*';

export function kpiFixture() {
    const today = new Date().toISOString().slice(0, 10);
    return {
        kpi_coverage: [{ machines: 30, machines_signal_24h: 21, machines_signal_7j: 25, machines_verifiees_24h: 21, signaux_7j: 1500, signaux_30j: 3320 }],
        kpi_contribution: [{ signaux_30j: 3320, fiches_ouvertes_30j: 267, fiches_via_qr_30j: 60, scans_qr_30j: 60, signaux_envoyes_30j: 200, signaux_via_qr_30j: 15, itineraires_30j: 85 }],
        kpi_signals_daily: [{ jour: today, source: 'anon', signaux: 100 }, { jour: today, source: 'user', signaux: 20 }],
        kpi_top_distributors: Array.from({ length: 6 }, (_, i) => ({
            id: `dist-00${i}`, name: `Machine ${i}`, type: 'bakery',
            fiches_ouvertes_30j: 60 - i, signaux_30j: 10 * i, last_verified: new Date().toISOString()
        }))
    };
}

export async function routeKpi(page, fixture) {
    await page.route(KPI_ROUTE, route => {
        const url = route.request().url();
        const key = Object.keys(fixture).find(k => url.includes(`/rest/v1/${k}`));
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(key ? fixture[key] : []) });
    });
}

// ============================================
// 19. TOASTS VISIBLES (au-dessus des modales et de la bottom nav)
// ============================================
// Audit UX 2026-09-18 (UX-01/10) : le toast etait rendu sous la fiche
// (z-index 300 vs 10500) et recouvrait la bottom nav sur la carte.

export async function toastGeometry(page) {
    return page.evaluate(() => {
        const t = document.querySelector('#toast-container .toast');
        if (!t) return null;
        const r = t.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const nav = document.querySelector('.bottom-nav')?.getBoundingClientRect();
        return { onTop: !!(top && t.contains(top)), bottom: r.bottom, right: r.right, navTop: nav ? nav.top : null, navVisible: !!nav && nav.height > 0, vw: innerWidth };
    });
}

// ============================================
// 21. LISIBILITE MOBILE : polices >= 12 px, contrastes >= 4,5:1 (audit UX-07/08)
// ============================================
// Mesure sur les styles calcules, en 390 px, des ecrans de la boucle coeur.
// Exclus : attribution Leaflet (tiers), note inventee (#dist-modal-rating,
// decision differee, cf. audit UX-14), compteurs en pastille (.nav-tab-badge).

export async function collectTextIssues(page, screen) {
    await page.waitForTimeout(350);
    return page.evaluate((screen) => {
        const SKIP = ['.leaflet-control-attribution', '#dist-modal-rating', '.side-panel-item-rating', '.nav-tab-badge', '.nav-badge'];
        const key = el => (el.id ? '#' + el.id : el.tagName.toLowerCase()) + '.' + String(el.className || '').trim().split(/\s+/).slice(0, 2).join('.');
        const vis = el => {
            const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return false;
            if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
            let e = el.parentElement;
            while (e) { const c = getComputedStyle(e); if (c.opacity === '0' || c.visibility === 'hidden' || c.display === 'none') return false; e = e.parentElement; }
            return true;
        };
        const parse = c => { const m = (c || '').match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
        const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
        const bgOf = el => {
            let e = el;
            while (e) {
                const cs = getComputedStyle(e);
                if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;   // degrade : non juge
                const c = parse(cs.backgroundColor);
                if (c && c.a > 0) { if (c.a < 1) { const under = e.parentElement ? bgOf(e.parentElement) : null; return under ? blend(c, under) : null; } return c; }
                e = e.parentElement;
            }
            return { r: 255, g: 255, b: 255, a: 1 };
        };
        const issues = []; const seen = new Set();
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            const t = node.textContent.trim(); if (!t) continue;
            const el = node.parentElement; if (!el || seen.has(el) || !vis(el)) continue;
            if (SKIP.some(s => el.matches(s) || el.closest(s))) continue;
            seen.add(el);
            const cs = getComputedStyle(el); const fs = parseFloat(cs.fontSize);
            if (fs < 12) issues.push(`${screen} ${key(el)} police ${fs.toFixed(1)}px "${t.slice(0, 20)}"`);
            const fg = parse(cs.color); const bg = bgOf(el); if (!fg || !bg) continue;
            const fgb = fg.a < 1 ? blend(fg, bg) : fg;
            const L1 = lum(fgb), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
            const large = fs >= 24 || (fs >= 18.66 && parseInt(cs.fontWeight) >= 700);
            if (ratio < (large ? 3 : 4.5)) issues.push(`${screen} ${key(el)} contraste ${ratio.toFixed(2)}:1 "${t.slice(0, 20)}"`);
        }
        return issues;
    }, screen);
}

// ============================================
// 22. GEOLOCALISATION OBLIGATOIRE (retour terrain 2026-09-25, annule UX-02)
// ============================================
// Decision Stephane (2026-09-25, T1-US5) : pas de carte sans geolocalisation.
// Refus -> l'ecran reste, avec les instructions et « Réessayer ». Un deep link
// (QR) montre la fiche, mais la fermer ramene l'ecran de geolocalisation.

export const overlayGone = (page) => page.evaluate(() => { const o = document.getElementById('geoloc-overlay'); return !o || o.classList.contains('hidden'); });

// ============================================
// 31. FICHES DE DEMONSTRATION (distributors.is_demo, migration 010)
// ============================================
// Le GET des distributeurs est intercepte par predicat (le glob
// '**/rest/v1/distributors*' attraperait aussi l'insert et le PATCH, et '?'
// est un joker Playwright). Une fiche fictive + une reelle, avec produits.

export function demoDistributorsFixture() {
    const now = new Date().toISOString();
    const row = (id, name, is_demo, lat) => ({
        id, name, type: 'pizza', emoji: '🍕', address: `${name}, Bayonne`, city: 'Bayonne', lat, lng: -1.4748,
        rating: 4.2, review_count: 7, status: 'verified', last_verified: now, price_range: '€€',
        is_user_added: false, is_demo, tz: 'Europe/Paris',
        products: [{ id: is_demo ? 9001 : 9002, name: 'Margherita', price: 9.5, available: true }]
    });
    return [row('demo-e2e', 'Fiche fictive e2e', true, 43.4935), row('real-e2e', 'Vraie machine e2e', false, 43.4940)];
}

export async function routeDistributors(page, rows) {
    await page.route(url => url.pathname.endsWith('/rest/v1/distributors'), route =>
        route.request().method() === 'GET'
            ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) })
            : route.fallback());
}
