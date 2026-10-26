/**
 * DistriMatch - Tests fonctionnels : validation des nouvelles fiches (EPIC-T21)
 *
 * Fiche en attente (bandeau, rien a signaler), « Mes ajouts » cote membre,
 * section « Nouveaux distributeurs » de la console (doublon, publier avec
 * corrections, refuser sans motif). Base simulee ; ses regles sont testees par
 * tests/integration/db.test.js (022). Lancer : npm run test:functional
 */
import { test, expect } from '@playwright/test';
import { setupApp, loginForTest, minutesAgoIso } from './helpers.js';

test.beforeEach(async ({ page, context }) => {
    await setupApp(page, context);
});

const json = (body, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
const TEST_USER = '00000000-0000-0000-0000-00000000e2e0';   // compte simule de window.__testLogin

async function routeReviewApi(page, { admin = false, mine = [], messages = [], pending = [] } = {}) {
    const log = [];
    await page.route('**/rest/v1/rpc/is_admin', r => r.fulfill(json(admin)));
    await page.route('**/rest/v1/rpc/my_operated_distributors', r => r.fulfill(json([])));
    await page.route(u => u.pathname.endsWith('/rest/v1/operator_requests'), r => r.fulfill(json([])));
    await page.route(u => u.pathname.endsWith('/rest/v1/operator_request_messages'), r => r.fulfill(json([])));
    await page.route(u => u.pathname.endsWith('/rest/v1/distributors') && u.searchParams.has('added_by'), r => r.fulfill(json(mine)));
    await page.route(u => u.pathname.endsWith('/rest/v1/distributor_review_messages'), r => r.fulfill(json(messages)));
    await page.route('**/rest/v1/rpc/admin_operator_requests', r => r.fulfill(json([])));
    await page.route('**/rest/v1/rpc/admin_operators', r => r.fulfill(json([])));
    await page.route('**/rest/v1/rpc/admin_pending_distributors', r => r.fulfill(admin ? json(pending) : json({ code: '42501' }, 403)));
    for (const fn of ['admin_review_distributor', 'post_review_message', 'mark_review_thread_read']) {
        await page.route(`**/rest/v1/rpc/${fn}`, r => {
            log.push({ rpc: fn, body: r.request().postDataJSON() });
            r.fulfill(json(fn === 'admin_review_distributor' ? 'published' : null));
        });
    }
    return log;
}

// BUG-06 : glisse le repere de la mini-carte de 40 px ; rend la position posee (data-lat / data-lng)
async function dragPendingPin(page) {
    const pin = page.locator('#admin-pending-map .leaflet-marker-icon');
    await expect(pin).toBeVisible();
    await page.waitForTimeout(300);   // invalidateSize (50 ms) peut encore deplacer le repere
    const box = await pin.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 40, y + 40, { steps: 10 });
    await page.mouse.up();
    const map = page.locator('#admin-pending-map');
    await expect(map).toHaveAttribute('data-lat', /\d/);
    return { lat: Number(await map.getAttribute('data-lat')), lng: Number(await map.getAttribute('data-lng')) };
}

