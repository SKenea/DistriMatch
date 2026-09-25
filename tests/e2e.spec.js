/**
 * DistriMatch - Tests end-to-end (Google Maps design)
 * Lancer : npx playwright test tests/e2e.spec.js --headed
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:8080';

// Mesure (008) : la RPC log_event est interceptee dans TOUS les tests, aucun vrai
// evenement n'atteint Supabase. captureEvents() renvoie la liste des appels.
const EVENTS_ROUTE = '**/rest/v1/rpc/log_event';

async function captureEvents(page, status = 200) {
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

async function setupApp(page, context) {
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

async function openDistModal(page, index = 0) {
    await page.evaluate((i) => {
        const d = window.AppState.distributors[i];
        window.openDistributorModal(d.id);
    }, index);
    await page.waitForSelector('#dist-modal-overlay.active', { timeout: 5000 });
}

test.beforeEach(async ({ page, context }) => {
    await setupApp(page, context);
});

// ============================================
// 1. ONBOARDING
// ============================================

test.describe('1. Onboarding', () => {
    test('la carte se charge apres validation geoloc', async ({ page }) => {
        const overlay = await page.$('#geoloc-overlay');
        if (overlay) {
            const classes = await overlay.getAttribute('class');
            expect(classes).toContain('hidden');
        }
        const map = await page.$('.leaflet-container');
        expect(map).not.toBeNull();
        const distCount = await page.evaluate(() => window.AppState.distributors.length);
        expect(distCount).toBeGreaterThan(0);
    });

    test('des marqueurs sont affiches sur la carte', async ({ page }) => {
        const markerCount = await page.evaluate(() =>
            document.querySelectorAll('.distributor-marker-container').length
        );
        expect(markerCount).toBeGreaterThan(0);
    });
});

// ============================================
// 1bis. DEEP LINK (?id=<distId>) sans consentement geoloc
// ============================================

test.describe('1bis. Deep link sans consentement geoloc', () => {
    test.beforeEach(async () => { /* override : pas de setupApp */ });

    test('lien partage ouvre la modal meme avant clic geoloc', async ({ browser }) => {
        // Nouveau context vierge : pas de permission geoloc accordee
        const context = await browser.newContext();
        await context.route(EVENTS_ROUTE, route => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));   // aucun vrai evenement
        const page = await context.newPage();

        // Recuperer un id de distributeur reel via une 1ere visite normale
        const tempPage = await context.newPage();
        await tempPage.goto(BASE_URL);
        await tempPage.waitForFunction(
            () => window.AppState?.distributors?.length > 0,
            { timeout: 50000 }
        );
        const firstId = await tempPage.evaluate(() => window.AppState.distributors[0].id);
        await tempPage.close();

        // Visiter le deep link sans cliquer sur "Activer la localisation"
        await page.goto(`${BASE_URL}/?id=${firstId}`);

        // La modal doit apparaitre (au-dessus de l'onboarding)
        await page.waitForSelector('#dist-modal-overlay.active', { timeout: 50000 });

        // L'onboarding geoloc reste affiche en arriere-plan (pas hidden)
        const overlayHidden = await page.evaluate(() =>
            document.getElementById('geoloc-overlay')?.classList.contains('hidden')
        );
        expect(overlayHidden).toBe(false);

        // L'URL doit etre nettoyee apres ouverture
        const url = await page.url();
        expect(url).not.toContain('?id=');

        await context.close();
    });
});

// ============================================
// 2. NAVIGATION
// ============================================

test.describe('2. Navigation', () => {
    test('bottom nav : Explorer / Favoris / Activité', async ({ page }) => {
        const tabs = await page.$$eval('.bottom-nav .nav-tab span:first-of-type', els =>
            els.map(el => el.textContent.trim())
        );
        expect(tabs).toEqual(expect.arrayContaining(['Explorer', 'Favoris', 'Activité']));
    });

    test('clic sur Activite ouvre la vue activite', async ({ page }) => {
        await page.click('.bottom-nav [data-tab="activity"]');
        await page.waitForSelector('#activity-view.view-active', { timeout: 3000 });
    });

    test('clic sur Favoris ouvre la vue favoris', async ({ page }) => {
        await page.click('.bottom-nav [data-tab="favorites"]');
        await page.waitForSelector('#subscriptions-view.view-active', { timeout: 3000 });
        const h2 = await page.textContent('#subscriptions-view h2');
        expect(h2).toBe('Mes Favoris');
    });
});

// ============================================
// 3. PANNEAU LATERAL FILTRES (Google Maps style)
// ============================================

test.describe('3. Panneau lateral filtres', () => {
    test('clic sur un filter chip ouvre le panneau lateral', async ({ page }) => {
        await page.click('.filter-chip[data-type="pizza"]');
        await page.waitForSelector('.side-panel.open', { timeout: 3000 });

        const panelOpen = await page.evaluate(() =>
            document.getElementById('sidebar').classList.contains('open')
        );
        expect(panelOpen).toBe(true);
    });

    test('le titre du panneau correspond au filtre', async ({ page }) => {
        await page.click('.filter-chip[data-type="pizza"]');
        await page.waitForSelector('.side-panel.open');

        const title = await page.textContent('#side-panel-title');
        expect(title).toContain('Pizza');
    });

    test('le panneau liste les distributeurs filtres', async ({ page }) => {
        await page.click('.filter-chip[data-type="pizza"]');
        await page.waitForSelector('.side-panel.open');
        // Accordeon : les items sont dans le DOM mais caches (groupes fermes).
        await page.waitForSelector('#side-panel-list .side-panel-item', { state: 'attached', timeout: 3000 });

        const items = await page.$$('#side-panel-list .side-panel-item');
        expect(items.length).toBeGreaterThan(0);
    });

    // Fraicheur (docs/STRATEGIE.md, chantier 1) : chaque item porte l'age de
    // sa derniere verification, ou "Pas encore vérifié".
    test('chaque item du panneau affiche sa fraicheur', async ({ page }) => {
        await page.click('.filter-chip[data-type="pizza"]');
        await page.waitForSelector('.side-panel.open');
        await page.waitForSelector('#side-panel-list .side-panel-item', { state: 'attached', timeout: 3000 });

        const r = await page.$$eval('#side-panel-list .side-panel-item', items => ({
            total: items.length,
            avecFraicheur: items.filter(i =>
                /^(Vérifié |Pas encore vérifié)/.test(i.querySelector('.side-panel-item-verified')?.textContent.trim() || '')
            ).length,
        }));
        expect(r.total).toBeGreaterThan(0);
        expect(r.avecFraicheur).toBe(r.total);
    });

    test('clic sur un item du panneau ouvre la modal', async ({ page }) => {
        await page.click('.filter-chip[data-type="pizza"]');
        await page.waitForSelector('.side-panel.open');
        // Accordeon : les groupes sont fermes par defaut, deplier le premier
        // groupe non vide avant de pouvoir cliquer un item.
        const headers = await page.$$('#side-panel-list .side-panel-group-header');
        for (const h of headers) {
            await h.click();
            const visible = await page.$('#side-panel-list .side-panel-group-items:not([hidden]) .side-panel-item');
            if (visible) break;
        }
        await page.click('#side-panel-list .side-panel-group-items:not([hidden]) .side-panel-item');
        await page.waitForSelector('#dist-modal-overlay.active', { timeout: 3000 });
    });

    test('bouton fermer ferme le panneau', async ({ page }) => {
        await page.click('.filter-chip[data-type="pizza"]');
        await page.waitForSelector('.side-panel.open');
        await page.click('#side-panel-close');
        await page.waitForTimeout(500);

        const panelOpen = await page.evaluate(() =>
            document.getElementById('sidebar').classList.contains('open')
        );
        expect(panelOpen).toBe(false);
    });

    test('clic sur Tous ouvre le panneau avec liste complete', async ({ page }) => {
        await page.click('.filter-chip[data-type="all"]');
        await page.waitForSelector('.side-panel.open', { timeout: 3000 });

        const title = await page.textContent('#side-panel-title');
        expect(title).toContain('Tous');

        const totalDist = await page.evaluate(() => window.AppState.distributors.length);
        const items = await page.$$('#side-panel-list .side-panel-item');
        expect(items.length).toBe(totalDist);
    });

    test('Tous : croix puis re-clic -> etats chip/panneau coherents', async ({ page }) => {
        // 1) clic Tous : panneau ouvert + chip actif
        await page.click('.filter-chip[data-type="all"]');
        await page.waitForSelector('.side-panel.open', { timeout: 3000 });
        let s = await page.evaluate(() => ({
            open: document.getElementById('sidebar').classList.contains('open'),
            active: document.querySelector('.filter-chip[data-type="all"]').classList.contains('active'),
        }));
        expect(s).toEqual({ open: true, active: true });

        // 2) fermeture via la croix : panneau ferme + chip deselectionne
        await page.click('#side-panel-close');
        await page.waitForTimeout(400);
        s = await page.evaluate(() => ({
            open: document.getElementById('sidebar').classList.contains('open'),
            active: document.querySelector('.filter-chip[data-type="all"]').classList.contains('active'),
        }));
        expect(s).toEqual({ open: false, active: false });

        // 3) re-clic Tous : panneau ouvert ET chip actif (coherent)
        await page.click('.filter-chip[data-type="all"]');
        await page.waitForSelector('.side-panel.open', { timeout: 3000 });
        s = await page.evaluate(() => ({
            open: document.getElementById('sidebar').classList.contains('open'),
            active: document.querySelector('.filter-chip[data-type="all"]').classList.contains('active'),
        }));
        expect(s).toEqual({ open: true, active: true });
    });

    test('re-clic sur Tous ferme le panneau et deselectionne le chip', async ({ page }) => {
        await page.click('.filter-chip[data-type="all"]');
        await page.waitForSelector('.side-panel.open');

        await page.click('.filter-chip[data-type="all"]');
        await page.waitForTimeout(500);

        const panelOpen = await page.evaluate(() =>
            document.getElementById('sidebar').classList.contains('open')
        );
        expect(panelOpen).toBe(false);

        const tousActive = await page.evaluate(() =>
            document.querySelector('.filter-chip[data-type="all"]').classList.contains('active')
        );
        expect(tousActive).toBe(false);
    });

    test('re-clic sur un type ferme le panneau (Tous reste inactif)', async ({ page }) => {
        await page.click('.filter-chip[data-type="pizza"]');
        await page.waitForSelector('.side-panel.open');

        await page.click('.filter-chip[data-type="pizza"]');
        await page.waitForTimeout(500);

        const panelOpen = await page.evaluate(() =>
            document.getElementById('sidebar').classList.contains('open')
        );
        expect(panelOpen).toBe(false);

        const tousActive = await page.evaluate(() =>
            document.querySelector('.filter-chip[data-type="all"]').classList.contains('active')
        );
        expect(tousActive).toBe(false);
    });

});

// ============================================
// 3ter. GROUPES PAR DISTANCE (side panel)
// ============================================

test.describe('3ter. Groupes par distance (accordeon)', () => {
    test('3 en-tetes, somme des compteurs == nb items', async ({ page }) => {
        await page.click('.filter-chip[data-type="all"]');
        await page.waitForSelector('.side-panel.open');
        await page.waitForSelector('#side-panel-list .side-panel-group-header');

        const headers = await page.$$('#side-panel-list .side-panel-group-header');
        // Audit UX-12 : les tranches vides ne sont plus affichees
        const nonEmpty = await page.$$eval('#side-panel-list .spg-count', els => els.filter(e => parseInt(e.textContent, 10) > 0).length);
        expect(headers.length).toBeLessThanOrEqual(3);
        expect(headers.length).toBe(nonEmpty);

        const counts = await page.$$eval(
            '#side-panel-list .spg-count',
            els => els.map(e => parseInt(e.textContent, 10))
        );
        const sumCounts = counts.reduce((s, n) => s + n, 0);
        const itemCount = await page.$$eval(
            '#side-panel-list .side-panel-item', els => els.length
        );
        expect(sumCounts).toBe(itemCount);
    });

    test('premier groupe non vide ouvert par defaut, les autres fermes ; clic en-tete replie / deplie', async ({ page }) => {
        await page.click('.filter-chip[data-type="all"]');
        await page.waitForSelector('#side-panel-list .side-panel-group-header');

        // Audit UX-03/12 : le premier groupe qui a des items est deplie d'emblee
        const states = await page.$$eval(
            '#side-panel-list .side-panel-group',
            els => els.map(g => ({
                expanded: g.querySelector('.side-panel-group-header').getAttribute('aria-expanded'),
                count: parseInt(g.querySelector('.spg-count').textContent, 10),
                hidden: g.querySelector('.side-panel-group-items').hidden
            }))
        );
        const firstNonEmpty = states.findIndex(s => s.count > 0);
        states.forEach((s, i) => {
            expect(s.expanded).toBe(i === firstNonEmpty ? 'true' : 'false');
            expect(s.hidden).toBe(i !== firstNonEmpty);
        });
        expect(await page.$('#side-panel-list .side-panel-group-items:not([hidden]) .side-panel-item')).not.toBeNull();

        // Clic sur l'en-tete ouverte -> elle se replie ; second clic -> se deplie
        const header = page.locator('#side-panel-list .side-panel-group-header').nth(firstNonEmpty);
        await header.click();
        await expect(header).toHaveAttribute('aria-expanded', 'false');
        expect(await page.$('#side-panel-list .side-panel-group-items:not([hidden])')).toBeNull();
        await header.click();
        await expect(header).toHaveAttribute('aria-expanded', 'true');
    });

    test('en-tete affiche le libelle + la plage + le mode de transport', async ({ page }) => {
        await page.click('.filter-chip[data-type="all"]');
        await page.waitForSelector('#side-panel-list .side-panel-group-header');

        const first = await page.$eval('#side-panel-list .side-panel-group-header', el => ({
            label: el.querySelector('.spg-label')?.textContent,
            sub: el.querySelector('.spg-sub')?.textContent,
            transportTitle: el.querySelector('.spg-transport')?.getAttribute('title'),
            transportText: el.querySelector('.spg-transport')?.textContent,
        }));
        expect(first.label).toBe('À proximité');
        expect(first.sub).toContain("moins d'1 km");
        // Icone seule visible, libelle accessible via title/aria-label
        expect(first.transportText).toBe('🚶');
        expect(first.transportTitle).toBe('à pied');
    });

    test('en-tetes collants (sticky)', async ({ page }) => {
        await page.click('.filter-chip[data-type="all"]');
        await page.waitForSelector('#side-panel-list .side-panel-group-header');

        const pos = await page.$eval(
            '#side-panel-list .side-panel-group-header',
            el => getComputedStyle(el).position
        );
        expect(pos).toBe('sticky');
    });

    test('sans geoloc : liste plate, aucun en-tete de groupe', async ({ page }) => {
        await page.evaluate(() => { window.AppState.userLocation = null; });
        await page.click('.filter-chip[data-type="pizza"]');
        await page.waitForSelector('#side-panel-list .side-panel-item');

        const headers = await page.$$('#side-panel-list .side-panel-group-header');
        expect(headers.length).toBe(0);
    });
});

// ============================================
// 4. MODAL DISTRIBUTEUR
// ============================================

test.describe('4. Modal distributeur', () => {
    test('la modal s\'ouvre avec les infos', async ({ page }) => {
        await openDistModal(page);
        const name = await page.textContent('#dist-modal-name');
        expect(name).toBeTruthy();
    });

    test('rating + reviews + type visibles', async ({ page }) => {
        await openDistModal(page);
        const rating = await page.textContent('#dist-modal-rating');
        expect(rating).toContain('★');
        const reviews = await page.textContent('#dist-modal-reviews');
        expect(reviews).toMatch(/\d/);
    });

    test('3 onglets presents (Produits / Avis / A propos)', async ({ page }) => {
        await openDistModal(page);
        const tabs = await page.$$eval('.dist-tab', els => els.map(el => el.textContent.trim()));
        expect(tabs).toEqual(['Produits', 'Avis', 'À propos']);
    });

    test('clic onglet Avis change le pane actif', async ({ page }) => {
        await openDistModal(page);
        await page.click('.dist-tab[data-tab="avis"]');
        await page.waitForTimeout(300);

        const active = await page.evaluate(() =>
            document.querySelector('.dist-tab-pane.active').dataset.tabPane
        );
        expect(active).toBe('avis');
    });

    test('clic onglet A propos affiche l\'adresse', async ({ page }) => {
        await openDistModal(page);
        await page.click('.dist-tab[data-tab="apropos"]');
        await page.waitForTimeout(300);

        const address = await page.textContent('#dist-apropos-address');
        expect(address).toBeTruthy();
    });

    test('bouton fermer ferme la modal', async ({ page }) => {
        await openDistModal(page);
        await page.click('#dist-modal-close');
        await page.waitForTimeout(300);

        const active = await page.evaluate(() =>
            document.getElementById('dist-modal-overlay').classList.contains('active')
        );
        expect(active).toBe(false);
    });

    test('boutons Itineraire et Favori visibles', async ({ page }) => {
        await openDistModal(page);
        expect(await page.$('#dist-action-directions')).not.toBeNull();
        expect(await page.$('#dist-action-favorite')).not.toBeNull();
    });

    // Fraicheur (docs/STRATEGIE.md, chantier 1) : l'age de la derniere
    // verification est toujours affiche en tete de fiche, ou "Pas encore
    // vérifié" ; jamais un etat vide ou faux.
    test('fraicheur : "Vérifié il y a X" ou "Pas encore vérifié" en tete de fiche', async ({ page }) => {
        await openDistModal(page);
        const r = await page.evaluate(() => {
            const el = document.getElementById('dist-modal-verified');
            return { text: el?.textContent.trim(), cls: el?.className };
        });
        expect(r.text).toMatch(/^(Vérifié (il y a \d+ (min|h|j)|à l'instant)|Pas encore vérifié)$/);
        expect(r.cls).toMatch(/\bis-(fresh|stale|unknown)\b/);
    });

});

// ============================================
// 5. AUTH WALL
// ============================================

test.describe('5. Auth wall', () => {
    test('clic favori : ajout local SANS mur d\'auth', async ({ page }) => {
        await page.evaluate(() => { window.AppState.subscriptions = []; localStorage.clear(); });
        await openDistModal(page);
        const id = await page.evaluate(() => window.AppState.currentDistributor.id);
        await page.evaluate(() => document.getElementById('dist-action-favorite').click());
        // Favori = purement local : pas de modale d'auth, ajout immediat
        await page.waitForTimeout(400);
        const r = await page.evaluate((did) => ({
            authShown: !!document.querySelector('.auth-modal-overlay'),
            subscribed: window.AppState.subscriptions.includes(did),
        }), id);
        expect(r.authShown).toBe(false);
        expect(r.subscribed).toBe(true);
    });

    test('clic + Ajouter un distributeur declenche la modal auth', async ({ page }) => {
        // Localhost saute le mur d'auth par defaut : on le reactive pour ce test
        await page.evaluate(() => localStorage.setItem('distrimatch_force_auth', '1'));
        await page.click('#btn-add-distributor');
        await page.waitForSelector('.auth-modal-overlay', { timeout: 3000 });

        const modal = await page.$('.auth-modal');
        expect(modal).not.toBeNull();
    });
});

// ============================================
// 5bis. MODIFICATION DEPUIS FAVORIS (stylo)
// ============================================

test.describe('5bis. Modification via stylo', () => {
    async function openFirstFavoriteCard(page) {
        await page.evaluate(() => {
            const id = window.AppState.distributors[0].id;
            window.AppState.subscriptions = [id];
        });
        await page.click('.bottom-nav [data-tab="favorites"]');
        await page.waitForSelector('#subscriptions-view.view-active');
        await page.waitForSelector('#subscriptions-list .subscription-card');
        await page.click('#subscriptions-list .subscription-card');
        await page.waitForSelector('#dist-modal-overlay.active', { timeout: 3000 });
    }

    test('carte favori ouvre la fiche en LECTURE avec stylo visible', async ({ page }) => {
        await openFirstFavoriteCard(page);

        const state = await page.evaluate(() => ({
            edit: window.AppState.modalEditMode,
            canEdit: window.AppState.modalCanEdit,
            addHidden: getComputedStyle(document.getElementById('dist-products-add-section')).display === 'none',
        }));
        expect(state.edit).toBe(false);
        expect(state.canEdit).toBe(true);
        expect(state.addHidden).toBe(true);
        await expect(page.locator('#dist-action-edit')).toBeVisible();
    });

    test('clic stylo non identifie -> modale "Connexion requise", pas d\'edition', async ({ page }) => {
        await openFirstFavoriteCard(page);
        await page.click('#dist-action-edit');
        await page.waitForSelector('#edit-auth-gate', { timeout: 3000 });

        const r = await page.evaluate(() => {
            const gate = document.getElementById('edit-auth-gate');
            return {
                gateText: gate.querySelector('h2')?.textContent,
                hasCta: !!gate.querySelector('#edit-auth-gate-go'),
                stillReadonly: window.AppState.modalEditMode === false,
            };
        });
        expect(r.gateText).toBe('Connexion requise');
        expect(r.hasCta).toBe(true);
        expect(r.stillReadonly).toBe(true);
    });

    test('modale gate : clic "Se connecter" -> modale email directement, fiche toujours ouverte', async ({ page }) => {
        // Auth comme en prod (sinon requireAuth() est contourne sur localhost)
        await page.evaluate(() => localStorage.setItem('distrimatch_force_auth', '1'));
        await openFirstFavoriteCard(page);
        await page.click('#dist-action-edit');
        await page.waitForSelector('#edit-auth-gate', { timeout: 3000 });
        await page.click('#edit-auth-gate-go');
        // 2 etapes : la modale email s'ouvre sans detour par la page Compte
        await page.waitForSelector('.auth-modal-overlay', { timeout: 3000 });

        const r = await page.evaluate(() => ({
            gateGone: !document.getElementById('edit-auth-gate'),
            emailModal: !!document.querySelector('.auth-modal'),
            modalStillOpen: document.getElementById('dist-modal-overlay').classList.contains('active'),
            accountNotOpened: !document.getElementById('account-view').classList.contains('view-active'),
            stillReadonly: window.AppState.modalEditMode === false,
        }));
        expect(r.gateGone).toBe(true);
        expect(r.emailModal).toBe(true);
        expect(r.modalStillOpen).toBe(true);
        expect(r.accountNotOpened).toBe(true);
        expect(r.stillReadonly).toBe(true);
    });

    test('mode edition affiche produits CRUD + ajout, stylo masque, chat inactif', async ({ page }) => {
        await openFirstFavoriteCard(page);
        // Auth contournee pour isoler le rendu edition
        await page.evaluate(() => {
            const id = window.AppState.currentDistributor.id;
            window.openDistributorModal(id, true, true);
        });
        const r = await page.evaluate(() => ({
            edit: window.AppState.modalEditMode,
            addVisible: getComputedStyle(document.getElementById('dist-products-add-section')).display !== 'none',
            chatVisible: getComputedStyle(document.getElementById('dist-chat-section')).display !== 'none',
            styloHidden: getComputedStyle(document.getElementById('dist-action-edit')).display === 'none',
        }));
        expect(r.edit).toBe(true);
        expect(r.addVisible).toBe(true);
        expect(r.chatVisible).toBe(false);   // chat inactif (FEATURES.chat)
        expect(r.styloHidden).toBe(true);
    });

    test('niveau de prix affiche + select edition, aucun prix produit', async ({ page }) => {
        await openFirstFavoriteCard(page);
        await page.evaluate(() => {
            const id = window.AppState.currentDistributor.id;
            window.openDistributorModal(id, true, true);
        });
        const r = await page.evaluate(() => ({
            headerPrice: document.getElementById('dist-modal-pricerange').textContent,
            selectVal: document.getElementById('dist-edit-pricerange').value,
            priceCleanCount: document.querySelectorAll('#dist-products-list .product-price-clean').length,
            priceInputCount: document.querySelectorAll('#dist-products-list .product-edit-price').length,
            addPriceInput: document.getElementById('dist-add-product-price'),
        }));
        expect(['€', '€€', '€€€']).toContain(r.headerPrice);
        expect(r.selectVal).toBe(r.headerPrice);
        expect(r.priceCleanCount).toBe(0);
        expect(r.priceInputCount).toBe(0);
        expect(r.addPriceInput).toBeNull();
    });

    // Retour terrain 2026-09-25 (T1-US1) : une fiche se complete d'ou qu'on l'ouvre
    test('hors Favoris (carte, liste, deep link) -> stylo visible, connexion demandee au clic', async ({ page }) => {
        await page.evaluate(() => {
            const id = window.AppState.distributors[0].id;
            window.openDistributorModal(id); // comme side panel / carte / deep link
        });
        await page.waitForSelector('#dist-modal-overlay.active');
        await expect(page.locator('#dist-action-edit')).toBeVisible();
        expect(await page.evaluate(() => window.AppState.modalEditMode)).toBe(false);

        await page.click('#dist-action-edit');
        await page.waitForSelector('#edit-auth-gate', { timeout: 3000 });
        expect(await page.evaluate(() => window.AppState.modalEditMode)).toBe(false);
    });

    test("machine sans produit : la liste propose « Ajouter les produits » (passe par la connexion)", async ({ page }) => {
        const id = await page.evaluate(() => {
            const d = window.AppState.distributors[0];
            d.products = [];
            return d.id;
        });
        await page.evaluate((distId) => window.openDistributorModal(distId), id);
        await page.waitForSelector('#dist-modal-overlay.active');
        await expect(page.locator('#dist-products-list')).toContainText('Aucun produit référencé');
        await page.click('#dist-products-add-first');
        await page.waitForSelector('#edit-auth-gate', { timeout: 3000 });
    });
});

// ============================================
// 5ter. CENTRE DE NOTIFICATIONS (cloche)
// ============================================

test.describe('5ter. Centre de notifications', () => {
    test('la cloche ouvre la vue notifications (empty state)', async ({ page }) => {
        await page.click('.nav-icon-btn[data-view="notifications"]');
        await page.waitForSelector('#notifications-view.view-active', { timeout: 3000 });
        const r = await page.evaluate(() => ({
            emptyVisible: getComputedStyle(document.getElementById('notifications-empty')).display !== 'none',
            clearHidden: getComputedStyle(document.getElementById('clear-notifications')).display === 'none',
        }));
        expect(r.emptyVisible).toBe(true);
        expect(r.clearHidden).toBe(true); // pas de "Tout effacer" si vide
    });

    test('la cloche n\'affiche plus le compteur favoris', async ({ page }) => {
        // Ajouter un favori ne doit PAS faire apparaitre le badge de la cloche
        await page.evaluate(() => {
            const id = window.AppState.distributors[0].id;
            window.AppState.subscriptions = [id];
        });
        const r = await page.evaluate(() => ({
            hasOldBadge: !!document.getElementById('subscriptions-badge'),
            notifBadgeDisplay: getComputedStyle(document.getElementById('notifications-badge')).display,
        }));
        expect(r.hasOldBadge).toBe(false);            // plus de badge favoris sur la cloche
        expect(r.notifBadgeDisplay).toBe('none');     // pas de notif -> badge cache
    });

    test('reglages : bouton/etat permission navigateur present', async ({ page }) => {
        const r = await page.evaluate(() => ({
            stateEl: !!document.getElementById('notif-permission-state'),
            btnEl: !!document.getElementById('notif-permission-btn'),
        }));
        expect(r.stateEl).toBe(true);
        expect(r.btnEl).toBe(true);
    });
});

// ============================================
// 6. CHAT INACTIF, FAVORIS QUI NOTIFIENT
// ============================================

test.describe('6. Chat inactif, favoris qui notifient', () => {
    // Decision produit 2026-09-20 : le chatbot par distributeur est inactif
    // (FEATURES.chat = false, code conserve). Tout ce qui menait au chat mene a la fiche.
    test('openConversation n\'ouvre rien, et un favori ne cree aucune conversation', async ({ page }) => {
        const id = await page.evaluate(() => window.AppState.distributors[0].id);
        await page.evaluate((distId) => window.openConversation(distId), id);
        await page.evaluate((distId) => window.toggleSubscription(distId), id);
        await page.waitForTimeout(300);

        const r = await page.evaluate(() => ({
            chatActive: document.getElementById('chat-modal').classList.contains('active'),
            chatInert: document.getElementById('chat-modal').hasAttribute('inert'),
            conversations: JSON.parse(localStorage.getItem('snackmatch_conversations') || '{}')
        }));
        expect(r.chatActive).toBe(false);
        expect(r.chatInert).toBe(true);
        expect(r.conversations.list || []).toEqual([]);
        expect(Object.keys(r.conversations.history || {})).toEqual([]);
    });

    test('la fiche en mode edition ne propose plus « Discuter »', async ({ page }) => {
        await page.evaluate(() => window.openDistributorModal(window.AppState.distributors[0].id, true, true));
        await page.waitForSelector('#dist-modal-overlay.active');
        await expect(page.locator('#dist-chat-section')).toBeHidden();
    });

    test('un resultat de recherche ouvre la fiche, pas le chat', async ({ page }) => {
        const name = await page.evaluate(() => window.AppState.distributors[0].name);
        await page.click('#search-toggle');
        await page.fill('#quick-search', name);
        await page.locator('#search-results .search-item-clean').first().click();
        await page.waitForSelector('#dist-modal-overlay.active', { timeout: 5000 });
        await expect(page.locator('#dist-modal-name')).toHaveText(name);
        await expect(page.locator('#chat-modal')).not.toHaveClass(/active/);
    });

    // Un favori notifie quand sa machine change : vues distributor_status /
    // product_availability (migration 007) interceptees, aucun appel reel.
    test('machine en favori signalee vide : cloche a 1, ligne dans le centre, clic = fiche', async ({ page, context }) => {
        const signals = { status: [], products: [] };
        await page.route(url => url.pathname.endsWith('/rest/v1/distributor_status'), route =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(signals.status) }));
        await page.route(url => url.pathname.endsWith('/rest/v1/product_availability'), route =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(signals.products) }));

        // Heures calmes coupees : le test doit passer aussi la nuit
        await page.evaluate(() => localStorage.setItem('snackmatch_notification_prefs', JSON.stringify({
            enabled: true, quietHours: { enabled: false, start: 22, end: 8 }
        })));
        await setupApp(page, context);

        const dist = await page.evaluate(() => {
            const d = window.AppState.distributors[0];
            return { id: d.id, name: d.name };
        });

        // 1er passage, a l'abonnement : on memorise, on ne notifie pas
        await page.evaluate((id) => window.toggleSubscription(id), dist.id);
        await expect.poll(() => page.evaluate((id) => {
            const prefs = JSON.parse(localStorage.getItem('snackmatch_notification_prefs') || '{}');
            return !!(prefs.lastSeenSignals && prefs.lastSeenSignals[id]);
        }, dist.id)).toBe(true);
        await expect(page.locator('#notifications-badge')).toBeHidden();

        // Quelqu'un signale la machine vide ; l'app le voit au retour sur l'onglet
        signals.status = [{
            distributor_id: dist.id, state: 'empty', source: 'anon', weight: 0.5,
            created_at: new Date(Date.now() - 40 * 60000).toISOString(), age_seconds: 2400
        }];
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await expect(page.locator('#notifications-badge')).toHaveText('1');

        // Le bandeau in-app mene a la fiche
        const banner = page.locator('.notification-banner');
        await expect(banner).toContainText(`${dist.name} a été signalée vide`);
        await banner.locator('.notif-action').click();
        await page.waitForSelector('#dist-modal-overlay.active');
        await expect(page.locator('#dist-modal-name')).toHaveText(dist.name);
        await page.click('#dist-modal-close');

        // Le centre de notifications garde la trace, datee du signal
        await page.click('.nav-icon-btn[data-view="notifications"]');
        await page.waitForSelector('#notifications-view.view-active');
        const row = page.locator('#notifications-list .notif-item-open');
        await expect(row).toHaveCount(1);
        await expect(row).toContainText('Machine signalée vide');
        await expect(row).toContainText(`${dist.name} a été signalée vide`);
        await expect(row).toContainText('il y a 40 min');

        await row.click();
        await page.waitForSelector('#dist-modal-overlay.active');
        await expect(page.locator('#dist-modal-name')).toHaveText(dist.name);

        // Rien de plus au passage suivant (meme signal)
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await page.waitForTimeout(500);
        const count = await page.evaluate(() =>
            JSON.parse(localStorage.getItem('snackmatch_notification_queue')).history.length);
        expect(count).toBe(1);
    });
});

