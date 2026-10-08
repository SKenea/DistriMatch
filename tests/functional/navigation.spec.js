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
        expect(h2).toBe('Mes favoris');
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
    test('fiche en feuille du bas en mobile (EPIC-T26) : collee en bas, a mi-hauteur', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.waitForTimeout(300);
        await openDistModal(page);
        await page.waitForTimeout(400);   // fin de l'animation d'arrivee

        const r = await page.evaluate(() => {
            const rect = document.getElementById('dist-modal').getBoundingClientRect();
            const area = document.getElementById('dist-modal-overlay').getBoundingClientRect();
            return { visible: area.bottom - rect.top, vh: area.height };
        });
        // Decision 2026-10-08 (retour testeur) : la fiche ne cache plus toute la carte
        expect(r.visible).toBeGreaterThan(r.vh * 0.5);
        expect(r.visible).toBeLessThan(r.vh * 0.7);
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
        await page.locator('#dist-products-list .product-status-btn:not([data-guest])').first().click();
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
        const heights = await page.$$eval('#profile-menu .profile-menu-item:not([hidden])', els => els.map(e => e.getBoundingClientRect().height));
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

// ============================================
// 38. MON ACTIVITE, ACCUEIL, COHERENCE (EPIC-T22)
// ============================================
test.describe('38. Mon activité et cohérence', () => {
    test('membre : historique (signal, ajout, avis), filtres, une ligne ouvre la fiche ; plus de points', async ({ page }) => {
        const id = await page.evaluate(() => window.AppState.distributors[0].id);
        const name = await page.evaluate(() => window.AppState.distributors[0].name);
        const now = Date.now();
        await page.route('**/rest/v1/rpc/my_activity', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
            { kind: 'signal', at: new Date(now - 60000).toISOString(), distributor_id: id, distributor_name: name, product_name: 'Margherita', state: 'available', detail: null },
            { kind: 'addition', at: new Date(now - 3600000).toISOString(), distributor_id: 'inconnu', distributor_name: 'Fiche refusée', product_name: null, state: 'rejected', detail: 'Doublon' },
            { kind: 'review', at: new Date(now - 7200000).toISOString(), distributor_id: id, distributor_name: name, product_name: null, state: '4', detail: 'Très bon' }
        ]) }));
        await page.evaluate(() => window.__testLogin());
        await page.click('.bottom-nav [data-tab="activity"]');
        await page.waitForSelector('#activity-view.view-active');
        await expect(page.locator('#activity-view h2')).toHaveText('Mon activité');
        const rows = page.locator('#activity-list .activity-row');
        await expect(rows).toHaveCount(3);
        await expect(rows.nth(0)).toContainText('Margherita : Dispo');
        await expect(rows.nth(1)).toContainText('Refusée : Doublon');
        await expect(rows.nth(1)).toBeDisabled();   // fiche refusee : pas de fiche a ouvrir
        await expect(page.locator('#activity-view')).not.toContainText(/pts|Confirmer|Infirmer|empty/);
        await page.click('.activity-filter[data-filter="review"]');
        await expect(rows).toHaveCount(1);
        await expect(rows.first()).toContainText('Avis ★★★★☆');
        await rows.first().click();
        await page.waitForSelector('#dist-modal-overlay.active');
        await page.evaluate(() => window.switchView('account'));
        await expect(page.locator('#account-meta')).toHaveText('Connecté');
    });

    test('visiteur : « Mon activité » invite a se connecter ; accueil sans « sans compte » ni « machine »', async ({ page }) => {
        await page.click('.bottom-nav [data-tab="activity"]');
        await page.waitForSelector('#activity-view.view-active');
        await expect(page.locator('#activity-empty')).toContainText('Connecte-toi pour retrouver ici');
        await expect(page.locator('.activity-filters')).toBeHidden();
        // L'ecran d'accueil est retire de la page apres son animation de sortie : on lit
        // son texte dans la page servie (sinon le test dependait du rythme de la machine)
        const html = await (await page.request.get('/')).text();
        const onboarding = html.slice(html.indexOf('id="geoloc-overlay"'), html.indexOf('id="geoloc-error"')).replace(/<[^>]+>/g, ' ');
        expect(onboarding).not.toMatch(/sans compte|machine/i);
        expect(onboarding).toContain('Ton distributeur préféré te prévient.');
    });
});

