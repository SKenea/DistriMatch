/**
 * DistriMatch - Tests end-to-end (Google Maps design)
 * Lancer : npx playwright test tests/e2e.spec.js --headed
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:8080';

// ============================================
// HELPERS
// ============================================

async function setupApp(page, context) {
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
    test('bottom nav : Explorer / Favoris / Activite', async ({ page }) => {
        const tabs = await page.$$eval('.bottom-nav .nav-tab span:first-of-type', els =>
            els.map(el => el.textContent.trim())
        );
        expect(tabs).toEqual(expect.arrayContaining(['Explorer', 'Favoris', 'Activite']));
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
        await page.waitForSelector('#side-panel-list .side-panel-item', { timeout: 3000 });

        const items = await page.$$('#side-panel-list .side-panel-item');
        expect(items.length).toBeGreaterThan(0);
    });

    test('clic sur un item du panneau ouvre la modal', async ({ page }) => {
        await page.click('.filter-chip[data-type="pizza"]');
        await page.waitForSelector('#side-panel-list .side-panel-item');
        await page.click('#side-panel-list .side-panel-item');
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

});

// ============================================
// 5. AUTH WALL
// ============================================

test.describe('5. Auth wall', () => {
    test('clic favori declenche la modal auth', async ({ page }) => {
        await page.evaluate(() => { window.AppState.subscriptions = []; localStorage.clear(); });
        await openDistModal(page);
        await page.evaluate(() => document.getElementById('dist-action-favorite').click());
        await page.waitForSelector('.auth-modal-overlay', { timeout: 3000 });

        const modal = await page.$('.auth-modal');
        expect(modal).not.toBeNull();
    });

    test('clic + Ajouter un distributeur declenche la modal auth', async ({ page }) => {
        await page.click('#btn-add-distributor');
        await page.waitForSelector('.auth-modal-overlay', { timeout: 3000 });

        const modal = await page.$('.auth-modal');
        expect(modal).not.toBeNull();
    });
});

// ============================================
// 6. CHAT BOT (sans auth)
// ============================================

test.describe('6. Chat bot', () => {
    test('chat ouvrable sans auth', async ({ page }) => {
        await page.evaluate(() => window.openConversation(window.AppState.distributors[0].id));
        await page.waitForSelector('#chat-modal.active');

        const active = await page.evaluate(() =>
            document.getElementById('chat-modal').classList.contains('active')
        );
        expect(active).toBe(true);
    });

    test('quick replies en francais', async ({ page }) => {
        await page.evaluate(() => window.openConversation(window.AppState.distributors[0].id));
        await page.waitForSelector('.quick-reply-btn');

        const firstReply = await page.$('.quick-reply-btn');
        const replyLabel = (await firstReply.textContent()).trim();
        await firstReply.click();
        await page.waitForTimeout(800);

        const userMessages = await page.$$eval('#chat-messages .chat-message.user .message-content',
            els => els.map(el => el.textContent.trim())
        );
        expect(userMessages[userMessages.length - 1]).toBe(replyLabel);
    });
});

// ============================================
// 7. PROFIL
// ============================================

test.describe('7. Profil', () => {
    test('indicateur "Non connecte" par defaut', async ({ page }) => {
        await page.click('button[aria-label="Profil"]');
        await page.waitForSelector('#profile-view.view-active');

        const text = await page.textContent('#auth-indicator-text');
        expect(text).toBe('Non connecte');
    });

    test('stats profil visibles', async ({ page }) => {
        await page.click('button[aria-label="Profil"]');
        await page.waitForSelector('#profile-view.view-active');
        const subsStat = await page.$('#profile-view .stat-card');
        expect(subsStat).not.toBeNull();
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
});