// Retour terrain 2026-09-25 (T1-US4) : une notification, une seule fois, et la
// suppression retire la ligne choisie. Vues interceptees, aucun appel reel.
test.describe('6bis. Centre de notifications fiable', () => {
    async function setupSignals(page, context) {
        const signals = { status: [] };
        await page.route(url => url.pathname.endsWith('/rest/v1/distributor_status'), route =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(signals.status) }));
        await page.route(url => url.pathname.endsWith('/rest/v1/product_availability'), route =>
            route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
        await page.evaluate(() => localStorage.setItem('snackmatch_notification_prefs', JSON.stringify({
            enabled: true, quietHours: { enabled: false, start: 22, end: 8 }
        })));
        await setupApp(page, context);
        return signals;
    }
    const historyLength = (page) => page.evaluate(() =>
        (JSON.parse(localStorage.getItem('snackmatch_notification_queue') || '{"history":[]}').history || []).length);
    const statusRow = (id, state, minutesAgo) => ({
        distributor_id: id, state, source: 'anon', weight: 0.5,
        created_at: new Date(Date.now() - minutesAgo * 60000).toISOString(), age_seconds: minutesAgo * 60
    });

    test('mon propre signal sur un favori ne me notifie pas', async ({ page, context }) => {
        const signals = await setupSignals(page, context);
        // La RPC "enregistre" le signal : la vue renvoie desormais ce signal
        await page.route(RPC_ROUTE, route => {
            const body = route.request().postDataJSON();
            signals.status = [statusRow(body.p_distributor_id, body.p_machine_state, 0)];
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ inserted: 1, skipped: 0, source: 'anon' }) });
        });
        const id = await page.evaluate(() => window.AppState.distributors[0].id);
        await page.evaluate((distId) => window.toggleSubscription(distId), id);
        await expect.poll(() => page.evaluate((distId) =>
            !!JSON.parse(localStorage.getItem('snackmatch_notification_prefs')).lastSeenSignals?.[distId], id)).toBe(true);

        await page.evaluate((distId) => window.openDistributorModal(distId), id);
        await page.click('#dist-machine-chip');
        await page.click('#dist-machine-choices .machine-choice[data-machine="empty"]');
        await expect(page.locator('#dist-machine-chip')).toContainText('Vide');

        await page.waitForTimeout(500);
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await page.waitForTimeout(800);
        expect(await historyLength(page)).toBe(0);
        await expect(page.locator('#notifications-badge')).toBeHidden();
    });

    test('page Notifications ouverte : la liste suit les arrivees et la suppression retire la bonne ligne', async ({ page, context }) => {
        const signals = await setupSignals(page, context);
        const [a, b] = await page.evaluate(() => window.AppState.distributors.slice(0, 2).map(d => ({ id: d.id, name: d.name })));
        await page.evaluate(([x, y]) => { window.toggleSubscription(x); window.toggleSubscription(y); }, [a.id, b.id]);
        await expect.poll(() => page.evaluate((ids) => {
            const seen = JSON.parse(localStorage.getItem('snackmatch_notification_prefs')).lastSeenSignals || {};
            return ids.every(i => !!seen[i]);
        }, [a.id, b.id])).toBe(true);

        await page.click('.nav-icon-btn[data-view="notifications"]');
        await page.waitForSelector('#notifications-view.view-active');

        // Machine A signalee vide pendant que la page est ouverte
        signals.status = [statusRow(a.id, 'empty', 20)];
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        const rows = page.locator('#notifications-list .notif-item');
        await expect(rows).toHaveCount(1);
        await expect(rows.first()).toContainText(a.name);

        // Puis machine B en panne : elle arrive en tete, sans recharger la page
        signals.status = [statusRow(a.id, 'empty', 20), statusRow(b.id, 'broken', 2)];
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await expect(rows).toHaveCount(2);
        await expect(rows.first()).toContainText(b.name);

        // Supprimer la ligne de A (la 2e affichee) retire bien A, pas B
        await rows.nth(1).locator('.notif-item-delete').click();
        await expect(rows).toHaveCount(1);
        await expect(rows.first()).toContainText(b.name);
        const kept = await page.evaluate(() =>
            JSON.parse(localStorage.getItem('snackmatch_notification_queue')).history.map(n => n.distributorId));
        expect(kept).toEqual([b.id]);
    });
});