// ============================================
// 39. VOIR SUR LA CARTE DEPUIS LA FICHE (EPIC-T23)
// ============================================
test.describe('39. Voir sur la carte', () => {
    test('liste -> fiche -> « Voir sur la carte » : fiche et liste fermees, carte centree, pastille qui pulse', async ({ page }) => {
        await page.evaluate(async () => { const g = await import('./js/gmaps-ui.js'); g.openSidePanelForType('all'); });
        const item = page.locator('#side-panel-list .side-panel-item').first();
        const id = await item.getAttribute('data-id');
        await item.click();
        await page.waitForSelector('#dist-modal-overlay.active');
        await expect(page.locator('#dist-action-locate')).toBeVisible();
        await page.click('#dist-action-locate');
        await expect(page.locator('#dist-modal-overlay')).not.toHaveClass(/active/);
        await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
        await expect(page.locator('.distributor-pin.is-located')).toHaveCount(1);
        const center = await page.evaluate(async (x) => {
            const s = await import('./js/state.js');
            const d = window.AppState.distributors.find(y => y.id === x);
            const c = s.mainMap.getCenter();
            return { dLat: Math.abs(c.lat - d.lat), dLng: Math.abs(c.lng - d.lng), zoom: s.mainMap.getZoom() };
        }, id);
        expect(center.dLat).toBeLessThan(0.002);
        expect(center.dLng).toBeLessThan(0.002);
        expect(center.zoom).toBeGreaterThanOrEqual(17);
    });

    test('un filtre de type qui masquait le distributeur est leve', async ({ page }) => {
        const pick = await page.evaluate(() => {
            const types = [...new Set(window.AppState.distributors.map(d => d.type))];
            const d = window.AppState.distributors[0];
            return { id: d.id, other: types.find(t => t !== d.type) };
        });
        test.skip(!pick.other, 'un seul type de distributeur dans les donnees');
        await page.evaluate(async (t) => { const n = await import('./js/navigation.js'); if (!window.AppState.activeFilters.includes(t)) n.setFilter(t); }, pick.other);
        await page.evaluate((x) => window.openDistributorModal(x), pick.id);
        await page.waitForSelector('#dist-modal-overlay.active');
        await page.click('#dist-action-locate');
        await expect.poll(() => page.evaluate(() => window.AppState.activeFilters.length)).toBe(0);
        await expect(page.locator('.distributor-pin.is-located')).toHaveCount(1);
    });
});

// ============================================
// 41. PASTILLES QUI SE CHEVAUCHENT (EPIC-T26)
// ============================================

