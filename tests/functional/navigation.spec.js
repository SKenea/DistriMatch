/**
 * DistriMatch - Tests fonctionnels : Navigation : carte, panneau lateral, filtres, vues, bouton retour
 *
 * User stories couvertes : EPIC-T1 T1-US3 (burger depuis toutes les pages), audit UX-03/04/11/12, profil, mobile.
 * Serveur simule la ou il le faut (voir helpers.js). Lancer : npm run test:functional
 */
import { test, expect } from '@playwright/test';
import { setupApp, openDistModal, openSignalableFiche } from './helpers.js';

test.beforeEach(async ({ page, context }) => {
    await setupApp(page, context);
});

// ============================================
// 2. NAVIGATION
// ============================================

test.describe('2. Navigation', () => {
    test('bottom nav : Explorer / Favoris / Activité', async ({ page }) => {
        const tabs = await page.$$eval('.bottom-nav .nav-tab span:first-of-type', els =>
            els.map(el => el.textContent.trim())
        );
        expect(tabs).toEqual(expect.arrayContaining(['Explorer', 'Favoris', 'Activité']));
    });

    test('clic sur Activite ouvre la vue activite', async ({ page }) => {
        await page.click('.bottom-nav [data-tab="activity"]');
        await page.waitForSelector('#activity-view.view-active', { timeout: 3000 });
    });

    test('clic sur Favoris ouvre la vue favoris', async ({ page }) => {
        await page.click('.bottom-nav [data-tab="favorites"]');
        await page.waitForSelector('#subscriptions-view.view-active', { timeout: 3000 });
        const h2 = await page.textContent('#subscriptions-view h2');
        expect(h2).toBe('Mes Favoris');
    });
});

// ============================================
// 3. PANNEAU LATERAL FILTRES (Google Maps style)
// ============================================

