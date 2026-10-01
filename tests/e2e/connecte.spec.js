/**
 * DistriMatch - Tests E2E : parcours CONNECTE sur le site EN LIGNE (EPIC-T7 T7-US4b)
 *
 * Bout en bout, sans simulation : vrai site, vraie base, vraie session du compte
 * de test e2e@distrimatch.test (migration 015, autorise par Stephane le
 * 2026-09-25). Le compte signale sur une FICHE DE DEMO (dist-007) ; la base
 * verifie le JWT, la RLS et la RPC. A la fin : signaux du compte purges,
 * sessions supprimees, verifie.
 *
 * Seule la mesure d'audience (log_event) est coupee, pour ne pas compter les
 * passages de test dans le KPI du pilote.
 * Prerequis : SUPABASE_ACCESS_TOKEN dans .env.local (sinon saute).
 */
import { test, expect } from '@playwright/test';
import {
    canOpenTestSession, openTestSession, closeTestSession, testAccountSignals, testAccountReviews, STORAGE_KEY
} from './session.mjs';

const DEMO_ID = 'dist-007';
let session = null;

test.describe.serial('E2E connecte (site en ligne, vrai compte de test)', () => {
    test.skip(!canOpenTestSession(), 'SUPABASE_ACCESS_TOKEN absent (.env.local) : parcours connecte saute');

    test.beforeAll(async () => {
        ({ session } = await openTestSession());
    });

    test.afterAll(async () => {
        await closeTestSession();
        expect(await testAccountSignals(DEMO_ID)).toEqual([]);   // rien ne reste en base
        expect(await testAccountReviews(DEMO_ID)).toEqual([]);
    });

    async function openAsTestAccount(page, context) {
        await context.grantPermissions(['geolocation']);
        await context.setGeolocation({ latitude: 43.4929, longitude: -1.4748 });
        await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify(session)]);
        await page.route('**/rest/v1/rpc/log_event', route => route.abort());   // pas de mesure d'audience
        await page.goto(`./?nocache=${Date.now()}`);
        await page.click('#geoloc-btn');
        await page.waitForFunction(() => window.AppState?.distributors?.length > 0, null, { timeout: 60000 });
        await page.evaluate((id) => window.openDistributorModal(id), DEMO_ID);
        await page.waitForSelector('#dist-modal-overlay.active');
    }

    test('connecte : les controles pour informer apparaissent (vraie session reconnue)', async ({ page, context }) => {
        await openAsTestAccount(page, context);
        await expect(page.locator('#dist-status-update')).toBeVisible({ timeout: 15000 });   // « Mettre à jour » (EPIC-T10)
        await expect(page.locator('#dist-login-invite')).toBeHidden();
        await expect(page.locator('#dist-products-list .product-name-btn').first()).toBeVisible();   // modifier au toucher (EPIC-T12)
        await expect(page.locator('#dist-product-add')).toBeVisible();
        await expect(page.locator('#dist-action-add-photo')).toBeVisible();
    });

    test('« En service » : la vraie base enregistre le signal du compte, la ligne d\u2019etat suit', async ({ page, context }) => {
        await openAsTestAccount(page, context);
        await page.click('#dist-status-update');
        await page.click('#dist-machine-choices .machine-choice[data-machine="working"]');
        await expect(page.locator('#toast-container .toast.success')).toContainText('Merci', { timeout: 15000 });
        await expect(page.locator('#dist-status-word')).toHaveText('En service');
        const rows = await testAccountSignals(DEMO_ID);
        expect(rows.some(r => r.state === 'working' && r.source === 'user' && r.product_id === null)).toBe(true);
    });

    test('avis : le compte publie un avis, le voit, la base l\u2019enregistre, puis il le supprime', async ({ page, context }) => {
        await openAsTestAccount(page, context);
        await page.click('.dist-tab[data-tab="avis"]');
        await expect(page.locator('#dist-review-mine')).toBeVisible({ timeout: 15000 });
        await page.click('#dist-review-stars .review-star[data-rating="5"]');
        await page.fill('#dist-review-body', 'Avis de test E2E, supprime aussitot.');
        await page.click('#dist-review-submit');
        await expect(page.locator('#toast-container .toast.success')).toContainText('Merci pour ton avis', { timeout: 15000 });
        await expect(page.locator('#dist-reviews-list .review-item.is-mine')).toContainText('Avis de test E2E');
        const saved = await testAccountReviews(DEMO_ID);
        expect(saved).toEqual([{ rating: 5, body: 'Avis de test E2E, supprime aussitot.', author_name: 'Membre DistriMatch' }]);

        await page.click('#dist-review-delete');
        await page.click('#confirm-ok');
        await expect(page.locator('#toast-container .toast', { hasText: 'Avis supprimé' })).toBeVisible({ timeout: 15000 });
        expect(await testAccountReviews(DEMO_ID)).toEqual([]);
    });

    test('« Dispo » sur un aliment : enregistre en base, la carte passe en « Dispo »', async ({ page, context }) => {
        await openAsTestAccount(page, context);
        const productId = Number(await page.locator('#dist-products-list .product-row').first().getAttribute('data-product-id'));
        // La carte peut changer de place une fois « Dispo » (tri) : on la suit par son id
        const row = page.locator(`#dist-products-list .product-row[data-product-id="${productId}"]`);
        if (await row.locator('.product-choices').isHidden()) await row.locator('.product-status-btn').click();
        await row.locator('.product-choice[data-state="available"]').click();
        await expect(page.locator('#toast-container .toast.success')).toContainText('Merci', { timeout: 15000 });
        await expect(row.locator('.product-pill')).toHaveText('Dispo');
        const rows = await testAccountSignals(DEMO_ID);
        expect(rows.some(r => r.state === 'available' && Number(r.product_id) === productId)).toBe(true);
    });
});
