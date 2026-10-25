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

    test('UC2 / UC3 : sans compte, rien a modifier ni Photo ; connecte, tout apparait sans recharger', async ({ page }) => {
        await openDistModal(page);
        await expect(page.locator('#dist-action-edit')).toHaveCount(0);   // EPIC-T12 : plus de bouton « Modifier »
        await expect(page.locator('#dist-products-list .product-status-btn:not([data-guest])')).toHaveCount(0);
        await expect(page.locator('#dist-action-add-photo')).toBeHidden();
        await loginForTest(page);
        await expect(page.locator('#dist-products-list .product-status-btn:not([data-guest])').first()).toBeVisible();
        await expect(page.locator('#dist-action-add-photo')).toBeHidden();   // EPIC-T14 : photos inactives en V1
        await expect(page.locator('#dist-login-invite')).toBeHidden();
        // Deconnexion : retour a la lecture seule
        await page.evaluate(() => window.__testLogout());
        await expect(page.locator('#dist-products-list .product-status-btn:not([data-guest])')).toHaveCount(0);
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

// ============================================
// RETOUR SUR LA FICHE APRES CONNEXION (2026-10-17)
// ============================================

test.describe('Connexion depuis une fiche', () => {
    test('le lien de connexion retient la fiche ouverte ; au retour, la fiche se rouvre', async ({ page, context }) => {
        await page.route('**/auth/v1/otp**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
        await page.evaluate(() => window.openDistributorModal('dist-007'));
        await page.waitForSelector('#dist-modal-overlay.active');
        await page.evaluate(async () => { await (await import('./js/auth.js')).sendMagicLink('test@exemple.fr', 'jeton'); });
        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('distrimatch_login_return') || 'null'));
        expect(saved?.id).toBe('dist-007');

        // Le lien ouvre l'adresse de base du site (comme Supabase) : la fiche revient
        const back = await context.newPage();
        await back.goto('http://localhost:8080/');
        await back.waitForSelector('#dist-modal-overlay.active', { timeout: 30000 });
        await expect(back.locator('#dist-modal-name')).toHaveText('Légumes Bio Cambo');
        expect(await back.evaluate(() => localStorage.getItem('distrimatch_login_return'))).toBeNull();
    });

    test('sans fiche ouverte, rien n est retenu', async ({ page }) => {
        await page.route('**/auth/v1/otp**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
        await page.evaluate(() => localStorage.setItem('distrimatch_login_return', JSON.stringify({ id: 'ancien', at: Date.now() })));
        await page.evaluate(async () => { await (await import('./js/auth.js')).sendMagicLink('test@exemple.fr', 'jeton'); });
        expect(await page.evaluate(() => localStorage.getItem('distrimatch_login_return'))).toBeNull();
    });
});

test.describe('Connexion depuis une fiche, par le menu du profil', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test('la fiche se ferme en touchant le menu, mais le lien ramene quand meme sur elle', async ({ page, context }) => {
        await page.route('**/auth/v1/otp**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
        await page.evaluate(() => window.openDistributorModal('dist-005'));
        await page.waitForSelector('#dist-modal-overlay.active');
        await page.waitForTimeout(400);
        await page.click('#profile-avatar-btn');
        await expect(page.locator('#dist-modal-overlay')).not.toHaveClass(/active/);
        await page.evaluate(async () => { await (await import('./js/auth.js')).sendMagicLink('test@exemple.fr', 'jeton'); });
        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('distrimatch_login_return') || 'null'));
        expect(saved?.id).toBe('dist-005');
        const back = await context.newPage();
        await back.goto('http://localhost:8080/');
        await back.waitForSelector('#dist-modal-overlay.active', { timeout: 30000 });
        await expect(back.locator('#dist-modal-name')).toHaveText('Plats Cuisinés Bayonne');
    });
});

// ============================================
// CONNEXION PAR CODE RECU PAR E-MAIL (BUG-05)
// ============================================

