/**
 * DistriMatch - Tests fonctionnels : avis sur les machines
 *
 * User stories couvertes : EPIC-T8 (T8-US1 lire les avis, T8-US2 deposer /
 * modifier / supprimer son avis en connecte, messages des refus de la base).
 * Serveur simule : table `reviews` et vue `distributor_ratings` interceptees.
 * Lancer : npm run test:functional
 */
import { test, expect } from '@playwright/test';
import { setupApp, loginForTest } from './helpers.js';

test.beforeEach(async ({ page, context }) => {
    await setupApp(page, context);
});

function fakeReviews(n) {
    return Array.from({ length: n }, (_, i) => ({
        id: 1000 + i, author_name: `Auteur ${i + 1}`, rating: 1 + (i % 5),   // PRIV-02 : l'API ne rend plus user_id
        body: i % 3 === 0 ? null : `Commentaire ${i + 1}`,
        created_at: new Date(Date.now() - (i + 1) * 86400000).toISOString(), updated_at: new Date().toISOString()
    }));
}

// Simule la table reviews : liste paginee (offset / limit + total dans
// Content-Range), insertion, modification, suppression ; « mon avis » par la
// RPC my_review (PRIV-02 : l'API ne rend plus user_id). Retourne l'etat pour
// les verifications (calls : methode, corps, parametres de l'URL).
async function routeReviews(page, { list = [], mine = null, rating = null, insertError = null } = {}) {
    const db = { list, mine, rating, calls: [] };
    await page.route(url => url.pathname.endsWith('/rest/v1/rpc/my_review'), async route => {
        db.calls.push({ method: 'RPC', body: route.request().postDataJSON?.() ?? null, search: '' });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(db.mine ? [db.mine] : []) });
    });
    await page.route(url => url.pathname.endsWith('/rest/v1/reviews'), async route => {
        const req = route.request();
        const url = new URL(req.url());
        const method = req.method();
        db.calls.push({ method, body: req.postDataJSON?.() ?? null, search: url.search });
        if (method === 'GET') {
            const all = db.mine ? [db.mine, ...db.list] : db.list;
            const offset = Number(url.searchParams.get('offset') || 0);
            const limit = Number(url.searchParams.get('limit') || 10);
            const page_ = all.slice(offset, offset + limit);
            const end = page_.length ? offset + page_.length - 1 : offset;
            return route.fulfill({
                status: 200, contentType: 'application/json',
                // Requete cross-origin : comme le vrai Supabase, on expose Content-Range (total)
                headers: { 'content-range': `${page_.length ? `${offset}-${end}` : '*'}/${all.length}`, 'access-control-expose-headers': 'Content-Range' },
                body: JSON.stringify(page_)
            });
        }
        if (method === 'POST') {
            if (insertError) return route.fulfill({ status: insertError.status, contentType: 'application/json', body: JSON.stringify(insertError.body) });
            const b = req.postDataJSON();
            db.mine = { id: 5000, author_name: 'Membre DistriMatch', rating: b.rating, body: b.body, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
            db.rating = { avis: db.list.length + 1, moyenne: b.rating };
            return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(db.mine) });
        }
        if (method === 'PATCH') {
            const b = req.postDataJSON();
            db.mine = { ...db.mine, ...b };
            db.rating = { avis: db.list.length + 1, moyenne: b.rating };
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(db.mine) });
        }
        if (method === 'DELETE') {
            db.mine = null;
            db.rating = db.list.length ? { avis: db.list.length, moyenne: 3 } : null;
            return route.fulfill({ status: 204, body: '' });
        }
        return route.continue();
    });
    await page.route(url => url.pathname.endsWith('/rest/v1/distributor_ratings'), route =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(db.rating ? [db.rating] : []) }));
    return db;
}

async function openReviewsTab(page, { rating = 0, reviewCount = 0 } = {}) {
    const id = await page.evaluate(({ rating, reviewCount }) => {
        const d = window.AppState.distributors[0];
        d.rating = rating;
        d.reviewCount = reviewCount;
        window.openDistributorModal(d.id);
        return d.id;
    }, { rating, reviewCount });
    await page.waitForSelector('#dist-modal-overlay.active');
    await page.click('.dist-tab[data-tab="avis"]');
    return id;
}

