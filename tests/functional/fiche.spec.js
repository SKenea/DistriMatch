/**
 * DistriMatch - Tests fonctionnels : Fiche distributeur : lecture, signal sur l'aliment et la machine, edition
 *
 * User stories couvertes : EPIC-T1 T1-US1/US2, EPIC-T2 (dispo ou pas), EPIC-T4 (style), EPIC-T5 (informer = privilege de compte), EPIC-T6 T6-US4 (session), rythme infere, fiches demo.
 * Serveur simule la ou il le faut (voir helpers.js). Lancer : npm run test:functional
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, EVENTS_ROUTE, captureEvents, setupApp, openDistModal, loginForTest, RPC_ROUTE, openSignalableFiche, signalFirstProduct, chooseMachineState, routeEditWrites, routeSignals, minutesAgoIso, RHYTHM_ROUTE, kpiFixture, routeKpi, collectTextIssues, demoDistributorsFixture, routeDistributors } from './helpers.js';

test.beforeEach(async ({ page, context }) => {
    await setupApp(page, context);
});

// ============================================
// 4. MODAL DISTRIBUTEUR
// ============================================

test.describe('4. Modal distributeur', () => {
    test('la modal s\'ouvre avec les infos', async ({ page }) => {
        await openDistModal(page);
        const name = await page.textContent('#dist-modal-name');
        expect(name).toBeTruthy();
    });

    test('rating + reviews + type visibles', async ({ page }) => {
        await openDistModal(page);
        const rating = await page.textContent('#dist-modal-rating');
        expect(rating).toContain('★');
        const reviews = await page.textContent('#dist-modal-reviews');
        expect(reviews).toMatch(/\d/);
    });

    test('3 onglets presents (Produits / Avis / A propos)', async ({ page }) => {
        await openDistModal(page);
        const tabs = await page.$$eval('.dist-tab', els => els.map(el => el.textContent.trim()));
        expect(tabs).toEqual(['Produits', 'Avis', 'À propos']);
    });

    test('clic onglet Avis change le pane actif', async ({ page }) => {
        await openDistModal(page);
        await page.click('.dist-tab[data-tab="avis"]');
        await page.waitForTimeout(300);

        const active = await page.evaluate(() =>
            document.querySelector('.dist-tab-pane.active').dataset.tabPane
        );
        expect(active).toBe('avis');
    });

    test('clic onglet A propos affiche l\'adresse', async ({ page }) => {
        await openDistModal(page);
        await page.click('.dist-tab[data-tab="apropos"]');
        await page.waitForTimeout(300);

        const address = await page.textContent('#dist-apropos-address');
        expect(address).toBeTruthy();
    });

    test('bouton fermer ferme la modal', async ({ page }) => {
        await openDistModal(page);
        await page.click('#dist-modal-close');
        await page.waitForTimeout(300);

        const active = await page.evaluate(() =>
            document.getElementById('dist-modal-overlay').classList.contains('active')
        );
        expect(active).toBe(false);
    });

    test('Itineraire dans « À propos » (plus de pied collé en bas), Favori dans l’en-tete ; pas de photo (V1)', async ({ page }) => {
        await openDistModal(page);
        await expect(page.locator('.dist-modal-actions')).toHaveCount(0);
        await expect(page.locator('#dist-action-directions')).toBeHidden();
        await page.click('.dist-tab[data-tab="apropos"]');
        await expect(page.locator('#dist-action-directions')).toBeVisible();
        await expect(page.locator('#dist-modal-photo')).toBeHidden();
        await expect(page.locator('#dist-action-add-photo')).toBeHidden();
        expect(await page.$('#dist-action-directions')).not.toBeNull();
        expect(await page.$('#dist-action-favorite')).not.toBeNull();
    });

    // Fraicheur (docs/STRATEGIE.md, chantier 1) : l'age de la derniere
    // verification est toujours affiche en tete de fiche, ou "Pas encore
    // vérifié" ; jamais un etat vide ou faux.
    test('fraicheur : "Vérifié il y a X" ou "Pas encore vérifié" en tete de fiche', async ({ page }) => {
        await openDistModal(page);
        const r = await page.evaluate(() => {
            const el = document.getElementById('dist-modal-verified');
            return { text: el?.textContent.trim(), cls: el?.className };
        });
        expect(r.text).toMatch(/^(Vérifié (il y a \d+ (min|h|j)|à l'instant)|Pas encore vérifié)$/);
        expect(r.cls).toMatch(/\bis-(fresh|stale|unknown)\b/);
    });

});

// ============================================
// 5bis. MODIFIER AU TOUCHER, SANS BOUTON (EPIC-T12)
// ============================================
// Aucune vraie ecriture : products / distributors interceptes (routeEditWrites).

test.describe('5bis. Modifier au toucher (EPIC-T12)', () => {
    async function openEditable(page, { products } = {}) {
        await routeSignals(page);
        const log = await routeEditWrites(page);
        await loginForTest(page);
        const id = await page.evaluate((prods) => {
            const ok = (p) => p && p.id !== null && p.id !== undefined && p.id !== '' && Number.isInteger(Number(p.id));
            const d = window.AppState.distributors.find(x => !x.isLocalOnly && (x.products || []).some(ok));
            d.products = prods ?? d.products.filter(ok).slice(0, 3);
            return d.id;
        }, products ?? null);
        await page.evaluate(distId => window.openDistributorModal(distId), id);
        await page.waitForSelector('#dist-modal-overlay.active');
        return { id, log };
    }

    test('plus de bouton « Modifier » ni de mode edition, depuis Favoris comme ailleurs', async ({ page }) => {
        await loginForTest(page);
        await page.evaluate(() => { window.AppState.subscriptions = [window.AppState.distributors[0].id]; });
        await page.click('.bottom-nav [data-tab="favorites"]');
        await page.waitForSelector('#subscriptions-list .subscription-card');
        await page.click('#subscriptions-list .subscription-card');
        await page.waitForSelector('#dist-modal-overlay.active');
        await expect(page.locator('#dist-action-edit')).toHaveCount(0);
        await expect(page.locator('#dist-products-add-section')).toHaveCount(0);
        expect(await page.evaluate(() => window.AppState.modalEditMode)).toBe(false);
        await expect(page.locator('#dist-product-add')).toBeVisible();
    });

    test('menu de l\u2019etiquette : Dispo / Pas dispo, separateur, Renommer, Retirer ; « Actuellement : Pas d\u2019info »', async ({ page }) => {
        await openEditable(page);
        const row = page.locator('#dist-products-list .product-row[data-editable]').first();
        await expect(row.locator('.product-name-btn')).toHaveCount(0);   // le nom n'est plus touchable
        await row.locator('.product-status-btn').click();
        const menu = row.locator('.product-choices[role="menu"]');
        await expect(menu).toBeVisible();
        await expect(menu.locator('button')).toHaveText(['Dispo', 'Pas dispo', 'Renommer', 'Retirer']);
        await expect(menu.locator('.dd-sep')).toHaveCount(1);
        await expect(menu.locator('.product-choices-q')).toHaveText("Actuellement : Pas d'info");
        await expect(menu.locator('.product-choice[aria-checked="true"]')).toHaveCount(0);
        // clavier : fleche bas passe a l'item suivant
        await expect(menu.locator('.product-choice').first()).toBeFocused();
        await page.keyboard.press('ArrowDown');
        await expect(menu.locator('.product-choice').nth(1)).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
    });

    test('renommer : menu -> Renommer, Entree enregistre (PATCH), Echap et vide annulent', async ({ page }) => {
        const { log } = await openEditable(page);
        const first = page.locator('#dist-products-list .product-row[data-editable]').first();
        const pid = await first.getAttribute('data-product-id');
        const rowOf = () => page.locator(`#dist-products-list .product-row[data-product-id="${pid}"]`);
        async function rename() {
            await rowOf().locator('.product-status-btn').click();
            await rowOf().locator('.product-menu-action[data-action="rename"]').click();
        }
        await rename();
        await page.locator('.product-name-input').fill('Nom renommé');
        await page.keyboard.press('Enter');
        await expect(rowOf().locator('.product-name-clean')).toHaveText('Nom renommé');
        await expect(page.locator('#toast-container .toast-action')).toContainText('Renommé en « Nom renommé »');
        expect(log).toEqual([expect.objectContaining({ table: 'products', method: 'PATCH', query: `?id=eq.${pid}`, body: { name: 'Nom renommé' } })]);
        // Echap : rien n'est envoye
        await rename();
        await page.locator('.product-name-input').fill('Autre');
        await page.keyboard.press('Escape');
        await expect(rowOf().locator('.product-name-clean')).toHaveText('Nom renommé');
        await expect(page.locator('#dist-modal-overlay')).toHaveClass(/active/);   // Echap ne ferme pas la fiche
        // Vide : annule (plus de retrait par nom vide)
        await rename();
        await page.locator('.product-name-input').fill('');
        await page.keyboard.press('Enter');
        await expect(rowOf().locator('.product-name-clean')).toHaveText('Nom renommé');
        expect(log).toHaveLength(1);
    });

    test('retirer : menu -> Retirer, toast « Annuler » ; Annuler rétablit et rien n\u2019est supprime en base', async ({ page }) => {
        const { log } = await openEditable(page);
        const first = page.locator('#dist-products-list .product-row[data-editable]').first();
        const pid = await first.getAttribute('data-product-id');
        const name = await first.locator('.product-name-clean').textContent();
        await first.locator('.product-status-btn').click();
        await first.locator('.product-menu-action[data-action="remove"]').click();
        await expect(page.locator(`#dist-products-list .product-row[data-product-id="${pid}"]`)).toHaveCount(0);
        await expect(page.locator('#toast-container .toast-action')).toContainText(`${name} retiré`);
        await page.click('#toast-container .toast-action-btn');
        await expect(page.locator(`#dist-products-list .product-row[data-product-id="${pid}"]`)).toHaveCount(1);
        await page.waitForTimeout(500);
        expect(log.filter(l => l.method === 'DELETE')).toEqual([]);
    });

    test('retirer : la suppression part a la fin du delai (7 s) ; plus de menu au clic droit', async ({ page }) => {
        const { log } = await openEditable(page);
        const second = page.locator('#dist-products-list .product-row[data-editable]').nth(1);
        const pid = await second.getAttribute('data-product-id');
        await second.click({ button: 'right' });
        await expect(second.locator('.product-choices')).toBeHidden();
        await second.locator('.product-status-btn').click();
        await second.locator('.product-menu-action[data-action="remove"]').click();
        await page.mouse.move(5, 5);   // un toast survole ne s'efface pas
        await expect(page.locator(`#dist-products-list .product-row[data-product-id="${pid}"]`)).toHaveCount(0);
        expect(log.filter(l => l.method === 'DELETE')).toEqual([]);   // pas tout de suite
        await expect.poll(() => log.filter(l => l.method === 'DELETE').length, { timeout: 10000 }).toBe(1);
        expect(log.find(l => l.method === 'DELETE').query).toBe(`?id=eq.${pid}`);
    });

    test('ajouter : « + Ajouter » ouvre 4 produits courants du type ; un toucher ajoute, la liste propose les suivants', async ({ page }) => {
        const { log } = await openEditable(page);
        const type = await page.evaluate(() => window.AppState.currentDistributor.type);
        await page.click('#dist-product-add');
        const chips = page.locator('#dist-add-panel .add-chip');
        const expected = await page.evaluate(async () => {
            const { suggestProducts } = await import('./js/utils.js');
            const d = window.AppState.currentDistributor;
            return suggestProducts(d.type, d.products);
        });
        test.skip(expected.length === 0, `aucune liste pour le type ${type}`);
        await expect(chips).toHaveText(expected.map(n => new RegExp(n)));
        expect(expected.length).toBeLessThanOrEqual(4);
        await chips.first().click();
        await expect(page.locator('#dist-products-list .product-name-clean', { hasText: expected[0] })).toHaveCount(1);
        expect(log.filter(l => l.method === 'POST').map(l => l.body.name)).toEqual([expected[0]]);
        // Le panneau reste ouvert et ne propose plus ce produit
        await expect(page.locator('#dist-add-panel')).toBeVisible();
        await expect(page.locator('#dist-add-panel .add-chip', { hasText: expected[0] })).toHaveCount(0);
    });

    test('ajouter : « Autre… » avec suggestions (fleches + Entree), nom libre, doublon refuse ; Echap ferme', async ({ page }) => {
        const { log } = await openEditable(page);
        await page.evaluate(() => { window.AppState.currentDistributor.type = 'dairy'; });
        await page.click('#dist-product-add');
        const input = page.locator('#dist-add-panel .product-add-input');
        await input.fill('fro');
        await expect(page.locator('#dist-add-suggestions [role="option"]').first()).toBeVisible();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await expect.poll(() => log.filter(l => l.method === 'POST').length).toBe(1);
        expect(log[0].body.name).toMatch(/^Fromage/);
        // nom libre, puis on enchaine dans le meme panneau
        await expect(input).toBeFocused();
        await page.keyboard.type('Kéfir maison');
        await page.keyboard.press('Enter');
        await expect(page.locator('#dist-products-list .product-name-clean', { hasText: 'Kéfir maison' })).toHaveCount(1);
        // doublon
        await page.keyboard.type('kefir MAISON');
        await page.keyboard.press('Enter');
        await expect(page.locator('#toast-container .toast.error')).toContainText('déjà dans la liste');
        expect(log.filter(l => l.method === 'POST')).toHaveLength(2);
        // Echap ferme les suggestions puis le panneau
        await page.locator('#dist-add-panel .product-add-input').fill('');
        await page.keyboard.press('Escape');
        await expect(page.locator('#dist-add-panel')).toHaveCount(0);
        await expect(page.locator('#dist-product-add')).toBeVisible();
    });

    test('ajout refuse par la base : message, pas de carte fantome', async ({ page }) => {
        await routeSignals(page);
        await routeEditWrites(page, { fail: { table: 'products', method: 'POST', status: 403, code: '42501' } });
        await openSignalableFiche(page);
        await page.click('#dist-product-add');
        await page.locator('#dist-add-panel .product-add-input').fill('Produit refusé');
        await page.keyboard.press('Enter');
        await expect(page.locator('#toast-container .toast.error')).toContainText('Produit non ajouté');
        await expect(page.locator('#dist-products-list .product-name-clean', { hasText: 'Produit refusé' })).toHaveCount(0);
    });

    test('prix : toucher « €€ » -> € / €€ / €€€ sur place ; un choix enregistre (PATCH distributors)', async ({ page }) => {
        const { id, log } = await openEditable(page);
        await page.click('#dist-modal-pricerange');
        await expect(page.locator('#dist-price-picker [role="radio"]')).toHaveText(['€', '€€', '€€€']);
        await page.click('#dist-price-picker [data-price="€€€"]');
        await expect(page.locator('#dist-modal-pricerange')).toHaveText('€€€');
        await expect(page.locator('#dist-price-picker')).toHaveCount(0);
        expect(log).toEqual([expect.objectContaining({ table: 'distributors', method: 'PATCH', query: `?id=eq.${id}`, body: { price_range: '€€€' } })]);
    });

    test('visiteur : etiquette, « + Ajouter » et prix menent a l\u2019invitation, rien n\u2019est envoye', async ({ page }) => {
        await routeSignals(page);
        const log = await routeEditWrites(page);
        await openSignalableFiche(page, { login: false });
        await expect(page.locator('#dist-products-list .product-name-btn')).toHaveCount(0);
        await page.locator('#dist-products-list .product-status-btn[data-guest]').first().click();
        await expect(page.locator('#dist-login-invite')).toHaveClass(/is-highlighted/);
        await expect(page.locator('#dist-products-list .product-choices')).toHaveCount(0);
        await page.evaluate(() => document.getElementById('dist-login-invite').classList.remove('is-highlighted'));
        await page.click('#dist-product-add');
        await expect(page.locator('#dist-login-invite')).toHaveClass(/is-highlighted/);
        await expect(page.locator('.product-add-input')).toHaveCount(0);
        await page.click('#dist-modal-pricerange');
        await expect(page.locator('#dist-price-picker')).toHaveCount(0);
        expect(log).toEqual([]);
    });

    test('distributeur sans produit : « Ajoute le premier produit »', async ({ page }) => {
        await openEditable(page, { products: [] });
        await expect(page.locator('#dist-products-list')).toContainText('Aucun produit référencé');
        await expect(page.locator('#dist-product-add')).toContainText('Ajoute le premier produit');
    });

    test('indice de premier usage sur la 1re carte, efface apres la 1re action reussie', async ({ page }) => {
        await page.evaluate(() => localStorage.removeItem('distrimatch_edit_hint_seen'));
        const { log } = await openEditable(page);
        await expect(page.locator('.fiche-edit-hint')).toHaveCount(1);
        await expect(page.locator('.fiche-edit-hint')).toHaveText("Touche l'étiquette pour la changer");
        await page.click('#dist-modal-pricerange');
        await page.click('#dist-price-picker [data-price="€"]');
        await expect(page.locator('.fiche-edit-hint')).toHaveCount(0);
        expect(await page.evaluate(() => localStorage.getItem('distrimatch_edit_hint_seen'))).toBe('1');
        expect(log).toHaveLength(1);
    });
});

// EPIC-T2 (2026-09-25) : plus de fenetre « Il reste quoi ? » ni de gros bouton
// rouge ; on signale sur l'aliment (toucher la ligne) et sur la puce machine.
test.describe('13. Signal sur l\u2019aliment et sur la machine', () => {
    test("connecte : toucher l'etiquette deplie « Là, maintenant ? » Dispo / Pas dispo ; un tap envoie ; la carte passe en « Dispo, vu à l'instant »", async ({ page }) => {
        const payloads = [];
        await page.route(RPC_ROUTE, route => {
            payloads.push(route.request().postDataJSON());
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ inserted: 1, skipped: 0, source: 'anon' }) });
        });
        await routeSignals(page);
        await page.evaluate(() => localStorage.setItem('distrimatch_force_auth', '1'));
        const f = await openSignalableFiche(page);
        await expect(page.locator('#dist-products-title')).toHaveText(/^Il reste quoi \?/);

        const row = page.locator(`#dist-products-list .product-row[data-product-id="${f.productId}"]`);
        const main = row.locator('.product-status-btn');
        // EPIC-T12 : rien d'affiche d'office ; l'etiquette est le controle
        await expect(row.locator('.product-choices')).toBeHidden();
        await main.click();
        await expect(main).toHaveAttribute('aria-expanded', 'true');
        await expect(row.locator('.product-choices-q')).toHaveText("Actuellement : Pas d'info");
        await expect(row.locator('.product-choice')).toHaveText(['Dispo', 'Pas dispo']);
        await row.locator('.product-choice[data-state="available"]').click();

        expect(await page.$('.auth-modal-overlay')).toBeNull();          // UC11 : pas de mur d'auth
        await expect(page.locator('#toast-container .toast.success')).toContainText('Merci');
        expect(payloads[0].p_product_signals).toEqual([{ product_id: Number(f.productId), state: 'available' }]);
        expect(payloads[0].p_machine_state).toBeNull();
        await expect(main).toHaveAttribute('aria-expanded', 'false');
        await expect(row.locator('.product-pill')).toHaveText('Dispo');
        await expect(row.locator('.product-pill')).toHaveClass(/is-fresh/);
        await expect(row.locator('.product-seen')).toHaveText("vu à l'instant");
        // Retoucher l'etiquette rouvre le menu, Dispo coche, plus d'en-tete ; Echap referme
        await main.click();
        await expect(main).toHaveAttribute('aria-expanded', 'true');
        await expect(row.locator('.product-choices-q')).toBeHidden();
        await expect(row.locator('.product-choice[data-state="available"]')).toHaveAttribute('aria-checked', 'true');
        await page.keyboard.press('Escape');
        await expect(main).toHaveAttribute('aria-expanded', 'false');
        // La fiche reste ouverte, la ligne d'etat deduit que le distributeur est en service
        await expect(page.locator('#dist-modal-overlay')).toHaveClass(/active/);
        await expect(page.locator('#dist-status-word')).toHaveText('En service');
        await expect(page.locator('#dist-status')).toHaveAttribute('data-state', 'working');
        // Carte Dispo en tete de la grille
        await expect(page.locator('#dist-products-list .product-row').first()).toHaveAttribute('data-product-id', f.productId);
        await expect(page.locator('#dist-products-count')).toHaveText(/^· 1 sur \d+ dispo$/);
    });

    test('on peut se corriger : « Pas dispo » juste apres « Dispo »', async ({ page }) => {
        const payloads = [];
        await page.route(RPC_ROUTE, route => {
            payloads.push(route.request().postDataJSON());
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ inserted: 1, skipped: 0, source: 'anon' }) });
        });
        await routeSignals(page);
        const f = await openSignalableFiche(page);
        const row = page.locator(`#dist-products-list .product-row[data-product-id="${f.productId}"]`);
        await signalFirstProduct(page, 'available');
        await expect(row.locator('.product-pill')).toHaveText('Dispo');
        await signalFirstProduct(page, 'absent');
        await expect(row.locator('.product-pill')).toHaveText('Pas dispo');
        expect(payloads.map(pl => pl.p_product_signals[0].state)).toEqual(['available', 'absent']);
    });

    test('menu de l\u2019etat -> « Vide » : ligne d\u2019etat orange « Vide », etat marque, un seul liseré, aliments « Pas dispo »', async ({ page }) => {
        const payloads = [];
        await page.route(RPC_ROUTE, route => {
            payloads.push(route.request().postDataJSON());
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ inserted: 1, skipped: 0, source: 'user' }) });
        });
        await routeSignals(page);
        const f = await openSignalableFiche(page);
        await expect(page.locator('#dist-status-word')).toHaveText("Pas d'info");
        await expect(page.locator('#dist-machine-choices')).toBeHidden();
        await page.click('#dist-status-update');
        await expect(page.locator('#dist-machine-choices .machine-choice')).toHaveText(['En service', 'Vide', 'En panne']);
        await expect(page.locator('#dist-machine-choices .machine-choice.is-current')).toHaveCount(0);
        await page.click('#dist-machine-choices .machine-choice[data-machine="empty"]');

        expect(payloads[0].p_machine_state).toBe('empty');
        expect(payloads[0].p_product_signals).toEqual([]);
        await expect(page.locator('#dist-status')).toHaveAttribute('data-state', 'empty');
        await expect(page.locator('#dist-status-word')).toHaveText('Vide');
        await expect(page.locator('#dist-machine-choices')).toBeHidden();   // replie apres l'envoi
        await expect(page.locator('#dist-machine-choices .machine-choice[data-machine="empty"]')).toHaveAttribute('aria-checked', 'true');
        await expect(page.locator('#dist-modal-verified')).toHaveText("à l'instant");
        await expect(page.locator('#dist-products-count')).toHaveText(/^· 0 sur \d+ dispo$/);
        await expect(page.locator('#dist-products-notice')).toHaveText("Distributeur signalé vide à l'instant : les produits sont probablement épuisés.");
        const row = page.locator(`#dist-products-list .product-row[data-product-id="${f.productId}"]`);
        await expect(row.locator('.product-pill')).toHaveText('Pas dispo');
        await expect(row.locator('.product-seen')).toHaveText("à l'instant");
        await expect(page.locator('#dist-modal .dist-modal-header')).not.toContainText(/machine/i);
        await expect(page.locator('#dist-modal [data-tab-pane="produits"]')).not.toContainText(/machine/i);
    });

    test('visiteur : lecture seule (ligne d\u2019etat et cartes menent a l\u2019invitation), invitation ; connexion -> tout apparait', async ({ page }) => {
        await routeSignals(page);
        await openSignalableFiche(page, { login: false });
        await expect(page.locator('#dist-status-update')).toHaveAttribute('data-guest', '1');   // EPIC-T19 : la ligne mene a l'invitation
        await expect(page.locator('#dist-status-update .dist-status-chevron')).toBeHidden();
        await expect(page.locator('#dist-machine-choices')).toBeHidden();
        await expect(page.locator('#dist-products-list .product-status-btn:not([data-guest])')).toHaveCount(0);
        await expect(page.locator('#dist-products-hint')).toBeHidden();
        await expect(page.locator('#dist-login-invite')).toBeVisible();
        await expect(page.locator('#dist-login-invite')).toContainText('Tu es devant le distributeur ?');
        await expect(page.locator('#dist-login-invite')).toContainText("signaler ce qu'il reste et donner ton avis");
        await loginForTest(page);
        await expect(page.locator('#dist-status-update')).not.toHaveAttribute('data-guest', '1');
        await expect(page.locator('#dist-status-update .dist-status-chevron')).toBeVisible();
        await expect(page.locator('#dist-machine-choices')).toBeHidden();   // replie tant que la ligne n'est pas touchee
        await expect(page.locator('#dist-products-list .product-status-btn:not([data-guest])').first()).toBeVisible();
        // Sans info recente, les boutons sont deja sur les cartes : pas de consigne en plus
        await expect(page.locator('#dist-products-hint')).toBeHidden();
        await expect(page.locator('#dist-login-invite')).toBeHidden();
    });

    test('etat lu en base : « En service » / « En panne » en petit sous le nom, avec son age', async ({ page }) => {
        const status = { state: 'working' };
        await page.route(url => url.pathname.endsWith('/rest/v1/distributor_status'), route => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify([{ distributor_id: 'x', state: status.state, source: 'anon', weight: 0.5, created_at: minutesAgoIso(10), age_seconds: 600 }])
        }));
        await page.route(url => url.pathname.endsWith('/rest/v1/product_availability'), route =>
            route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
        await openDistModal(page);
        await expect(page.locator('#dist-status-word')).toHaveText('En service');
        await expect(page.locator('#dist-status')).toHaveAttribute('data-state', 'working');
        await expect(page.locator('#dist-modal-verified')).toHaveText('il y a 10 min');
        await expect(page.locator('#dist-hero')).toHaveCount(0);   // plus de bandeau (EPIC-T10)
        await page.click('#dist-modal-close');
        status.state = 'broken';
        await openDistModal(page);
        await expect(page.locator('#dist-status-word')).toHaveText('En panne');
        await expect(page.locator('#dist-modal-verified')).toHaveText('il y a 10 min');
    });

    // EPIC-T6 : un envoi qui echoue hors refus metier est renvoye une fois apres
    // renouvellement de la session (plus de renvoi anonyme) ; un refus metier ne l'est pas.
    test('envoi en echec (401) -> session renouvelee, renvoi -> « Merci »', async ({ page }) => {
        const calls = [];
        await page.route(RPC_ROUTE, route => {
            calls.push(route.request().postDataJSON());
            if (calls.length === 1) {
                return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST301', message: 'JWT expired' }) });
            }
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ inserted: 1, skipped: 0, source: 'anon' }) });
        });
        await routeSignals(page);
        await loginForTest(page);
        await openDistModal(page);
        await chooseMachineState(page, 'working');
        await expect(page.locator('#toast-container .toast.success')).toContainText('Merci');
        expect(calls).toHaveLength(2);
        expect(calls[1]).toEqual(calls[0]);
        await expect(page.locator('#dist-status-word')).toHaveText('En service');
        expect(await page.$('#toast-container .toast.error')).toBeNull();
    });

    test('refus « trop de signaux » : pas de renvoi, la raison est affichee', async ({ page }) => {
        const calls = [];
        await page.route(RPC_ROUTE, route => {
            calls.push(1);
            route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'Trop de signaux pour cet appareil, reessaie plus tard' }) });
        });
        await routeSignals(page);
        await loginForTest(page);
        await openDistModal(page);
        await chooseMachineState(page, 'empty');
        await expect(page.locator('#toast-container .toast.error')).toHaveText('Trop de signaux depuis ce compte, réessaie dans une heure');
        expect(calls).toHaveLength(1);
    });

    test('session morte (28000 deux fois) -> « Ta session a expiré : reconnecte-toi » et la connexion s\u2019ouvre', async ({ page }) => {
        const calls = [];
        await page.route(RPC_ROUTE, route => {
            calls.push(1);
            route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '28000', message: 'Connexion requise pour signaler' }) });
        });
        await routeSignals(page);
        await page.evaluate(() => localStorage.setItem('distrimatch_force_auth', '1'));   // modale email comme en prod
        await loginForTest(page);
        await openDistModal(page);
        await chooseMachineState(page, 'working');
        await expect(page.locator('#toast-container .toast.error')).toHaveText('Ta session a expiré : reconnecte-toi');
        expect(calls).toHaveLength(2);
        await page.waitForSelector('.auth-modal-overlay', { timeout: 3000 });
    });

    test('plus de gros bouton rouge ni de fenetre « Il reste quoi ? »', async ({ page }) => {
        await openDistModal(page);
        await expect(page.locator('#dist-action-confirm')).toHaveCount(0);
        await expect(page.locator('#availability-modal')).toHaveCount(0);
        await expect(page.locator('#dist-status-banner')).toHaveCount(0);
    });

    test('erreur serveur (503) -> toast d\u2019erreur, la ligne reste ouverte et inchangee', async ({ page }) => {
        await page.route(RPC_ROUTE, route => route.fulfill({
            status: 503, contentType: 'application/json',
            body: JSON.stringify({ message: 'indisponible' })
        }));
        await routeSignals(page);
        const f = await openSignalableFiche(page);
        const row = page.locator(`#dist-products-list .product-row[data-product-id="${f.productId}"]`);
        await signalFirstProduct(page, 'available');
        await expect(page.locator('#toast-container .toast.error')).toContainText('réessaie plus tard (code 503)');
        await expect(row.locator('.product-status-btn')).toHaveAttribute('aria-expanded', 'true');
        await expect(row.locator('.product-pill')).toHaveText("Pas d'info");
    });
});

test.describe('13bis. Deep link QR (&confirm=1&src=qr)', () => {
    test.beforeEach(async () => { /* override : pas de setupApp */ });

    test("visiteur : ouvre la fiche, l'encadre de connexion mis en avant, memorise la source, nettoie l'URL", async ({ browser }) => {
        const context = await browser.newContext();
        await context.route(EVENTS_ROUTE, route => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));   // aucun vrai evenement
        const page = await context.newPage();
        const events = await captureEvents(page);
        await page.goto(BASE_URL);
        await page.waitForFunction(() => window.AppState?.distributors?.length > 0, { timeout: 50000 });
        const firstId = await page.evaluate(() => {
            const ok = (p) => p && p.id !== null && p.id !== undefined && p.id !== '' && Number.isInteger(Number(p.id));
            return window.AppState.distributors.find(x => (x.products || []).some(ok)).id;
        });

        await page.goto(`${BASE_URL}/?id=${firstId}&confirm=1&src=qr`);
        await page.waitForSelector('#dist-modal-overlay.active', { timeout: 50000 });
        await expect(page.locator('#dist-login-invite')).toHaveClass(/is-highlighted/);
        await expect(page.locator('#dist-login-invite')).toBeInViewport();

        const src = await page.evaluate(() => sessionStorage.getItem('distrimatch_src'));
        expect(src).toBe('qr');
        expect(page.url()).not.toContain('confirm=');
        // Mesure : l'arrivee par QR compte app_ouverte + qr_scan + fiche_ouverte, source 'qr'
        await expect.poll(() => events.filter(e => e.source === 'qr').map(e => e.type).sort()).toEqual(['app_ouverte', 'fiche_ouverte', 'qr_scan']);
        expect(events.find(e => e.type === 'qr_scan').distributorId).toBe(firstId);
        await context.close();
    });

    test('QR en visiteur sur une machine sans produit : encadre de connexion, pas de boutons d\u2019etat', async ({ browser }) => {
        const context = await browser.newContext();
        await context.route(EVENTS_ROUTE, route => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }));
        const page = await context.newPage();
        await page.goto(BASE_URL);
        await page.waitForFunction(() => window.AppState?.distributors?.length > 0, { timeout: 50000 });
        const emptyId = await page.evaluate(() => (window.AppState.distributors.find(x => !(x.products || []).length) || {}).id);
        test.skip(!emptyId, 'aucune machine sans produit dans les donnees');
        await page.goto(`${BASE_URL}/?id=${emptyId}&confirm=1&src=qr`);
        await page.waitForSelector('#dist-modal-overlay.active', { timeout: 50000 });
        await expect(page.locator('#dist-login-invite')).toHaveClass(/is-highlighted/);
        await expect(page.locator('#dist-machine-choices')).toBeHidden();
        await context.close();
    });
});