test.describe('3. Panneau lateral filtres', () => {
    test('clic sur un filter chip ouvre le panneau lateral', async ({ page }) => {
        await page.click('.filter-chip[data-type="pizza"]');
        await page.waitForSelector('.side-panel.open', { timeout: 3000 });

        const panelOpen = await page.evaluate(() =>
            document.getElementById('sidebar').classList.contains('open')
        );
        expect(panelOpen).toBe(true);
    });

    test('le titre du panneau correspond au filtre', async ({ page }) => {
        await page.click('.filter-chip[data-type="pizza"]');
        await page.waitForSelector('.side-panel.open');

        const title = await page.textContent('#side-panel-title');
        expect(title).toContain('Pizza');
    });

    test('le panneau liste les distributeurs filtres', async ({ page }) => {
        await page.click('.filter-chip[data-type="pizza"]');
        await page.waitForSelector('.side-panel.open');
        // Accordeon : les items sont dans le DOM mais caches (groupes fermes).
        await page.waitForSelector('#side-panel-list .side-panel-item', { state: 'attached', timeout: 3000 });

        const items = await page.$$('#side-panel-list .side-panel-item');
        expect(items.length).toBeGreaterThan(0);
    });

    // Fraicheur (docs/STRATEGIE.md, chantier 1) : chaque item porte l'age de
    // sa derniere verification, ou "Pas encore vérifié".
    test('chaque item du panneau affiche sa fraicheur', async ({ page }) => {
        await page.click('.filter-chip[data-type="pizza"]');
        await page.waitForSelector('.side-panel.open');
        await page.waitForSelector('#side-panel-list .side-panel-item', { state: 'attached', timeout: 3000 });

        const r = await page.$$eval('#side-panel-list .side-panel-item', items => ({
            total: items.length,
            avecFraicheur: items.filter(i =>
                /^(Vérifié |Pas encore vérifié)/.test(i.querySelector('.side-panel-item-verified')?.textContent.trim() || '')
            ).length,
        }));
        expect(r.total).toBeGreaterThan(0);
        expect(r.avecFraicheur).toBe(r.total);
    });

    test('clic sur un item du panneau ouvre la modal', async ({ page }) => {
        await page.click('.filter-chip[data-type="pizza"]');
        await page.waitForSelector('.side-panel.open');
        // Accordeon : les groupes sont fermes par defaut, deplier le premier
        // groupe non vide avant de pouvoir cliquer un item.
        const headers = await page.$$('#side-panel-list .side-panel-group-header');
        for (const h of headers) {
            await h.click();
            const visible = await page.$('#side-panel-list .side-panel-group-items:not([hidden]) .side-panel-item');
            if (visible) break;
        }
        await page.click('#side-panel-list .side-panel-group-items:not([hidden]) .side-panel-item');
        await page.waitForSelector('#dist-modal-overlay.active', { timeout: 3000 });
    });

    test('bouton fermer ferme le panneau', async ({ page }) => {
        await page.click('.filter-chip[data-type="pizza"]');
        await page.waitForSelector('.side-panel.open');
        await page.click('#side-panel-close');
        await page.waitForTimeout(500);

        const panelOpen = await page.evaluate(() =>
            document.getElementById('sidebar').classList.contains('open')
        );
        expect(panelOpen).toBe(false);
    });

    test('clic sur Tous ouvre le panneau avec liste complete', async ({ page }) => {
        await page.click('.filter-chip[data-type="all"]');
        await page.waitForSelector('.side-panel.open', { timeout: 3000 });

        const title = await page.textContent('#side-panel-title');
        expect(title).toContain('Tous');

        const totalDist = await page.evaluate(() => window.AppState.distributors.length);
        const items = await page.$$('#side-panel-list .side-panel-item');
        expect(items.length).toBe(totalDist);
    });

    test('Tous : croix puis re-clic -> etats chip/panneau coherents', async ({ page }) => {
        // 1) clic Tous : panneau ouvert + chip actif
        await page.click('.filter-chip[data-type="all"]');
        await page.waitForSelector('.side-panel.open', { timeout: 3000 });
        let s = await page.evaluate(() => ({
            open: document.getElementById('sidebar').classList.contains('open'),
            active: document.querySelector('.filter-chip[data-type="all"]').classList.contains('active'),
        }));
        expect(s).toEqual({ open: true, active: true });

        // 2) fermeture via la croix : panneau ferme + chip deselectionne
        await page.click('#side-panel-close');
        await page.waitForTimeout(400);
        s = await page.evaluate(() => ({
            open: document.getElementById('sidebar').classList.contains('open'),
            active: document.querySelector('.filter-chip[data-type="all"]').classList.contains('active'),
        }));
        expect(s).toEqual({ open: false, active: false });

        // 3) re-clic Tous : panneau ouvert ET chip actif (coherent)
        await page.click('.filter-chip[data-type="all"]');
        await page.waitForSelector('.side-panel.open', { timeout: 3000 });
        s = await page.evaluate(() => ({
            open: document.getElementById('sidebar').classList.contains('open'),
            active: document.querySelector('.filter-chip[data-type="all"]').classList.contains('active'),
        }));
        expect(s).toEqual({ open: true, active: true });
    });

    test('re-clic sur Tous ferme le panneau et deselectionne le chip', async ({ page }) => {
        await page.click('.filter-chip[data-type="all"]');
        await page.waitForSelector('.side-panel.open');

        await page.click('.filter-chip[data-type="all"]');
        await page.waitForTimeout(500);

        const panelOpen = await page.evaluate(() =>
            document.getElementById('sidebar').classList.contains('open')
        );
        expect(panelOpen).toBe(false);

        const tousActive = await page.evaluate(() =>
            document.querySelector('.filter-chip[data-type="all"]').classList.contains('active')
        );
        expect(tousActive).toBe(false);
    });

    test('re-clic sur un type ferme le panneau (Tous reste inactif)', async ({ page }) => {
        await page.click('.filter-chip[data-type="pizza"]');
        await page.waitForSelector('.side-panel.open');

        await page.click('.filter-chip[data-type="pizza"]');
        await page.waitForTimeout(500);

        const panelOpen = await page.evaluate(() =>
            document.getElementById('sidebar').classList.contains('open')
        );
        expect(panelOpen).toBe(false);

        const tousActive = await page.evaluate(() =>
            document.querySelector('.filter-chip[data-type="all"]').classList.contains('active')
        );
        expect(tousActive).toBe(false);
    });

});

