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
    canOpenTestSession, openTestSession, closeTestSession, testAccountSignals, STORAGE_KEY
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
        await expect(page.locator('#dist-machine-choices')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('#dist-login-invite')).toBeHidden();
        await expect(page.locator('#dist-action-edit')).toBeVisible();
        await expect(page.locator('#dist-action-add-photo')).toBeVisible();
    });

    test('« Fonctionne » : la vraie base enregistre le signal du compte, le bandeau suit', async ({ page, context }) => {
        await openAsTestAccount(page, context);
        await page.click('#dist-machine-choices .machine-choice[data-machine="working"]');
        await expect(page.locator('#toast-container .toast.success')).toContainText('Merci', { timeout: 15000 });
        await expect(page.locator('#dist-hero-kpi')).toHaveText('Fonctionne');
        const rows = await testAccountSignals(DEMO_ID);
        expect(rows.some(r => r.state === 'working' && r.source === 'user' && r.product_id === null)).toBe(true);
    });

    test('« Il y en a » sur un aliment : enregistre en base, la ligne passe en « Dispo »', async ({ page, context }) => {
        await openAsTestAccount(page, context);
        const row = page.locator('#dist-products-list .product-row').first();
        const productId = Number(await row.getAttribute('data-product-id'));
        await row.locator('button.product-row-main').click();
        await row.locator('.product-choice[data-state="available"]').click();
        await expect(page.locator('#toast-container .toast.success')).toContainText('Merci', { timeout: 15000 });
        await expect(row.locator('.product-pill')).toHaveText('Dispo');
        const rows = await testAccountSignals(DEMO_ID);
        expect(rows.some(r => r.state === 'available' && Number(r.product_id) === productId)).toBe(true);
    });
});
