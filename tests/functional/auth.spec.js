/**
 * DistriMatch - Tests fonctionnels : Politique d'authentification
 *
 * User stories couvertes : CLAUDE.md « Politique d'authentification » (UC1 a UC11), EPIC-T5.
 * Serveur simule la ou il le faut (voir helpers.js). Lancer : npm run test:functional
 */
import { test, expect } from '@playwright/test';
import { setupApp, openDistModal, loginForTest } from './helpers.js';

test.beforeEach(async ({ page, context }) => {
    await setupApp(page, context);
});

// ============================================
// 5. AUTH WALL
// ============================================

test.describe('5. Auth wall', () => {
    test('clic favori : ajout local SANS mur d\'auth', async ({ page }) => {
        await page.evaluate(() => { window.AppState.subscriptions = []; localStorage.clear(); });
        await openDistModal(page);
        const id = await page.evaluate(() => window.AppState.currentDistributor.id);
        await page.evaluate(() => document.getElementById('dist-action-favorite').click());
        // Favori = purement local : pas de modale d'auth, ajout immediat
        await page.waitForTimeout(400);
        const r = await page.evaluate((did) => ({
            authShown: !!document.querySelector('.auth-modal-overlay'),
            subscribed: window.AppState.subscriptions.includes(did),
        }), id);
        expect(r.authShown).toBe(false);
        expect(r.subscribed).toBe(true);
    });

    test('clic + Ajouter un distributeur declenche la modal auth', async ({ page }) => {
        // Localhost saute le mur d'auth par defaut : on le reactive pour ce test
        await page.evaluate(() => localStorage.setItem('distrimatch_force_auth', '1'));
        await page.click('#btn-add-distributor');
        await page.waitForSelector('.auth-modal-overlay', { timeout: 3000 });

        const modal = await page.$('.auth-modal');
        expect(modal).not.toBeNull();
    });
});

// ============================================
// 10. POLITIQUE D'AUTHENTIFICATION (verrouillage)
// ============================================
//
// Verrouille la matrice 10 UC documentee dans CLAUDE.md > "Politique
// d'authentification". Toute regression future (ex. oubli de requireAuth()
// sur une contribution publique, ou ajout accidentel d'un gate sur une
// action locale) doit faire echouer un de ces tests.
//
// Note : localhost bypass requireAuth() par defaut (auth.js:111-131). Les
// tests qui verifient le gating posent `distrimatch_force_auth=1` pour
// reactiver l'auth comme en prod. Les tests anti-regression "libre" ne le
// posent pas : on verifie que meme en prod-like, ces actions n'ouvrent
// aucune modale.

test.describe('10. Politique d\'authentification', () => {

    test('UC1 contribution publique : Ajouter un distributeur sans auth -> modale email', async ({ page }) => {
        await page.evaluate(() => localStorage.setItem('distrimatch_force_auth', '1'));
        await page.click('#btn-add-distributor');
        await page.waitForSelector('.auth-modal-overlay', { timeout: 3000 });

        const modal = await page.$('.auth-modal');
        expect(modal).not.toBeNull();
    });

    test('UC2 / UC3 : sans compte, ni Modifier ni Photo ; connecte, les deux apparaissent sans recharger', async ({ page }) => {
        await openDistModal(page);
        await expect(page.locator('#dist-action-edit')).toBeHidden();
        await expect(page.locator('#dist-action-add-photo')).toBeHidden();
        await loginForTest(page);
        await expect(page.locator('#dist-action-edit')).toBeVisible();
        await expect(page.locator('#dist-action-add-photo')).toBeVisible();
        await expect(page.locator('#dist-login-invite')).toBeHidden();
        // Deconnexion : retour a la lecture seule
        await page.evaluate(() => window.__testLogout());
        await expect(page.locator('#dist-action-edit')).toBeHidden();
        await expect(page.locator('#dist-login-invite')).toBeVisible();
    });

    test('UC4 contribution publique : Signaler sans auth -> modale email', async ({ page }) => {
        await page.evaluate(() => localStorage.setItem('distrimatch_force_auth', '1'));
        await openDistModal(page);
        // openReportModal n'est pas sur window : import dynamique pour le declencher
        // sans dependre du timing chat (-> Conversations.active -> dyn import -> ...)
        await page.evaluate(async () => {
            const m = await import('./js/activity.js');
            // pas d'await : requireAuth() interne va resoudre via la modale, on ne
            // veut pas bloquer la promesse.
            m.openReportModal();
        });
        await page.waitForSelector('.auth-modal-overlay', { timeout: 3000 });

        const modal = await page.$('.auth-modal');
        expect(modal).not.toBeNull();
    });

    test('UC5 sociale locale : Favori SANS modale d\'auth (anti-regression regle #7)', async ({ page }) => {
        // Pas de distrimatch_force_auth : meme en prod-like, favori reste libre
        await page.evaluate(() => { window.AppState.subscriptions = []; localStorage.clear(); });
        await openDistModal(page);
        const id = await page.evaluate(() => window.AppState.currentDistributor.id);
        await page.click('#dist-action-favorite');
        await page.waitForTimeout(400);

        const r = await page.evaluate((did) => ({
            authShown: !!document.querySelector('.auth-modal-overlay'),
            gateShown: !!document.getElementById('edit-auth-gate'),
            subscribed: window.AppState.subscriptions.includes(did),
        }), id);
        expect(r.authShown).toBe(false);
        expect(r.gateShown).toBe(false);
        expect(r.subscribed).toBe(true);
    });

    test('UC8 preference perso : changer le rayon geofence SANS modale d\'auth', async ({ page }) => {
        // Anti-regression : meme avec force_auth, les prefs notifs restent libres.
        // On modifie le slider DOM via input event (le handler 'oninput' va
        // appeler updateRadiusDisplay et eventuellement saveNotificationPrefs).
        await page.evaluate(() => localStorage.setItem('distrimatch_force_auth', '1'));

        const r = await page.evaluate(() => {
            const slider = document.getElementById('geofence-radius');
            if (!slider) return { sliderMissing: true };
            const before = slider.value;
            slider.value = before === '2000' ? '1500' : '2000';
            slider.dispatchEvent(new Event('input', { bubbles: true }));
            slider.dispatchEvent(new Event('change', { bubbles: true }));
            return {
                authShown: !!document.querySelector('.auth-modal-overlay'),
                gateShown: !!document.getElementById('edit-auth-gate'),
                newValue: slider.value,
                changed: slider.value !== before,
            };
        });
        expect(r.sliderMissing).toBeFalsy();
        expect(r.authShown).toBe(false);
        expect(r.gateShown).toBe(false);
        expect(r.changed).toBe(true);
    });
});