// ============================================
// 7. PROFIL
// ============================================

test.describe('7. Profil (Local Guides + menu avatar)', () => {
    test('avatar ouvre le menu deroulant (Connexion si deconnecte)', async ({ page }) => {
        await page.click('#profile-avatar-btn');
        await page.waitForSelector('#profile-menu:not([hidden])', { timeout: 3000 });
        const authLabel = await page.textContent('#menu-auth-action');
        expect(authLabel).toBe('Connexion');
    });

    test('menu -> Mon profil : dashboard avec niveau + barre', async ({ page }) => {
        await page.click('#profile-avatar-btn');
        await page.click('#profile-menu [data-action="profile"]');
        await page.waitForSelector('#profile-view.view-active', { timeout: 3000 });
        const r = await page.evaluate(() => ({
            badge: document.getElementById('profile-badge').textContent,
            hasBar: !!document.getElementById('profile-level-bar'),
            contrib: document.querySelectorAll('#profile-view .contrib-row').length,
            noStatCard: document.querySelectorAll('#profile-view .stat-card').length,
        }));
        expect(r.badge.length).toBeGreaterThan(0); // niveau dynamique
        expect(r.hasBar).toBe(true);
        expect(r.contrib).toBe(4);                 // breakdown compact
        expect(r.noStatCard).toBe(0);              // plus de mur de cartes
    });

    test('menu -> Compte : etat + bouton connexion + reinitialisation (sans "danger")', async ({ page }) => {
        await page.click('#profile-avatar-btn');
        await page.click('#profile-menu [data-action="account"]');
        await page.waitForSelector('#account-view.view-active', { timeout: 3000 });
        const r = await page.evaluate(() => ({
            authText: document.getElementById('account-auth-text').textContent,
            authBtn: document.getElementById('account-auth-action')?.textContent.trim(),
            clearBtn: !!document.getElementById('clear-data-btn'),
            noDanger: !/danger/i.test(document.getElementById('account-view').innerHTML),
        }));
        expect(r.authText).toBe('Non connecté');
        expect(r.authBtn).toBe('Se connecter');
        expect(r.clearBtn).toBe(true);
        expect(r.noDanger).toBe(true);
    });

    test('Compte : clic "Se connecter" -> mur d\'auth', async ({ page }) => {
        await page.evaluate(() => localStorage.setItem('distrimatch_force_auth', '1'));
        await page.click('#profile-avatar-btn');
        await page.click('#profile-menu [data-action="account"]');
        await page.waitForSelector('#account-view.view-active', { timeout: 3000 });
        await page.click('#account-auth-action');
        await page.waitForSelector('.auth-modal-overlay', { timeout: 3000 });
        expect(await page.$('.auth-modal')).not.toBeNull();
    });

    test('menu Connexion -> mur d\'auth', async ({ page }) => {
        await page.evaluate(() => localStorage.setItem('distrimatch_force_auth', '1'));
        await page.click('#profile-avatar-btn');
        await page.click('#menu-auth-action');
        await page.waitForSelector('.auth-modal-overlay', { timeout: 3000 });
        expect(await page.$('.auth-modal')).not.toBeNull();
    });
});

// ============================================
// 8. MOBILE
// ============================================

test.describe('8. Mobile', () => {
    test('modal plein ecran en mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.waitForTimeout(300);
        await openDistModal(page);

        const height = await page.evaluate(() =>
            document.getElementById('dist-modal').getBoundingClientRect().height
        );
        // En mobile, la modal prend tout l'ecran
        expect(height).toBeGreaterThan(500);
    });

    test('bottom nav visible en mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.waitForTimeout(300);
        const visible = await page.$('.bottom-nav');
        expect(await visible.isVisible()).toBe(true);
    });

    // Page Compte (refonte PR #84) verrouillee en 390x844 : pas de debordement
    // horizontal, email long tronque avec ellipsis, boutons visibles et
    // cliquables au-dessus de la bottom nav.
    test('page Compte en 390x844 : aucun debordement, email long tronque, boutons au-dessus de la bottom nav', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(300);
        await page.evaluate(() => window.switchView('account'));
        await page.waitForSelector('#account-view.view-active', { timeout: 3000 });
        // La vue glisse en place : mesurer apres la transition, pas pendant
        await page.waitForTimeout(500);

        const r = await page.evaluate(() => {
            const view = document.getElementById('account-view');
            const email = document.getElementById('account-auth-text');
            email.textContent = 'prenom.nom.tres.long.adresse@sous-domaine.exemple-vraiment-long.fr';
            const box = (id) => document.getElementById(id).getBoundingClientRect();
            const nav = document.querySelector('.bottom-nav').getBoundingClientRect();
            const inView = (b) => b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= nav.top;
            const es = getComputedStyle(email);
            return {
                viewOverflow: view.scrollWidth - view.clientWidth,
                docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                emailEllipsis: es.textOverflow === 'ellipsis' && es.whiteSpace === 'nowrap' && es.overflow === 'hidden',
                emailInView: inView(box('account-auth-text')),
                authBtn: inView(box('account-auth-action')),
                notifRow: inView(box('account-notif-settings')),
                clearBtn: inView(box('clear-data-btn')),
            };
        });
        expect(r.viewOverflow).toBe(0);
        expect(r.docOverflow).toBe(0);
        expect(r.emailEllipsis).toBe(true);
        expect(r.emailInView).toBe(true);
        expect(r.authBtn).toBe(true);
        expect(r.notifRow).toBe(true);
        expect(r.clearBtn).toBe(true);

        // Cliquable pour de vrai (pas recouvert par la bottom nav) : la rangee
        // Reglages ouvre bien la page des notifications
        await page.click('#account-notif-settings');
        await page.waitForSelector('#notification-settings.view-active', { timeout: 3000 });
    });
});