test.describe('17. Rythme infere', () => {
    test('profil boulangerie -> phrase sous le badge de fraicheur ; la tranche a 2 signaux est ignoree', async ({ page }) => {
        await page.route(RHYTHM_ROUTE, route => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify([
                { distributor_id: 'x', tranche: 'apres-midi', signaux_produit: 40, pct_dispo: 15, signaux_machine_ko: 0 },
                { distributor_id: 'x', tranche: 'matin', signaux_produit: 40, pct_dispo: 86, signaux_machine_ko: 0 },
                { distributor_id: 'x', tranche: 'midi', signaux_produit: 40, pct_dispo: 7, signaux_machine_ko: 2 },
                { distributor_id: 'x', tranche: 'soir', signaux_produit: 2, pct_dispo: 0, signaux_machine_ko: 0 }
            ])
        }));
        await openDistModal(page);
        const rhythm = page.locator('#dist-modal-rhythm');
        await expect(rhythm).toHaveText('Habituellement plein le matin, souvent vide à midi et l\'après-midi');
        await expect(rhythm).toBeVisible();
        const pos = await page.evaluate(() => ({
            rhythmTop: document.getElementById('dist-modal-rhythm').getBoundingClientRect().top,
            verifiedBottom: document.getElementById('dist-modal-verified').getBoundingClientRect().bottom
        }));
        expect(pos.rhythmTop).toBeGreaterThanOrEqual(pos.verifiedBottom - 1);
    });

    test('sans lignes -> rien n\'est affiche', async ({ page }) => {
        let served = false;
        await page.route(RHYTHM_ROUTE, route => { served = true; route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); });
        await openDistModal(page);
        await expect.poll(() => served).toBe(true);
        await page.waitForTimeout(300);
        const rhythm = page.locator('#dist-modal-rhythm');
        await expect(rhythm).toBeHidden();
        expect(await rhythm.textContent()).toBe('');
    });
});