// Fausse session au format Supabase (jeton en-tete.charge.signature). Les appels que l'app
// fera ensuite au vrai serveur avec ce jeton seront refuses : sans effet sur ces tests.
function fakeSession(email) {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const user = {
        id: '00000000-0000-0000-0000-0000000b0505', aud: 'authenticated', role: 'authenticated',
        email, is_anonymous: false, app_metadata: { provider: 'email' }, user_metadata: {},
        created_at: new Date().toISOString()
    };
    return {
        access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, email, role: 'authenticated', aud: 'authenticated', exp })}.signature`,
        token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'faux-refresh', user
    };
}

// Fiche dist-007 ouverte, fenetre de connexion ouverte par requireAuth() (resultat dans window.__authOk)
async function openLoginOnFiche(page) {
    await page.route('**/auth/v1/otp**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.evaluate(() => localStorage.setItem('distrimatch_force_auth', '1'));
    await page.evaluate(() => window.openDistributorModal('dist-007'));
    await page.waitForSelector('#dist-modal-overlay.active');
    await page.evaluate(() => {
        import('./js/auth.js').then(m => m.requireAuth()).then(ok => { window.__authOk = ok; });
    });
    await page.waitForSelector('.auth-modal-overlay');
    await expect(page.locator('#auth-modal-code')).toBeHidden();
}

async function sendEmail(page) {
    await page.fill('.auth-modal-form input[type=email]', 'test@exemple.fr');
    await page.locator('.auth-modal-form:not(.auth-modal-otp) .auth-modal-submit').click();
    await expect(page.locator('#auth-modal-code')).toBeVisible();
}

async function isLoggedIn(page) {
    return page.evaluate(async () => (await import('./js/auth.js')).isAuthenticated());
}

test.describe('Connexion par code reçu par e-mail (BUG-05)', () => {
    test('code juste : connecté, fenêtre fermée, fiche toujours ouverte', async ({ page }) => {
        let body = null;
        await page.route('**/auth/v1/verify**', async route => {
            body = route.request().postDataJSON();
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeSession('test@exemple.fr')) });
        });
        await page.route('**/auth/v1/user**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeSession('test@exemple.fr').user) }));
        await openLoginOnFiche(page);
        await sendEmail(page);
        await expect(page.locator('.auth-modal-status')).toContainText('entre ici le code reçu');
        await expect(page.locator('#auth-modal-code')).toHaveAttribute('inputmode', 'numeric');
        await expect(page.locator('#auth-modal-code')).toHaveAttribute('autocomplete', 'one-time-code');

        await page.fill('#auth-modal-code', '123 456');
        await page.click('.auth-modal-code-submit');
        await expect(page.locator('.auth-modal-overlay')).toHaveCount(0, { timeout: 5000 });
        expect(body).toMatchObject({ email: 'test@exemple.fr', token: '123456', type: 'email' });
        expect(await isLoggedIn(page)).toBe(true);
        await page.waitForFunction(() => window.__authOk === true, null, { timeout: 3000 });
        await expect(page.locator('#dist-modal-overlay')).toHaveClass(/active/);
        expect(await page.evaluate(() => window.AppState.currentDistributor?.id)).toBe('dist-007');
        expect(await page.evaluate(() => localStorage.getItem('distrimatch_login_return'))).toBeNull();
    });

    test('code faux ou mal saisi : message en français, fenêtre ouverte, pas connecté', async ({ page }) => {
        let calls = 0;
        await page.route('**/auth/v1/verify**', route => {
            calls += 1;
            return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' }) });
        });
        await openLoginOnFiche(page);
        await sendEmail(page);

        await page.fill('#auth-modal-code', '12ab');
        await page.click('.auth-modal-code-submit');
        await expect(page.locator('.auth-modal-status')).toContainText('Entre les chiffres du code');
        expect(calls).toBe(0);

        await page.fill('#auth-modal-code', '000000');
        await page.click('.auth-modal-code-submit');
        await expect(page.locator('.auth-modal-status')).toContainText('Code incorrect ou expiré');
        expect(calls).toBe(1);
        await expect(page.locator('.auth-modal-overlay')).toHaveCount(1);
        await expect(page.locator('.auth-modal-code-submit')).toBeEnabled();
        expect(await isLoggedIn(page)).toBe(false);
    });

    test('app de l’écran d’accueil : le code est mis en avant', async ({ page }) => {
        await page.evaluate(() => Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => true }));
        await openLoginOnFiche(page);
        await expect(page.locator('.auth-modal-form:not(.auth-modal-otp) .auth-modal-submit')).toHaveText('Recevoir le code');
        await sendEmail(page);
        await expect(page.locator('.auth-modal-status')).toContainText('Entre ici le code reçu par e-mail');
        await expect(page.locator('.auth-modal-status')).not.toContainText('Ouvre le lien');
        await expect(page.locator('#auth-modal-code')).toBeFocused();
    });
});