test.describe('32. Avis', () => {
    test('visiteur : les avis se lisent du plus recent, 10 par page, « Voir plus » ; invitation a se connecter', async ({ page }) => {
        await routeReviews(page, { list: fakeReviews(23) });
        await openReviewsTab(page, { rating: 4.2, reviewCount: 23 });
        const items = page.locator('#dist-reviews-list .review-item');
        await expect(items).toHaveCount(10);
        await expect(items.first()).toContainText('Auteur 1');
        await expect(page.locator('#dist-reviews-summary')).toHaveText('4.2 ★★★★☆ · 23 avis');
        await expect(page.locator('#dist-modal-rating')).toHaveText('4.2 ★★★★☆');
        await expect(page.locator('#dist-review-invite')).toBeVisible();
        await expect(page.locator('#dist-review-mine')).toBeHidden();
        await page.click('#dist-reviews-more');
        await expect(items).toHaveCount(20);
        await page.click('#dist-reviews-more');
        await expect(items).toHaveCount(23);
        await expect(page.locator('#dist-reviews-more')).toBeHidden();
    });

    test('machine sans avis : « Pas encore d’avis » en tete et dans l’onglet', async ({ page }) => {
        await routeReviews(page, { list: [] });
        await openReviewsTab(page);
        await expect(page.locator('#dist-modal-rating')).toHaveText("Pas encore d'avis");
        await expect(page.locator('#dist-reviews-empty')).toBeVisible();
        await expect(page.locator('#dist-reviews-list .review-item')).toHaveCount(0);
    });

    test('connecte : publier un avis -> merci, note de la fiche et liste mises a jour, « Ton avis »', async ({ page }) => {
        const db = await routeReviews(page, { list: [] });
        await loginForTest(page);
        await openReviewsTab(page);
        await expect(page.locator('#dist-review-mine-title')).toHaveText('Donne ton avis');
        await expect(page.locator('#dist-review-submit')).toBeDisabled();
        await page.click('#dist-review-stars .review-star[data-rating="4"]');
        await page.fill('#dist-review-body', '  Machine propre, pain chaud.  ');
        await expect(page.locator('#dist-review-chars')).toHaveText('27 / 500');
        await page.click('#dist-review-submit');

        await expect(page.locator('#toast-container .toast.success')).toContainText('Merci pour ton avis');
        const post = db.calls.find(c => c.method === 'POST');
        expect(post.body).toMatchObject({ rating: 4, body: 'Machine propre, pain chaud.' });
        expect(post.body.author_name).toBeUndefined();   // l'auteur est pose par la base
        await expect(page.locator('#dist-modal-rating')).toHaveText('4.0 ★★★★☆');
        await expect(page.locator('#dist-modal-reviews')).toHaveText('(1)');
        await expect(page.locator('#dist-reviews-list .review-item.is-mine')).toContainText('Ton avis');
        await expect(page.locator('#dist-review-mine-title')).toHaveText('Ton avis');
        await expect(page.locator('#dist-review-submit')).toHaveText('Modifier mon avis');
        await expect(page.locator('#dist-review-delete')).toBeVisible();
    });

    test('connecte : modifier puis supprimer son avis', async ({ page }) => {
        const mine = { id: 5000, author_name: 'Membre DistriMatch', rating: 5, body: 'Top', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        const db = await routeReviews(page, { list: fakeReviews(2), mine, rating: { avis: 3, moyenne: 3.3 } });
        await loginForTest(page);
        await openReviewsTab(page, { rating: 3.3, reviewCount: 3 });
        await expect(page.locator('#dist-review-body')).toHaveValue('Top');
        await expect(page.locator('#dist-review-stars .review-star.is-on')).toHaveCount(5);

        await page.click('#dist-review-stars .review-star[data-rating="2"]');
        await page.click('#dist-review-submit');
        await expect(page.locator('#toast-container .toast.success')).toContainText('Avis modifié');
        expect(db.calls.find(c => c.method === 'PATCH').body).toMatchObject({ rating: 2 });

        await page.click('#dist-review-delete');
        await page.click('#confirm-ok');
        await expect(page.locator('#toast-container .toast', { hasText: 'Avis supprimé' })).toBeVisible();
        expect(db.calls.some(c => c.method === 'DELETE')).toBe(true);
        await expect(page.locator('#dist-review-mine-title')).toHaveText('Donne ton avis');
        await expect(page.locator('#dist-review-delete')).toBeHidden();
        await expect(page.locator('#dist-review-body')).toHaveValue('');
    });

    // PRIV-02 : l'auteur d'un avis n'est plus lisible ; « Ton avis » vient de my_review et de l'id
    test('PRIV-02 : la liste ne demande jamais l’auteur (user_id) ; « Ton avis » vient de my_review', async ({ page }) => {
        const mine = { id: 5000, author_name: 'Membre DistriMatch', rating: 4, body: 'Le mien', created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        const db = await routeReviews(page, { list: fakeReviews(2), mine, rating: { avis: 3, moyenne: 3 } });
        await loginForTest(page);
        const id = await openReviewsTab(page, { rating: 3, reviewCount: 3 });
        await expect(page.locator('#dist-reviews-list .review-item')).toHaveCount(3);
        await expect(page.locator('#dist-reviews-list .review-item.is-mine')).toHaveCount(1);
        await expect(page.locator('#dist-reviews-list .review-item.is-mine')).toContainText('Le mien');
        await expect(page.locator('#dist-review-mine-title')).toHaveText('Ton avis');
        const gets = db.calls.filter(c => c.method === 'GET');
        expect(gets.length).toBeGreaterThan(0);
        for (const c of gets) expect(c.search).not.toContain('user_id');
        expect(db.calls.find(c => c.method === 'RPC').body).toEqual({ p_distributor_id: id });
    });

    test('refus de la base : le message dit la raison (deja un avis, trop d’avis)', async ({ page }) => {
        await routeReviews(page, { list: [], insertError: { status: 409, body: { code: '23505', message: 'duplicate key' } } });
        await loginForTest(page);
        await openReviewsTab(page);
        await page.click('#dist-review-stars .review-star[data-rating="3"]');
        await page.click('#dist-review-submit');
        await expect(page.locator('#toast-container .toast.error')).toContainText('déjà donné ton avis');
    });

    test('visiteur : « Se connecter » de l’onglet Avis ouvre la connexion par e-mail', async ({ page }) => {
        await routeReviews(page, { list: fakeReviews(1) });
        await page.evaluate(() => localStorage.setItem('distrimatch_force_auth', '1'));
        await openReviewsTab(page, { rating: 1, reviewCount: 1 });
        await page.click('#dist-review-invite-btn');
        await page.waitForSelector('.auth-modal-overlay', { timeout: 3000 });
    });
});