// ============================================
// 24. HIERARCHIE DE LA FICHE (audit UX-05/13)
// ============================================
// EPIC-T10 (fiche v3) : les produits d'abord, l'etat en discret. Plus de
// bandeau : sous le nom, une ligne d'etat de 14-15 px (mini-feu + mot + age),
// avant la note ; cartes produit en grille 2 colonnes ; pas de CTA rouge ;
// pas de separateur orphelin ; le type n'apparait qu'une fois.

test.describe('24. Hierarchie de la fiche', () => {
    test('ligne d\u2019etat discrete sous le nom (plus de bandeau), avant la note ; cartes en grille ; onglets en pastilles', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await openDistModal(page);
        await page.waitForTimeout(500);
        const r = await page.evaluate(() => {
            const rect = el => (typeof el === 'string' ? document.getElementById(el) : el).getBoundingClientRect();
            const meta = document.querySelector('.dist-modal-meta');
            const visibleChildren = [...meta.children].filter(c => c.offsetParent !== null && c.textContent.trim());
            const last = visibleChildren[visibleChildren.length - 1];
            const cards = [...document.querySelectorAll('#dist-products-list .product-row')];
            return {
                nameBottom: rect('dist-modal-name').bottom,
                statusTop: rect('dist-status').top,
                statusBottom: rect('dist-status').bottom,
                ratingTop: rect('dist-modal-rating').top,
                statusWordSize: parseFloat(getComputedStyle(document.getElementById('dist-status-word')).fontSize),
                nameSize: parseFloat(getComputedStyle(document.getElementById('dist-modal-name')).fontSize),
                hasHero: !!document.getElementById('dist-hero'),
                hasCta: !!document.getElementById('dist-action-confirm'),
                overflow: document.documentElement.scrollWidth > innerWidth,
                gridCols: cards.length >= 2 && Math.abs(rect(cards[0]).top - rect(cards[1]).top) < 2 && rect(cards[0]).left < rect(cards[1]).left,
                activeTabBg: getComputedStyle(document.querySelector('.dist-tab.active')).backgroundColor,
                lastMetaIsSeparator: !!last && last.classList.contains('meta-separator'),
                typeOccurrences: (() => {
                    const label = document.getElementById('dist-modal-type').textContent.replace(/^[^A-Za-zÀ-ÿ]+/, '').trim();
                    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const head = [...document.querySelectorAll('.dist-modal-header, .dist-modal-actions')].map(e => e.textContent).join(' ');
                    return (head.match(new RegExp(escaped, 'g')) || []).length;
                })()
            };
        });
        expect(r.hasHero).toBe(false);                                    // EPIC-T10 : plus de bandeau d'etat
        expect(r.statusTop).toBeGreaterThanOrEqual(r.nameBottom - 1);     // l'etat sous le nom
        expect(r.statusBottom).toBeLessThanOrEqual(r.ratingTop + 1);      // avant la note
        expect(r.statusWordSize).toBeLessThanOrEqual(16);                 // discret
        expect(r.statusWordSize).toBeLessThan(r.nameSize);
        expect(r.hasCta).toBe(false);
        expect(r.overflow).toBe(false);
        expect(r.gridCols).toBe(true);
        expect(r.activeTabBg).not.toBe('rgba(0, 0, 0, 0)');
        expect(r.lastMetaIsSeparator).toBe(false);
        expect(r.typeOccurrences).toBe(1);
    });
});