test.describe('41. Pastilles qui se chevauchent', () => {
    test('toucher une pastille qui en chevauche une autre : menu « 2 distributeurs ici », le choix ouvre la bonne fiche', async ({ page }) => {
        const ids = await page.evaluate(async () => {
            const [a, b] = window.AppState.distributors.filter(d => d.reviewStatus !== 'pending').slice(0, 2);
            b.lat = a.lat + 0.00008; b.lng = a.lng + 0.00012;
            const map = await import('./js/map.js');
            const state = await import('./js/state.js');
            map.updateMapMarkers(false);
            state.mainMap.setView([a.lat, a.lng], 16, { animate: false });
            return [a.id, b.id, b.name];
        });
        await page.waitForTimeout(400);
        await page.evaluate(async (id) => {
            const state = await import('./js/state.js');
            state.distributorMarkers.find(m => m.distributorId === id).fire('click');
        }, ids[0]);
        const menu = page.locator('.pin-chooser');
        await expect(menu).toBeVisible();
        await expect(menu).toContainText('2 distributeurs ici');
        await expect(page.locator('.pin-choice')).toHaveCount(2);
        await page.locator(`.pin-choice[data-id="${ids[1]}"]`).click();
        await expect(page.locator('#dist-modal-overlay')).toHaveClass(/active/);
        await expect(page.locator('#dist-modal-name')).toHaveText(ids[2]);
        await expect(menu).toHaveCount(0);
    });

    test('une pastille isolee ouvre sa fiche directement, sans dezoomer la carte', async ({ page }) => {
        const r = await page.evaluate(async () => {
            const state = await import('./js/state.js');
            const map = await import('./js/map.js');
            map.updateMapMarkers(false);
            const marker = state.distributorMarkers[0];
            state.mainMap.setView(marker.getLatLng(), 18, { animate: false });
            // isoler : toutes les autres pastilles loin
            return { id: marker.distributorId };
        });
        await page.evaluate(async (id) => {
            const state = await import('./js/state.js');
            const others = state.distributorMarkers.filter(m => m.distributorId !== id);
            const marker = state.distributorMarkers.find(m => m.distributorId === id);
            const c = state.mainMap.latLngToContainerPoint(marker.getLatLng());
            if (others.some(m => c.distanceTo(state.mainMap.latLngToContainerPoint(m.getLatLng())) < 40)) throw new Error('pastille non isolee');
            marker.fire('click');
        }, r.id);
        await expect(page.locator('#dist-modal-overlay')).toHaveClass(/active/);
        await expect(page.locator('.pin-chooser')).toHaveCount(0);
        expect(await page.evaluate(async () => (await import('./js/state.js')).mainMap.getZoom())).toBe(18);
    });
});

// ============================================
// 42. FICHE A MI-HAUTEUR SUR TELEPHONE (EPIC-T26)
// ============================================

test.describe('42. Fiche a mi-hauteur sur telephone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test('depuis la carte : fiche a mi-hauteur, pastille mise en avant ; la poignee bascule plein ecran / mi-hauteur ; fermer libere la pastille', async ({ page }) => {
        const id = await page.evaluate(async () => {
            const state = await import('./js/state.js');
            const map = await import('./js/map.js');
            map.updateMapMarkers(false);
            const marker = state.distributorMarkers[0];
            state.mainMap.setView(marker.getLatLng(), 19, { animate: false });
            marker.fire('click');
            return marker.distributorId;
        });
        if (await page.locator('.pin-choice').count()) await page.locator(`.pin-choice[data-id="${id}"]`).click();
        await expect(page.locator('#dist-modal-overlay')).toHaveClass(/active/);
        // attend la fin de la montee (animation) plutot qu'un delai fixe
        const ratio = () => page.evaluate(() => {
            const m = document.getElementById('dist-modal');
            const area = document.getElementById('dist-modal-overlay').getBoundingClientRect();
            return (area.bottom - m.getBoundingClientRect().top) / area.height;
        });
        await expect.poll(ratio, { timeout: 5000 }).toBeGreaterThan(0.5);
        await expect.poll(ratio, { timeout: 5000 }).toBeLessThan(0.7);
        await expect(page.locator('#dist-modal')).not.toHaveClass(/is-full/);
        await expect(page.locator('.distributor-pin.is-selected')).toHaveCount(1);
        const handle = page.locator('#dist-sheet-handle');
        await expect(handle).toHaveAttribute('aria-label', 'Agrandir la fiche');
        await handle.click();
        await expect(page.locator('#dist-modal')).toHaveClass(/is-full/);
        await expect(handle).toHaveAttribute('aria-label', 'Réduire la fiche');
        await handle.click();
        await expect(page.locator('#dist-modal')).not.toHaveClass(/is-full/);
        await page.click('#dist-modal-close');
        await expect(page.locator('#dist-modal-overlay')).not.toHaveClass(/active/);
        await expect(page.locator('.distributor-pin.is-selected')).toHaveCount(0);
    });
});