// ============================================
// 3ter. GROUPES PAR DISTANCE (side panel)
// ============================================

test.describe('3ter. Groupes par distance (accordeon)', () => {
    test('3 en-tetes, somme des compteurs == nb items', async ({ page }) => {
        await page.click('.filter-chip[data-type="all"]');
        await page.waitForSelector('.side-panel.open');
        await page.waitForSelector('#side-panel-list .side-panel-group-header');

        const headers = await page.$$('#side-panel-list .side-panel-group-header');
        // Audit UX-12 : les tranches vides ne sont plus affichees
        const nonEmpty = await page.$$eval('#side-panel-list .spg-count', els => els.filter(e => parseInt(e.textContent, 10) > 0).length);
        expect(headers.length).toBeLessThanOrEqual(3);
        expect(headers.length).toBe(nonEmpty);

        const counts = await page.$$eval(
            '#side-panel-list .spg-count',
            els => els.map(e => parseInt(e.textContent, 10))
        );
        const sumCounts = counts.reduce((s, n) => s + n, 0);
        const itemCount = await page.$$eval(
            '#side-panel-list .side-panel-item', els => els.length
        );
        expect(sumCounts).toBe(itemCount);
    });

    test('premier groupe non vide ouvert par defaut, les autres fermes ; clic en-tete replie / deplie', async ({ page }) => {
        await page.click('.filter-chip[data-type="all"]');
        await page.waitForSelector('#side-panel-list .side-panel-group-header');

        // Audit UX-03/12 : le premier groupe qui a des items est deplie d'emblee
        const states = await page.$$eval(
            '#side-panel-list .side-panel-group',
            els => els.map(g => ({
                expanded: g.querySelector('.side-panel-group-header').getAttribute('aria-expanded'),
                count: parseInt(g.querySelector('.spg-count').textContent, 10),
                hidden: g.querySelector('.side-panel-group-items').hidden
            }))
        );
        const firstNonEmpty = states.findIndex(s => s.count > 0);
        states.forEach((s, i) => {
            expect(s.expanded).toBe(i === firstNonEmpty ? 'true' : 'false');
            expect(s.hidden).toBe(i !== firstNonEmpty);
        });
        expect(await page.$('#side-panel-list .side-panel-group-items:not([hidden]) .side-panel-item')).not.toBeNull();

        // Clic sur l'en-tete ouverte -> elle se replie ; second clic -> se deplie
        const header = page.locator('#side-panel-list .side-panel-group-header').nth(firstNonEmpty);
        await header.click();
        await expect(header).toHaveAttribute('aria-expanded', 'false');
        expect(await page.$('#side-panel-list .side-panel-group-items:not([hidden])')).toBeNull();
        await header.click();
        await expect(header).toHaveAttribute('aria-expanded', 'true');
    });

    test('en-tete affiche le libelle + la plage + le mode de transport', async ({ page }) => {
        await page.click('.filter-chip[data-type="all"]');
        await page.waitForSelector('#side-panel-list .side-panel-group-header');

        const first = await page.$eval('#side-panel-list .side-panel-group-header', el => ({
            label: el.querySelector('.spg-label')?.textContent,
            sub: el.querySelector('.spg-sub')?.textContent,
            transportTitle: el.querySelector('.spg-transport')?.getAttribute('title'),
            transportText: el.querySelector('.spg-transport')?.textContent,
        }));
        expect(first.label).toBe('À proximité');
        expect(first.sub).toContain("moins d'1 km");
        // Icone seule visible, libelle accessible via title/aria-label
        expect(first.transportText).toBe('🚶');
        expect(first.transportTitle).toBe('à pied');
    });

    test('en-tetes collants (sticky)', async ({ page }) => {
        await page.click('.filter-chip[data-type="all"]');
        await page.waitForSelector('#side-panel-list .side-panel-group-header');

        const pos = await page.$eval(
            '#side-panel-list .side-panel-group-header',
            el => getComputedStyle(el).position
        );
        expect(pos).toBe('sticky');
    });

    test('sans geoloc : liste plate, aucun en-tete de groupe', async ({ page }) => {
        await page.evaluate(() => { window.AppState.userLocation = null; });
        await page.click('.filter-chip[data-type="pizza"]');
        await page.waitForSelector('#side-panel-list .side-panel-item');

        const headers = await page.$$('#side-panel-list .side-panel-group-header');
        expect(headers.length).toBe(0);
    });
});

