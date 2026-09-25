/**
 * DistriMatch - Tests E2E : parcours visiteur sur le site EN LIGNE
 *
 * Bout en bout, sans AUCUNE simulation : vrai site (GitHub Pages), vraie base
 * Supabase, vraies donnees. Un visiteur ouvre l'app, voit la carte, lit une fiche
 * et ne peut pas informer ; la base elle-meme refuse un signal sans compte.
 *
 * Aucune ecriture en base : le seul appel bloque est la mesure d'audience
 * (log_event), pour ne pas compter les passages de test dans le KPI du pilote.
 * Ce n'est pas une simulation : la requete est coupee, rien n'est repondu a la
 * place du serveur.
 *
 * Lancer : npm run test:e2e   (E2E_BASE_URL pour viser un autre hote)
 * Fiche de reference : dist-007, une fiche de demonstration (is_demo).
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const DEMO_ID = 'dist-007';
const config = readFileSync(new URL('../../js/config.js', import.meta.url), 'utf8');
const SUPABASE_URL = config.match(/SUPABASE_URL = '([^']+)'/)[1];
const ANON_KEY = config.match(/SUPABASE_ANON_KEY = '([^']+)'/)[1];

async function openApp(page, context, query = '') {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 43.4929, longitude: -1.4748 });
    await page.route('**/rest/v1/rpc/log_event', route => route.abort());   // pas de mesure d'audience
    await page.goto(`./${query}${query ? '&' : '?'}nocache=${Date.now()}`);
}

async function passGeoloc(page) {
    await page.click('#geoloc-btn');
    await page.waitForFunction(() => window.AppState?.distributors?.length > 0, null, { timeout: 60000 });
}

test.describe('E2E visiteur (site en ligne, vraie base)', () => {
    test('la carte se charge avec les distributeurs de la vraie base', async ({ page, context }) => {
        const errors = [];
        page.on('pageerror', e => errors.push(String(e)));
        await openApp(page, context);
        await passGeoloc(page);
        const n = await page.evaluate(() => window.AppState.distributors.length);
        expect(n).toBeGreaterThan(1);
        await expect.poll(() => page.evaluate(() => document.querySelectorAll('.distributor-marker-container').length)).toBeGreaterThan(0);
        expect(errors).toEqual([]);
    });

    test('une fiche se lit sans compte : etat en grand, dispo, aucun controle pour informer', async ({ page, context }) => {
        await openApp(page, context);
        await passGeoloc(page);
        await page.evaluate((id) => window.openDistributorModal(id), DEMO_ID);
        await page.waitForSelector('#dist-modal-overlay.active');
        await expect(page.locator('#dist-hero-kpi')).toHaveText(/^(Fonctionne|Vide|En panne|Pas d'info)$/, { timeout: 15000 });
        await expect(page.locator('#dist-products-title')).toHaveText(/^Il reste quoi \?/);
        await expect(page.locator('#dist-modal-demo')).toBeVisible();                       // fiche de demo signalee
        await expect(page.locator('#dist-login-invite')).toBeVisible();
        await expect(page.locator('#dist-machine-choices')).toBeHidden();
        await expect(page.locator('#dist-products-list button.product-row-main')).toHaveCount(0);
        await expect(page.locator('#dist-action-edit')).toBeHidden();
        await expect(page.locator('#dist-action-add-photo')).toBeHidden();
        expect(await page.evaluate(() => typeof window.__testLogin)).toBe('undefined');      // pas d'acces de test en ligne
    });

    test('scan du QR code en visiteur : la fiche s’ouvre et invite a se connecter', async ({ page, context }) => {
        await openApp(page, context, `?id=${DEMO_ID}&confirm=1&src=qr`);
        await page.waitForSelector('#dist-modal-overlay.active', { timeout: 60000 });
        await expect(page.locator('#dist-login-invite')).toHaveClass(/is-highlighted/);
        await expect(page.locator('#dist-login-invite')).toBeInViewport();
        expect(page.url()).not.toContain('confirm=');
    });

    test('la vraie base refuse un signal sans compte (403, « Connexion requise »)', async ({ request }) => {
        const res = await request.post(`${SUPABASE_URL}/rest/v1/rpc/confirm_availability`, {
            headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
            data: { p_distributor_id: DEMO_ID, p_device_hash: 'e2e-visiteur-000000001', p_product_signals: [], p_machine_state: 'working' }
        });
        expect(res.status()).toBe(403);
        const body = await res.json();
        expect(body.code).toBe('28000');
        expect(body.message).toMatch(/Connexion requise/);
    });

    test('la vraie base refuse de renommer une fiche sans compte', async ({ request }) => {
        const res = await request.patch(`${SUPABASE_URL}/rest/v1/distributors?id=eq.${DEMO_ID}`, {
            headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
            data: { name: 'Pirate' }
        });
        expect(res.status()).toBeGreaterThanOrEqual(400);
    });
});

// Parcours connecte (vrai compte de test) : tests/e2e/connecte.spec.js