// ============================================
// 25. STATUT PRODUIT : DISPO / PAS DISPO / PAS D'INFO (EPIC-T2)
// ============================================
// Trois mots seulement. La couleur (is-fresh) dit la confiance : < 2 h vive,
// jusqu'a 24 h adoucie ; sans signal, « Pas d'info ». Plus jamais « catalogue ».

test.describe('25. Statut produit', () => {
    test("vu dispo 12 min -> « Dispo » vif ; vu absent 3 h -> « Pas dispo » adouci ; sans signal -> « Pas d'info »", async ({ page }) => {
        const signals = { products: [] };
        await page.route(url => url.pathname.endsWith('/rest/v1/distributor_status'), route =>
            route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
        await page.route(url => url.pathname.endsWith('/rest/v1/product_availability'), route =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(signals.products) }));
        const first = await page.evaluate(() => {
            const ok = (p) => p && p.id !== null && p.id !== undefined && p.id !== '' && Number.isInteger(Number(p.id));
            const d = window.AppState.distributors.find(x => (x.products || []).some(ok));
            return { id: d.id, productId: String(d.products.find(ok).id) };
        });
        const row = page.locator(`#dist-products-list .product-row[data-product-id="${first.productId}"]`);
        const open = async () => {
            await page.evaluate(id => window.openDistributorModal(id), first.id);
            await page.waitForSelector('#dist-modal-overlay.active', { timeout: 5000 });
            await page.waitForTimeout(500);
        };

        signals.products = [{ distributor_id: first.id, product_id: Number(first.productId), state: 'available', created_at: minutesAgoIso(12), source: 'anon', weight: 0.5 }];
        await open();
        await expect(row.locator('.product-pill')).toHaveText('Dispo');
        await expect(row.locator('.product-pill')).toHaveClass(/is-fresh/);
        await expect(row.locator('.product-seen')).toHaveText('vu il y a 12 min');
        await page.click('#dist-modal-close');

        signals.products = [{ distributor_id: first.id, product_id: Number(first.productId), state: 'absent', created_at: minutesAgoIso(180), source: 'anon', weight: 0.5 }];
        await open();
        await expect(row.locator('.product-pill')).toHaveText('Pas dispo');
        await expect(row.locator('.product-pill')).not.toHaveClass(/is-fresh/);
        await expect(row.locator('.product-seen')).toHaveText('vu il y a 3 h');
        await page.click('#dist-modal-close');

        signals.products = [];
        await open();
        await expect(row.locator('.product-pill')).toHaveText("Pas d'info");
        await expect(page.locator('#dist-products-list')).not.toContainText(/catalogue/i);
    });
});