// ============================================
// 9. DEDUP DISTRIBUTEURS (local + remote)
// ============================================

test.describe('9. Dedup distributeurs', () => {
    test('un distributeur deja remote n\'apparait pas en double via le local', async ({ page }) => {
        // Prend un distributeur deja charge (simule la version "remote" / source de verite)
        const remote = await page.evaluate(() => {
            const d = window.AppState.distributors[0];
            return { id: d.id, name: d.name };
        });

        // Injecte une copie locale avec le MEME id (simule un distrib ajoute en
        // local puis sync sur Supabase : il revient via le fetch + le local)
        await page.evaluate((r) => {
            const localCopy = { ...window.AppState.distributors[0], name: r.name + ' (copie locale)' };
            localStorage.setItem('snackmatch_user_distributors', JSON.stringify([localCopy]));
        }, remote);

        // Recharge : loadDistributors() doit dedupliquer par id
        await page.reload();
        await page.waitForFunction(
            () => window.AppState?.distributors?.length > 0,
            { timeout: 50000 }
        );

        const occurrences = await page.evaluate(
            (id) => window.AppState.distributors.filter((d) => d.id === id).length,
            remote.id
        );
        expect(occurrences).toBe(1);

        // La version conservee doit etre la remote (pas la copie locale renommee)
        const keptName = await page.evaluate(
            (id) => window.AppState.distributors.find((d) => d.id === id)?.name,
            remote.id
        );
        expect(keptName).toBe(remote.name);
    });

    test('localStorage legacy avec doublon interne (meme id, pas en remote) -> 1 occurrence', async ({ page }) => {
        // Simule un etat localStorage corrompu d'avant le fix : 2 entrees avec
        // le MEME id, et cet id n'existe PAS dans la source remote.
        const localId = 'user-legacy-dup-test';
        await page.evaluate((id) => {
            const a = { id, name: 'Distrib legacy', type: 'general', emoji: '🍫',
                lat: 43.49, lng: -1.47, address: '', city: 'Test', rating: 4,
                reviewCount: 0, status: 'verified', priceRange: '€', products: [] };
            localStorage.setItem('snackmatch_user_distributors', JSON.stringify([a, { ...a }]));
        }, localId);

        await page.reload();
        await page.waitForFunction(
            () => window.AppState?.distributors?.length > 0,
            { timeout: 50000 }
        );

        const occurrences = await page.evaluate(
            (id) => window.AppState.distributors.filter((d) => d.id === id).length,
            localId
        );
        expect(occurrences).toBe(1);
    });

    test('doublons par contenu, ids differents (bug double-submit) -> 1 occurrence', async ({ page }) => {
        // Reproduit le symptome reel : N entrees meme nom + memes coords mais
        // ids tous differents (user-<timestamp> distinct a chaque clic du
        // bouton avant le garde anti-double-submit). La dedup par id ne peut
        // PAS les voir -> c'est le filet par contenu qui doit collapser.
        // Nom volontairement unique : l'e2e tape la vraie base Supabase, un nom
        // reel (ex. "Gaztainbidea 2") entrerait en collision avec la prod.
        const uniqueName = 'ZZ-E2E-DEDUP-CONTENU-' + Date.now();
        await page.evaluate((nm) => {
            const base = { name: nm, type: 'general', emoji: '🌰',
                lat: 43.4931, lng: -1.4752, address: '', city: 'Test', rating: 5,
                reviewCount: 0, status: 'verified', priceRange: '€', products: [] };
            const dups = Array.from({ length: 7 }, (_, i) => ({
                ...base, id: `user-${1700000000000 + i}`
            }));
            localStorage.setItem('snackmatch_user_distributors', JSON.stringify(dups));
        }, uniqueName);

        await page.reload();
        await page.waitForFunction(
            () => window.AppState?.distributors?.length > 0,
            { timeout: 50000 }
        );

        const occurrences = await page.evaluate(
            (nm) => window.AppState.distributors.filter((d) => d.name === nm).length,
            uniqueName
        );
        expect(occurrences).toBe(1);
    });

    test('le garde anti-double-submit existe sur AddMode', async ({ page }) => {
        const hasGuard = await page.evaluate(
            () => typeof window.AppState !== 'undefined'
                && Object.prototype.hasOwnProperty.call(window.AddMode || {}, 'submitting')
        );
        expect(hasGuard).toBe(true);
    });
});

// ============================================
// 10. POLITIQUE D'AUTHENTIFICATION (verrouillage)
// ============================================
//
// Verrouille la matrice 10 UC documentee dans CLAUDE.md > "Politique
// d'authentification". Toute regression future (ex. oubli de requireAuth()
// sur une contribution publique, ou ajout accidentel d'un gate sur une
// action locale) doit faire echouer un de ces tests.
//
// Note : localhost bypass requireAuth() par defaut (auth.js:111-131). Les
// tests qui verifient le gating posent `distrimatch_force_auth=1` pour
// reactiver l'auth comme en prod. Les tests anti-regression "libre" ne le
// posent pas : on verifie que meme en prod-like, ces actions n'ouvrent
// aucune modale.

test.describe('10. Politique d\'authentification', () => {

    test('UC1 contribution publique : Ajouter un distributeur sans auth -> modale email', async ({ page }) => {
        await page.evaluate(() => localStorage.setItem('distrimatch_force_auth', '1'));
        await page.click('#btn-add-distributor');
        await page.waitForSelector('.auth-modal-overlay', { timeout: 3000 });

        const modal = await page.$('.auth-modal');
        expect(modal).not.toBeNull();
    });

    test('UC2 contribution publique : stylo Modifier sans auth -> gate "Connexion requise"', async ({ page }) => {
        await page.evaluate(() => {
            const id = window.AppState.distributors[0].id;
            window.AppState.subscriptions = [id];
        });
        await page.click('.bottom-nav [data-tab="favorites"]');
        await page.waitForSelector('#subscriptions-view.view-active');
        await page.waitForSelector('#subscriptions-list .subscription-card');
        await page.click('#subscriptions-list .subscription-card');
        await page.waitForSelector('#dist-modal-overlay.active');

        await page.click('#dist-action-edit');
        await page.waitForSelector('#edit-auth-gate', { timeout: 3000 });

        const gateText = await page.textContent('#edit-auth-gate h2');
        expect(gateText).toBe('Connexion requise');
    });

    test('UC3 contribution publique : bouton Photo sans auth -> gate "Connexion requise"', async ({ page }) => {
        await openDistModal(page);
        // Geofence : on s'assure d'etre tout pres pour ne pas bloquer avant le gate auth
        await page.evaluate(() => {
            const d = window.AppState.currentDistributor;
            window.AppState.userLocation = { lat: d.lat + 0.0001, lng: d.lng + 0.0001 };
        });

        await page.click('#dist-action-add-photo');
        await page.waitForSelector('#edit-auth-gate', { timeout: 3000 });

        const r = await page.evaluate(() => ({
            gateText: document.getElementById('edit-auth-gate')?.querySelector('h2')?.textContent,
            webcamModalAppeared: !!document.getElementById('webcam-modal'),
            filePickerTriggered: document.getElementById('dist-add-photo-input')?.files?.length || 0
        }));
        expect(r.gateText).toBe('Connexion requise');
        expect(r.webcamModalAppeared).toBe(false);
    });

    test('UC4 contribution publique : Signaler sans auth -> modale email', async ({ page }) => {
        await page.evaluate(() => localStorage.setItem('distrimatch_force_auth', '1'));
        await openDistModal(page);
        // openReportModal n'est pas sur window : import dynamique pour le declencher
        // sans dependre du timing chat (-> Conversations.active -> dyn import -> ...)
        await page.evaluate(async () => {
            const m = await import('./js/activity.js');
            // pas d'await : requireAuth() interne va resoudre via la modale, on ne
            // veut pas bloquer la promesse.
            m.openReportModal();
        });
        await page.waitForSelector('.auth-modal-overlay', { timeout: 3000 });

        const modal = await page.$('.auth-modal');
        expect(modal).not.toBeNull();
    });

    test('UC5 sociale locale : Favori SANS modale d\'auth (anti-regression regle #7)', async ({ page }) => {
        // Pas de distrimatch_force_auth : meme en prod-like, favori reste libre
        await page.evaluate(() => { window.AppState.subscriptions = []; localStorage.clear(); });
        await openDistModal(page);
        const id = await page.evaluate(() => window.AppState.currentDistributor.id);
        await page.click('#dist-action-favorite');
        await page.waitForTimeout(400);

        const r = await page.evaluate((did) => ({
            authShown: !!document.querySelector('.auth-modal-overlay'),
            gateShown: !!document.getElementById('edit-auth-gate'),
            subscribed: window.AppState.subscriptions.includes(did),
        }), id);
        expect(r.authShown).toBe(false);
        expect(r.gateShown).toBe(false);
        expect(r.subscribed).toBe(true);
    });

    test('UC8 preference perso : changer le rayon geofence SANS modale d\'auth', async ({ page }) => {
        // Anti-regression : meme avec force_auth, les prefs notifs restent libres.
        // On modifie le slider DOM via input event (le handler 'oninput' va
        // appeler updateRadiusDisplay et eventuellement saveNotificationPrefs).
        await page.evaluate(() => localStorage.setItem('distrimatch_force_auth', '1'));

        const r = await page.evaluate(() => {
            const slider = document.getElementById('geofence-radius');
            if (!slider) return { sliderMissing: true };
            const before = slider.value;
            slider.value = before === '2000' ? '1500' : '2000';
            slider.dispatchEvent(new Event('input', { bubbles: true }));
            slider.dispatchEvent(new Event('change', { bubbles: true }));
            return {
                authShown: !!document.querySelector('.auth-modal-overlay'),
                gateShown: !!document.getElementById('edit-auth-gate'),
                newValue: slider.value,
                changed: slider.value !== before,
            };
        });
        expect(r.sliderMissing).toBeFalsy();
        expect(r.authShown).toBe(false);
        expect(r.gateShown).toBe(false);
        expect(r.changed).toBe(true);
    });
});

// ============================================
// 11. ACCESSIBILITE DES MODALES (focus-trap, WCAG 2.4.3 / 2.1.2)
// ============================================

test.describe('11. Accessibilite modales (focus-trap)', () => {
    test('dist-modal : role dialog + aria-labelledby + focus piege + Echap ferme + focus rendu', async ({ page }) => {
        // Focaliser un declencheur connu (bouton recherche) pour verifier le
        // retour du focus a la fermeture.
        await page.evaluate(() => document.getElementById('search-toggle').focus());

        await page.evaluate(() => {
            const d = window.AppState.distributors[0];
            window.openDistributorModal(d.id);
        });
        await page.waitForSelector('#dist-modal-overlay.active', { timeout: 5000 });

        // Semantique dialog
        const dialog = page.locator('#dist-modal');
        await expect(dialog).toHaveAttribute('role', 'dialog');
        await expect(dialog).toHaveAttribute('aria-modal', 'true');
        await expect(dialog).toHaveAttribute('aria-labelledby', 'dist-modal-name');
        // Le titre reference existe et n'est pas vide
        const titleText = await page.textContent('#dist-modal-name');
        expect((titleText || '').trim().length).toBeGreaterThan(0);

        // Le focus est passe DANS la modale
        const focusInside = await page.evaluate(() =>
            document.getElementById('dist-modal').contains(document.activeElement));
        expect(focusInside).toBe(true);

        // Echap ferme la modale...
        await page.keyboard.press('Escape');
        await expect(page.locator('#dist-modal-overlay')).not.toHaveClass(/active/);

        // ...et rend le focus au declencheur d'origine
        const backId = await page.evaluate(() => document.activeElement?.id);
        expect(backId).toBe('search-toggle');
    });
});

// ============================================
// 12. SUIVRE UN PRODUIT (modale maison, Lot 2.2)
// ============================================

test.describe('12. Suivre un produit (modale)', () => {
    test('ouvre une modale maison (pas de prompt natif), focus au champ, valide et enregistre', async ({ page }) => {
        // Si un prompt() natif etait encore utilise, Playwright recevrait un
        // evenement "dialog" : on echoue alors explicitement.
        let nativeDialog = false;
        page.on('dialog', async (d) => { nativeDialog = true; await d.dismiss().catch(() => {}); });

        await page.evaluate(() => window.promptAddProductFollow());

        const modal = page.locator('#product-follow-modal');
        await expect(modal).toHaveClass(/active/);
        await expect(modal).toHaveAttribute('role', 'dialog');

        // Le focus est sur le champ (autofocus respecte par le focus-trap)
        const focusOnInput = await page.evaluate(() => document.activeElement?.id === 'product-follow-input');
        expect(focusOnInput).toBe(true);

        await page.fill('#product-follow-input', 'Pizza Test E2E');
        await page.click('#product-follow-form button[type="submit"]');

        // Modale fermee + produit persiste en localStorage (normalise en minuscules)
        await expect(modal).not.toHaveClass(/active/);
        const stored = await page.evaluate(() => localStorage.getItem('snackmatch_notification_prefs'));
        expect(stored).toContain('pizza test e2e');

        expect(nativeDialog).toBe(false);
    });

    test('Echap ferme la modale sans rien enregistrer', async ({ page }) => {
        await page.evaluate(() => window.promptAddProductFollow());
        await expect(page.locator('#product-follow-modal')).toHaveClass(/active/);
        await page.fill('#product-follow-input', 'Ne Doit Pas Etre Suivi');
        await page.keyboard.press('Escape');
        await expect(page.locator('#product-follow-modal')).not.toHaveClass(/active/);
        const stored = await page.evaluate(() => localStorage.getItem('snackmatch_notification_prefs') || '');
        expect(stored.toLowerCase()).not.toContain('ne doit pas etre suivi');
    });
});

