/**
 * DistriMatch - Tests fonctionnels : page Confidentialite (PRIV-04)
 *
 * La page s'ouvre depuis l'accueil (avant le consentement a la localisation), la
 * fenetre de connexion, le formulaire « C'est ton distributeur ? » et Compte ;
 * « Retour » (ou le retour du telephone) la ferme et rend ce qui etait dessous,
 * saisie comprise. La base est simulee la ou il le faut. Lancer : npm run test:functional
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, EVENTS_ROUTE, setupApp, loginForTest, openSignalableFiche } from './helpers.js';

const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

test.describe('49. Confidentialité (PRIV-04)', () => {
    test('accueil : le lien ouvre la page avant la localisation, Retour et retour du téléphone ramènent l’accueil', async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        await context.route(EVENTS_ROUTE, route => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
        const page = await context.newPage();
        await page.goto(BASE_URL);
        await page.waitForSelector('#geoloc-btn', { state: 'visible', timeout: 15000 });
        await expect(page.locator('#geoloc-overlay')).not.toContainText('jamais stockée');
        await page.click('#geoloc-overlay [data-open-privacy]');
        await expect(page.locator('#privacy-view')).toHaveClass(/view-active/);
        await expect(page.locator('#privacy-view h2')).toHaveText('Confidentialité');
        await page.click('#back-from-privacy');
        await expect(page.locator('#privacy-view')).not.toHaveClass(/view-active/);
        await expect(page.locator('#geoloc-btn')).toBeVisible();
        await page.click('#geoloc-overlay [data-open-privacy]');
        await expect(page.locator('#privacy-view')).toHaveClass(/view-active/);
        await page.goBack({ waitUntil: 'commit' }).catch(() => {});
        await expect(page.locator('#privacy-view')).not.toHaveClass(/view-active/);
        await expect(page.locator('#geoloc-btn')).toBeVisible();
        await context.close();
    });

    test('Compte : la ligne ouvre la page, Retour ramène Compte', async ({ page, context }) => {
        await setupApp(page, context);
        await page.evaluate(() => window.switchView('account'));
        await page.waitForSelector('#account-view.view-active', { timeout: 3000 });
        await page.click('#account-privacy-row');
        await expect(page.locator('#privacy-view')).toHaveClass(/view-active/);
        await page.click('#back-from-privacy');
        await expect(page.locator('#account-view')).toHaveClass(/view-active/);
        await expect(page.locator('#privacy-view')).not.toHaveClass(/view-active/);
    });

    test('connexion : le lien sous l’e-mail ouvre la page par-dessus, Retour rend la fenêtre et la saisie', async ({ page, context }) => {
        await setupApp(page, context);
        await page.evaluate(() => localStorage.setItem('distrimatch_force_auth', '1'));
        await page.click('#btn-add-distributor');
        await page.waitForSelector('.auth-modal-overlay', { timeout: 3000 });
        await page.fill('.auth-modal input[type="email"]', 'moi@example.test');
        await page.click('.auth-modal [data-open-privacy]');
        await expect(page.locator('#privacy-view')).toHaveClass(/view-active/);
        await page.click('#back-from-privacy');   // echoue si la fenetre de connexion recouvre la page
        await expect(page.locator('#privacy-view')).not.toHaveClass(/view-active/);
        await expect(page.locator('.auth-modal input[type="email"]')).toHaveValue('moi@example.test');
    });

    test('« C’est ton distributeur ? » : le lien ouvre la page par-dessus la fiche, Retour rend le formulaire rempli', async ({ page, context }) => {
        await setupApp(page, context);
        await page.route('**/rest/v1/rpc/is_admin', r => r.fulfill(json(false)));
        await page.route('**/rest/v1/rpc/my_operated_distributors', r => r.fulfill(json([])));
        await page.route(u => u.pathname.endsWith('/rest/v1/operator_requests'), r => r.fulfill(json([])));
        await page.route(u => u.pathname.endsWith('/rest/v1/operator_request_messages'), r => r.fulfill(json([])));
        await loginForTest(page);
        await openSignalableFiche(page, { login: false });
        await page.click('.dist-tab[data-tab="apropos"]');
        await page.click('#dist-operator-claim');
        await page.fill('#dist-operator-form input[name="company"]', 'Ferme Exemple');
        await page.click('#dist-operator-form [data-open-privacy]');
        await expect(page.locator('#privacy-view')).toHaveClass(/view-active/);
        await page.click('#back-from-privacy');   // echoue si la fiche recouvre la page
        await expect(page.locator('#privacy-view')).not.toHaveClass(/view-active/);
        await expect(page.locator('#dist-modal-overlay')).toHaveClass(/active/);
        await expect(page.locator('#dist-operator-form input[name="company"]')).toHaveValue('Ferme Exemple');
    });
});