test.describe('37. Validation des nouvelles fiches', () => {
    test('fiche en attente (son auteur) : bandeau, rien a signaler, pas d’avis ni d’exploitant', async ({ page }) => {
        await routeReviewApi(page);
        await loginForTest(page);
        const id = await page.evaluate((uid) => {
            const d = window.AppState.distributors.find(x => (x.products || []).length);
            d.reviewStatus = 'pending';
            d.addedById = uid;
            window.openDistributorModal(d.id);
            return d.id;
        }, TEST_USER);
        await page.waitForSelector('#dist-modal-overlay.active');
        await expect(page.locator('#dist-review-pending')).toBeVisible();
        await expect(page.locator('#dist-review-pending-text')).toContainText('Visible seulement par toi');
        await expect(page.locator('#dist-status-update')).toHaveAttribute('aria-disabled', 'true');
        await expect(page.locator('#dist-products-list .product-status-btn')).toHaveCount(0);
        await page.click('.dist-tab[data-tab="avis"]');
        await expect(page.locator('#dist-reviews-empty')).toHaveText('Les avis s’ouvrent quand le distributeur est publié.'.replace('’', "'"));
        await page.click('.dist-tab[data-tab="apropos"]');
        await expect(page.locator('#dist-operator')).toBeHidden();
        expect(id).toBeTruthy();
    });

    test('« Mes ajouts » : statuts, motif d’un refus, message a l’equipe', async ({ page }) => {
        const log = await routeReviewApi(page, {
            mine: [
                { id: 'user-a', name: 'Pizza de la gare', type: 'pizza', emoji: '🍕', city: 'Bayonne', review_status: 'pending', review_reason: null, author_read_at: minutesAgoIso(100), created_at: minutesAgoIso(200) },
                { id: 'user-b', name: 'Boulangerie test', type: 'bakery', emoji: '🥖', city: 'Anglet', review_status: 'rejected', review_reason: 'Ce n’est pas un distributeur automatique.', author_read_at: minutesAgoIso(10), created_at: minutesAgoIso(3000) }
            ],
            messages: [{ id: 1, distributor_id: 'user-a', author: 'admin', body: 'Peux-tu préciser l’adresse ?', created_at: minutesAgoIso(30) }]
        });
        await loginForTest(page);
        await page.evaluate(() => window.switchView('account'));
        await expect(page.locator('#account-additions-row')).toBeVisible();
        await expect(page.locator('#account-additions-row .account-row-label')).toHaveText('Mes ajouts · 1 en attente · 1 nouveau');
        await page.click('#account-additions-row');
        const cards = page.locator('#my-additions-content .addition-card');
        await expect(cards).toHaveCount(2);
        await expect(cards.nth(0)).toContainText('En attente de validation');
        await expect(cards.nth(0)).toContainText('Peux-tu préciser l’adresse ?');
        await expect(cards.nth(1)).toContainText('Refusée');
        await expect(cards.nth(1)).toContainText('Motif : Ce n’est pas un distributeur automatique.');
        await cards.nth(0).locator('textarea').fill('12 rue de la gare.');
        await cards.nth(0).locator('.op-send').click();
        await expect.poll(() => log.find(l => l.rpc === 'post_review_message')?.body).toEqual({ p_distributor_id: 'user-a', p_body: '12 rue de la gare.' });
        expect(log.some(l => l.rpc === 'mark_review_thread_read')).toBe(true);
    });

    test('« Mes ajouts » : apres l’envoi, l’echange reste ouvert, montre le message, un seul envoi (BUG-11)', async ({ page }) => {
        const messages = [{ id: 1, distributor_id: 'user-a', author: 'admin', body: 'Merci, on regarde.', created_at: minutesAgoIso(30) }];
        await routeReviewApi(page, {
            mine: [{ id: 'user-a', name: 'Pizza de la gare', type: 'pizza', emoji: '🍕', city: 'Bayonne', review_status: 'pending', review_reason: null, author_read_at: minutesAgoIso(10), created_at: minutesAgoIso(200) }],
            messages
        });
        // Pose apres routeReviewApi : cette route passe en premier. Reponse lente (laisse le temps
        // d'un second envoi) ; le message est ajoute au fil que le faux serveur renvoie ensuite.
        const posts = [];
        await page.route('**/rest/v1/rpc/post_review_message', async r => {
            const body = r.request().postDataJSON();
            posts.push(body);
            await new Promise(res => setTimeout(res, 300));
            messages.push({ id: messages.length + 1, distributor_id: body.p_distributor_id, author: 'member', body: body.p_body, created_at: new Date().toISOString() });
            await r.fulfill(json(null));
        });
        await loginForTest(page);
        await page.evaluate(() => window.switchView('account'));
        // Ligne visible = relecture de la connexion terminee : la reponse attendue ci-dessous est
        // bien celle de l'ouverture de la page
        await expect(page.locator('#account-additions-row')).toBeVisible();
        // Attendre la relecture de « Mes ajouts » lancee a l'ouverture de la page : sinon le champ
        // peut etre rempli puis remplace par ce nouveau rendu (test instable)
        const reloaded = page.waitForResponse(r => r.url().includes('/rest/v1/distributors') && r.url().includes('added_by'));
        await page.click('#account-additions-row');
        await reloaded;
        const card = page.locator('#my-additions-content .addition-card').first();
        const thread = card.locator('details.addition-thread');
        expect(await thread.getAttribute('open')).toBeNull();   // rien de non lu : replie
        await thread.locator('summary').click();
        await card.locator('textarea').fill('12 rue de la gare.');
        // Double toucher : deux envois coup sur coup
        await card.locator('form.addition-composer').evaluate(f => { f.requestSubmit(); f.requestSubmit(); });
        await expect(page.locator('#toast-container .toast.success')).toContainText('Message envoyé à l’équipe');
        const after = page.locator('#my-additions-content .addition-card').first();
        await expect(after.locator('details.addition-thread')).toHaveAttribute('open', '');
        await expect(after.locator('.op-msg.is-mine')).toBeVisible();
        await expect(after.locator('.op-msg.is-mine')).toContainText('12 rue de la gare.');
        expect(posts).toHaveLength(1);
    });

    test('« Mes ajouts » : fiche publiee ou refusee, echange termine, pas de champ (BUG-11)', async ({ page }) => {
        await routeReviewApi(page, {
            mine: [
                { id: 'user-b', name: 'Boulangerie test', type: 'bakery', emoji: '🥖', city: 'Anglet', review_status: 'rejected', review_reason: 'Doublon', author_read_at: minutesAgoIso(10), created_at: minutesAgoIso(3000) },
                { id: 'user-c', name: 'Frites test', type: 'fries', emoji: '🍟', city: 'Biarritz', review_status: 'published', review_reason: null, author_read_at: minutesAgoIso(10), created_at: minutesAgoIso(4000) }
            ]
        });
        await loginForTest(page);
        await page.evaluate(() => window.switchView('account'));
        await page.click('#account-additions-row');
        const cards = page.locator('#my-additions-content .addition-card');
        await expect(cards).toHaveCount(2);
        await expect(page.locator('#my-additions-content form.addition-composer')).toHaveCount(0);
        await expect(cards.nth(0)).toContainText('Motif : Doublon');
        await expect(cards.nth(0).locator('.addition-thread-closed')).toHaveText('Cet échange est terminé.');
        await expect(cards.nth(1).locator('.addition-thread-closed')).toHaveText('Ta fiche est publiée : cet échange est terminé. Tu peux la compléter directement depuis la fiche.');
    });

    test('console : « Nouveaux distributeurs », doublon signale, publier avec un nom corrige', async ({ page }) => {
        const near = await page.evaluate(() => {
            const d = window.AppState.distributors[0];
            return { name: d.name, lat: d.lat, lng: d.lng };
        });
        const log = await routeReviewApi(page, {
            admin: true,
            pending: [{ id: 'user-new', name: near.name, type: 'pizza', emoji: '🍕', address: '1 rue Test', city: 'Bayonne', lat: near.lat + 0.0002, lng: near.lng,
                created_at: minutesAgoIso(60), email: 'membre@example.test', products: ['Margherita'], unread: 0 }]
        });
        await loginForTest(page);
        await page.evaluate(() => window.switchView('admin'));
        const card = page.locator('#admin-pending .admin-request');
        await expect(card).toContainText(near.name);
        await expect(card).toContainText('Doublon possible');
        await card.click();
        await expect(page.locator('#admin-pending-map')).toBeVisible();
        await expect(page.locator('#admin-detail')).toContainText('Margherita');
        await page.fill('#admin-pending-form input[name="name"]', 'Pizza corrigée');
        await page.click('#admin-pending-form button[type="submit"]');
        await expect.poll(() => log.find(l => l.rpc === 'admin_review_distributor')?.body).toEqual({
            p_id: 'user-new', p_decision: 'publish', p_name: 'Pizza corrigée', p_type: null, p_emoji: null, p_lat: null, p_lng: null
        });
        await expect(page.locator('#toast-container .toast.success')).toContainText('Fiche publiée');
    });

    test('console : un type hors liste reste choisi, Publier ne le réécrit pas ; « Produits agricoles » proposé (BUG-03)', async ({ page }) => {
        const log = await routeReviewApi(page, {
            admin: true,
            pending: [{ id: 'user-new', name: 'Type inconnu', type: 'type-hors-liste', emoji: '🥤', address: null, city: null, lat: 43.49, lng: -1.47,
                created_at: minutesAgoIso(60), email: 'membre@example.test', products: [], unread: 0 }]
        });
        await loginForTest(page);
        await page.evaluate(() => window.switchView('admin'));
        await page.locator('#admin-pending .admin-request').click();
        const select = page.locator('#admin-pending-form select[name="type"]');
        await expect(select).toHaveValue('type-hors-liste');
        await expect(select.locator('option[value="agricultural"]')).toHaveCount(1);
        await page.click('#admin-pending-form button[type="submit"]');
        await expect.poll(() => log.find(l => l.rpc === 'admin_review_distributor')?.body).toEqual({
            p_id: 'user-new', p_decision: 'publish', p_name: null, p_type: null, p_emoji: null, p_lat: null, p_lng: null
        });
    });

    test('console : refuser sans motif', async ({ page }) => {
        const log = await routeReviewApi(page, {
            admin: true,
            pending: [{ id: 'user-new', name: 'Fiche douteuse', type: 'other', emoji: '📦', address: null, city: null, lat: 43.49, lng: -1.47,
                created_at: minutesAgoIso(60), email: 'membre@example.test', products: [], unread: 0 }]
        });
        await loginForTest(page);
        await page.evaluate(() => window.switchView('admin'));
        await page.locator('#admin-pending .admin-request').click();
        await page.click('[data-admin-action="reject-fiche"]');
        await page.click('#admin-reject-fiche-form button[type="submit"]');
        await expect.poll(() => log.find(l => l.rpc === 'admin_review_distributor')?.body).toEqual({ p_id: 'user-new', p_decision: 'reject', p_reason: null });
    });

    test('console : écrire au membre garde le nom et la position corrigés (BUG-06)', async ({ page }) => {
        const log = await routeReviewApi(page, {
            admin: true,
            pending: [{ id: 'user-new', name: 'Fiche à corriger', type: 'pizza', emoji: '🍕', address: '1 rue Test', city: 'Bayonne', lat: 43.49, lng: -1.47,
                created_at: minutesAgoIso(60), email: 'membre@example.test', products: [], unread: 0 }]
        });
        // Fil simule : renvoie les messages deja postes (pose apres routeReviewApi, donc prioritaire)
        await page.route(u => u.pathname.endsWith('/rest/v1/distributor_review_messages'), r => r.fulfill(json(
            log.filter(l => l.rpc === 'post_review_message')
                .map((l, i) => ({ id: i + 1, distributor_id: 'user-new', author: 'admin', body: l.body.p_body, created_at: new Date().toISOString() }))
        )));
        await loginForTest(page);
        await page.evaluate(() => window.switchView('admin'));
        await page.locator('#admin-pending .admin-request').click();
        await page.fill('#admin-pending-form input[name="name"]', 'Pizza corrigée');
        const moved = await dragPendingPin(page);

        await page.fill('#admin-review-input', 'J’ai corrigé la position.');
        await page.click('#admin-review-composer .op-send');
        await expect(page.locator('#admin-detail .op-thread')).toContainText('J’ai corrigé la position.');
        await expect(page.locator('#admin-pending-form input[name="name"]')).toHaveValue('Pizza corrigée');
        await expect(page.locator('#admin-pending-map')).toHaveAttribute('data-lat', String(moved.lat));

        await page.click('#admin-pending-form button[type="submit"]');
        await expect.poll(() => log.find(l => l.rpc === 'admin_review_distributor')?.body).toEqual({
            p_id: 'user-new', p_decision: 'publish', p_name: 'Pizza corrigée', p_type: null, p_emoji: null, p_lat: moved.lat, p_lng: moved.lng
        });
    });

    test('console : quitter puis rouvrir la page Admin garde les corrections (BUG-06)', async ({ page }) => {
        const log = await routeReviewApi(page, {
            admin: true,
            pending: [{ id: 'user-new', name: 'Fiche à corriger', type: 'pizza', emoji: '🍕', address: '1 rue Test', city: 'Bayonne', lat: 43.49, lng: -1.47,
                created_at: minutesAgoIso(60), email: 'membre@example.test', products: [], unread: 0 }]
        });
        await loginForTest(page);
        await page.evaluate(() => window.switchView('admin'));
        await page.locator('#admin-pending .admin-request').click();
        await page.fill('#admin-pending-form input[name="name"]', 'Pizza corrigée');
        await page.selectOption('#admin-pending-form select[name="type"]', 'bakery');
        const moved = await dragPendingPin(page);

        // Marque l'ancien formulaire : on attend ensuite le formulaire reconstruit par loadAdmin
        await page.evaluate(() => { document.getElementById('admin-pending-form').dataset.old = '1'; });
        await page.evaluate(() => window.switchView('favorites'));
        await page.evaluate(() => window.switchView('admin'));
        await page.waitForSelector('#admin-pending-form:not([data-old])', { timeout: 5000 });
        await expect(page.locator('#admin-pending-form input[name="name"]')).toHaveValue('Pizza corrigée');
        await expect(page.locator('#admin-pending-form select[name="type"]')).toHaveValue('bakery');
        await expect(page.locator('#admin-pending-map')).toHaveAttribute('data-lat', String(moved.lat));

        await page.click('#admin-pending-form button[type="submit"]');
        await expect.poll(() => log.find(l => l.rpc === 'admin_review_distributor')?.body).toEqual({
            p_id: 'user-new', p_decision: 'publish', p_name: 'Pizza corrigée', p_type: 'bakery', p_emoji: '🥖', p_lat: moved.lat, p_lng: moved.lng
        });
    });
});