// ============================================
// 13. SIGNAL DE DISPO EN UN TAP (UC11, chantier 2)
// ============================================
// Aucun vrai signal n'est envoye : la RPC est interceptee par page.route.

const RPC_ROUTE = '**/rest/v1/rpc/confirm_availability';

// Fiche ouverte sur une machine qui a au moins un produit signalable (id
// Supabase). Retourne { id, productId }.
async function openSignalableFiche(page) {
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
async function signalFirstProduct(page, state = 'available') {
    await page.locator('#dist-products-list button.product-row-main').first().click();
    await page.locator(`#dist-products-list .product-choices:not([hidden]) .product-choice[data-state="${state}"]`).click();
}

// Vues de lecture des signaux (007) interceptees : l'etat de depart est maitrise.
async function routeSignals(page, { status = [], products = [] } = {}) {
    await page.route(url => url.pathname.endsWith('/rest/v1/distributor_status'), route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(status) }));
    await page.route(url => url.pathname.endsWith('/rest/v1/product_availability'), route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(products) }));
}

const minutesAgoIso = (m) => new Date(Date.now() - m * 60000).toISOString();

// EPIC-T2 (2026-09-25) : plus de fenetre « Il reste quoi ? » ni de gros bouton
// rouge ; on signale sur l'aliment (toucher la ligne) et sur la puce machine.
test.describe('13. Signal sur l\u2019aliment et sur la machine', () => {
    test("toucher un aliment deplie « Il y en a / Plus rien » ; un tap envoie sans auth ; la ligne passe en « Dispo, vu à l'instant »", async ({ page }) => {
        const payloads = [];
        await page.route(RPC_ROUTE, route => {
            payloads.push(route.request().postDataJSON());
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ inserted: 1, skipped: 0, source: 'anon' }) });
        });
        await routeSignals(page);
        await page.evaluate(() => localStorage.setItem('distrimatch_force_auth', '1'));
        const f = await openSignalableFiche(page);
        await expect(page.locator('#dist-products-title')).toHaveText('Il reste quoi ?');

        const row = page.locator(`#dist-products-list .product-row[data-product-id="${f.productId}"]`);
        const main = row.locator('button.product-row-main');
        await expect(main).toHaveAttribute('aria-expanded', 'false');
        await main.click();
        await expect(main).toHaveAttribute('aria-expanded', 'true');
        await row.locator('.product-choice[data-state="available"]').click();

        expect(await page.$('.auth-modal-overlay')).toBeNull();          // UC11 : pas de mur d'auth
        await expect(page.locator('#toast-container .toast.success')).toContainText('Merci');
        expect(payloads[0].p_product_signals).toEqual([{ product_id: Number(f.productId), state: 'available' }]);
        expect(payloads[0].p_machine_state).toBeNull();
        await expect(main).toHaveAttribute('aria-expanded', 'false');
        await expect(row.locator('.product-pill')).toHaveText('Dispo');
        await expect(row.locator('.product-pill')).toHaveClass(/is-fresh/);
        await expect(row.locator('.product-seen')).toHaveText("vu à l'instant");
        // La fiche reste ouverte, la puce deduit que la machine marche
        await expect(page.locator('#dist-modal-overlay')).toHaveClass(/active/);
        await expect(page.locator('#dist-machine-chip')).toContainText('Fonctionne');
    });

    test('on peut se corriger : « Plus rien » juste apres « Il y en a »', async ({ page }) => {
        const payloads = [];
        await page.route(RPC_ROUTE, route => {
            payloads.push(route.request().postDataJSON());
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ inserted: 1, skipped: 0, source: 'anon' }) });
        });
        await routeSignals(page);
        const f = await openSignalableFiche(page);
        const row = page.locator(`#dist-products-list .product-row[data-product-id="${f.productId}"]`);
        await signalFirstProduct(page, 'available');
        await expect(row.locator('.product-pill')).toHaveText('Dispo');
        await signalFirstProduct(page, 'absent');
        await expect(row.locator('.product-pill')).toHaveText('Pas dispo');
        expect(payloads.map(pl => pl.p_product_signals[0].state)).toEqual(['available', 'absent']);
    });

    test('puce machine : « Vide » -> puce, ligne sous le nom, aliments « Pas dispo, Machine vide »', async ({ page }) => {
        const payloads = [];
        await page.route(RPC_ROUTE, route => {
            payloads.push(route.request().postDataJSON());
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ inserted: 1, skipped: 0, source: 'anon' }) });
        });
        await routeSignals(page);
        const f = await openSignalableFiche(page);
        const chip = page.locator('#dist-machine-chip');
        await expect(chip).toContainText("Pas d'info");
        await chip.click();
        await expect(chip).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#dist-machine-choices .machine-choice')).toHaveText(['Fonctionne', 'Vide', 'En panne']);
        await page.click('#dist-machine-choices .machine-choice[data-machine="empty"]');

        expect(payloads[0].p_machine_state).toBe('empty');
        expect(payloads[0].p_product_signals).toEqual([]);
        await expect(chip).toContainText('Vide');
        await expect(chip).toHaveAttribute('aria-expanded', 'false');
        await expect(page.locator('#dist-modal-verified')).toHaveText("Signalée vide à l'instant");
        // Bandeau d'etat (EPIC-T4) : orange, aucun produit dispo
        await expect(page.locator('#dist-hero')).toHaveClass(/is-empty/);
        await expect(page.locator('#dist-hero-kpi')).toHaveText(/^0 sur \d+ dispo$/);
        const row = page.locator(`#dist-products-list .product-row[data-product-id="${f.productId}"]`);
        await expect(row.locator('.product-pill')).toHaveText('Pas dispo');
        await expect(row.locator('.product-seen')).toHaveText('Machine vide');
    });

    test('etat lu en base : « Fonctionne » / « En panne » a droite du nom, avec sa provenance', async ({ page }) => {
        const status = { state: 'working' };
        await page.route(url => url.pathname.endsWith('/rest/v1/distributor_status'), route => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify([{ distributor_id: 'x', state: status.state, source: 'anon', weight: 0.5, created_at: minutesAgoIso(10), age_seconds: 600 }])
        }));
        await page.route(url => url.pathname.endsWith('/rest/v1/product_availability'), route =>
            route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
        await openDistModal(page);
        await expect(page.locator('#dist-machine-chip')).toContainText('Fonctionne');
        await expect(page.locator('#dist-machine-chip')).toHaveClass(/is-working/);
        await expect(page.locator('#dist-modal-verified')).toHaveText('Vue en marche il y a 10 min');
        await page.click('#dist-modal-close');
        status.state = 'broken';
        await openDistModal(page);
        await expect(page.locator('#dist-machine-chip')).toContainText('En panne');
        await expect(page.locator('#dist-modal-verified')).toHaveText('Signalée en panne il y a 10 min');
    });

    // EPIC-T3 (constat terrain Android) : un envoi qui echoue hors refus metier
    // est renvoye une fois, sans session ; un refus metier ne l'est pas.
    test('envoi en echec (401) -> renvoi anonyme automatique -> « Merci »', async ({ page }) => {
        const calls = [];
        await page.route(RPC_ROUTE, route => {
            calls.push(route.request().postDataJSON());
            if (calls.length === 1) {
                return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST301', message: 'JWT expired' }) });
            }
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ inserted: 1, skipped: 0, source: 'anon' }) });
        });
        await routeSignals(page);
        await openDistModal(page);
        await page.click('#dist-machine-chip');
        await page.click('#dist-machine-choices .machine-choice[data-machine="working"]');
        await expect(page.locator('#toast-container .toast.success')).toContainText('Merci');
        expect(calls).toHaveLength(2);
        expect(calls[1]).toEqual(calls[0]);
        await expect(page.locator('#dist-machine-chip')).toContainText('Fonctionne');
        expect(await page.$('#toast-container .toast.error')).toBeNull();
    });

    test('refus « trop de signaux » : pas de renvoi, la raison est affichee', async ({ page }) => {
        const calls = [];
        await page.route(RPC_ROUTE, route => {
            calls.push(1);
            route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'Trop de signaux pour cet appareil, reessaie plus tard' }) });
        });
        await routeSignals(page);
        await openDistModal(page);
        await page.click('#dist-machine-chip');
        await page.click('#dist-machine-choices .machine-choice[data-machine="empty"]');
        await expect(page.locator('#toast-container .toast.error')).toHaveText('Trop de signaux depuis ce téléphone, réessaie dans une heure');
        expect(calls).toHaveLength(1);
    });

    test('plus de gros bouton rouge ni de fenetre « Il reste quoi ? »', async ({ page }) => {
        await openDistModal(page);
        await expect(page.locator('#dist-action-confirm')).toHaveCount(0);
        await expect(page.locator('#availability-modal')).toHaveCount(0);
        await expect(page.locator('#dist-status-banner')).toHaveCount(0);
    });

    test('erreur serveur (503) -> toast d\u2019erreur, la ligne reste ouverte et inchangee', async ({ page }) => {
        await page.route(RPC_ROUTE, route => route.fulfill({
            status: 503, contentType: 'application/json',
            body: JSON.stringify({ message: 'indisponible' })
        }));
        await routeSignals(page);
        const f = await openSignalableFiche(page);
        const row = page.locator(`#dist-products-list .product-row[data-product-id="${f.productId}"]`);
        await signalFirstProduct(page, 'available');
        await expect(page.locator('#toast-container .toast.error')).toContainText('réessaie plus tard (code 503)');
        await expect(row.locator('button.product-row-main')).toHaveAttribute('aria-expanded', 'true');
        await expect(row.locator('.product-pill')).toHaveText("Pas d'info");
    });
});

test.describe('13bis. Deep link QR (&confirm=1&src=qr)', () => {
    test.beforeEach(async () => { /* override : pas de setupApp */ });

    test("ouvre la fiche sur « Il reste quoi ? » (consigne mise en avant), memorise la source, nettoie l'URL", async ({ browser }) => {
        const context = await browser.newContext();
        await context.route(EVENTS_ROUTE, route => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));   // aucun vrai evenement
        const page = await context.newPage();
        const events = await captureEvents(page);
        await page.goto(BASE_URL);
        await page.waitForFunction(() => window.AppState?.distributors?.length > 0, { timeout: 50000 });
        const firstId = await page.evaluate(() => {
            const ok = (p) => p && p.id !== null && p.id !== undefined && p.id !== '' && Number.isInteger(Number(p.id));
            return window.AppState.distributors.find(x => (x.products || []).some(ok)).id;
        });

        await page.goto(`${BASE_URL}/?id=${firstId}&confirm=1&src=qr`);
        await page.waitForSelector('#dist-modal-overlay.active', { timeout: 50000 });
        await expect(page.locator('#dist-products-hint')).toHaveClass(/is-highlighted/);
        await expect(page.locator('#dist-products-title')).toBeInViewport();

        const src = await page.evaluate(() => sessionStorage.getItem('distrimatch_src'));
        expect(src).toBe('qr');
        expect(page.url()).not.toContain('confirm=');
        // Mesure : l'arrivee par QR compte app_ouverte + qr_scan + fiche_ouverte, source 'qr'
        await expect.poll(() => events.filter(e => e.source === 'qr').map(e => e.type).sort()).toEqual(['app_ouverte', 'fiche_ouverte', 'qr_scan']);
        expect(events.find(e => e.type === 'qr_scan').distributorId).toBe(firstId);
        await context.close();
    });

    test('QR sur une machine sans produit : les choix de l\u2019etat de la machine sont ouverts', async ({ browser }) => {
        const context = await browser.newContext();
        await context.route(EVENTS_ROUTE, route => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
        const page = await context.newPage();
        await page.goto(BASE_URL);
        await page.waitForFunction(() => window.AppState?.distributors?.length > 0, { timeout: 50000 });
        const emptyId = await page.evaluate(() => (window.AppState.distributors.find(x => !(x.products || []).length) || {}).id);
        test.skip(!emptyId, 'aucune machine sans produit dans les donnees');
        await page.goto(`${BASE_URL}/?id=${emptyId}&confirm=1&src=qr`);
        await page.waitForSelector('#dist-modal-overlay.active', { timeout: 50000 });
        await expect(page.locator('#dist-machine-choices')).toBeVisible();
        await expect(page.locator('#dist-machine-chip')).toHaveAttribute('aria-expanded', 'true');
        await context.close();
    });
});

// ============================================
// 14. CIBLES TACTILES >= 44 px (WCAG 2.5.5, iOS HIG, Material)
// ============================================
// Mesure la zone effective de chaque element interactif visible : sa boite,
// le <label> qui l'enveloppe (toggles), ou son pseudo-element ::after
// d'extension (base.css, "cibles tactiles"). Ecrans : carte + side panel,
// fiche + "Il reste quoi ?", chat, compte, notifications, profil, reglages
// notifs, favoris, activite.

const TARGET_MIN = 44;
// Hors perimetre : attribution Leaflet (tiers) et marqueur de position (non actionnable)
const TARGET_ALLOWLIST = ['.leaflet-control-attribution', '.user-marker-container'];

