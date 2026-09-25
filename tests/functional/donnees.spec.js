/**
 * DistriMatch - Tests fonctionnels : Donnees et mesure : dedoublonnage, confirmations, mesure du pilote, tableau de bord
 *
 * User stories couvertes : Lot 4 (mesure 008, tableau de bord), confirmation maison, dedup.
 * Serveur simule la ou il le faut (voir helpers.js). Lancer : npm run test:functional
 */
import { test, expect } from '@playwright/test';
import { captureEvents, setupApp, openDistModal, RPC_ROUTE, openSignalableFiche, signalFirstProduct, routeSignals, kpiFixture, routeKpi } from './helpers.js';

test.beforeEach(async ({ page, context }) => {
    await setupApp(page, context);
});

// ============================================
// 9. DEDUP DISTRIBUTEURS (local + remote)
// ============================================

test.describe('9. Dedup distributeurs', () => {
    test('un distributeur deja remote n\'apparait pas en double via le local', async ({ page }) => {
        // Prend un distributeur deja charge (simule la version "remote" / source de verite)
        const remote = await page.evaluate(() => {
            const d = window.AppState.distributors[0];
            return { id: d.id, name: d.name };
        });

        // Injecte une copie locale avec le MEME id (simule un distrib ajoute en
        // local puis sync sur Supabase : il revient via le fetch + le local)
        await page.evaluate((r) => {
            const localCopy = { ...window.AppState.distributors[0], name: r.name + ' (copie locale)' };
            localStorage.setItem('snackmatch_user_distributors', JSON.stringify([localCopy]));
        }, remote);

        // Recharge : loadDistributors() doit dedupliquer par id
        await page.reload();
        await page.waitForFunction(
            () => window.AppState?.distributors?.length > 0,
            { timeout: 50000 }
        );

        const occurrences = await page.evaluate(
            (id) => window.AppState.distributors.filter((d) => d.id === id).length,
            remote.id
        );
        expect(occurrences).toBe(1);

        // La version conservee doit etre la remote (pas la copie locale renommee)
        const keptName = await page.evaluate(
            (id) => window.AppState.distributors.find((d) => d.id === id)?.name,
            remote.id
        );
        expect(keptName).toBe(remote.name);
    });

    test('localStorage legacy avec doublon interne (meme id, pas en remote) -> 1 occurrence', async ({ page }) => {
        // Simule un etat localStorage corrompu d'avant le fix : 2 entrees avec
        // le MEME id, et cet id n'existe PAS dans la source remote.
        const localId = 'user-legacy-dup-test';
        await page.evaluate((id) => {
            const a = { id, name: 'Distrib legacy', type: 'general', emoji: '🍫',
                lat: 43.49, lng: -1.47, address: '', city: 'Test', rating: 4,
                reviewCount: 0, status: 'verified', priceRange: '€', products: [] };
            localStorage.setItem('snackmatch_user_distributors', JSON.stringify([a, { ...a }]));
        }, localId);

        await page.reload();
        await page.waitForFunction(
            () => window.AppState?.distributors?.length > 0,
            { timeout: 50000 }
        );

        const occurrences = await page.evaluate(
            (id) => window.AppState.distributors.filter((d) => d.id === id).length,
            localId
        );
        expect(occurrences).toBe(1);
    });

    test('doublons par contenu, ids differents (bug double-submit) -> 1 occurrence', async ({ page }) => {
        // Reproduit le symptome reel : N entrees meme nom + memes coords mais
        // ids tous differents (user-<timestamp> distinct a chaque clic du
        // bouton avant le garde anti-double-submit). La dedup par id ne peut
        // PAS les voir -> c'est le filet par contenu qui doit collapser.
        // Nom volontairement unique : l'e2e tape la vraie base Supabase, un nom
        // reel (ex. "Gaztainbidea 2") entrerait en collision avec la prod.
        const uniqueName = 'ZZ-E2E-DEDUP-CONTENU-' + Date.now();
        await page.evaluate((nm) => {
            const base = { name: nm, type: 'general', emoji: '🌰',
                lat: 43.4931, lng: -1.4752, address: '', city: 'Test', rating: 5,
                reviewCount: 0, status: 'verified', priceRange: '€', products: [] };
            const dups = Array.from({ length: 7 }, (_, i) => ({
                ...base, id: `user-${1700000000000 + i}`
            }));
            localStorage.setItem('snackmatch_user_distributors', JSON.stringify(dups));
        }, uniqueName);

        await page.reload();
        await page.waitForFunction(
            () => window.AppState?.distributors?.length > 0,
            { timeout: 50000 }
        );

        const occurrences = await page.evaluate(
            (nm) => window.AppState.distributors.filter((d) => d.name === nm).length,
            uniqueName
        );
        expect(occurrences).toBe(1);
    });

    test('le garde anti-double-submit existe sur AddMode', async ({ page }) => {
        const hasGuard = await page.evaluate(
            () => typeof window.AppState !== 'undefined'
                && Object.prototype.hasOwnProperty.call(window.AddMode || {}, 'submitting')
        );
        expect(hasGuard).toBe(true);
    });
});