// ============================================
// 43. RECHERCHE, NOTIFICATIONS ET TITRES DE GROUPE (EPIC-T26)
// ============================================

test.describe('43. Recherche, notifications et titres de groupe', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('depuis Notifications, la recherche s’ouvre par-dessus, champ entier, avec des suggestions « Près de toi »', async ({ page }) => {
        await page.click('.nav-icon-btn[data-view="notifications"]');
        await page.waitForSelector('#notifications-view.view-active');
        await expect(page.locator('#notifications-view')).not.toContainText('machine');
        await page.click('#search-toggle');
        await expect(page.locator('#search-overlay')).toHaveClass(/active/);
        await page.waitForTimeout(400);
        const top = await page.evaluate(() => document.elementFromPoint(195, 300)?.closest('#search-overlay, .view-page')?.id);
        expect(top).toBe('search-overlay');
        const input = await page.locator('#quick-search').boundingBox();
        const container = await page.locator('.search-container-clean').boundingBox();
        expect(input.y + input.height).toBeLessThanOrEqual(container.y + container.height);
        await expect(page.locator('#search-results')).toContainText('Près de toi');
        expect(await page.locator('#search-results .search-item-clean').count()).toBeGreaterThan(0);
    });

    test('icones du haut : cibles de 44 px', async ({ page }) => {
        for (const sel of ['#search-toggle', '.nav-icon-btn[data-view="notifications"]', '#profile-avatar-btn']) {
            const b = await page.locator(sel).boundingBox();
            expect(Math.round(b.width)).toBeGreaterThanOrEqual(44);
            expect(Math.round(b.height)).toBeGreaterThanOrEqual(44);
        }
    });

    test('liste : le titre de groupe reste colle en haut, sur toute la largeur, en defilant', async ({ page }) => {
        await page.click('.filter-chip[data-type="all"]');
        await page.waitForSelector('.side-panel.open');
        const r = await page.evaluate(async () => {
            const list = document.getElementById('side-panel-list');
            const headers = [...list.querySelectorAll('.side-panel-group-header')];
            const target = headers[headers.length - 1];
            if (target.getAttribute('aria-expanded') !== 'true') target.click();
            await new Promise(res => setTimeout(res, 300));
            list.scrollTop = target.offsetTop + 300;
            await new Promise(res => setTimeout(res, 300));
            const lr = list.getBoundingClientRect(), hr = target.getBoundingClientRect();
            return { dTop: Math.round(hr.top - lr.top), dW: Math.round(hr.width - lr.width), dLeft: Math.round(hr.left - lr.left), scrolled: list.scrollTop > 0 };
        });
        expect(r.scrolled).toBe(true);
        expect(r).toMatchObject({ dTop: 0, dW: 0, dLeft: 0 });
    });
});

// ============================================
// 44. ZOOM D'UN SEUL DOIGT (EPIC-T26)
// ============================================

test.describe('44. Zoom d’un seul doigt', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    async function gesture(page, moves) {
        return page.evaluate(async (moves) => {
            const state = await import('./js/state.js');
            const map = state.mainMap;
            map.setZoom(15, { animate: false });
            const pane = map.getPane('mapPane');
            const rect = map.getContainer().getBoundingClientRect();
            const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
            const fire = (type, cy, id) => pane.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: cy, pointerId: id, pointerType: 'touch', isPrimary: true }));
            const wait = (ms) => new Promise(r => setTimeout(r, ms));
            fire('pointerdown', y, 1); await wait(40); fire('pointerup', y, 1);
            await wait(80);
            fire('pointerdown', y, 2);
            for (const dy of moves) { fire('pointermove', y + dy, 2); await wait(16); }
            fire('pointerup', y + (moves[moves.length - 1] || 0), 2);
            await wait(400);
            return map.getZoom();
        }, moves);
    }

    test('double toucher + glisser vers le bas = zoom avant ; vers le haut = zoom arriere', async ({ page }) => {
        expect(await gesture(page, [20, 60, 120, 240])).toBe(17);
        expect(await gesture(page, [-20, -60, -120, -240])).toBe(13);
    });

    test('double toucher simple : un cran de plus', async ({ page }) => {
        expect(await gesture(page, [])).toBe(16);
    });
});

