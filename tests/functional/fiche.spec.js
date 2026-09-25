/**
 * DistriMatch - Tests fonctionnels : Fiche distributeur : lecture, signal sur l'aliment et la machine, edition
 *
 * User stories couvertes : EPIC-T1 T1-US1/US2, EPIC-T2 (dispo ou pas), EPIC-T4 (style), EPIC-T5 (informer = privilege de compte), EPIC-T6 T6-US4 (session), rythme infere, fiches demo.
 * Serveur simule la ou il le faut (voir helpers.js). Lancer : npm run test:functional
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, EVENTS_ROUTE, captureEvents, setupApp, openDistModal, loginForTest, RPC_ROUTE, openSignalableFiche, signalFirstProduct, routeSignals, minutesAgoIso, RHYTHM_ROUTE, kpiFixture, routeKpi, collectTextIssues, demoDistributorsFixture, routeDistributors } from './helpers.js';

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

    test('boutons Itineraire et Favori visibles', async ({ page }) => {
        await openDistModal(page);
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
// 5bis. MODIFICATION DEPUIS FAVORIS (stylo)
// ============================================

test.describe('5bis. Modification via stylo', () => {
    async function openFirstFavoriteCard(page) {
        await page.evaluate(() => {
            const id = window.AppState.distributors[0].id;
            window.AppState.subscriptions = [id];
        });
        await page.click('.bottom-nav [data-tab="favorites"]');
        await page.waitForSelector('#subscriptions-view.view-active');
        await page.waitForSelector('#subscriptions-list .subscription-card');
        await page.click('#subscriptions-list .subscription-card');
        await page.waitForSelector('#dist-modal-overlay.active', { timeout: 3000 });
    }

    test('connecte : carte favori ouvre la fiche en LECTURE avec stylo visible', async ({ page }) => {
        await loginForTest(page);
        await openFirstFavoriteCard(page);

        const state = await page.evaluate(() => ({
            edit: window.AppState.modalEditMode,
            canEdit: window.AppState.modalCanEdit,
            addHidden: getComputedStyle(document.getElementById('dist-products-add-section')).display === 'none',
        }));
        expect(state.edit).toBe(false);
        expect(state.canEdit).toBe(true);
        expect(state.addHidden).toBe(true);
        await expect(page.locator('#dist-action-edit')).toBeVisible();
    });

    test('visiteur : ni Modifier ni Photo, un encadre invite a se connecter', async ({ page }) => {
        await openFirstFavoriteCard(page);
        await expect(page.locator('#dist-action-edit')).toBeHidden();
        await expect(page.locator('#dist-action-add-photo')).toBeHidden();
        await expect(page.locator('#dist-login-invite')).toBeVisible();
        await expect(page.locator('#dist-machine-choices')).toBeHidden();
    });

    test('visiteur : « Se connecter » de l\u2019encadre ouvre la modale email, fiche toujours ouverte', async ({ page }) => {
        // Auth comme en prod (sinon requireAuth() est contourne sur localhost)
        await page.evaluate(() => localStorage.setItem('distrimatch_force_auth', '1'));
        await openFirstFavoriteCard(page);
        await page.click('#dist-login-invite-btn');
        await page.waitForSelector('.auth-modal-overlay', { timeout: 3000 });
        const r = await page.evaluate(() => ({
            emailModal: !!document.querySelector('.auth-modal'),
            modalStillOpen: document.getElementById('dist-modal-overlay').classList.contains('active'),
            accountNotOpened: !document.getElementById('account-view').classList.contains('view-active'),
        }));
        expect(r.emailModal).toBe(true);
        expect(r.modalStillOpen).toBe(true);
        expect(r.accountNotOpened).toBe(true);
    });

    test('mode edition affiche produits CRUD + ajout, stylo masque, chat inactif', async ({ page }) => {
        await openFirstFavoriteCard(page);
        // Auth contournee pour isoler le rendu edition
        await page.evaluate(() => {
            const id = window.AppState.currentDistributor.id;
            window.openDistributorModal(id, true, true);
        });
        const r = await page.evaluate(() => ({
            edit: window.AppState.modalEditMode,
            addVisible: getComputedStyle(document.getElementById('dist-products-add-section')).display !== 'none',
            chatVisible: getComputedStyle(document.getElementById('dist-chat-section')).display !== 'none',
            styloHidden: getComputedStyle(document.getElementById('dist-action-edit')).display === 'none',
        }));
        expect(r.edit).toBe(true);
        expect(r.addVisible).toBe(true);
        expect(r.chatVisible).toBe(false);   // chat inactif (FEATURES.chat)
        expect(r.styloHidden).toBe(true);
    });

    test('niveau de prix affiche + select edition, aucun prix produit', async ({ page }) => {
        await openFirstFavoriteCard(page);
        await page.evaluate(() => {
            const id = window.AppState.currentDistributor.id;
            window.openDistributorModal(id, true, true);
        });
        const r = await page.evaluate(() => ({
            headerPrice: document.getElementById('dist-modal-pricerange').textContent,
            selectVal: document.getElementById('dist-edit-pricerange').value,
            priceCleanCount: document.querySelectorAll('#dist-products-list .product-price-clean').length,
            priceInputCount: document.querySelectorAll('#dist-products-list .product-edit-price').length,
            addPriceInput: document.getElementById('dist-add-product-price'),
        }));
        expect(['€', '€€', '€€€']).toContain(r.headerPrice);
        expect(r.selectVal).toBe(r.headerPrice);
        expect(r.priceCleanCount).toBe(0);
        expect(r.priceInputCount).toBe(0);
        expect(r.addPriceInput).toBeNull();
    });

    // Retour terrain 2026-09-25 (T1-US1) : une fiche se complete d'ou qu'on l'ouvre
    test('connecte, hors Favoris (carte, liste, deep link) -> stylo visible, il ouvre l\u2019edition', async ({ page }) => {
        await loginForTest(page);
        await page.evaluate(() => {
            const id = window.AppState.distributors[0].id;
            window.openDistributorModal(id); // comme side panel / carte / deep link
        });
        await page.waitForSelector('#dist-modal-overlay.active');
        await expect(page.locator('#dist-action-edit')).toBeVisible();
        expect(await page.evaluate(() => window.AppState.modalEditMode)).toBe(false);
        await page.click('#dist-action-edit');
        await expect.poll(() => page.evaluate(() => window.AppState.modalEditMode)).toBe(true);
    });

    test("machine sans produit : « Ajouter les produits » pour un connecte seulement, il ouvre l'edition", async ({ page }) => {
        const id = await page.evaluate(() => {
            const d = window.AppState.distributors[0];
            d.products = [];
            return d.id;
        });
        await page.evaluate((distId) => window.openDistributorModal(distId), id);
        await page.waitForSelector('#dist-modal-overlay.active');
        await expect(page.locator('#dist-products-list')).toContainText('Aucun produit référencé');
        await expect(page.locator('#dist-products-add-first')).toHaveCount(0);
        await loginForTest(page);
        await page.click('#dist-products-add-first');
        await expect.poll(() => page.evaluate(() => window.AppState.modalEditMode)).toBe(true);
    });
});

// EPIC-T2 (2026-09-25) : plus de fenetre « Il reste quoi ? » ni de gros bouton
// rouge ; on signale sur l'aliment (toucher la ligne) et sur la puce machine.
test.describe('13. Signal sur l\u2019aliment et sur la machine', () => {
    test("connecte : toucher un aliment deplie « Il y en a / Plus rien » ; un tap envoie ; la ligne passe en « Dispo, vu à l'instant »", async ({ page }) => {
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
        const main = row.locator('button.product-row-main');
        await expect(main).toHaveAttribute('aria-expanded', 'false');
        await main.click();
        await expect(main).toHaveAttribute('aria-expanded', 'true');
        await row.locator('.product-choice[data-state="available"]').click();

        expect(await page.$('.auth-modal-overlay')).toBeNull();          // UC11 : pas de mur d'auth
        await expect(page.locator('#toast-container .toast.success')).toContainText('Merci');
        expect(payloads[0].p_product_signals).toEqual([{ product_id: Number(f.productId), state: 'available' }]);
        expect(payloads[0].p_machine_state).toBeNull();
        await expect(main).toHaveAttribute('aria-expanded', 'false');
        await expect(row.locator('.product-pill')).toHaveText('Dispo');
        await expect(row.locator('.product-pill')).toHaveClass(/is-fresh/);
        await expect(row.locator('.product-seen')).toHaveText("vu à l'instant");
        // La fiche reste ouverte, le bandeau deduit que la machine marche
        await expect(page.locator('#dist-modal-overlay')).toHaveClass(/active/);
        await expect(page.locator('#dist-hero-kpi')).toHaveText('Fonctionne');
        await expect(page.locator('#dist-products-count')).toHaveText(/^· 1 sur \d+ dispo$/);
    });

    test('on peut se corriger : « Plus rien » juste apres « Il y en a »', async ({ page }) => {
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

    test('boutons d\u2019etat : « Vide » -> bandeau orange « Vide », bouton colore, aliments « Pas dispo, Machine vide »', async ({ page }) => {
        const payloads = [];
        await page.route(RPC_ROUTE, route => {
            payloads.push(route.request().postDataJSON());
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ inserted: 1, skipped: 0, source: 'user' }) });
        });
        await routeSignals(page);
        const f = await openSignalableFiche(page);
        await expect(page.locator('#dist-hero-kpi')).toHaveText("Pas d'info");
        await expect(page.locator('#dist-machine-choices .machine-choice')).toHaveText(['Fonctionne', 'Vide', 'En panne']);
        await expect(page.locator('#dist-machine-choices .machine-choice.is-current')).toHaveCount(0);
        await page.click('#dist-machine-choices .machine-choice[data-machine="empty"]');

        expect(payloads[0].p_machine_state).toBe('empty');
        expect(payloads[0].p_product_signals).toEqual([]);
        await expect(page.locator('#dist-hero')).toHaveClass(/is-empty/);
        await expect(page.locator('#dist-hero-kpi')).toHaveText('Vide');
        await expect(page.locator('#dist-machine-choices .machine-choice[data-machine="empty"]')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('#dist-modal-verified')).toHaveText("Signalée vide à l'instant");
        await expect(page.locator('#dist-products-count')).toHaveText(/^· 0 sur \d+ dispo$/);
        const row = page.locator(`#dist-products-list .product-row[data-product-id="${f.productId}"]`);
        await expect(row.locator('.product-pill')).toHaveText('Pas dispo');
        await expect(row.locator('.product-seen')).toHaveText('Machine vide');
    });

    test('visiteur : lecture seule (ni boutons d\u2019etat ni aliment touchable), encadre de connexion ; connexion -> tout apparait', async ({ page }) => {
        await routeSignals(page);
        await openSignalableFiche(page, { login: false });
        await expect(page.locator('#dist-machine-choices')).toBeHidden();
        await expect(page.locator('#dist-products-list button.product-row-main')).toHaveCount(0);
        await expect(page.locator('#dist-products-hint')).toBeHidden();
        await expect(page.locator('#dist-login-invite')).toBeVisible();
        await loginForTest(page);
        await expect(page.locator('#dist-machine-choices')).toBeVisible();
        await expect(page.locator('#dist-products-list button.product-row-main').first()).toBeVisible();
        await expect(page.locator('#dist-products-hint')).toBeVisible();
        await expect(page.locator('#dist-login-invite')).toBeHidden();
    });

    test('etat lu en base : « Fonctionne » / « En panne » en grand dans le bandeau, avec sa provenance', async ({ page }) => {
        const status = { state: 'working' };
        await page.route(url => url.pathname.endsWith('/rest/v1/distributor_status'), route => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify([{ distributor_id: 'x', state: status.state, source: 'anon', weight: 0.5, created_at: minutesAgoIso(10), age_seconds: 600 }])
        }));
        await page.route(url => url.pathname.endsWith('/rest/v1/product_availability'), route =>
            route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
        await openDistModal(page);
        await expect(page.locator('#dist-hero-kpi')).toHaveText('Fonctionne');
        await expect(page.locator('#dist-hero')).toHaveClass(/is-working/);
        await expect(page.locator('#dist-modal-verified')).toHaveText('Vue en marche il y a 10 min');
        await page.click('#dist-modal-close');
        status.state = 'broken';
        await openDistModal(page);
        await expect(page.locator('#dist-hero-kpi')).toHaveText('En panne');
        await expect(page.locator('#dist-modal-verified')).toHaveText('Signalée en panne il y a 10 min');
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
        await page.click('#dist-machine-choices .machine-choice[data-machine="working"]');
        await expect(page.locator('#toast-container .toast.success')).toContainText('Merci');
        expect(calls).toHaveLength(2);
        expect(calls[1]).toEqual(calls[0]);
        await expect(page.locator('#dist-hero-kpi')).toHaveText('Fonctionne');
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
        await page.click('#dist-machine-choices .machine-choice[data-machine="empty"]');
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
        await page.click('#dist-machine-choices .machine-choice[data-machine="working"]');
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
        await expect(row.locator('button.product-row-main')).toHaveAttribute('aria-expanded', 'true');
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
// EPIC-T2 : l'etat de la machine a droite du nom, sa provenance avant la note,
// plus de gros bouton rouge (on signale sur l'aliment), hero reduit sans photo,
// pas de separateur orphelin.

test.describe('24. Hierarchie de la fiche', () => {
    test('bandeau d\u2019etat en tete (etat en grand, sans puce), provenance au-dessus de la note, pas de CTA rouge, onglets en pastilles', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await openDistModal(page);
        await page.waitForTimeout(500);
        const r = await page.evaluate(() => {
            const rect = id => document.getElementById(id).getBoundingClientRect();
            const meta = document.querySelector('.dist-modal-meta');
            const visibleChildren = [...meta.children].filter(c => c.offsetParent !== null && c.textContent.trim());
            const last = visibleChildren[visibleChildren.length - 1];
            return {
                verifiedBottom: rect('dist-modal-verified').bottom,
                ratingTop: rect('dist-modal-rating').top,
                hasChip: !!document.getElementById('dist-machine-chip'),
                hasCta: !!document.getElementById('dist-action-confirm'),
                overflow: document.documentElement.scrollWidth > innerWidth,
                heroTop: rect('dist-hero').top,
                ficheTop: document.getElementById('dist-modal').getBoundingClientRect().top,
                heroBg: getComputedStyle(document.getElementById('dist-hero')).backgroundColor,
                kpiSize: parseFloat(getComputedStyle(document.getElementById('dist-hero-kpi')).fontSize),
                kpiText: document.getElementById('dist-hero-kpi').textContent,
                activeTabBg: getComputedStyle(document.querySelector('.dist-tab.active')).backgroundColor,
                lastMetaIsSeparator: !!last && last.classList.contains('meta-separator'),
                typeOccurrences: (() => {
                    // Libelle du type sans l'emoji, accents conserves, echappe pour la RegExp
                    const label = document.getElementById('dist-modal-type').textContent.replace(/^[^A-Za-zÀ-ÿ]+/, '').trim();
                    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    return (document.getElementById('dist-modal').textContent.match(new RegExp(escaped, 'g')) || []).length;
                })()
            };
        });
        expect(r.verifiedBottom).toBeLessThanOrEqual(r.ratingTop + 1);
        expect(r.hasChip).toBe(false);                                    // EPIC-T5 : le bandeau seul dit l'etat
        expect(r.hasCta).toBe(false);
        expect(r.overflow).toBe(false);
        // EPIC-T4 : bandeau d'etat en tete, aplat colore, info cle en tres grand, onglet actif rempli
        expect(r.heroTop).toBeLessThanOrEqual(r.ficheTop + 1);
        expect(r.heroBg).not.toBe('rgba(0, 0, 0, 0)');
        expect(r.kpiSize).toBeGreaterThanOrEqual(32);
        expect(r.kpiText.length).toBeGreaterThan(0);
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
    test('connecte : deplier un aliment replie le precedent ; boutons d\u2019etat toujours visibles ; la croix reste visible', async ({ page }) => {
        const d = await page.evaluate(() => {
            const ok = (p) => p && p.id !== null && p.id !== undefined && p.id !== '' && Number.isInteger(Number(p.id));
            return window.AppState.distributors.find(x => (x.products || []).filter(ok).length >= 2)?.id;
        });
        test.skip(!d, 'aucune machine avec deux produits signalables');
        await loginForTest(page);
        await page.evaluate(id => window.openDistributorModal(id), d);
        await page.waitForSelector('#dist-modal-overlay.active');
        await expect(page.locator('#dist-machine-choices')).toBeVisible();
        const mains = page.locator('#dist-products-list button.product-row-main');
        await mains.nth(0).click();
        await expect(mains.nth(0)).toHaveAttribute('aria-expanded', 'true');
        await mains.nth(1).click();
        await expect(mains.nth(1)).toHaveAttribute('aria-expanded', 'true');
        await expect(mains.nth(0)).toHaveAttribute('aria-expanded', 'false');
        await expect(page.locator('#dist-machine-choices')).toBeVisible();
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
