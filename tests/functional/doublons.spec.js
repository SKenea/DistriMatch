/**
 * DistriMatch - Tests fonctionnels : machines enregistrees seulement sur le telephone
 *
 * User stories couvertes : EPIC-T9 (T9-US1 nettoyage des doublons locaux, T9-US2
 * machine locale signalee et publiable). Rejoue le cas terrain de Stephane : une
 * copie locale de Gaztainbidea (id inconnu de la base, position decalee) ouvrait
 * une fiche refusee par la base (avis en erreur 23503).
 * Lancer : npm run test:functional
 */
import { test, expect } from '@playwright/test';
import { setupApp, loginForTest } from './helpers.js';

const LOCAL_KEY = 'snackmatch_user_distributors';

test.beforeEach(async ({ page, context }) => {
    await setupApp(page, context);
});

// Pose des machines « locales » sur le telephone puis recharge l'app.
// Retourne la machine de la base dont on fabrique une copie locale.
async function withLocalMachines(page, context) {
    const remote = await page.evaluate(() => {
        const d = window.AppState.distributors.find(x => !x.isLocalOnly);
        return { id: d.id, name: d.name, lat: d.lat, lng: d.lng, type: d.type };
    });
    await page.evaluate(([key, r]) => {
        localStorage.setItem(key, JSON.stringify([
            // Copie locale : meme nom (casse differente), 33 m plus loin, autre id
            { id: 'user-local-dup', name: `  ${r.name.toUpperCase()} `, lat: r.lat + 0.0003, lng: r.lng, type: r.type, emoji: '🏪', address: 'Copie locale', products: [] },
            // Vraie machine locale : jamais envoyee a la base
            { id: 'user-local-only', name: 'Machine locale de test', lat: 43.4001, lng: -1.3001, type: 'other', emoji: '📦', address: 'Rue du test', products: [{ name: 'Produit test', available: true }] }
        ]));
    }, [LOCAL_KEY, remote]);
    await setupApp(page, context);   // rechargement : le nettoyage se fait au chargement
    return remote;
}

test.describe('33. Machines seulement locales', () => {
    test('au chargement, la copie locale d’une machine de la base disparait ; la vraie machine locale est reperee', async ({ page, context }) => {
        const remote = await withLocalMachines(page, context);
        const r = await page.evaluate((key) => ({
            dupInApp: window.AppState.distributors.some(d => d.id === 'user-local-dup'),
            localOnly: window.AppState.distributors.find(d => d.id === 'user-local-only')?.isLocalOnly,
            stored: JSON.parse(localStorage.getItem(key)).map(d => d.id)
        }), LOCAL_KEY);
        expect(r.dupInApp).toBe(false);
        expect(r.stored).toEqual(['user-local-only']);
        expect(r.localOnly).toBe(true);
        // La vraie machine de la base est toujours la
        expect(await page.evaluate((id) => window.AppState.distributors.some(d => d.id === id), remote.id)).toBe(true);
    });

    test('fiche d’une machine locale : bandeau explicatif, ni signal, ni avis, ni photo, ni modifier (meme connecte)', async ({ page, context }) => {
        await withLocalMachines(page, context);
        await loginForTest(page);
        await page.evaluate(() => window.openDistributorModal('user-local-only'));
        await page.waitForSelector('#dist-modal-overlay.active');
        await expect(page.locator('#dist-local-only')).toBeVisible();
        await expect(page.locator('#dist-local-only')).toContainText("n'est enregistrée que sur ton téléphone");
        await expect(page.locator('#dist-local-publish')).toHaveText('Publier cette machine');
        await expect(page.locator('#dist-machine-choices')).toBeHidden();
        await expect(page.locator('#dist-products-list button.product-row-main')).toHaveCount(0);
        await expect(page.locator('#dist-action-edit')).toBeHidden();
        await expect(page.locator('#dist-action-add-photo')).toBeHidden();
        await page.click('.dist-tab[data-tab="avis"]');
        await expect(page.locator('#dist-reviews-empty')).toHaveText("Publie d'abord cette machine pour recevoir des avis.");
        await expect(page.locator('#dist-review-mine')).toBeHidden();
    });

    test('« Publier cette machine » l’envoie a la base avec ses produits ; la fiche redevient normale', async ({ page, context }) => {
        await withLocalMachines(page, context);
        const posted = { distributors: null, products: null };
        await page.route(url => url.pathname.endsWith('/rest/v1/distributors'), route => {
            if (route.request().method() !== 'POST') return route.continue();
            posted.distributors = route.request().postDataJSON();
            return route.fulfill({ status: 201, contentType: 'application/json', body: '' });
        });
        await page.route(url => url.pathname.endsWith('/rest/v1/products'), route => {
            if (route.request().method() !== 'POST') return route.continue();
            posted.products = route.request().postDataJSON();
            return route.fulfill({ status: 201, contentType: 'application/json', body: '' });
        });
        await loginForTest(page);
        await page.evaluate(() => window.openDistributorModal('user-local-only'));
        await page.waitForSelector('#dist-modal-overlay.active');
        await page.click('#dist-local-publish');

        await expect(page.locator('#toast-container .toast.success')).toContainText('Machine publiée');
        expect(posted.distributors).toMatchObject({ id: 'user-local-only', name: 'Machine locale de test', is_user_added: true });
        expect(posted.distributors.is_demo).toBeUndefined();   // jamais envoye
        expect(posted.products).toEqual([{ distributor_id: 'user-local-only', name: 'Produit test', available: true }]);
        await expect(page.locator('#dist-local-only')).toBeHidden();
        await expect(page.locator('#dist-machine-choices')).toBeVisible();
        await expect(page.locator('#dist-action-edit')).toBeVisible();
        expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).length, LOCAL_KEY)).toBe(0);
    });

    test('visiteur sur une machine locale : le bouton propose de se connecter pour la publier', async ({ page, context }) => {
        await withLocalMachines(page, context);
        await page.evaluate(() => window.openDistributorModal('user-local-only'));
        await page.waitForSelector('#dist-modal-overlay.active');
        await expect(page.locator('#dist-local-publish')).toHaveText('Me connecter pour la publier');
        await expect(page.locator('#dist-login-invite')).toBeHidden();   // un seul encadre
    });
});