// ============================================
// 26. SIGNAL SUR LA FICHE : UNE CHOSE DEPLIEE A LA FOIS (EPIC-T2 / T5)
// ============================================

test.describe('26. Une chose depliee a la fois', () => {
    test('connecte, infos recentes : deplier une carte replie la precedente et « Mettre à jour » ; la croix reste visible', async ({ page }) => {
        const d = await page.evaluate(() => {
            const ok = (p) => p && p.id !== null && p.id !== undefined && p.id !== '' && Number.isInteger(Number(p.id));
            const x = window.AppState.distributors.find(y => (y.products || []).filter(ok).length >= 2);
            if (!x) return null;
            // Seulement des produits signalables et en vente : ils ont tous un signal recent
            x.products = x.products.filter(ok).map(p => ({ ...p, available: true }));
            return { id: x.id, products: x.products.map(p => Number(p.id)) };
        });
        test.skip(!d, 'aucun distributeur avec deux produits signalables');
        // Infos de 5 min : cartes repliees (boutons caches tant qu'on ne touche pas)
        await page.route(url => url.pathname.endsWith('/rest/v1/distributor_status'), route =>
            route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
        await page.route(url => url.pathname.endsWith('/rest/v1/product_availability'), route => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify(d.products.map(id => ({ distributor_id: d.id, product_id: id, state: 'available', created_at: minutesAgoIso(5), source: 'user', weight: 0.8 })))
        }));
        await loginForTest(page);
        await page.evaluate(id => window.openDistributorModal(id), d.id);
        await page.waitForSelector('#dist-modal-overlay.active');
        await expect(page.locator('#dist-products-list .product-status-btn:not([data-guest])[aria-expanded="true"]')).toHaveCount(0);
        await page.click('#dist-status-update');
        await expect(page.locator('#dist-machine-choices')).toBeVisible();
        const mains = page.locator('#dist-products-list .product-status-btn:not([data-guest])');
        await expect(mains.nth(0)).toHaveAttribute('aria-expanded', 'false');
        await mains.nth(0).click();
        await expect(mains.nth(0)).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#dist-machine-choices')).toBeHidden();
        await mains.nth(1).click();
        await expect(mains.nth(1)).toHaveAttribute('aria-expanded', 'true');
        await expect(mains.nth(0)).toHaveAttribute('aria-expanded', 'false');
        await expect(page.locator('#dist-modal-close')).toBeVisible();
    });
});