async function collectSmallTargets(page, screen) {
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

test.describe('14. Cibles tactiles >= 44 px', () => {
    test('aucun element interactif visible sous 44x44 (zone etendue comprise) sur les ecrans principaux, en 390 px', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(300);
        const violations = [];

        violations.push(...await collectSmallTargets(page, 'carte'));

        await page.click('.filter-chip[data-type="pizza"]');
        await page.waitForSelector('.side-panel.open');
        for (const h of await page.$$('#side-panel-list .side-panel-group-header')) await h.click();
        violations.push(...await collectSmallTargets(page, 'side-panel'));

        await openSignalableFiche(page);
        violations.push(...await collectSmallTargets(page, 'fiche'));
        await page.locator('#dist-products-list button.product-row-main').first().click();
        violations.push(...await collectSmallTargets(page, 'il-reste-quoi'));
        await page.click('#dist-machine-chip');
        violations.push(...await collectSmallTargets(page, 'etat-machine'));
        await page.click('#dist-modal-close');


        for (const view of ['account', 'notifications', 'profile']) {
            await page.evaluate((v) => window.switchView(v), view);
            violations.push(...await collectSmallTargets(page, view));
        }
        await page.evaluate(() => window.switchView('account'));
        await page.click('#account-notif-settings');
        violations.push(...await collectSmallTargets(page, 'reglages-notifs'));

        await page.click('.bottom-nav [data-tab="favorites"]');
        violations.push(...await collectSmallTargets(page, 'favoris'));
        await page.click('.bottom-nav [data-tab="activity"]');
        violations.push(...await collectSmallTargets(page, 'activite'));

        expect(violations, `cibles < 44px :\n${violations.join('\n')}`).toEqual([]);
    });

    test('la zone etendue est reellement cliquable : un point 4 px au-dessus d\'un chip de filtre l\'atteint', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(300);
        const hit = await page.evaluate(() => {
            const chip = document.querySelector('.filter-chip[data-type="pizza"]');
            const r = chip.getBoundingClientRect();
            const el = document.elementFromPoint(r.left + r.width / 2, r.top - 4);
            return el === chip || chip.contains(el);
        });
        expect(hit).toBe(true);
    });
});

// ============================================
// 15. CONFIRMATION MAISON (plus de confirm() natif sur les actions destructrices)
// ============================================

test.describe('15. Confirmation maison', () => {
    test('Effacer mes données : modale maison, Annuler conserve, Effacer vide le localStorage, aucun dialogue natif', async ({ page }) => {
        let nativeDialog = false;
        page.on('dialog', async (d) => { nativeDialog = true; await d.dismiss().catch(() => {}); });

        await page.evaluate(() => {
            localStorage.setItem('snackmatch_profile', JSON.stringify({ marker: 'e2e-confirm' }));
            window.switchView('account');
        });
        await page.waitForSelector('#account-view.view-active');
        await page.click('#clear-data-btn');

        const modal = page.locator('#confirm-modal');
        await expect(modal).toHaveClass(/active/);
        await expect(modal).toHaveAttribute('role', 'alertdialog');
        // L'action destructrice n'est jamais le defaut : le focus est sur Annuler
        expect(await page.evaluate(() => document.activeElement?.id)).toBe('confirm-cancel');

        await page.click('#confirm-cancel');
        await expect(modal).not.toHaveClass(/active/);
        expect(await page.evaluate(() => localStorage.getItem('snackmatch_profile'))).toContain('e2e-confirm');

        await page.click('#clear-data-btn');
        await expect(modal).toHaveClass(/active/);
        await page.click('#confirm-ok');
        await expect(modal).not.toHaveClass(/active/);
        expect(await page.evaluate(() => localStorage.getItem('snackmatch_profile'))).toBeNull();
        expect(nativeDialog).toBe(false);
    });

    test('Supprimer un produit : modale par-dessus la fiche en edition, Echap annule et garde le produit', async ({ page }) => {
        await page.evaluate(() => {
            const d = window.AppState.distributors.find(x => (x.products || []).length > 0) || window.AppState.distributors[0];
            window.openDistributorModal(d.id, true, true);
        });
        await page.waitForSelector('#dist-modal-overlay.active');
        const before = await page.evaluate(() => window.AppState.currentDistributor.products.length);
        expect(before).toBeGreaterThan(0);

        await page.click('#dist-products-list .product-btn-delete');
        const modal = page.locator('#confirm-modal');
        await expect(modal).toHaveClass(/active/);
        const firstName = await page.evaluate(() => window.AppState.currentDistributor.products[0].name);
        await expect(page.locator('#confirm-message')).toContainText(firstName);

        await page.keyboard.press('Escape');
        await expect(modal).not.toHaveClass(/active/);
        const after = await page.evaluate(() => window.AppState.currentDistributor.products.length);
        expect(after).toBe(before);
        await expect(page.locator('#dist-modal-overlay')).toHaveClass(/active/);
    });
});

// ============================================
// 16. MESURE DU PILOTE (RPC log_event, migration 008)
// ============================================
// setupApp bloque deja la RPC pour tous les tests ; ici captureEvents() la
// remplace (le dernier handler enregistre gagne) pour lire ce qui part.

test.describe('16. Mesure du pilote (log_event)', () => {
    test('fiche_ouverte puis itineraire : un evenement chacun, meme appareil, source organic, aucune donnee personnelle', async ({ page }) => {
        const events = await captureEvents(page);
        const firstId = await page.evaluate(() => window.AppState.distributors[0].id);
        await page.evaluate(() => { window.open = () => null; });   // pas de vrai onglet Google Maps
        await openDistModal(page);
        await page.click('#dist-action-directions');

        await expect.poll(() => events.map(e => e.type)).toEqual(['fiche_ouverte', 'itineraire']);
        const device = await page.evaluate(() => localStorage.getItem('snackmatch_device'));
        for (const e of events) {
            expect(e).toMatchObject({ distributorId: firstId, source: 'organic', device });
            expect(Object.keys(e.raw).sort()).toEqual(['p_device_hash', 'p_distributor_id', 'p_source', 'p_type']);
        }
    });

    test('le passage en mode edition ne recompte pas la fiche', async ({ page }) => {
        const events = await captureEvents(page);
        await openDistModal(page);
        await page.evaluate(() => window.openDistributorModal(window.AppState.distributors[0].id, true, true));
        await page.waitForTimeout(300);
        expect(events.filter(e => e.type === 'fiche_ouverte')).toHaveLength(1);
    });

    test('signal retenu (inserted > 0) -> un seul signal_envoye par fiche ; RPC de mesure en erreur -> aucun toast', async ({ page }) => {
        const events = await captureEvents(page, 503);
        await page.route(RPC_ROUTE, route => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ inserted: 1, skipped: 0, source: 'anon' })
        }));
        await routeSignals(page);
        await openSignalableFiche(page);
        await signalFirstProduct(page, 'available');
        await expect(page.locator('#toast-container .toast.success')).toContainText('Merci');
        // Un 2e signal sur la meme fiche (la machine) : le KPI compte une contribution
        await page.click('#dist-machine-chip');
        await page.click('#dist-machine-choices .machine-choice[data-machine="working"]');
        await page.waitForTimeout(400);
        await expect.poll(() => events.map(e => e.type)).toEqual(['fiche_ouverte', 'signal_envoye']);
        expect(await page.$('#toast-container .toast.error')).toBeNull();
    });
});

// ============================================
// 17. RYTHME INFERE (vue product_rhythm, couche 2)
// ============================================
// La vue est interceptee : un profil boulangerie donne la phrase attendue sous
// la fraicheur ; sans lignes, rien n'est affiche (jamais une phrase inventee).

const RHYTHM_ROUTE = '**/rest/v1/product_rhythm*';

test.describe('17. Rythme infere', () => {
    test('profil boulangerie -> phrase sous le badge de fraicheur ; la tranche a 2 signaux est ignoree', async ({ page }) => {
        await page.route(RHYTHM_ROUTE, route => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify([
                { distributor_id: 'x', tranche: 'apres-midi', signaux_produit: 40, pct_dispo: 15, signaux_machine_ko: 0 },
                { distributor_id: 'x', tranche: 'matin', signaux_produit: 40, pct_dispo: 86, signaux_machine_ko: 0 },
                { distributor_id: 'x', tranche: 'midi', signaux_produit: 40, pct_dispo: 7, signaux_machine_ko: 2 },
                { distributor_id: 'x', tranche: 'soir', signaux_produit: 2, pct_dispo: 0, signaux_machine_ko: 0 }
            ])
        }));
        await openDistModal(page);
        const rhythm = page.locator('#dist-modal-rhythm');
        await expect(rhythm).toHaveText('Habituellement plein le matin, souvent vide à midi et l\'après-midi');
        await expect(rhythm).toBeVisible();
        const pos = await page.evaluate(() => ({
            rhythmTop: document.getElementById('dist-modal-rhythm').getBoundingClientRect().top,
            verifiedBottom: document.getElementById('dist-modal-verified').getBoundingClientRect().bottom
        }));
        expect(pos.rhythmTop).toBeGreaterThanOrEqual(pos.verifiedBottom - 1);
    });

    test('sans lignes -> rien n\'est affiche', async ({ page }) => {
        let served = false;
        await page.route(RHYTHM_ROUTE, route => { served = true; route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); });
        await openDistModal(page);
        await expect.poll(() => served).toBe(true);
        await page.waitForTimeout(300);
        const rhythm = page.locator('#dist-modal-rhythm');
        await expect(rhythm).toBeHidden();
        expect(await rhythm.textContent()).toBe('');
    });
});

// ============================================
// 18. TABLEAU DE BORD DU PILOTE (vues kpi_*, js/stats.js)
// ============================================
// Les vues sont interceptees ; on verifie les chiffres, le seuil, la
// navigation Compte -> tableau de bord -> retour, l'etat vide, et l'absence
// de debordement en 390 px.

const KPI_ROUTE = '**/rest/v1/kpi_*';

function kpiFixture() {
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

async function routeKpi(page, fixture) {
    await page.route(KPI_ROUTE, route => {
        const url = route.request().url();
        const key = Object.keys(fixture).find(k => url.includes(`/rest/v1/${k}`));
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(key ? fixture[key] : []) });
    });
}

test.describe('18. Tableau de bord du pilote', () => {
    test('Compte -> rangee "Tableau de bord du pilote" -> chiffres, seuil, listes ; retour vers Compte ; aucun debordement en 390 px', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await routeKpi(page, kpiFixture());
        await page.evaluate(() => window.switchView('account'));
        await page.waitForSelector('#account-view.view-active', { timeout: 3000 });
        await page.click('#account-stats-row');
        await page.waitForSelector('#stats-view.view-active', { timeout: 3000 });

        await expect(page.locator('#stats-coverage-24h')).toHaveText('70 %');
        await expect(page.locator('#stats-coverage-detail')).toHaveText('21 machines sur 30');
        await expect(page.locator('#stats-coverage-threshold')).toHaveClass(/is-ok/);
        await expect(page.locator('#stats-coverage-threshold')).toContainText('83 %');
        await expect(page.locator('#stats-contrib-rate')).toHaveText('25 %');
        await expect(page.locator('#stats-qr-share')).toHaveText('22 %');
        await expect(page.locator('#stats-signals-30j')).toHaveText('3320');
        await expect(page.locator('#stats-routes-30j')).toHaveText('85');
        await expect(page.locator('#stats-daily .stats-row')).toHaveCount(7);
        await expect(page.locator('#stats-daily .stats-row-value').first()).toHaveText('120');
        await expect(page.locator('#stats-top .stats-row')).toHaveCount(5);
        await expect(page.locator('#stats-top .stats-row').first()).toContainText('Machine 0');
        await expect(page.locator('#stats-empty')).toBeHidden();
await expect(page.locator('#stats-demo-note')).toBeHidden();   // sans machines_demo (migration 010 absente) : rien

        const overflow = await page.evaluate(() => ({
            doc: document.documentElement.scrollWidth,
            view: document.getElementById('stats-view').scrollWidth
        }));
        expect(overflow.doc).toBeLessThanOrEqual(390);
        expect(overflow.view).toBeLessThanOrEqual(390);

        await page.click('#back-from-stats');
        await page.waitForSelector('#account-view.view-active', { timeout: 3000 });
        expect(await page.$('#stats-view.view-active')).toBeNull();
    });

    test('aucune donnee -> etat vide explicite, pas de cartes', async ({ page }) => {
        await routeKpi(page, {});
        await page.evaluate(() => window.switchView('stats'));
        await page.waitForSelector('#stats-view.view-active', { timeout: 3000 });
        await expect(page.locator('#stats-empty')).toContainText('Pas encore de données');
        await expect(page.locator('#stats-content')).toBeHidden();
    });
});

// ============================================
// 19. TOASTS VISIBLES (au-dessus des modales et de la bottom nav)
// ============================================
// Audit UX 2026-09-18 (UX-01/10) : le toast etait rendu sous la fiche
// (z-index 300 vs 10500) et recouvrait la bottom nav sur la carte.

async function toastGeometry(page) {
    return page.evaluate(() => {
        const t = document.querySelector('#toast-container .toast');
        if (!t) return null;
        const r = t.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const nav = document.querySelector('.bottom-nav')?.getBoundingClientRect();
        return { onTop: !!(top && t.contains(top)), bottom: r.bottom, right: r.right, navTop: nav ? nav.top : null, navVisible: !!nav && nav.height > 0, vw: innerWidth };
    });
}

test.describe('19. Toasts visibles', () => {
    test('apres un signal envoye, le toast est au-dessus de la fiche (elementFromPoint)', async ({ page }) => {
        await page.route(RPC_ROUTE, route => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ inserted: 1, skipped: 0, source: 'anon' })
        }));
        await routeSignals(page);
        await openSignalableFiche(page);
        await signalFirstProduct(page, 'available');
        await expect(page.locator('#toast-container .toast.success')).toBeVisible();
        const g = await toastGeometry(page);
        expect(g.onTop).toBe(true);
    });

    test('sur la carte en 390 px, le toast reste au-dessus de la bottom nav et dans l\'ecran', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(300);
        await page.evaluate(async () => { const u = await import('./js/utils.js'); u.showToast('Toast de test, un peu long pour verifier la largeur en mobile', 'success'); });
        await expect(page.locator('#toast-container .toast')).toBeVisible();
        await page.waitForTimeout(400);   // fin de l'animation toastIn (translateY 20px -> 0)
        const g = await toastGeometry(page);
        expect(g.navVisible).toBe(true);
        expect(g.bottom).toBeLessThanOrEqual(g.navTop);
        expect(g.right).toBeLessThanOrEqual(g.vw);
        expect(g.onTop).toBe(true);
    });

    test('en desktop aussi, le toast ne recouvre pas la pilule de navigation', async ({ page }) => {
        await page.evaluate(async () => { const u = await import('./js/utils.js'); u.showToast('Toast de test', 'default'); });
        await expect(page.locator('#toast-container .toast')).toBeVisible();
        await page.waitForTimeout(400);   // fin de l'animation toastIn (translateY 20px -> 0)
        const g = await toastGeometry(page);
        if (g.navVisible) expect(g.bottom).toBeLessThanOrEqual(g.navTop);
    });
});