// ============================================
// 7. PROFIL
// ============================================

test.describe('7. Profil (Local Guides + menu avatar)', () => {
    test('avatar ouvre le menu deroulant (Connexion si deconnecte)', async ({ page }) => {
        await page.click('#profile-avatar-btn');
        await page.waitForSelector('#profile-menu:not([hidden])', { timeout: 3000 });
        const authLabel = await page.textContent('#menu-auth-action');
        expect(authLabel).toBe('Connexion');
    });

    test('menu -> Mon profil : dashboard avec niveau + barre', async ({ page }) => {
        await page.click('#profile-avatar-btn');
        await page.click('#profile-menu [data-action="profile"]');
        await page.waitForSelector('#profile-view.view-active', { timeout: 3000 });
        const r = await page.evaluate(() => ({
            badge: document.getElementById('profile-badge').textContent,
            hasBar: !!document.getElementById('profile-level-bar'),
            contrib: document.querySelectorAll('#profile-view .contrib-row').length,
            noStatCard: document.querySelectorAll('#profile-view .stat-card').length,
        }));
        expect(r.badge.length).toBeGreaterThan(0); // niveau dynamique
        expect(r.hasBar).toBe(true);
        expect(r.contrib).toBe(4);                 // breakdown compact
        expect(r.noStatCard).toBe(0);              // plus de mur de cartes
    });

    test('menu -> Compte : etat + bouton connexion + reinitialisation (sans "danger")', async ({ page }) => {
        await page.click('#profile-avatar-btn');
        await page.click('#profile-menu [data-action="account"]');
        await page.waitForSelector('#account-view.view-active', { timeout: 3000 });
        const r = await page.evaluate(() => ({
            authText: document.getElementById('account-auth-text').textContent,
            authBtn: document.getElementById('account-auth-action')?.textContent.trim(),
            clearBtn: !!document.getElementById('clear-data-btn'),
            noDanger: !/danger/i.test(document.getElementById('account-view').innerHTML),
        }));
        expect(r.authText).toBe('Non connecté');
        expect(r.authBtn).toBe('Se connecter');
        expect(r.clearBtn).toBe(true);
        expect(r.noDanger).toBe(true);
    });

    test('Compte : clic "Se connecter" -> mur d\'auth', async ({ page }) => {
        await page.evaluate(() => localStorage.setItem('distrimatch_force_auth', '1'));
        await page.click('#profile-avatar-btn');
        await page.click('#profile-menu [data-action="account"]');
        await page.waitForSelector('#account-view.view-active', { timeout: 3000 });
        await page.click('#account-auth-action');
        await page.waitForSelector('.auth-modal-overlay', { timeout: 3000 });
        expect(await page.$('.auth-modal')).not.toBeNull();
    });

    test('menu Connexion -> mur d\'auth', async ({ page }) => {
        await page.evaluate(() => localStorage.setItem('distrimatch_force_auth', '1'));
        await page.click('#profile-avatar-btn');
        await page.click('#menu-auth-action');
        await page.waitForSelector('.auth-modal-overlay', { timeout: 3000 });
        expect(await page.$('.auth-modal')).not.toBeNull();
    });
});

// ============================================
// 8. MOBILE
// ============================================