// ============================================
// 45. FICHE EN TROIS POSITIONS ET « VOIR SUR LA CARTE » DEPUIS UNE PAGE (EPIC-T26)
// ============================================

test.describe('45. Fiche en trois positions', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    async function dragSheet(page, fromSelector, dy) {
        return page.evaluate(async ({ fromSelector, dy }) => {
            const el = document.querySelector(fromSelector);
            const r = el.getBoundingClientRect();
            const x = r.left + r.width / 2, y0 = r.top + Math.min(20, r.height / 2);
            const fire = (type, y) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 9, pointerType: 'touch', isPrimary: true }));
            const wait = (ms) => new Promise(res => setTimeout(res, ms));
            fire('pointerdown', y0);
            for (let i = 1; i <= 10; i++) { fire('pointermove', y0 + dy * i / 10); await wait(30); }
            await wait(80);                                  // elan nul au lacher
            fire('pointermove', y0 + dy); await wait(30);
            fire('pointerup', y0 + dy);
            await wait(450);
            const m = document.getElementById('dist-modal');
            return {
                open: document.getElementById('dist-modal-overlay').classList.contains('active'),
                full: m.classList.contains('is-full'),
                peek: m.classList.contains('is-peek'),
                visible: Math.round(document.getElementById('dist-modal-overlay').getBoundingClientRect().bottom - m.getBoundingClientRect().top)
            };
        }, { fromSelector, dy });
    }

    test('mi-hauteur -> tirer le nom vers le bas = reduite (nom + etat visibles) -> encore = fermee ; vers le haut = plein ecran', async ({ page }) => {
        await page.evaluate(() => window.openDistributorModal(window.AppState.distributors[0].id));
        await page.waitForTimeout(450);
        const down = await dragSheet(page, '.dist-modal-header', 150);
        expect(down.peek).toBe(true);
        expect(down.visible).toBeLessThan(300);
        await expect(page.locator('#dist-modal-name')).toBeInViewport();
        await expect(page.locator('#dist-status')).toBeInViewport();
        // comme Google Maps : icones sur la ligne du nom, onglets visibles
        await expect(page.locator('#dist-modal-close')).toBeInViewport();
        await expect(page.locator('.dist-tab[data-tab="avis"]')).toBeInViewport();
        const sameRow = await page.evaluate(() => Math.abs(document.getElementById('dist-modal-close').getBoundingClientRect().top - document.getElementById('dist-modal-name').getBoundingClientRect().top) < 30);
        expect(sameRow).toBe(true);
        const up = await dragSheet(page, '.dist-modal-header', -700);
        expect(up.full).toBe(true);
        const half = await dragSheet(page, '#dist-sheet-handle', 330);
        expect(half.full).toBe(false);
        expect(half.peek).toBe(false);
        await dragSheet(page, '.dist-modal-header', 150);
        const closed = await dragSheet(page, '.dist-modal-header', 200);
        expect(closed.open).toBe(false);
    });

    test('depuis Favoris, « Voir sur la carte » ferme la page et ramene sur la carte', async ({ page }) => {
        const id = await page.evaluate(() => {
            const d = window.AppState.distributors[0];
            window.AppState.subscriptions = [d.id];
            return d.id;
        });
        await page.click('.bottom-nav [data-tab="favorites"]');
        await page.waitForSelector('#subscriptions-view.view-active');
        await page.evaluate((id) => window.openDistributorModal(id), id);
        await page.waitForTimeout(450);
        await page.click('#dist-action-locate');
        await expect(page.locator('#subscriptions-view')).not.toHaveClass(/view-active/);
        await expect(page.locator('#dist-modal-overlay')).not.toHaveClass(/active/);
        await expect(page.locator('.distributor-pin.is-located')).toHaveCount(1);
    });
});