test.describe('31. Fiches de démonstration', () => {
    test('tag « Démo » dans le panneau, la fiche et « À propos » de la fiche fictive seulement ; lisible en 390 px', async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const page = await context.newPage();
        await routeDistributors(page, demoDistributorsFixture());
        await setupApp(page, context);
        expect(await page.evaluate(() => window.AppState.distributors.map(d => [d.id, d.isDemo]))).toEqual([['demo-e2e', true], ['real-e2e', false]]);

        await page.click('.filter-chip[data-type="all"]');
        await expect(page.locator('#side-panel-list .side-panel-item[data-id="demo-e2e"] .demo-tag')).toHaveText('Démo');
        expect(await page.locator('#side-panel-list .demo-tag').count()).toBe(1);
        await page.click('#side-panel-close');

        await page.evaluate(() => window.openDistributorModal('demo-e2e'));
        await page.waitForSelector('#dist-modal-overlay.active', { timeout: 5000 });
        await expect(page.locator('#dist-modal-demo')).toBeVisible();
        await expect(page.locator('#dist-modal-name')).toHaveText('Fiche fictive e2e');
        await page.click('.dist-tab[data-tab="apropos"]');
        await expect(page.locator('#dist-apropos-demo-row')).toBeVisible();
        await page.click('.dist-tab[data-tab="produits"]');
        const issues = await collectTextIssues(page, 'fiche-demo');
        expect(issues, issues.join('\n')).toEqual([]);
        await page.click('#dist-modal-close');

        await page.evaluate(() => window.openDistributorModal('real-e2e'));
        await page.waitForSelector('#dist-modal-overlay.active', { timeout: 5000 });
        await expect(page.locator('#dist-modal-demo')).toBeHidden();
        await page.click('.dist-tab[data-tab="apropos"]');
        await expect(page.locator('#dist-apropos-demo-row')).toBeHidden();
        await context.close();
    });

    test('tableau de bord : « dont N de démo » et tags sur les fiches fictives du top', async ({ page }) => {
        const fixture = kpiFixture();
        fixture.kpi_coverage = [{ ...fixture.kpi_coverage[0], machines_demo: 25 }];
        fixture.kpi_top_distributors = fixture.kpi_top_distributors.map((r, i) => ({ ...r, is_demo: i % 2 === 0 }));
        await routeKpi(page, fixture);
        await page.evaluate(() => window.switchView('stats'));
        await page.waitForSelector('#stats-view.view-active', { timeout: 3000 });
        await expect(page.locator('#stats-demo-note')).toHaveText('dont 25 de démo (données fictives)');
        await expect(page.locator('#stats-coverage-detail')).toHaveText('21 machines sur 30');
        await expect(page.locator('#stats-top .demo-tag')).toHaveCount(3);
    });
});

