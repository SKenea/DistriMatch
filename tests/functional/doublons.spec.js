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
        await expect(page.locator('#dist-local-only')).toContainText("n'est enregistré que sur ton téléphone");
        await expect(page.locator('#dist-local-publish')).toHaveText('Publier ce distributeur');
        await expect(page.locator('#dist-status-update')).toHaveAttribute('aria-disabled', 'true');   // EPIC-T19 : ligne inerte
        await expect(page.locator('#dist-machine-choices')).toBeHidden();
        await expect(page.locator('#dist-products-list .product-status-btn:not([data-guest])')).toHaveCount(0);
        await expect(page.locator('#dist-product-add')).toHaveCount(0);
        await expect(page.locator('#dist-action-add-photo')).toBeHidden();
        await page.click('.dist-tab[data-tab="avis"]');
        await expect(page.locator('#dist-reviews-empty')).toHaveText("Publie d'abord ce distributeur pour recevoir des avis.");
        await expect(page.locator('#dist-review-mine')).toBeHidden();
    });

    test('« Publier ce distributeur » l’envoie a la base avec ses produits ; la fiche passe en attente de validation (EPIC-T21)', async ({ page, context }) => {
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

        await expect(page.locator('#toast-container .toast.success')).toContainText('visible par tous après validation');
        expect(posted.distributors).toMatchObject({ id: 'user-local-only', name: 'Machine locale de test', is_user_added: true, tz: expect.any(String) });   // SEC-05 : fuseau du telephone
        expect(posted.distributors.is_demo).toBeUndefined();   // jamais envoye
        expect(posted.products).toEqual([{ distributor_id: 'user-local-only', name: 'Produit test', available: true }]);
        await expect(page.locator('#dist-local-only')).toBeHidden();
        await expect(page.locator('#dist-review-pending')).toBeVisible();
        await expect(page.locator('#dist-status-update')).toHaveAttribute('aria-disabled', 'true');
        await expect(page.locator('#dist-product-add')).toHaveCount(0);
        expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).length, LOCAL_KEY)).toBe(0);
    });

    test('visiteur sur une machine locale : le bouton propose de se connecter pour la publier', async ({ page, context }) => {
        await withLocalMachines(page, context);
        await page.evaluate(() => window.openDistributorModal('user-local-only'));
        await page.waitForSelector('#dist-modal-overlay.active');
        await expect(page.locator('#dist-local-publish')).toHaveText('Me connecter pour le publier');
        await expect(page.locator('#dist-login-invite')).toBeHidden();   // un seul encadre
    });

    // BUG-07 : une copie locale d'une fiche deja envoyee ne revient jamais
    // « seulement sur ton telephone » ; un id deja refuse n'est pas un succes
    const REJECTED_ID = 'user-bug07-refusee';

    test('copie locale d’une fiche refusée : quitte le téléphone, ni pastille ni bandeau (BUG-07)', async ({ page, context }) => {
        // Base simulee : la vraie reponse + la fiche refusee (son auteur la lit, regle 022)
        await page.route(u => u.pathname.endsWith('/rest/v1/distributors') && (u.searchParams.get('select') || '').includes('products('), async route => {
            if (route.request().method() !== 'GET') return route.continue();
            const res = await route.fetch();
            const rows = await res.json();
            rows.push({ ...rows[0], id: REJECTED_ID, name: 'ZZ BUG-07 fiche refusee', lat: 43.3901, lng: -1.2901, review_status: 'rejected', products: [] });
            return route.fulfill({ response: res, json: rows });
        });
        await page.evaluate((key) => {
            localStorage.setItem(key, JSON.stringify([
                // Copie gardee apres un envoi reussi (avant BUG-07), meme id que la ligne refusee
                { id: 'user-bug07-refusee', name: 'ZZ BUG-07 fiche refusee', lat: 43.3901, lng: -1.2901, type: 'other', emoji: '📦', address: 'Rue du test', products: [], reviewStatus: 'pending', isUserAdded: true }
            ]));
        }, LOCAL_KEY);
        await setupApp(page, context);   // rechargement : le nettoyage se fait au chargement
        const r = await page.evaluate(([key, id]) => ({
            inApp: window.AppState.distributors.some(d => d.id === id),
            stored: JSON.parse(localStorage.getItem(key) || '[]').map(d => d.id)
        }), [LOCAL_KEY, REJECTED_ID]);
        expect(r).toEqual({ inApp: false, stored: [] });
        await page.evaluate((id) => window.openDistributorModal(id), REJECTED_ID);
        await expect(page.locator('#dist-modal-overlay.active')).toHaveCount(0);
        await expect(page.locator('#dist-local-only')).toBeHidden();
    });

    test('copie d’une fiche déjà envoyée que la base ne renvoie pas : cachée, gardée (BUG-07)', async ({ page, context }) => {
        // Visiteur : sa fiche en attente est illisible en anonyme, la vraie base ne la renvoie pas
        await page.evaluate((key) => {
            localStorage.setItem(key, JSON.stringify([
                { id: 'user-bug07-envoyee', name: 'ZZ BUG-07 fiche envoyee', lat: 43.3801, lng: -1.2801, type: 'other', emoji: '📦', address: 'Rue du test', products: [], reviewStatus: 'pending', isUserAdded: true }
            ]));
        }, LOCAL_KEY);
        await setupApp(page, context);
        const r = await page.evaluate((key) => ({
            inApp: window.AppState.distributors.some(d => d.id === 'user-bug07-envoyee'),
            stored: JSON.parse(localStorage.getItem(key) || '[]').map(d => d.id)
        }), LOCAL_KEY);
        expect(r).toEqual({ inApp: false, stored: ['user-bug07-envoyee'] });
    });

    test('« Publier » sur un id déjà refusé : pas de faux succès, la copie s’en va (BUG-07)', async ({ page, context }) => {
        await withLocalMachines(page, context);   // user-local-only : jamais envoyee, isLocalOnly
        const posted = [];
        await page.route(u => u.pathname.endsWith('/rest/v1/distributors'), route => {
            const req = route.request();
            if (req.method() === 'POST') {
                posted.push(req.postDataJSON());
                return route.fulfill({ status: 409, contentType: 'application/json',
                    body: JSON.stringify({ code: '23505', message: 'duplicate key value violates unique constraint "distributors_pkey"', details: null, hint: null }) });
            }
            if (new URL(req.url()).searchParams.get('select') === 'review_status') {
                return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ review_status: 'rejected' }]) });
            }
            return route.continue();
        });
        await loginForTest(page);
        await page.evaluate(() => window.openDistributorModal('user-local-only'));
        await page.waitForSelector('#dist-modal-overlay.active');
        await page.click('#dist-local-publish');

        await expect(page.locator('#toast-container .toast.warning')).toContainText('Mes ajouts');
        await expect(page.locator('#toast-container .toast.success')).toHaveCount(0);
        expect(posted).toHaveLength(1);
        const r = await page.evaluate((key) => ({
            inApp: window.AppState.distributors.some(d => d.id === 'user-local-only'),
            stored: JSON.parse(localStorage.getItem(key) || '[]').map(d => d.id)
        }), LOCAL_KEY);
        expect(r).toEqual({ inApp: false, stored: [] });
        await expect(page.locator('#dist-modal-overlay.active')).toHaveCount(0);
    });
});