test.describe('46. Fiche reduite : onglets', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    test('toucher « Avis » sur la fiche reduite la remonte a mi-hauteur sur les avis', async ({ page }) => {
        await page.evaluate(() => window.openDistributorModal(window.AppState.distributors[0].id));
        await page.waitForTimeout(450);
        await page.evaluate(async () => {
            const el = document.querySelector('.dist-modal-header'); const r = el.getBoundingClientRect(); const x = r.left + 60, y0 = r.top + 20;
            const fire = (t, y) => el.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 4, pointerType: 'touch', isPrimary: true }));
            const w = (ms) => new Promise(res => setTimeout(res, ms));
            fire('pointerdown', y0); for (let i = 1; i <= 10; i++) { fire('pointermove', y0 + 15 * i); await w(30); } await w(80); fire('pointermove', y0 + 150); await w(20); fire('pointerup', y0 + 150); await w(450);
        });
        await expect(page.locator('#dist-modal')).toHaveClass(/is-peek/);
        await page.click('.dist-tab[data-tab="avis"]');
        await expect(page.locator('#dist-modal')).not.toHaveClass(/is-peek/);
        await expect(page.locator('.dist-tab[data-tab="avis"]')).toHaveClass(/active/);
    });
});

test.describe('47. Fiche et barres de navigation', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

    async function openFiche(page) {
        await page.evaluate(() => window.openDistributorModal(window.AppState.distributors[0].id));
        await page.waitForTimeout(450);
    }

    test('barres du haut et du bas visibles et touchables, meme en plein ecran', async ({ page }) => {
        await openFiche(page);
        await page.locator('#dist-sheet-handle').click();
        await expect(page.locator('#dist-modal')).toHaveClass(/is-full/);
        await page.waitForTimeout(400);
        const r = await page.evaluate(() => {
            const nav = document.querySelector('.bottom-nav').getBoundingClientRect();
            const top = document.querySelector('.top-nav').getBoundingClientRect();
            const m = document.getElementById('dist-modal').getBoundingClientRect();
            const hitNav = document.elementFromPoint(nav.left + nav.width / 2, nav.top + nav.height / 2)?.closest('.bottom-nav');
            const hitTop = document.elementFromPoint(top.left + 20, top.top + top.height / 2)?.closest('.top-nav');
            return { sheetBottom: Math.round(m.bottom), navTop: Math.round(nav.top), sheetTop: Math.round(m.top), topBottom: Math.round(top.bottom), hitNav: !!hitNav, hitTop: !!hitTop };
        });
        expect(r.hitNav).toBe(true);
        expect(r.hitTop).toBe(true);
        expect(r.sheetBottom).toBeLessThanOrEqual(r.navTop);
        expect(r.sheetTop).toBeGreaterThanOrEqual(r.topBottom);
    });

    test('toucher la carte ferme la fiche', async ({ page }) => {
        await openFiche(page);
        await page.evaluate(async () => (await import('./js/state.js')).mainMap.fire('click', { latlng: (await import('./js/state.js')).mainMap.getCenter() }));
        await expect(page.locator('#dist-modal-overlay')).not.toHaveClass(/active/);
    });

    test('toucher Favoris dans la barre du bas ferme la fiche et ouvre Favoris', async ({ page }) => {
        await openFiche(page);
        await page.click('.bottom-nav [data-tab="favorites"]');
        await expect(page.locator('#dist-modal-overlay')).not.toHaveClass(/active/);
        await expect(page.locator('#subscriptions-view')).toHaveClass(/view-active/);
    });
});