// ============================================
// 32. HORAIRES ET COUP DE POUCE SUR PLACE (EPIC-T17)
// ============================================
test.describe('32. Horaires et coup de pouce sur place', () => {
    async function openWithHours(page, hours) {
        await page.evaluate((h) => {
            const d = window.AppState.distributors[0];
            d.openingHours = h;
            d.tz = 'Europe/Paris';
            window.openDistributorModal(d.id);
        }, hours);
        await page.waitForSelector('#dist-modal-overlay.active');
    }

    test('horaires : « Ouvert 24 h/24 » sous le nom et la semaine dans « À propos » ; format inconnu = texte brut ; sans horaires, rien', async ({ page }) => {
        await openWithHours(page, '24/7');
        await expect(page.locator('#dist-modal-hours')).toBeVisible();
        await expect(page.locator('#dist-modal-hours')).toHaveClass(/is-open/);
        await expect(page.locator('#dist-modal-hours-text')).toHaveText('Ouvert 24 h/24');
        await page.click('.dist-tab[data-tab="apropos"]');
        await expect(page.locator('#dist-apropos-hours')).toHaveText('Tous les jours, 24 h/24');
        await page.click('#dist-modal-close');

        await openWithHours(page, 'sunrise-sunset');
        await expect(page.locator('#dist-modal-hours')).toBeHidden();
        await page.click('.dist-tab[data-tab="apropos"]');
        await expect(page.locator('#dist-apropos-hours')).toHaveText('sunrise-sunset');
        await page.click('#dist-modal-close');

        await openWithHours(page, null);
        await expect(page.locator('#dist-modal-hours')).toBeHidden();
        await expect(page.locator('#dist-apropos-hours-row')).toBeHidden();
    });

    // Position emulee sur le distributeur, avant d'ouvrir la fiche (relue a l'ouverture)
    async function standAt(page, context, { offsetLat = 0, accuracy = 5 } = {}) {
        const d = await page.evaluate(() => {
            const ok = (p) => p && Number.isInteger(Number(p.id));
            const x = window.AppState.distributors.find(y => (y.products || []).some(ok));
            return { lat: x.lat, lng: x.lng };
        });
        await context.setGeolocation({ latitude: d.lat + offsetLat, longitude: d.lng, accuracy });
    }

    test('membre a moins de 15 m : « N produits à vérifier », ce qui date est marqué, pas ce qui est frais ; rien n’est envoyé', async ({ page, context }) => {
        const f = await page.evaluate(() => {
            const ok = (p) => p && Number.isInteger(Number(p.id));
            const d = window.AppState.distributors.find(x => (x.products || []).some(ok));
            return { productId: Number(d.products.find(ok).id), signalable: d.products.filter(ok).length };
        });
        await routeSignals(page, { products: [{ product_id: f.productId, state: 'available', created_at: minutesAgoIso(5) }] });
        let rpc = 0;
        await page.route(RPC_ROUTE, route => { rpc++; route.abort(); });
        await standAt(page, context);
        await openSignalableFiche(page);
        const nudge = page.locator('#dist-products-nudge');
        await expect(nudge).toBeVisible();
        const stale = f.signalable - 1;
        if (stale > 0) await expect(nudge).toContainText(`${stale} produit`);
        await expect(page.locator(`#dist-products-list .product-row[data-product-id="${f.productId}"]`)).not.toHaveClass(/needs-check/);
        await expect(page.locator('#dist-products-list .product-row.needs-check')).toHaveCount(stale);
        // un « Dispo » d'il y a 5 min dit deja qu'il est en service : la ligne d'etat n'est pas marquee
        await expect(page.locator('#dist-status-word')).toHaveText('En service');
        await expect(page.locator('#dist-status-update')).not.toHaveClass(/needs-check/);
        expect(rpc).toBe(0);
    });

    test('loin (25 m), position imprécise (50 m) ou visiteur : pas de coup de pouce', async ({ page, context }) => {
        await routeSignals(page);
        await standAt(page, context, { offsetLat: 0.000225 });   // ~25 m
        await openSignalableFiche(page);
        await page.waitForTimeout(800);
        await expect(page.locator('#dist-products-nudge')).toBeHidden();
        await expect(page.locator('#dist-products-list .product-row.needs-check')).toHaveCount(0);
        await page.click('#dist-modal-close');

        await standAt(page, context, { accuracy: 50 });
        await openSignalableFiche(page, { login: false });
        await page.waitForTimeout(800);
        await expect(page.locator('#dist-products-nudge')).toBeHidden();
        await page.click('#dist-modal-close');

        await page.evaluate(() => window.__testLogout());
        await standAt(page, context);
        await openSignalableFiche(page, { login: false });
        await page.waitForTimeout(800);
        await expect(page.locator('#dist-products-nudge')).toBeHidden();
        await expect(page.locator('#dist-status-update')).toHaveAttribute('data-guest', '1');   // EPIC-T19 : la ligne mene a l'invitation
        await expect(page.locator('#dist-status-update')).not.toHaveClass(/needs-check/);
    });
});

