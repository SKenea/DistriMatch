/**
 * DistriMatch - Tests fonctionnels : Accessibilite : modales, cibles tactiles, toasts, lisibilite
 *
 * User stories couvertes : audit UX-01 / UX-07 / UX-08 / UX-10, WCAG 2.4.3, 2.5.5, 1.4.3.
 * Serveur simule la ou il le faut (voir helpers.js). Lancer : npm run test:functional
 */
import { test, expect } from '@playwright/test';
import { setupApp, RPC_ROUTE, openSignalableFiche, signalFirstProduct, routeSignals, minutesAgoIso, collectSmallTargets, toastGeometry, collectTextIssues } from './helpers.js';

test.beforeEach(async ({ page, context }) => {
    await setupApp(page, context);
});

// ============================================
// 11. ACCESSIBILITE DES MODALES (focus-trap, WCAG 2.4.3 / 2.1.2)
// ============================================

test.describe('11. Accessibilite modales (focus-trap)', () => {
    test('dist-modal : role dialog + aria-labelledby + focus piege + Echap ferme + focus rendu', async ({ page }) => {
        // Focaliser un declencheur connu (bouton recherche) pour verifier le
        // retour du focus a la fermeture.
        await page.evaluate(() => document.getElementById('search-toggle').focus());

        await page.evaluate(() => {
            const d = window.AppState.distributors[0];
            window.openDistributorModal(d.id);
        });
        await page.waitForSelector('#dist-modal-overlay.active', { timeout: 5000 });

        // Semantique dialog
        const dialog = page.locator('#dist-modal');
        await expect(dialog).toHaveAttribute('role', 'dialog');
        await expect(dialog).toHaveAttribute('aria-modal', 'true');
        await expect(dialog).toHaveAttribute('aria-labelledby', 'dist-modal-name');
        // Le titre reference existe et n'est pas vide
        const titleText = await page.textContent('#dist-modal-name');
        expect((titleText || '').trim().length).toBeGreaterThan(0);

        // Le focus est passe DANS la modale
        const focusInside = await page.evaluate(() =>
            document.getElementById('dist-modal').contains(document.activeElement));
        expect(focusInside).toBe(true);

        // Echap ferme la modale...
        await page.keyboard.press('Escape');
        await expect(page.locator('#dist-modal-overlay')).not.toHaveClass(/active/);

        // ...et rend le focus au declencheur d'origine
        const backId = await page.evaluate(() => document.activeElement?.id);
        expect(backId).toBe('search-toggle');
    });
});

test.describe('14. Cibles tactiles >= 44 px', () => {
    test('aucun element interactif visible sous 44x44 (zone etendue comprise) sur les ecrans principaux, en 390 px', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(300);
        const violations = [];

        violations.push(...await collectSmallTargets(page, 'carte'));

        await page.click('.filter-chip[data-type="pizza"]');
        await page.waitForSelector('.side-panel.open');
        for (const h of await page.$$('#side-panel-list .side-panel-group-header')) await h.click();
        violations.push(...await collectSmallTargets(page, 'side-panel'));

        await openSignalableFiche(page);
        violations.push(...await collectSmallTargets(page, 'fiche'));
        await page.locator('#dist-products-list button.product-row-main').first().click();
        violations.push(...await collectSmallTargets(page, 'il-reste-quoi'));
        violations.push(...await collectSmallTargets(page, 'etat-machine'));
        await page.click('#dist-modal-close');


        for (const view of ['account', 'notifications', 'profile']) {
            await page.evaluate((v) => window.switchView(v), view);
            violations.push(...await collectSmallTargets(page, view));
        }
        await page.evaluate(() => window.switchView('account'));
        await page.click('#account-notif-settings');
        violations.push(...await collectSmallTargets(page, 'reglages-notifs'));

        await page.click('.bottom-nav [data-tab="favorites"]');
        violations.push(...await collectSmallTargets(page, 'favoris'));
        await page.click('.bottom-nav [data-tab="activity"]');
        violations.push(...await collectSmallTargets(page, 'activite'));

        expect(violations, `cibles < 44px :\n${violations.join('\n')}`).toEqual([]);
    });

    test('la zone etendue est reellement cliquable : un point 4 px au-dessus d\'un chip de filtre l\'atteint', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(300);
        const hit = await page.evaluate(() => {
            const chip = document.querySelector('.filter-chip[data-type="pizza"]');
            const r = chip.getBoundingClientRect();
            const el = document.elementFromPoint(r.left + r.width / 2, r.top - 4);
            return el === chip || chip.contains(el);
        });
        expect(hit).toBe(true);
    });
});

test.describe('19. Toasts visibles', () => {
    test('apres un signal envoye, le toast est au-dessus de la fiche (elementFromPoint)', async ({ page }) => {
        await page.route(RPC_ROUTE, route => route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({ inserted: 1, skipped: 0, source: 'anon' })
        }));
        await routeSignals(page);
        await openSignalableFiche(page);
        await signalFirstProduct(page, 'available');
        await expect(page.locator('#toast-container .toast.success')).toBeVisible();
        const g = await toastGeometry(page);
        expect(g.onTop).toBe(true);
    });

    test('sur la carte en 390 px, le toast reste au-dessus de la bottom nav et dans l\'ecran', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(300);
        await page.evaluate(async () => { const u = await import('./js/utils.js'); u.showToast('Toast de test, un peu long pour verifier la largeur en mobile', 'success'); });
        await expect(page.locator('#toast-container .toast')).toBeVisible();
        await page.waitForTimeout(400);   // fin de l'animation toastIn (translateY 20px -> 0)
        const g = await toastGeometry(page);
        expect(g.navVisible).toBe(true);
        expect(g.bottom).toBeLessThanOrEqual(g.navTop);
        expect(g.right).toBeLessThanOrEqual(g.vw);
        expect(g.onTop).toBe(true);
    });

    test('en desktop aussi, le toast ne recouvre pas la pilule de navigation', async ({ page }) => {
        await page.evaluate(async () => { const u = await import('./js/utils.js'); u.showToast('Toast de test', 'default'); });
        await expect(page.locator('#toast-container .toast')).toBeVisible();
        await page.waitForTimeout(400);   // fin de l'animation toastIn (translateY 20px -> 0)
        const g = await toastGeometry(page);
        if (g.navVisible) expect(g.bottom).toBeLessThanOrEqual(g.navTop);
    });
});

test.describe('21. Lisibilite mobile (polices, contrastes)', () => {
    test('carte, panneau, fiche et signal sur l\u2019aliment / la machine : aucun texte < 12 px ni sous 4,5:1 en 390 px', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await routeSignals(page, {
            status: [{ distributor_id: 'x', state: 'empty', source: 'anon', weight: 0.5, created_at: minutesAgoIso(20), age_seconds: 1200 }]
        });
        const issues = [];
        issues.push(...await collectTextIssues(page, 'carte'));
        await page.click('.filter-chip[data-type="all"]');
        issues.push(...await collectTextIssues(page, 'panneau'));
        await page.click('#side-panel-close');
        await openSignalableFiche(page);
        await page.waitForTimeout(800);
        issues.push(...await collectTextIssues(page, 'fiche'));
        await page.locator('#dist-products-list button.product-row-main').first().click();
        issues.push(...await collectTextIssues(page, 'signal-aliment'));
        issues.push(...await collectTextIssues(page, 'signal-machine'));
        expect(issues, issues.join('\n')).toEqual([]);
    });
});