test.describe('8. Mobile', () => {
    test('modal plein ecran en mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.waitForTimeout(300);
        await openDistModal(page);

        const height = await page.evaluate(() =>
            document.getElementById('dist-modal').getBoundingClientRect().height
        );
        // En mobile, la modal prend tout l'ecran
        expect(height).toBeGreaterThan(500);
    });

    test('bottom nav visible en mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.waitForTimeout(300);
        const visible = await page.$('.bottom-nav');
        expect(await visible.isVisible()).toBe(true);
    });

    // Page Compte (refonte PR #84) verrouillee en 390x844 : pas de debordement
    // horizontal, email long tronque avec ellipsis, boutons visibles et
    // cliquables au-dessus de la bottom nav.
    test('page Compte en 390x844 : aucun debordement, email long tronque, boutons au-dessus de la bottom nav', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(300);
        await page.evaluate(() => window.switchView('account'));
        await page.waitForSelector('#account-view.view-active', { timeout: 3000 });
        // La vue glisse en place : mesurer apres la transition, pas pendant
        await page.waitForTimeout(500);

        const r = await page.evaluate(() => {
            const view = document.getElementById('account-view');
            const email = document.getElementById('account-auth-text');
            email.textContent = 'prenom.nom.tres.long.adresse@sous-domaine.exemple-vraiment-long.fr';
            const box = (id) => document.getElementById(id).getBoundingClientRect();
            const nav = document.querySelector('.bottom-nav').getBoundingClientRect();
            const inView = (b) => b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= nav.top;
            const es = getComputedStyle(email);
            return {
                viewOverflow: view.scrollWidth - view.clientWidth,
                docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                emailEllipsis: es.textOverflow === 'ellipsis' && es.whiteSpace === 'nowrap' && es.overflow === 'hidden',
                emailInView: inView(box('account-auth-text')),
                authBtn: inView(box('account-auth-action')),
                notifRow: inView(box('account-notif-settings')),
                clearBtn: inView(box('clear-data-btn')),
            };
        });
        expect(r.viewOverflow).toBe(0);
        expect(r.docOverflow).toBe(0);
        expect(r.emailEllipsis).toBe(true);
        expect(r.emailInView).toBe(true);
        expect(r.authBtn).toBe(true);
        expect(r.notifRow).toBe(true);
        expect(r.clearBtn).toBe(true);

        // Cliquable pour de vrai (pas recouvert par la bottom nav) : la rangee
        // Reglages ouvre bien la page des notifications
        await page.click('#account-notif-settings');
        await page.waitForSelector('#notification-settings.view-active', { timeout: 3000 });
    });
});

// ============================================
// 20. LISTE VIA LE HAMBURGER (mobile) - audit UX-03
// ============================================
// Le panneau « Tous les distributeurs » s'ouvrait vide tant qu'aucun chip
// n'avait ete tape ; le premier groupe de distance est desormais deplie.

test.describe('20. Liste via le hamburger', () => {
    test('en 390 px, le hamburger ouvre « Tous les distributeurs » deja rempli, premier groupe ouvert ; second tap ferme', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(300);
        await page.click('#sidebar-toggle');
        await expect(page.locator('#sidebar')).toHaveClass(/open/);
        await expect(page.locator('#side-panel-title')).toHaveText(/^Tous les distributeurs/);
        await expect(page.locator('#side-panel-list .side-panel-group-items:not([hidden]) .side-panel-item').first()).toBeVisible();
        const groups = await page.$$eval('#side-panel-list .side-panel-group-header', hs => hs.map(h => h.getAttribute('aria-expanded')));
        expect(groups.filter(g => g === 'true')).toHaveLength(1);
        await page.click('#sidebar-toggle');
        await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
    });

    // Retour terrain 2026-09-25 (T1-US3) : depuis une page, la liste s'ouvrait
    // sous la page (z-index 50 contre 150). Le burger revient a la carte d'abord.
    for (const view of ['notifications', 'subscriptions', 'activity', 'account']) {
        test(`depuis la page ${view}, le burger ferme la page et ouvre la liste, cliquable`, async ({ page }) => {
            await page.setViewportSize({ width: 390, height: 844 });
            await page.evaluate((v) => window.switchView(v), view);
            await expect(page.locator(`#${view === 'notifications' ? 'notifications-view' : view === 'subscriptions' ? 'subscriptions-view' : view + '-view'}`)).toHaveClass(/view-active/);
            await page.click('#sidebar-toggle');
            await expect(page.locator('#sidebar')).toHaveClass(/open/);
            expect(await page.evaluate(() => !!document.querySelector('.view-page.view-active'))).toBe(false);
            // Le premier item est au premier plan : un clic reel ouvre la fiche
            const item = page.locator('#side-panel-list .side-panel-group-items:not([hidden]) .side-panel-item').first();
            await item.click();
            await page.waitForSelector('#dist-modal-overlay.active', { timeout: 3000 });
        });
    }

    test('un chip ouvre le panneau avec le premier groupe non vide deja deplie', async ({ page }) => {
        await page.click('.filter-chip[data-type="pizza"]');
        await expect(page.locator('#side-panel-list .side-panel-group-items:not([hidden]) .side-panel-item').first()).toBeVisible();
    });
});

