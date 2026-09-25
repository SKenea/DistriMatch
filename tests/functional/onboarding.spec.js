/**
 * DistriMatch - Tests fonctionnels : Onboarding : ecran d'accueil, geolocalisation obligatoire, deep link
 *
 * User stories couvertes : EPIC-T1 T1-US5 (geolocalisation obligatoire), audit UX-02 / UX-15 (accueil), deep link QR avant consentement.
 * Serveur simule la ou il le faut (voir helpers.js). Lancer : npm run test:functional
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, EVENTS_ROUTE, setupApp, overlayGone } from './helpers.js';

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