// ============================================
// 36. ETAT DU DISTRIBUTEUR : MENU ANCRE, PASTILLE, LISTE (EPIC-T19)
// ============================================
test.describe('36. Etat du distributeur : menu, pastille, liste', () => {
    test('membre : la ligne d’etat ouvre le menu ancre ; « Actuellement : Pas d’info » ; fleches ; Echap ferme ; plus de « Mettre à jour »', async ({ page }) => {
        await routeSignals(page);
        await openSignalableFiche(page);
        await expect(page.locator('#dist-modal')).not.toContainText('Mettre à jour');
        const trigger = page.locator('#dist-status-update');
        await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
        await trigger.click();
        const menu = page.locator('#dist-machine-choices[role="menu"]');
        await expect(menu).toBeVisible();
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#dist-machine-choices-q')).toHaveText("Actuellement : Pas d'info");
        await expect(menu.locator('[role="menuitemradio"][aria-checked="true"]')).toHaveCount(0);
        await page.locator('#dist-machine-choices .machine-choice').first().focus();
        await page.keyboard.press('ArrowDown');
        await expect(page.locator('#dist-machine-choices .machine-choice[data-machine="empty"]')).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
        await expect(trigger).toBeFocused();
        await expect(page.locator('#dist-modal-overlay')).toHaveClass(/active/);   // Echap ne ferme pas la fiche
    });

    test('etat connu : coche sur l’etat actuel, pas d’en-tete ; toucher ailleurs ferme', async ({ page }) => {
        await routeSignals(page, { status: [{ state: 'broken', created_at: minutesAgoIso(10) }] });
        await openSignalableFiche(page);
        await page.click('#dist-status-update');
        await expect(page.locator('#dist-machine-choices .machine-choice[data-machine="broken"]')).toHaveAttribute('aria-checked', 'true');
        await expect(page.locator('#dist-machine-choices-q')).toBeHidden();
        await page.mouse.click(5, 700);
        await expect(page.locator('#dist-machine-choices')).toBeHidden();
    });

    test('visiteur : toucher la ligne d’etat met l’invitation en avant, aucun menu', async ({ page }) => {
        await routeSignals(page);
        await openSignalableFiche(page, { login: false });
        await page.click('#dist-status-update');
        await expect(page.locator('#dist-machine-choices')).toBeHidden();
        await expect(page.locator('#dist-login-invite')).toHaveClass(/is-highlighted/);
    });

    test('carte : anneau de la couleur de l’etat, rempli selon le stock, pointille sans info, sans chiffre ; titre accessible', async ({ page }) => {
        const ids = await page.evaluate(() => {
            const ok = (p) => p && Number.isInteger(Number(p.id));
            const withProducts = window.AppState.distributors.filter(x => (x.products || []).filter(ok).length >= 2);
            const d = withProducts[0];
            return { id: d.id, products: d.products.filter(ok).map(p => Number(p.id)) };
        });
        const statusRows = [{ distributor_id: ids.id, state: 'working', source: 'user', created_at: minutesAgoIso(10) }];
        const productRows = [{ distributor_id: ids.id, product_id: ids.products[0], state: 'available', source: 'user', created_at: minutesAgoIso(10) }];
        await page.route(url => url.pathname.endsWith('/rest/v1/distributor_status'), r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(statusRows) }));
        await page.route(url => url.pathname.endsWith('/rest/v1/product_availability'), r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(productRows) }));
        await page.evaluate(async () => { const m = await import('./js/summaries.js'); await m.loadSignalSummaries(); });
        const pin = page.locator('.leaflet-marker-icon', { has: page.locator('.distributor-pin.is-working') }).first();
        await expect(pin).toBeVisible();
        const title = await pin.getAttribute('title');
        expect(title).toMatch(/: En service, 1 sur \d+ dispo$/);
        // l'arc plein couvre une partie seulement de l'anneau (1 sur N)
        const dash = await pin.locator('.distributor-pin-ring circle[stroke-dasharray]').getAttribute('stroke-dasharray');
        const [arc, total] = dash.split(' ').map(Number);
        expect(arc).toBeGreaterThan(0);
        expect(arc).toBeLessThan(total);
        await expect(pin).not.toContainText(/\d/);   // pas de chiffre sur la pastille
        // sans info : pointille gris
        await expect(page.locator('.distributor-pin.is-unknown .distributor-pin-ring circle[stroke-dasharray="5 4"]').first()).toBeVisible();
    });

    test('liste : anneau autour de la vignette et « En service · 1 sur N dispo »', async ({ page }) => {
        const ids = await page.evaluate(() => {
            const ok = (p) => p && Number.isInteger(Number(p.id));
            const d = window.AppState.distributors.find(x => (x.products || []).filter(ok).length >= 2);
            return { id: d.id, products: d.products.filter(ok).map(p => Number(p.id)), count: d.products.length };
        });
        await page.route(url => url.pathname.endsWith('/rest/v1/distributor_status'), r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ distributor_id: ids.id, state: 'working', created_at: minutesAgoIso(10) }]) }));
        await page.route(url => url.pathname.endsWith('/rest/v1/product_availability'), r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ distributor_id: ids.id, product_id: ids.products[0], state: 'available', created_at: minutesAgoIso(10) }]) }));
        // Le chargement du demarrage peut finir apres nos routes : on relit jusqu'a obtenir l'etat simule
        const item = page.locator(`#side-panel-list .side-panel-item[data-id="${ids.id}"]`);
        await expect.poll(async () => {
            await page.evaluate(async () => {
                const m = await import('./js/summaries.js'); await m.loadSignalSummaries();
                const g = await import('./js/gmaps-ui.js'); g.openSidePanelForType('all');
            });
            return item.locator('.side-panel-item-state').textContent();
        }, { timeout: 10000 }).toBe(`En service · 1 sur ${ids.count} dispo`);
        await expect(item.locator('.side-panel-item-photo.has-ring.is-working .side-panel-ring')).toHaveCount(1);
    });
});