// ============================================
// 15. CONFIRMATION MAISON (plus de confirm() natif sur les actions destructrices)
// ============================================

test.describe('15. Confirmation maison', () => {
    test('Effacer mes données : modale maison, Annuler conserve, Effacer vide le localStorage, aucun dialogue natif', async ({ page }) => {
        let nativeDialog = false;
        page.on('dialog', async (d) => { nativeDialog = true; await d.dismiss().catch(() => {}); });

        await page.evaluate(() => {
            localStorage.setItem('snackmatch_profile', JSON.stringify({ marker: 'e2e-confirm' }));
            window.switchView('account');
        });
        await page.waitForSelector('#account-view.view-active');
        await page.click('#clear-data-btn');

        const modal = page.locator('#confirm-modal');
        await expect(modal).toHaveClass(/active/);
        await expect(modal).toHaveAttribute('role', 'alertdialog');
        // L'action destructrice n'est jamais le defaut : le focus est sur Annuler
        expect(await page.evaluate(() => document.activeElement?.id)).toBe('confirm-cancel');

        await page.click('#confirm-cancel');
        await expect(modal).not.toHaveClass(/active/);
        expect(await page.evaluate(() => localStorage.getItem('snackmatch_profile'))).toContain('e2e-confirm');

        await page.click('#clear-data-btn');
        await expect(modal).toHaveClass(/active/);
        await page.click('#confirm-ok');
        await expect(modal).not.toHaveClass(/active/);
        expect(await page.evaluate(() => localStorage.getItem('snackmatch_profile'))).toBeNull();
        expect(nativeDialog).toBe(false);
    });

    test('Supprimer un produit : modale par-dessus la fiche en edition, Echap annule et garde le produit', async ({ page }) => {
        await page.evaluate(() => {
            const d = window.AppState.distributors.find(x => (x.products || []).length > 0) || window.AppState.distributors[0];
            window.openDistributorModal(d.id, true, true);
        });
        await page.waitForSelector('#dist-modal-overlay.active');
        const before = await page.evaluate(() => window.AppState.currentDistributor.products.length);
        expect(before).toBeGreaterThan(0);

        await page.click('#dist-products-list .product-btn-delete');
        const modal = page.locator('#confirm-modal');
        await expect(modal).toHaveClass(/active/);
        const firstName = await page.evaluate(() => window.AppState.currentDistributor.products[0].name);
        await expect(page.locator('#confirm-message')).toContainText(firstName);

        await page.keyboard.press('Escape');
        await expect(modal).not.toHaveClass(/active/);
        const after = await page.evaluate(() => window.AppState.currentDistributor.products.length);
        expect(after).toBe(before);
        await expect(page.locator('#dist-modal-overlay')).toHaveClass(/active/);
    });
});

// ============================================
// 16. MESURE DU PILOTE (RPC log_event, migration 008)
// ============================================
// setupApp bloque deja la RPC pour tous les tests ; ici captureEvents() la
// remplace (le dernier handler enregistre gagne) pour lire ce qui part.

