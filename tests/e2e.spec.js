/**
 * DistriMatch - Tests end-to-end des chemins fonctionnels
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

async function openBottomSheet(page, index = 0) {
    await page.evaluate((i) => {
        const d = window.AppState.distributors[i];
        window.showDetails(d.id);
    }, index);
    await page.waitForSelector('#bottom-sheet.bs-peek', { timeout: 5000 });
}

async function expandBottomSheetToFull(page) {
    await page.click('#bottom-sheet-peek');
    await page.waitForSelector('#bottom-sheet.bs-full', { timeout: 5000 });
}

async function closeAuthModal(page) {
    const close = await page.$('.auth-modal-close');
    if (close) {
        await close.click();
        await page.waitForSelector('.auth-modal-overlay', { state: 'detached', timeout: 3000 });
    }
}

test.beforeEach(async ({ page, context }) => {
    await setupApp(page, context);
});

// ============================================
// 1. ONBOARDING
// ============================================

test.describe('1. Onboarding', () => {
    test('la carte se charge apres validation geoloc', async ({ page }) => {
        // L'overlay doit etre masque ou supprime du DOM
        const overlay = await page.$('#geoloc-overlay');
        if (overlay) {
            const classes = await overlay.getAttribute('class');
            expect(classes).toContain('hidden');
        }
        // Sinon l'overlay a ete remove du DOM, ce qui est aussi OK

        // La carte Leaflet doit etre presente
        const map = await page.$('.leaflet-container');
        expect(map).not.toBeNull();

        // Des distributeurs sont charges
        const distCount = await page.evaluate(() => window.AppState.distributors.length);
        expect(distCount).toBeGreaterThan(0);
    });

    test('des marqueurs sont affiches sur la carte', async ({ page }) => {
        const markerCount = await page.evaluate(() => {
            return document.querySelectorAll('.distributor-marker-container').length;
        });
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

        const h2 = await page.textContent('#activity-view h2');
        expect(h2).toBe('Activite');
    });

    test('clic sur Favoris ouvre la vue favoris', async ({ page }) => {
        await page.click('.bottom-nav [data-tab="favorites"]');
        await page.waitForSelector('#subscriptions-view.view-active', { timeout: 3000 });

        const h2 = await page.textContent('#subscriptions-view h2');
        expect(h2).toBe('Mes Favoris');
    });

    test('clic sur Explorer revient a la carte', async ({ page }) => {
        await page.click('.bottom-nav [data-tab="activity"]');
        await page.waitForSelector('#activity-view.view-active');
        await page.click('.bottom-nav [data-tab="explore"]');
        await page.waitForTimeout(500);

        const activeView = await page.$('.view-page.view-active');
        expect(activeView).toBeNull();
    });

    test('top nav : boutons recherche/abonnements/profil presents', async ({ page }) => {
        expect(await page.$('button[aria-label="Rechercher"]')).not.toBeNull();
        expect(await page.$('button[aria-label="Abonnements"]')).not.toBeNull();
        expect(await page.$('button[aria-label="Profil"]')).not.toBeNull();
    });

    test('clic profil ouvre la vue profil', async ({ page }) => {
        await page.click('button[aria-label="Profil"]');
        await page.waitForSelector('#profile-view.view-active', { timeout: 3000 });

        const h2 = await page.textContent('#profile-view h2');
        expect(h2).toContain('Profil');
    });
});

// ============================================
// 3. EXPLORATION CARTE
// ============================================

test.describe('3. Exploration carte', () => {
    test('clic sur un filtre active le filtre et met a jour les marqueurs', async ({ page }) => {
        await page.click('.filter-chip[data-type="pizza"]');
        await page.waitForTimeout(500);

        const activeFilter = await page.evaluate(() => {
            return window.AppState.activeFilters;
        });
        expect(activeFilter).toContain('pizza');

        // Les marqueurs visibles doivent etre filtres
        const visibleMarkers = await page.$$('.distributor-marker-container');
        expect(visibleMarkers.length).toBeGreaterThan(0);
    });

    test('clic sur "Tous" reset les filtres', async ({ page }) => {
        await page.click('.filter-chip[data-type="pizza"]');
        await page.waitForTimeout(300);
        await page.click('.filter-chip[data-type="all"]');
        await page.waitForTimeout(500);

        const activeFilters = await page.evaluate(() => window.AppState.activeFilters);
        expect(activeFilters.length).toBe(0);
    });

    test('ouverture recherche via bouton loupe', async ({ page }) => {
        await page.click('button[aria-label="Rechercher"]');
        await page.waitForSelector('#search-overlay.active', { timeout: 3000 });

        const input = await page.$('#quick-search');
        expect(input).not.toBeNull();
    });

    test('recherche par nom filtre les resultats', async ({ page }) => {
        await page.click('button[aria-label="Rechercher"]');
        await page.waitForSelector('#search-overlay.active');
        await page.fill('#quick-search', 'Pizza');
        await page.waitForTimeout(500);

        const results = await page.$$('#search-results .search-item-clean');
        expect(results.length).toBeGreaterThan(0);
    });

    test('bouton centrer sur ma position', async ({ page }) => {
        const btn = await page.$('#center-map');
        expect(btn).not.toBeNull();
        await btn.click();
        await page.waitForTimeout(500);
        // Pas de crash
    });
});

// ============================================
// 4. INTERACTION DISTRIBUTEUR (BOTTOM SHEET)
// ============================================

test.describe('4. Bottom sheet distributeur', () => {
    test('ouverture peek avec infos', async ({ page }) => {
        await openBottomSheet(page);

        const name = await page.textContent('#peek-name');
        expect(name).toBeTruthy();

        const emoji = await page.textContent('#peek-emoji');
        expect(emoji.length).toBeGreaterThan(0);
    });

    test('expansion peek -> full', async ({ page }) => {
        await openBottomSheet(page);
        await expandBottomSheetToFull(page);

        // Verifier les sections full
        const name = await page.textContent('#bs-detail-name');
        expect(name).toBeTruthy();

        const address = await page.textContent('#bs-detail-address');
        expect(address).toBeTruthy();

        const rating = await page.textContent('#bs-detail-rating');
        expect(rating).toContain('★');
    });

    test('liste produits visible ou empty state', async ({ page }) => {
        await openBottomSheet(page);
        await expandBottomSheetToFull(page);

        const productsList = await page.$('#bs-products-list');
        const html = await productsList.innerHTML();

        // Soit des produits, soit l'empty state
        expect(
            html.includes('product-item-clean') || html.includes('products-empty-state')
        ).toBe(true);
    });

    test('retour full -> peek via drag handle', async ({ page }) => {
        await openBottomSheet(page);
        await expandBottomSheetToFull(page);
        await page.click('#bottom-sheet-drag');
        await page.waitForSelector('#bottom-sheet.bs-peek', { timeout: 3000 });

        const state = await page.evaluate(() =>
            document.getElementById('bottom-sheet').classList.toString()
        );
        expect(state).toContain('bs-peek');
    });

    test('3 boutons action presents (Signaler/Itineraire/Discuter)', async ({ page }) => {
        await openBottomSheet(page);
        await expandBottomSheetToFull(page);

        expect(await page.$('#bs-btn-report')).not.toBeNull();
        expect(await page.$('#bs-get-directions')).not.toBeNull();
        expect(await page.$('#bs-btn-chat')).not.toBeNull();
    });
});

// ============================================
// 5. CHAT BOT (SANS AUTH)
// ============================================

test.describe('5. Chat bot', () => {
    test('clic Discuter ouvre le chat modal', async ({ page }) => {
        await openBottomSheet(page);
        await expandBottomSheetToFull(page);
        await page.click('#bs-btn-chat');
        await page.waitForSelector('#chat-modal.active', { timeout: 3000 });

        const name = await page.textContent('#chat-name');
        expect(name).toBeTruthy();
    });

    test('chat affiche des quick replies', async ({ page }) => {
        await page.evaluate(() => window.openConversation(window.AppState.distributors[0].id));
        await page.waitForSelector('#chat-modal.active');

        const replies = await page.$$('.quick-reply-btn');
        expect(replies.length).toBeGreaterThan(0);
    });

    test('quick reply envoie un message francais', async ({ page }) => {
        await page.evaluate(() => window.openConversation(window.AppState.distributors[0].id));
        await page.waitForSelector('#chat-modal.active');
        await page.waitForSelector('.quick-reply-btn');

        const firstReply = await page.$('.quick-reply-btn');
        const replyLabel = await firstReply.textContent();
        await firstReply.click();
        await page.waitForTimeout(800);

        // Le dernier message user doit etre le label francais, pas l'action anglaise
        const userMessages = await page.$$eval('#chat-messages .chat-message.user .message-content',
            els => els.map(el => el.textContent.trim())
        );
        expect(userMessages[userMessages.length - 1]).toBe(replyLabel.trim());
    });

    test('le bot repond apres un quick reply', async ({ page }) => {
        await page.evaluate(() => window.openConversation(window.AppState.distributors[0].id));
        await page.waitForSelector('#chat-modal.active');
        await page.waitForSelector('.quick-reply-btn');

        const before = await page.$$eval('#chat-messages .chat-message.bot', els => els.length);
        await page.click('.quick-reply-btn');
        await page.waitForTimeout(800);
        const after = await page.$$eval('#chat-messages .chat-message.bot', els => els.length);

        expect(after).toBeGreaterThan(before);
    });

    test('fermeture chat modal', async ({ page }) => {
        await page.evaluate(() => window.openConversation(window.AppState.distributors[0].id));
        await page.waitForSelector('#chat-modal.active');
        await page.click('#chat-close');
        await page.waitForTimeout(300);

        const active = await page.evaluate(() =>
            document.getElementById('chat-modal').classList.contains('active')
        );
        expect(active).toBe(false);
    });
});

// ============================================
// 6. AUTH WALL - TOUTES LES ACTIONS D'ECRITURE
// ============================================

test.describe('6. Auth wall', () => {
    test('clic favori (coeur) declenche la modal auth', async ({ page }) => {
        await openBottomSheet(page);
        await expandBottomSheetToFull(page);
        await page.evaluate(() => document.getElementById('bs-favorite').click());
        await page.waitForSelector('.auth-modal-overlay', { timeout: 3000 });

        const modal = await page.$('.auth-modal');
        expect(modal).not.toBeNull();
    });

    test('clic "+ Ajouter un distributeur" declenche la modal auth', async ({ page }) => {
        await page.click('#btn-add-distributor');
        await page.waitForSelector('.auth-modal-overlay', { timeout: 3000 });

        const modal = await page.$('.auth-modal');
        expect(modal).not.toBeNull();
    });

    test('clic Signaler declenche la modal auth', async ({ page }) => {
        await openBottomSheet(page);
        await expandBottomSheetToFull(page);
        await page.click('#bs-btn-report');
        await page.waitForSelector('.auth-modal-overlay', { timeout: 3000 });

        const modal = await page.$('.auth-modal');
        expect(modal).not.toBeNull();
    });

    test('modal contient le widget hCaptcha', async ({ page }) => {
        await page.waitForFunction(() => typeof window.hcaptcha !== 'undefined', { timeout: 15000 });

        await openBottomSheet(page);
        await expandBottomSheetToFull(page);
        await page.evaluate(() => document.getElementById('bs-favorite').click());
        await page.waitForSelector('.auth-modal-overlay');

        const captchaDiv = await page.$('.auth-modal .h-captcha');
        expect(captchaDiv).not.toBeNull();

        const sitekey = await captchaDiv.getAttribute('data-sitekey');
        expect(sitekey).toBe('10000000-ffff-ffff-ffff-000000000001'); // cle test en localhost
    });

    test('bouton submit desactive sans captcha', async ({ page }) => {
        await openBottomSheet(page);
        await expandBottomSheetToFull(page);
        await page.evaluate(() => document.getElementById('bs-favorite').click());
        await page.waitForSelector('.auth-modal-overlay');

        const disabled = await page.getAttribute('.auth-modal-submit', 'disabled');
        expect(disabled).not.toBeNull();
    });

    test('fermeture modal via croix', async ({ page }) => {
        await openBottomSheet(page);
        await expandBottomSheetToFull(page);
        await page.evaluate(() => document.getElementById('bs-favorite').click());
        await page.waitForSelector('.auth-modal-overlay');
        await closeAuthModal(page);

        const modalGone = await page.$('.auth-modal-overlay');
        expect(modalGone).toBeNull();
    });
});

// ============================================
// 7. LECTURES ANONYMES
// ============================================

test.describe('7. Lectures restent anonymes', () => {
    test('ouverture bottom sheet sans modal auth', async ({ page }) => {
        await openBottomSheet(page);

        const modal = await page.$('.auth-modal-overlay');
        expect(modal).toBeNull();
    });

    test('navigation onglets sans modal auth', async ({ page }) => {
        await page.click('.bottom-nav [data-tab="activity"]');
        await page.waitForTimeout(300);
        await page.click('.bottom-nav [data-tab="favorites"]');
        await page.waitForTimeout(300);
        await page.click('.bottom-nav [data-tab="explore"]');
        await page.waitForTimeout(300);

        const modal = await page.$('.auth-modal-overlay');
        expect(modal).toBeNull();
    });

    test('chat sans modal auth', async ({ page }) => {
        await page.evaluate(() => window.openConversation(window.AppState.distributors[0].id));
        await page.waitForSelector('#chat-modal.active');

        const modal = await page.$('.auth-modal-overlay');
        expect(modal).toBeNull();
    });
});

// ============================================
// 8. PROFIL
// ============================================

test.describe('8. Profil', () => {
    test('indicateur "Non connecte" par defaut', async ({ page }) => {
        await page.click('button[aria-label="Profil"]');
        await page.waitForSelector('#profile-view.view-active');

        const text = await page.textContent('#auth-indicator-text');
        expect(text).toBe('Non connecte');

        const indicator = await page.$('#auth-indicator');
        const classes = await indicator.getAttribute('class');
        expect(classes).not.toContain('logged-in');
    });

    test('bouton logout cache par defaut', async ({ page }) => {
        await page.click('button[aria-label="Profil"]');
        await page.waitForSelector('#profile-view.view-active');

        const display = await page.evaluate(() =>
            getComputedStyle(document.getElementById('logout-btn')).display
        );
        expect(display).toBe('none');
    });

    test('stats profil visibles', async ({ page }) => {
        await page.click('button[aria-label="Profil"]');
        await page.waitForSelector('#profile-view.view-active');

        const subsStat = await page.$('#profile-view .stat-card');
        expect(subsStat).not.toBeNull();
    });

    test('bouton Notifications ouvre les parametres', async ({ page }) => {
        await page.click('button[aria-label="Profil"]');
        await page.waitForSelector('#profile-view.view-active');
        await page.click('#notification-settings-btn');
        await page.waitForSelector('#notification-settings.view-active', { timeout: 3000 });

        const h2 = await page.textContent('#notification-settings h2');
        expect(h2).toContain('Notifications');
    });
});

// ============================================
// 9. MOBILE VIEWPORT
// ============================================

test.describe('9. Mobile', () => {
    test('sidebar cachee en mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.waitForTimeout(500);

        const sidebarOpen = await page.evaluate(() =>
            document.getElementById('sidebar').classList.contains('open')
        );
        expect(sidebarOpen).toBe(false);
    });

    test('bottom sheet fonctionne en mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.waitForTimeout(300);

        await openBottomSheet(page);

        const state = await page.evaluate(() =>
            document.getElementById('bottom-sheet').classList.toString()
        );
        expect(state).toContain('bs-peek');
    });

    test('bottom nav visible en mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.waitForTimeout(300);

        const bottomNav = await page.$('.bottom-nav');
        const visible = await bottomNav.isVisible();
        expect(visible).toBe(true);
    });
});
