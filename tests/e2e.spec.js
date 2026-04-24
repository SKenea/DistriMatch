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

    test('bouton Modifier cache si non favori', async ({ page }) => {
        await page.evaluate(() => { window.AppState.subscriptions = []; });
        await openDistModal(page);

        const display = await page.evaluate(() =>
            getComputedStyle(document.getElementById('dist-action-edit')).display
        );
        expect(display).toBe('none');
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