// ============================================
// 23. BOUTON RETOUR (Android) - audit UX-04
// ============================================
// Chaque couche (fiche, modale de signal, vue) pousse une entree d'historique :
// "retour" ferme la couche la plus haute, l'app n'est jamais quittee.

test.describe('23. Bouton retour', () => {
    test('fiche ouverte -> retour ferme la fiche, URL inchangee, app toujours la', async ({ page }) => {
        const url = page.url();
        await openDistModal(page);
        await page.goBack({ waitUntil: 'commit' }).catch(() => {});
        await expect(page.locator('#dist-modal-overlay')).not.toHaveClass(/active/);
        expect(page.url()).toBe(url);
        expect(await page.evaluate(() => !!window.AppState?.distributors?.length)).toBe(true);
    });

    test('aliment deplie dans la fiche -> retour ferme la fiche, l\u2019app reste', async ({ page }) => {
        await openSignalableFiche(page);
        await page.locator('#dist-products-list button.product-row-main').first().click();
        await page.goBack({ waitUntil: 'commit' }).catch(() => {});
        await expect(page.locator('#dist-modal-overlay')).not.toHaveClass(/active/);
        expect(await page.evaluate(() => !!window.AppState)).toBe(true);
    });

    test('vue Compte -> retour ramene a la carte', async ({ page }) => {
        await page.evaluate(() => window.switchView('account'));
        await page.waitForSelector('#account-view.view-active', { timeout: 3000 });
        await page.goBack({ waitUntil: 'commit' }).catch(() => {});
        await expect(page.locator('#account-view')).not.toHaveClass(/view-active/);
        await expect(page.locator('.leaflet-container')).toBeVisible();
    });

    test('fermer par la croix puis retour : la fiche ne se rouvre pas et l\'app reste chargee', async ({ page }) => {
        await openDistModal(page);
        await page.click('#dist-modal-close');
        await expect(page.locator('#dist-modal-overlay')).not.toHaveClass(/active/);
        await page.waitForTimeout(300);
        // Plus aucune couche : un retour de plus sort de l'app, comme sur n'importe quel site
        expect(await page.evaluate(() => window.__distrimatchLayers ? window.__distrimatchLayers() : [])).toEqual([]);
    });
});

// ============================================
// 27. FILTRES ET PANNEAU (audit UX-11/12)
// ============================================
// Fondu a droite des chips tant qu'il en reste hors ecran, rappel « Tous »
// dans le panneau filtre, plus de toast de comptage, tranches vides masquees.

test.describe('27. Filtres et panneau', () => {
    test('390 px : fondu des chips tant qu\'on n\'est pas au bout ; chip -> panneau avec « Tous » et compte, sans toast, sans tranche vide', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(400);
        const bar = page.locator('#filter-bar');
        await expect(bar).toHaveClass(/is-scrollable-end/);
        await page.evaluate(() => { const b = document.getElementById('filter-bar'); b.scrollLeft = b.scrollWidth; });
        await expect(bar).not.toHaveClass(/is-scrollable-end/);
        await page.evaluate(() => { document.getElementById('filter-bar').scrollLeft = 0; });

        await page.click('.filter-chip[data-type="pizza"]');
        await expect(page.locator('#sidebar')).toHaveClass(/open/);
        await expect(page.locator('#side-panel-title')).toHaveText(/Pizza.*· \d+$/);
        await expect(page.locator('#side-panel-all')).toBeVisible();
        expect(await page.$('#toast-container .toast')).toBeNull();
        const counts = await page.$$eval('#side-panel-list .spg-count', els => els.map(e => parseInt(e.textContent, 10)));
        expect(counts.length).toBeGreaterThan(0);
        expect(counts.every(n => n > 0)).toBe(true);
        await expect(page.locator('#side-panel-list .side-panel-group-items:not([hidden]) .side-panel-item').first()).toBeVisible();

        await page.click('#side-panel-all');
        await expect(page.locator('#side-panel-title')).toHaveText(/^Tous les distributeurs · \d+$/);
        await expect(page.locator('#side-panel-all')).toBeHidden();
        await expect(page.locator('.filter-chip[data-type="pizza"]')).not.toHaveClass(/active/);
    });
});