test.describe('16. Mesure du pilote (log_event)', () => {
    test('fiche_ouverte puis itineraire : un evenement chacun, meme appareil, source organic, aucune donnee personnelle', async ({ page }) => {
        const events = await captureEvents(page);
        const firstId = await page.evaluate(() => window.AppState.distributors[0].id);
        await page.evaluate(() => { window.open = () => null; });   // pas de vrai onglet Google Maps
        await openDistModal(page);
        await page.click('#dist-action-directions');

        await expect.poll(() => events.map(e => e.type)).toEqual(['fiche_ouverte', 'itineraire']);
        const device = await page.evaluate(() => localStorage.getItem('snackmatch_device'));
        for (const e of events) {
            expect(e).toMatchObject({ distributorId: firstId, source: 'organic', device });
            expect(Object.keys(e.raw).sort()).toEqual(['p_device_hash', 'p_distributor_id', 'p_source', 'p_type']);
        }
    });

    test('le passage en mode edition ne recompte pas la fiche', async ({ page }) => {
        const events = await captureEvents(page);
        await openDistModal(page);
        await page.evaluate(() => window.openDistributorModal(window.AppState.distributors[0].id, true, true));
        await page.waitForTimeout(300);
        expect(events.filter(e => e.type === 'fiche_ouverte')).toHaveLength(1);
    });

    test('signal retenu (inserted > 0) -> un seul signal_envoye par fiche ; RPC de mesure en erreur -> aucun toast', async ({ page }) => {
        const events = await captureEvents(page, 503);
        await page.route(RPC_ROUTE, route => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ inserted: 1, skipped: 0, source: 'anon' })
        }));
        await routeSignals(page);
        await openSignalableFiche(page);
        await signalFirstProduct(page, 'available');
        await expect(page.locator('#toast-container .toast.success')).toContainText('Merci');
        // Un 2e signal sur la meme fiche (la machine) : le KPI compte une contribution
        await page.click('#dist-machine-choices .machine-choice[data-machine="working"]');
        await page.waitForTimeout(400);
        await expect.poll(() => events.map(e => e.type)).toEqual(['fiche_ouverte', 'signal_envoye']);
        expect(await page.$('#toast-container .toast.error')).toBeNull();
    });
});

test.describe('18. Tableau de bord du pilote', () => {
    test('Compte -> rangee "Tableau de bord du pilote" -> chiffres, seuil, listes ; retour vers Compte ; aucun debordement en 390 px', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await routeKpi(page, kpiFixture());
        await page.evaluate(() => window.switchView('account'));
        await page.waitForSelector('#account-view.view-active', { timeout: 3000 });
        await page.click('#account-stats-row');
        await page.waitForSelector('#stats-view.view-active', { timeout: 3000 });

        await expect(page.locator('#stats-coverage-24h')).toHaveText('70 %');
        await expect(page.locator('#stats-coverage-detail')).toHaveText('21 machines sur 30');
        await expect(page.locator('#stats-coverage-threshold')).toHaveClass(/is-ok/);
        await expect(page.locator('#stats-coverage-threshold')).toContainText('83 %');
        await expect(page.locator('#stats-contrib-rate')).toHaveText('25 %');
        await expect(page.locator('#stats-qr-share')).toHaveText('22 %');
        await expect(page.locator('#stats-signals-30j')).toHaveText('3320');
        await expect(page.locator('#stats-routes-30j')).toHaveText('85');
        await expect(page.locator('#stats-daily .stats-row')).toHaveCount(7);
        await expect(page.locator('#stats-daily .stats-row-value').first()).toHaveText('120');
        await expect(page.locator('#stats-top .stats-row')).toHaveCount(5);
        await expect(page.locator('#stats-top .stats-row').first()).toContainText('Machine 0');
        await expect(page.locator('#stats-empty')).toBeHidden();
await expect(page.locator('#stats-demo-note')).toBeHidden();   // sans machines_demo (migration 010 absente) : rien

        const overflow = await page.evaluate(() => ({
            doc: document.documentElement.scrollWidth,
            view: document.getElementById('stats-view').scrollWidth
        }));
        expect(overflow.doc).toBeLessThanOrEqual(390);
        expect(overflow.view).toBeLessThanOrEqual(390);

        await page.click('#back-from-stats');
        await page.waitForSelector('#account-view.view-active', { timeout: 3000 });
        expect(await page.$('#stats-view.view-active')).toBeNull();
    });

    test('aucune donnee -> etat vide explicite, pas de cartes', async ({ page }) => {
        await routeKpi(page, {});
        await page.evaluate(() => window.switchView('stats'));
        await page.waitForSelector('#stats-view.view-active', { timeout: 3000 });
        await expect(page.locator('#stats-empty')).toContainText('Pas encore de données');
        await expect(page.locator('#stats-content')).toBeHidden();
    });
});