// ============================================
// 20. LISTE VIA LE HAMBURGER (mobile) - audit UX-03
// ============================================
// Le panneau « Tous les distributeurs » s'ouvrait vide tant qu'aucun chip
// n'avait ete tape ; le premier groupe de distance est desormais deplie.

test.describe('20. Liste via le hamburger', () => {
    test('en 390 px, le hamburger ouvre « Tous les distributeurs » deja rempli, premier groupe ouvert ; second tap ferme', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(300);
        await page.click('#sidebar-toggle');
        await expect(page.locator('#sidebar')).toHaveClass(/open/);
        await expect(page.locator('#side-panel-title')).toHaveText(/^Tous les distributeurs/);
        await expect(page.locator('#side-panel-list .side-panel-group-items:not([hidden]) .side-panel-item').first()).toBeVisible();
        const groups = await page.$$eval('#side-panel-list .side-panel-group-header', hs => hs.map(h => h.getAttribute('aria-expanded')));
        expect(groups.filter(g => g === 'true')).toHaveLength(1);
        await page.click('#sidebar-toggle');
        await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
    });

    // Retour terrain 2026-09-25 (T1-US3) : depuis une page, la liste s'ouvrait
    // sous la page (z-index 50 contre 150). Le burger revient a la carte d'abord.
    for (const view of ['notifications', 'subscriptions', 'activity', 'account']) {
        test(`depuis la page ${view}, le burger ferme la page et ouvre la liste, cliquable`, async ({ page }) => {
            await page.setViewportSize({ width: 390, height: 844 });
            await page.evaluate((v) => window.switchView(v), view);
            await expect(page.locator(`#${view === 'notifications' ? 'notifications-view' : view === 'subscriptions' ? 'subscriptions-view' : view + '-view'}`)).toHaveClass(/view-active/);
            await page.click('#sidebar-toggle');
            await expect(page.locator('#sidebar')).toHaveClass(/open/);
            expect(await page.evaluate(() => !!document.querySelector('.view-page.view-active'))).toBe(false);
            // Le premier item est au premier plan : un clic reel ouvre la fiche
            const item = page.locator('#side-panel-list .side-panel-group-items:not([hidden]) .side-panel-item').first();
            await item.click();
            await page.waitForSelector('#dist-modal-overlay.active', { timeout: 3000 });
        });
    }

    test('un chip ouvre le panneau avec le premier groupe non vide deja deplie', async ({ page }) => {
        await page.click('.filter-chip[data-type="pizza"]');
        await expect(page.locator('#side-panel-list .side-panel-group-items:not([hidden]) .side-panel-item').first()).toBeVisible();
    });
});

// ============================================
// 21. LISIBILITE MOBILE : polices >= 12 px, contrastes >= 4,5:1 (audit UX-07/08)
// ============================================
// Mesure sur les styles calcules, en 390 px, des ecrans de la boucle coeur.
// Exclus : attribution Leaflet (tiers), note inventee (#dist-modal-rating,
// decision differee, cf. audit UX-14), compteurs en pastille (.nav-tab-badge).

async function collectTextIssues(page, screen) {
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

test.describe('21. Lisibilite mobile (polices, contrastes)', () => {
    test('carte, panneau, fiche et signal sur l\u2019aliment / la machine : aucun texte < 12 px ni sous 4,5:1 en 390 px', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await routeSignals(page, {
            status: [{ distributor_id: 'x', state: 'empty', source: 'anon', weight: 0.5, created_at: minutesAgoIso(20), age_seconds: 1200 }]
        });
        const issues = [];
        issues.push(...await collectTextIssues(page, 'carte'));
        await page.click('.filter-chip[data-type="all"]');
        issues.push(...await collectTextIssues(page, 'panneau'));
        await page.click('#side-panel-close');
        await openSignalableFiche(page);
        await page.waitForTimeout(800);
        issues.push(...await collectTextIssues(page, 'fiche'));
        await page.locator('#dist-products-list button.product-row-main').first().click();
        issues.push(...await collectTextIssues(page, 'signal-aliment'));
        await page.click('#dist-machine-chip');
        issues.push(...await collectTextIssues(page, 'signal-machine'));
        expect(issues, issues.join('\n')).toEqual([]);
    });
});

// ============================================
// 22. GEOLOCALISATION OBLIGATOIRE (retour terrain 2026-09-25, annule UX-02)
// ============================================
// Decision Stephane (2026-09-25, T1-US5) : pas de carte sans geolocalisation.
// Refus -> l'ecran reste, avec les instructions et « Réessayer ». Un deep link
// (QR) montre la fiche, mais la fermer ramene l'ecran de geolocalisation.

const overlayGone = (page) => page.evaluate(() => { const o = document.getElementById('geoloc-overlay'); return !o || o.classList.contains('hidden'); });

test.describe('22. Geolocalisation obligatoire', () => {
    test.beforeEach(async () => { /* override : pas de setupApp */ });

    test('plus de « Voir la carte sans me localiser » ; un refus laisse l\'ecran avec « Réessayer »', async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        await context.route(EVENTS_ROUTE, route => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
        // Refus simule : l'API de geolocalisation repond PERMISSION_DENIED
        await context.addInitScript(() => {
            navigator.geolocation.getCurrentPosition = (ok, err) => setTimeout(() => err({ code: 1, message: 'denied' }), 50);
        });
        const page = await context.newPage();
        await page.goto(BASE_URL);
        await page.waitForSelector('#geoloc-btn', { state: 'visible', timeout: 15000 });
        await expect(page.locator('#geoloc-skip')).toHaveCount(0);
        await expect(page.locator('#geoloc-overlay')).not.toContainText('sans me localiser');

        await page.click('#geoloc-btn');
        await expect(page.locator('#geoloc-error')).toBeVisible();
        await expect(page.locator('#geoloc-error')).toContainText('Géolocalisation refusée');
        await expect(page.locator('#geoloc-btn')).toContainText('Réessayer');
        await expect(page.locator('#geoloc-btn')).toBeEnabled();
        expect(await overlayGone(page)).toBe(false);
        await context.close();
    });

    test('deep link QR sans geoloc : la fiche s\'ouvre, la fermer ramene l\'ecran de geolocalisation', async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        await context.route(EVENTS_ROUTE, route => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
        const page = await context.newPage();
        await page.goto(BASE_URL);
        await page.waitForFunction(() => window.AppState?.distributors?.length > 0, { timeout: 50000 });
        const firstId = await page.evaluate(() => window.AppState.distributors[0].id);
        await page.goto(`${BASE_URL}/?id=${firstId}&confirm=1&src=qr`);
        await page.waitForSelector('#dist-modal-overlay.active', { timeout: 50000 });
        await page.click('#dist-modal-close');
        await expect(page.locator('#dist-modal-overlay')).not.toHaveClass(/active/);
        await page.waitForTimeout(500);
        expect(await overlayGone(page)).toBe(false);
        await expect(page.locator('#geoloc-btn')).toBeVisible();
        await context.close();
    });
});

// ============================================
// 23. BOUTON RETOUR (Android) - audit UX-04
// ============================================
// Chaque couche (fiche, modale de signal, vue) pousse une entree d'historique :
// "retour" ferme la couche la plus haute, l'app n'est jamais quittee.

test.describe('23. Bouton retour', () => {
    test('fiche ouverte -> retour ferme la fiche, URL inchangee, app toujours la', async ({ page }) => {
        const url = page.url();
        await openDistModal(page);
        await page.goBack({ waitUntil: 'commit' }).catch(() => {});
        await expect(page.locator('#dist-modal-overlay')).not.toHaveClass(/active/);
        expect(page.url()).toBe(url);
        expect(await page.evaluate(() => !!window.AppState?.distributors?.length)).toBe(true);
    });

    test('aliment deplie dans la fiche -> retour ferme la fiche, l\u2019app reste', async ({ page }) => {
        await openSignalableFiche(page);
        await page.locator('#dist-products-list button.product-row-main').first().click();
        await page.goBack({ waitUntil: 'commit' }).catch(() => {});
        await expect(page.locator('#dist-modal-overlay')).not.toHaveClass(/active/);
        expect(await page.evaluate(() => !!window.AppState)).toBe(true);
    });

    test('vue Compte -> retour ramene a la carte', async ({ page }) => {
        await page.evaluate(() => window.switchView('account'));
        await page.waitForSelector('#account-view.view-active', { timeout: 3000 });
        await page.goBack({ waitUntil: 'commit' }).catch(() => {});
        await expect(page.locator('#account-view')).not.toHaveClass(/view-active/);
        await expect(page.locator('.leaflet-container')).toBeVisible();
    });

    test('fermer par la croix puis retour : la fiche ne se rouvre pas et l\'app reste chargee', async ({ page }) => {
        await openDistModal(page);
        await page.click('#dist-modal-close');
        await expect(page.locator('#dist-modal-overlay')).not.toHaveClass(/active/);
        await page.waitForTimeout(300);
        // Plus aucune couche : un retour de plus sort de l'app, comme sur n'importe quel site
        expect(await page.evaluate(() => window.__distrimatchLayers ? window.__distrimatchLayers() : [])).toEqual([]);
    });
});

// ============================================
// 24. HIERARCHIE DE LA FICHE (audit UX-05/13)
// ============================================
// EPIC-T2 : l'etat de la machine a droite du nom, sa provenance avant la note,
// plus de gros bouton rouge (on signale sur l'aliment), hero reduit sans photo,
// pas de separateur orphelin.

test.describe('24. Hierarchie de la fiche', () => {
    test('bandeau d\u2019etat en tete (info cle en grand), etat machine a droite du nom, provenance au-dessus de la note, pas de CTA rouge, onglets en pastilles', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await openDistModal(page);
        await page.waitForTimeout(500);
        const r = await page.evaluate(() => {
            const rect = id => document.getElementById(id).getBoundingClientRect();
            const meta = document.querySelector('.dist-modal-meta');
            const visibleChildren = [...meta.children].filter(c => c.offsetParent !== null && c.textContent.trim());
            const last = visibleChildren[visibleChildren.length - 1];
            return {
                verifiedBottom: rect('dist-modal-verified').bottom,
                ratingTop: rect('dist-modal-rating').top,
                chipLeft: rect('dist-machine-chip').left,
                chipTop: rect('dist-machine-chip').top,
                chipRight: rect('dist-machine-chip').right,
                nameLeft: rect('dist-modal-name').left,
                nameRight: rect('dist-modal-name').right,
                nameTop: rect('dist-modal-name').top,
                ficheRight: document.getElementById('dist-modal').getBoundingClientRect().right,
                hasCta: !!document.getElementById('dist-action-confirm'),
                overflow: document.documentElement.scrollWidth > innerWidth,
                heroTop: rect('dist-hero').top,
                ficheTop: document.getElementById('dist-modal').getBoundingClientRect().top,
                heroBg: getComputedStyle(document.getElementById('dist-hero')).backgroundColor,
                kpiSize: parseFloat(getComputedStyle(document.getElementById('dist-hero-kpi')).fontSize),
                kpiText: document.getElementById('dist-hero-kpi').textContent,
                activeTabBg: getComputedStyle(document.querySelector('.dist-tab.active')).backgroundColor,
                lastMetaIsSeparator: !!last && last.classList.contains('meta-separator'),
                typeOccurrences: (() => {
                    // Libelle du type sans l'emoji, accents conserves, echappe pour la RegExp
                    const label = document.getElementById('dist-modal-type').textContent.replace(/^[^A-Za-zÀ-ÿ]+/, '').trim();
                    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    return (document.getElementById('dist-modal').textContent.match(new RegExp(escaped, 'g')) || []).length;
                })()
            };
        });
        expect(r.verifiedBottom).toBeLessThanOrEqual(r.ratingTop + 1);
        expect(r.chipLeft).toBeGreaterThanOrEqual(r.nameRight - 1);      // a droite du nom
        expect(Math.abs(r.chipTop - r.nameTop)).toBeLessThan(16);          // sur la meme ligne
        expect(r.ficheRight - r.chipRight).toBeLessThan(40);                // cale a droite
        expect(r.hasCta).toBe(false);
        expect(r.overflow).toBe(false);
        // EPIC-T4 : bandeau d'etat en tete, aplat colore, info cle en tres grand, onglet actif rempli
        expect(r.heroTop).toBeLessThanOrEqual(r.ficheTop + 1);
        expect(r.heroBg).not.toBe('rgba(0, 0, 0, 0)');
        expect(r.kpiSize).toBeGreaterThanOrEqual(32);
        expect(r.kpiText.length).toBeGreaterThan(0);
        expect(r.activeTabBg).not.toBe('rgba(0, 0, 0, 0)');
        expect(r.lastMetaIsSeparator).toBe(false);
        expect(r.typeOccurrences).toBe(1);
    });
});

// ============================================
// 25. STATUT PRODUIT : DISPO / PAS DISPO / PAS D'INFO (EPIC-T2)
// ============================================
// Trois mots seulement. La couleur (is-fresh) dit la confiance : < 2 h vive,
// jusqu'a 24 h adoucie ; sans signal, « Pas d'info ». Plus jamais « catalogue ».