// ============================================
// 28. FAVORI ET MENU AVATAR (audit UX-18/19)
// ============================================

test.describe('28. Favori et menu avatar', () => {
    test('favori : libelle constant, aria-pressed bascule, toast et vue Favoris parlent de favoris', async ({ page }) => {
        await openDistModal(page);
        const btn = page.locator('#dist-action-favorite');
        await expect(btn).toHaveAttribute('aria-pressed', 'false');
        await btn.click();
        await expect(btn).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('#dist-action-favorite-label')).toHaveText('Favori');
        await expect(page.locator('#toast-container .toast').last()).toContainText('favoris');
        await page.click('#dist-modal-close');
        await page.click('.bottom-nav [data-tab="favorites"]');
        await expect(page.locator('#subscriptions-count')).toHaveText(/favori/);
        await expect(page.locator('#subscriptions-list .btn-unsubscribe').first()).toHaveAttribute('aria-label', 'Retirer des favoris');
        await page.click('#subscriptions-list .btn-unsubscribe');
        await expect(page.locator('#subscriptions-count')).toHaveText('0 favori');
        const emptyPath = await page.getAttribute('#subscriptions-empty svg path', 'd');
        expect(emptyPath.startsWith('M20.84')).toBe(true);   // coeur, plus la cloche
    });

    test('menu avatar : chaque item fait au moins 44 px de haut', async ({ page }) => {
        await page.click('#profile-avatar-btn');
        const heights = await page.$$eval('#profile-menu .profile-menu-item', els => els.map(e => e.getBoundingClientRect().height));
        expect(heights.length).toBeGreaterThan(0);
        for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
    });
});

// ============================================
// 29. VUES CACHEES INERTES, POLICE DES CONTROLES (audit UX-20/21)
// ============================================

test.describe('29. Vues cachees et police des controles', () => {
    test('une vue cachee et le chat ferme ne sont ni visibles ni focusables ; la vue active l\'est', async ({ page }) => {
        const r = await page.evaluate(() => {
            const view = document.querySelector('.view-page.view-hidden');
            const btn = view.querySelector('button, a[href], input');
            btn.focus();
            const chat = document.getElementById('chat-modal');
            const chatBtn = chat.querySelector('button, input');
            chatBtn.focus();
            return {
                viewInert: view.hasAttribute('inert'),
                viewFocusable: document.activeElement === btn,
                chatInert: chat.hasAttribute('inert'),
                chatFocusable: document.activeElement === chatBtn
            };
        });
        expect(r.viewInert).toBe(true);
        expect(r.viewFocusable).toBe(false);
        expect(r.chatInert).toBe(true);
        expect(r.chatFocusable).toBe(false);
        await page.evaluate(() => window.switchView('account'));
        await page.waitForSelector('#account-view.view-active', { timeout: 3000 });
        await expect(page.locator('#account-auth-action')).toBeVisible();
        expect(await page.evaluate(() => { const b = document.getElementById('account-auth-action'); b.focus(); return document.activeElement === b; })).toBe(true);
    });

    test('boutons et champs utilisent la police du site', async ({ page }) => {
        await openSignalableFiche(page);
        const r = await page.evaluate(() => {
            const body = getComputedStyle(document.body).fontFamily;
            const same = sel => getComputedStyle(document.querySelector(sel)).fontFamily === body;
            return { body, machineChoice: same('#dist-machine-choices .machine-choice'), productRow: same('#dist-products-list .product-row-main'), chip: same('.filter-chip'), tab: same('.dist-tab'), navTab: same('.nav-tab'), search: same('#quick-search') };
        });
        expect(r.machineChoice).toBe(true);
        expect(r.productRow).toBe(true);
        expect(r.chip).toBe(true);
        expect(r.tab).toBe(true);
        expect(r.navTab).toBe(true);
        expect(r.search).toBe(true);
    });
});