test.describe('25. Statut produit', () => {
    test("vu dispo 12 min -> « Dispo » vif ; vu absent 3 h -> « Pas dispo » adouci ; sans signal -> « Pas d'info »", async ({ page }) => {
        const signals = { products: [] };
        await page.route(url => url.pathname.endsWith('/rest/v1/distributor_status'), route =>
            route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
        await page.route(url => url.pathname.endsWith('/rest/v1/product_availability'), route =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(signals.products) }));
        const first = await page.evaluate(() => {
            const ok = (p) => p && p.id !== null && p.id !== undefined && p.id !== '' && Number.isInteger(Number(p.id));
            const d = window.AppState.distributors.find(x => (x.products || []).some(ok));
            return { id: d.id, productId: String(d.products.find(ok).id) };
        });
        const row = page.locator(`#dist-products-list .product-row[data-product-id="${first.productId}"]`);
        const open = async () => {
            await page.evaluate(id => window.openDistributorModal(id), first.id);
            await page.waitForSelector('#dist-modal-overlay.active', { timeout: 5000 });
            await page.waitForTimeout(500);
        };

        signals.products = [{ distributor_id: first.id, product_id: Number(first.productId), state: 'available', created_at: minutesAgoIso(12), source: 'anon', weight: 0.5 }];
        await open();
        await expect(row.locator('.product-pill')).toHaveText('Dispo');
        await expect(row.locator('.product-pill')).toHaveClass(/is-fresh/);
        await expect(row.locator('.product-seen')).toHaveText('vu il y a 12 min');
        await page.click('#dist-modal-close');

        signals.products = [{ distributor_id: first.id, product_id: Number(first.productId), state: 'absent', created_at: minutesAgoIso(180), source: 'anon', weight: 0.5 }];
        await open();
        await expect(row.locator('.product-pill')).toHaveText('Pas dispo');
        await expect(row.locator('.product-pill')).not.toHaveClass(/is-fresh/);
        await expect(row.locator('.product-seen')).toHaveText('vu il y a 3 h');
        await page.click('#dist-modal-close');

        signals.products = [];
        await open();
        await expect(row.locator('.product-pill')).toHaveText("Pas d'info");
        await expect(page.locator('#dist-products-list')).not.toContainText(/catalogue/i);
    });
});

// ============================================
// 26. SIGNAL SUR LA FICHE : UNE CHOSE DEPLIEE A LA FOIS (EPIC-T2)
// ============================================

test.describe('26. Une chose depliee a la fois', () => {
    test('deplier un aliment replie le precedent ; la puce machine replie les aliments ; la croix de la fiche reste visible', async ({ page }) => {
        const d = await page.evaluate(() => {
            const ok = (p) => p && p.id !== null && p.id !== undefined && p.id !== '' && Number.isInteger(Number(p.id));
            return window.AppState.distributors.find(x => (x.products || []).filter(ok).length >= 2)?.id;
        });
        test.skip(!d, 'aucune machine avec deux produits signalables');
        await page.evaluate(id => window.openDistributorModal(id), d);
        await page.waitForSelector('#dist-modal-overlay.active');
        const mains = page.locator('#dist-products-list button.product-row-main');
        await mains.nth(0).click();
        await expect(mains.nth(0)).toHaveAttribute('aria-expanded', 'true');
        await mains.nth(1).click();
        await expect(mains.nth(1)).toHaveAttribute('aria-expanded', 'true');
        await expect(mains.nth(0)).toHaveAttribute('aria-expanded', 'false');
        await page.click('#dist-machine-chip');
        await expect(page.locator('#dist-machine-choices')).toBeVisible();
        await expect(mains.nth(1)).toHaveAttribute('aria-expanded', 'false');
        await expect(page.locator('#dist-modal-close')).toBeVisible();
        // Un second tap sur la puce referme
        await page.click('#dist-machine-chip');
        await expect(page.locator('#dist-machine-choices')).toBeHidden();
    });
});

// ============================================
// 27. FILTRES ET PANNEAU (audit UX-11/12)
// ============================================
// Fondu a droite des chips tant qu'il en reste hors ecran, rappel « Tous »
// dans le panneau filtre, plus de toast de comptage, tranches vides masquees.

test.describe('27. Filtres et panneau', () => {
    test('390 px : fondu des chips tant qu\'on n\'est pas au bout ; chip -> panneau avec « Tous » et compte, sans toast, sans tranche vide', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(400);
        const bar = page.locator('#filter-bar');
        await expect(bar).toHaveClass(/is-scrollable-end/);
        await page.evaluate(() => { const b = document.getElementById('filter-bar'); b.scrollLeft = b.scrollWidth; });
        await expect(bar).not.toHaveClass(/is-scrollable-end/);
        await page.evaluate(() => { document.getElementById('filter-bar').scrollLeft = 0; });

        await page.click('.filter-chip[data-type="pizza"]');
        await expect(page.locator('#sidebar')).toHaveClass(/open/);
        await expect(page.locator('#side-panel-title')).toHaveText(/Pizza.*· \d+$/);
        await expect(page.locator('#side-panel-all')).toBeVisible();
        expect(await page.$('#toast-container .toast')).toBeNull();
        const counts = await page.$$eval('#side-panel-list .spg-count', els => els.map(e => parseInt(e.textContent, 10)));
        expect(counts.length).toBeGreaterThan(0);
        expect(counts.every(n => n > 0)).toBe(true);
        await expect(page.locator('#side-panel-list .side-panel-group-items:not([hidden]) .side-panel-item').first()).toBeVisible();

        await page.click('#side-panel-all');
        await expect(page.locator('#side-panel-title')).toHaveText(/^Tous les distributeurs · \d+$/);
        await expect(page.locator('#side-panel-all')).toBeHidden();
        await expect(page.locator('.filter-chip[data-type="pizza"]')).not.toHaveClass(/active/);
    });
});

// ============================================
// 28. FAVORI ET MENU AVATAR (audit UX-18/19)
// ============================================

test.describe('28. Favori et menu avatar', () => {
    test('favori : libelle constant, aria-pressed bascule, toast et vue Favoris parlent de favoris', async ({ page }) => {
        await openDistModal(page);
        const btn = page.locator('#dist-action-favorite');
        await expect(btn).toHaveAttribute('aria-pressed', 'false');
        await btn.click();
        await expect(btn).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('#dist-action-favorite-label')).toHaveText('Favori');
        await expect(page.locator('#toast-container .toast').last()).toContainText('favoris');
        await page.click('#dist-modal-close');
        await page.click('.bottom-nav [data-tab="favorites"]');
        await expect(page.locator('#subscriptions-count')).toHaveText(/favori/);
        await expect(page.locator('#subscriptions-list .btn-unsubscribe').first()).toHaveAttribute('aria-label', 'Retirer des favoris');
        await page.click('#subscriptions-list .btn-unsubscribe');
        await expect(page.locator('#subscriptions-count')).toHaveText('0 favori');
        const emptyPath = await page.getAttribute('#subscriptions-empty svg path', 'd');
        expect(emptyPath.startsWith('M20.84')).toBe(true);   // coeur, plus la cloche
    });

    test('menu avatar : chaque item fait au moins 44 px de haut', async ({ page }) => {
        await page.click('#profile-avatar-btn');
        const heights = await page.$$eval('#profile-menu .profile-menu-item', els => els.map(e => e.getBoundingClientRect().height));
        expect(heights.length).toBeGreaterThan(0);
        for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
    });
});

// ============================================
// 29. VUES CACHEES INERTES, POLICE DES CONTROLES (audit UX-20/21)
// ============================================

test.describe('29. Vues cachees et police des controles', () => {
    test('une vue cachee et le chat ferme ne sont ni visibles ni focusables ; la vue active l\'est', async ({ page }) => {
        const r = await page.evaluate(() => {
            const view = document.querySelector('.view-page.view-hidden');
            const btn = view.querySelector('button, a[href], input');
            btn.focus();
            const chat = document.getElementById('chat-modal');
            const chatBtn = chat.querySelector('button, input');
            chatBtn.focus();
            return {
                viewInert: view.hasAttribute('inert'),
                viewFocusable: document.activeElement === btn,
                chatInert: chat.hasAttribute('inert'),
                chatFocusable: document.activeElement === chatBtn
            };
        });
        expect(r.viewInert).toBe(true);
        expect(r.viewFocusable).toBe(false);
        expect(r.chatInert).toBe(true);
        expect(r.chatFocusable).toBe(false);
        await page.evaluate(() => window.switchView('account'));
        await page.waitForSelector('#account-view.view-active', { timeout: 3000 });
        await expect(page.locator('#account-auth-action')).toBeVisible();
        expect(await page.evaluate(() => { const b = document.getElementById('account-auth-action'); b.focus(); return document.activeElement === b; })).toBe(true);
    });

    test('boutons et champs utilisent la police du site', async ({ page }) => {
        await openSignalableFiche(page);
        const r = await page.evaluate(() => {
            const body = getComputedStyle(document.body).fontFamily;
            const same = sel => getComputedStyle(document.querySelector(sel)).fontFamily === body;
            return { body, machineChip: same('#dist-machine-chip'), productRow: same('#dist-products-list .product-row-main'), chip: same('.filter-chip'), tab: same('.dist-tab'), navTab: same('.nav-tab'), search: same('#quick-search') };
        });
        expect(r.machineChip).toBe(true);
        expect(r.productRow).toBe(true);
        expect(r.chip).toBe(true);
        expect(r.tab).toBe(true);
        expect(r.navTab).toBe(true);
        expect(r.search).toBe(true);
    });
});

// ============================================
// 30. ECRAN D'ACCUEIL : PROMETTRE CE QUE L'APP FAIT (audit UX-15)
// ============================================

test.describe('30. Ecran d\'accueil', () => {
    test.beforeEach(async () => { /* override : pas de setupApp */ });

    test('les benefices parlent de fraicheur, de signal et de rythme ; ni « Alertes stock » ni territoire', async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        await context.route(EVENTS_ROUTE, route => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
        const page = await context.newPage();
        await page.goto(BASE_URL);
        await page.waitForSelector('#geoloc-btn', { state: 'visible', timeout: 15000 });
        const text = await page.textContent('#geoloc-overlay');
        expect(text).toContain('Vérifié il y a');
        expect(text).toContain('en un tap');
        expect(text).toContain('Habituellement plein');
        expect(text).not.toContain('Alertes stock');
        expect(text).not.toMatch(/C[oô]te Basque/);
        expect(await page.title()).not.toMatch(/C[oô]te Basque/);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(overflow).toBeLessThanOrEqual(390);
        await context.close();
    });
});

// ============================================
// 31. FICHES DE DEMONSTRATION (distributors.is_demo, migration 010)
// ============================================
// Le GET des distributeurs est intercepte par predicat (le glob
// '**/rest/v1/distributors*' attraperait aussi l'insert et le PATCH, et '?'
// est un joker Playwright). Une fiche fictive + une reelle, avec produits.

function demoDistributorsFixture() {
    const now = new Date().toISOString();
    const row = (id, name, is_demo, lat) => ({
        id, name, type: 'pizza', emoji: '🍕', address: `${name}, Bayonne`, city: 'Bayonne', lat, lng: -1.4748,
        rating: 4.2, review_count: 7, status: 'verified', last_verified: now, price_range: '€€',
        is_user_added: false, is_demo, tz: 'Europe/Paris',
        products: [{ id: is_demo ? 9001 : 9002, name: 'Margherita', price: 9.5, available: true }]
    });
    return [row('demo-e2e', 'Fiche fictive e2e', true, 43.4935), row('real-e2e', 'Vraie machine e2e', false, 43.4940)];
}

async function routeDistributors(page, rows) {
    await page.route(url => url.pathname.endsWith('/rest/v1/distributors'), route =>
        route.request().method() === 'GET'
            ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) })
            : route.fallback());
}

test.describe('31. Fiches de démonstration', () => {
    test('tag « Démo » dans le panneau, la fiche et « À propos » de la fiche fictive seulement ; lisible en 390 px', async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const page = await context.newPage();
        await routeDistributors(page, demoDistributorsFixture());
        await setupApp(page, context);
        expect(await page.evaluate(() => window.AppState.distributors.map(d => [d.id, d.isDemo]))).toEqual([['demo-e2e', true], ['real-e2e', false]]);

        await page.click('.filter-chip[data-type="all"]');
        await expect(page.locator('#side-panel-list .side-panel-item[data-id="demo-e2e"] .demo-tag')).toHaveText('Démo');
        expect(await page.locator('#side-panel-list .demo-tag').count()).toBe(1);
        await page.click('#side-panel-close');

        await page.evaluate(() => window.openDistributorModal('demo-e2e'));
        await page.waitForSelector('#dist-modal-overlay.active', { timeout: 5000 });
        await expect(page.locator('#dist-modal-demo')).toBeVisible();
        await expect(page.locator('#dist-modal-name')).toHaveText('Fiche fictive e2e');
        await page.click('.dist-tab[data-tab="apropos"]');
        await expect(page.locator('#dist-apropos-demo-row')).toBeVisible();
        await page.click('.dist-tab[data-tab="produits"]');
        const issues = await collectTextIssues(page, 'fiche-demo');
        expect(issues, issues.join('\n')).toEqual([]);
        await page.click('#dist-modal-close');

        await page.evaluate(() => window.openDistributorModal('real-e2e'));
        await page.waitForSelector('#dist-modal-overlay.active', { timeout: 5000 });
        await expect(page.locator('#dist-modal-demo')).toBeHidden();
        await page.click('.dist-tab[data-tab="apropos"]');
        await expect(page.locator('#dist-apropos-demo-row')).toBeHidden();
        await context.close();
    });

    test('tableau de bord : « dont N de démo » et tags sur les fiches fictives du top', async ({ page }) => {
        const fixture = kpiFixture();
        fixture.kpi_coverage = [{ ...fixture.kpi_coverage[0], machines_demo: 25 }];
        fixture.kpi_top_distributors = fixture.kpi_top_distributors.map((r, i) => ({ ...r, is_demo: i % 2 === 0 }));
        await routeKpi(page, fixture);
        await page.evaluate(() => window.switchView('stats'));
        await page.waitForSelector('#stats-view.view-active', { timeout: 3000 });
        await expect(page.locator('#stats-demo-note')).toHaveText('dont 25 de démo (données fictives)');
        await expect(page.locator('#stats-coverage-detail')).toHaveText('21 machines sur 30');
        await expect(page.locator('#stats-top .demo-tag')).toHaveCount(3);
    });
});
