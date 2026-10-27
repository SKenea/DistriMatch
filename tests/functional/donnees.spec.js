/**
 * DistriMatch - Tests fonctionnels : Donnees et mesure : dedoublonnage, confirmations, mesure du pilote, tableau de bord
 *
 * User stories couvertes : Lot 4 (mesure 008, tableau de bord), confirmation maison, dedup.
 * Serveur simule la ou il le faut (voir helpers.js). Lancer : npm run test:functional
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, captureEvents, setupApp, openDistModal, loginForTest, RPC_ROUTE, openSignalableFiche, signalFirstProduct, chooseMachineState, routeSignals, routeEditWrites, kpiFixture, routeKpi, passWelcome } from './helpers.js';

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

        // BUG-14 : toutes les donnees de la personne sur cet appareil (inventaire : docs/stories/BUG-14.md)
        const USER_KEYS = [
            'snackmatch_user', 'snackmatch_profile', 'snackmatch_conversations', 'snackmatch_notification_prefs',
            'snackmatch_notification_queue', 'snackmatch_user_distributors', 'snackmatch_device',
            'distrimatch_push_asked', 'distrimatch_home_screen_seen', 'distrimatch_login_return', 'distrimatch_edit_hint_seen', 'distrimatch_geo_ok'
        ];
        const before = await page.evaluate(async (keys) => {
            for (const k of keys) localStorage.setItem(k, JSON.stringify({ marker: 'e2e-confirm' }));
            // snackmatch_user_distributors est une liste : un tableau valide (un objet ferait planter updateBadges)
            localStorage.setItem('snackmatch_user_distributors', JSON.stringify([{ id: 'user-e2e-confirm', name: 'Fiche locale e2e', type: 'other', emoji: '🏪', lat: 43.49, lng: -1.47, products: [] }]));
            localStorage.setItem('distrimatch_force_auth', '0');
            const base = window.AppState.distributors[0];
            window.AppState.distributors.push({ ...base, id: 'user-bug14-local', name: 'Local BUG-14', isLocalOnly: true, products: [] });
            const { mainMap } = await import('./js/state.js');
            window.switchView('account');
            return { zoom: mainMap.getZoom(), center: mainMap.getCenter() };
        }, USER_KEYS);
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
        await expect(page.locator('#toast-container .toast.success')).toContainText('Données effacées');

        const after = await page.evaluate(async (keys) => {
            const { mainMap } = await import('./js/state.js');
            return {
                left: keys.filter(k => localStorage.getItem(k) !== null),
                forceAuth: localStorage.getItem('distrimatch_force_auth'),
                localStill: window.AppState.distributors.some(d => d.id === 'user-bug14-local'),
                zoom: mainMap.getZoom(),
                center: mainMap.getCenter()
            };
        }, USER_KEYS);
        expect(after.left).toEqual([]);
        expect(after.forceAuth).toBe('0');
        expect(after.localStill).toBe(false);
        expect(after.zoom).toBe(before.zoom);
        expect(after.center.lat).toBeCloseTo(before.center.lat, 4);
        expect(after.center.lng).toBeCloseTo(before.center.lng, 4);
        expect(nativeDialog).toBe(false);
    });

    // EPIC-T12 : retirer un produit ne passe plus par une confirmation, mais par « Annuler »
    test('Retirer un produit : pas de fenetre de confirmation, un toast « Annuler » qui le rétablit', async ({ page }) => {
        await routeSignals(page);
        await routeEditWrites(page);
        await loginForTest(page);
        await page.evaluate(() => {
            const ok = (p) => p && Number.isInteger(Number(p.id));
            const d = window.AppState.distributors.find(x => !x.isLocalOnly && (x.products || []).some(ok));
            window.openDistributorModal(d.id);
        });
        await page.waitForSelector('#dist-modal-overlay.active');
        const before = await page.evaluate(() => window.AppState.currentDistributor.products.length);
        const row = page.locator('#dist-products-list .product-row[data-editable]').first();
        await row.locator('.product-status-btn').click();
        await row.locator('.product-menu-action[data-action="remove"]').click();
        await expect(page.locator('#confirm-modal')).not.toHaveClass(/active/);
        await expect(page.locator('#toast-container .toast-action')).toContainText('retiré');
        expect(await page.evaluate(() => window.AppState.currentDistributor.products.length)).toBe(before - 1);
        await page.click('#toast-container .toast-action-btn');
        expect(await page.evaluate(() => window.AppState.currentDistributor.products.length)).toBe(before);
        await expect(page.locator('#dist-modal-overlay')).toHaveClass(/active/);
    });
});

// ============================================
// 16. MESURE DU PILOTE (RPC log_event, migration 008)
// ============================================
// setupApp bloque deja la RPC pour tous les tests ; ici captureEvents() la
// remplace (le dernier handler enregistre gagne) pour lire ce qui part.

test.describe('16. Mesure du pilote (log_event)', () => {
    test('fiche_ouverte puis itineraire : un evenement chacun, meme session, source organic, aucun identifiant persistant', async ({ page }) => {
        const events = await captureEvents(page);
        const firstId = await page.evaluate(() => window.AppState.distributors[0].id);
        await page.evaluate(() => { window.open = () => null; });   // pas de vrai onglet Google Maps
        await openDistModal(page);
        await page.click('.dist-tab[data-tab="apropos"]');   // EPIC-T14 : l'itineraire est dans « À propos »
        await page.click('#dist-action-directions');

        await expect.poll(() => events.map(e => e.type)).toEqual(['fiche_ouverte', 'itineraire']);
        // PRIV-05 : identifiant limite a la session (sessionStorage), plus rien en localStorage
        const device = await page.evaluate(() => sessionStorage.getItem('distrimatch_session'));
        expect(device?.length).toBeGreaterThanOrEqual(16);
        expect(await page.evaluate(() => localStorage.getItem('snackmatch_device'))).toBeNull();
        for (const e of events) {
            expect(e).toMatchObject({ distributorId: firstId, source: 'organic', device });
            expect(Object.keys(e.raw).sort()).toEqual(['p_device_hash', 'p_distributor_id', 'p_source', 'p_type']);
        }
    });

    // PRIV-05 : l'ancien identifiant d'appareil persistant ne reste pas sur le telephone
    test('l’ancien identifiant d’appareil (snackmatch_device) est efface a l’ouverture', async ({ page }) => {
        await page.evaluate(() => localStorage.setItem('snackmatch_device', 'ancien-appareil-0123456789'));
        await page.reload();
        await expect.poll(() => page.evaluate(() => localStorage.getItem('snackmatch_device')), { timeout: 15000 }).toBeNull();
    });

    // EPIC-T12 : modifier la fiche (renommer...) la re-rend sans la rouvrir : pas recomptee
    test('modifier la fiche au toucher ne recompte pas son ouverture', async ({ page }) => {
        const events = await captureEvents(page);
        await routeSignals(page);
        await routeEditWrites(page);
        await openSignalableFiche(page);
        await page.locator('#dist-products-list .product-status-btn:not([data-guest])').first().click();
        await page.locator('#dist-products-list .product-choices:not([hidden]) .product-menu-action[data-action="rename"]').click();
        await page.locator('.product-name-input').fill('Nom de mesure');
        await page.keyboard.press('Enter');
        await expect(page.locator('#dist-products-list .product-name-clean', { hasText: 'Nom de mesure' })).toHaveCount(1);
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
        await chooseMachineState(page, 'working');
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

// ============================================
// AJOUT ANNULE ET DEMARRAGE ROBUSTE (BUG-02)
// ============================================

test.describe('Ajout annulé et démarrage robuste (BUG-02)', () => {
    test('annuler pendant la vérification de position n\'enregistre rien', async ({ page }) => {
        const NAME = 'ZZ-BUG02-ANNULE-' + Date.now();
        // Aucune ecriture reelle : l'envoi a la base est intercepte et refuse
        const writes = await routeEditWrites(page, { fail: { method: 'POST', table: 'distributors', status: 401, code: '42501' } });
        await loginForTest(page);

        // Emplacement libre (aucun distributeur a moins de 60 m) pres du centre de la carte
        const spot = await page.evaluate(async () => {
            const { mainMap } = await import('./js/state.js');
            const { calculateDistance } = await import('./js/utils.js');
            const c = mainMap.getCenter();
            for (let k = 0; k < 50; k++) {
                const lat = c.lat + k * 0.001;
                const free = window.AppState.distributors.every((d) => !(calculateDistance(lat, c.lng, Number(d.lat), Number(d.lng)) * 1000 < 60));
                if (free) return { lat, lng: c.lng };
            }
            return null;
        });
        expect(spot).not.toBeNull();

        // GPS de verification (haute precision, maximumAge 0) mis en attente : le test decide quand il repond
        await page.evaluate(() => {
            window.__gpsWaiting = [];
            const real = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
            navigator.geolocation.getCurrentPosition = function (ok, err, opts) {
                if (opts && opts.enableHighAccuracy && opts.maximumAge === 0) { window.__gpsWaiting.push(ok); return; }
                return real(ok, err, opts);
            };
        });

        await page.click('#btn-add-distributor');
        await page.waitForSelector('#placement-hint.visible', { timeout: 3000 });
        await page.evaluate(async (s) => {
            const { mainMap } = await import('./js/state.js');
            mainMap.fire('click', { latlng: L.latLng(s.lat, s.lng) });
        }, spot);
        await page.waitForSelector('.add-distributor-popup', { timeout: 3000 });
        await page.fill('#new-dist-name', NAME);
        await page.click('#btn-confirm-add');
        await page.waitForFunction(() => window.__gpsWaiting.length > 0, null, { timeout: 3000 });

        // Pendant la verification : « Annuler »
        await page.click('.add-distributor-popup .btn-cancel');
        await expect(page.locator('.add-distributor-popup')).toHaveCount(0);

        // Le GPS repond ensuite : sur place
        await page.evaluate((s) => {
            window.__gpsWaiting.splice(0).forEach((ok) => ok({ coords: { latitude: s.lat, longitude: s.lng, accuracy: 5 }, timestamp: Date.now() }));
        }, spot);
        await page.waitForFunction(() => window.AddMode.submitting === false, null, { timeout: 5000 });

        expect(writes.filter((w) => w.table === 'distributors')).toHaveLength(0);
        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('snackmatch_user_distributors') || '[]'));
        expect(saved.filter((d) => d.name === NAME)).toHaveLength(0);
        expect(await page.evaluate((n) => window.AppState.distributors.some((d) => d.name === n), NAME)).toBe(false);
    });

    test('une fiche locale sans position ne bloque pas le démarrage et est retirée', async ({ page }) => {
        await page.evaluate(() => {
            const base = { type: 'other', emoji: '📦', address: '', city: 'Test', rating: 0,
                reviewCount: 0, status: 'verified', priceRange: '€', products: [], isUserAdded: true };
            localStorage.setItem('snackmatch_user_distributors', JSON.stringify([
                { ...base, id: 'user-bug02-null', name: 'ZZ-BUG02-SANS-POSITION', lat: null, lng: null },
                { ...base, id: 'user-bug02-ok', name: 'ZZ-BUG02-OK', lat: 43.4931, lng: -1.4752 }
            ]));
        });
        await page.reload();
        await passWelcome(page);

        // Le chargeur disparait (avant le correctif : il restait affiche, initMainMap levait)
        await page.waitForFunction(() => {
            const l = document.getElementById('map-loader');
            return !l || l.classList.contains('hidden');
        }, null, { timeout: 20000 });
        // Les boutons repondent
        await page.click('.bottom-nav [data-tab="favorites"]');
        await page.waitForSelector('#subscriptions-view.view-active', { timeout: 3000 });

        const ids = await page.evaluate(() => window.AppState.distributors.map((d) => d.id));
        expect(ids).not.toContain('user-bug02-null');
        expect(ids).toContain('user-bug02-ok');
        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('snackmatch_user_distributors') || '[]').map((d) => d.id));
        expect(saved).toEqual(['user-bug02-ok']);
    });
});

// ============================================
// 19. DEUX ONGLETS OUVERTS (BUG-13)
// ============================================
// L'evenement storage n'est envoye qu'aux AUTRES pages : deux pages du meme contexte
// (meme localStorage). La page 1 est celle du beforeEach.

test.describe('19. Deux onglets ouverts (BUG-13)', () => {
    test('un favori ajoute dans l autre onglet est connu ici sans recharger, et une action ici ne l efface pas', async ({ page, context }) => {
        const [idA, idB] = await page.evaluate(() => window.AppState.distributors.slice(0, 2).map(d => d.id));
        // Page 2 : un produit suivi est deja enregistre quand elle demarre (ecrit avant son chargement)
        const page2 = await context.newPage();
        await page2.goto(`${BASE_URL}/manifest.json`);
        await page2.evaluate(() => localStorage.setItem('snackmatch_notification_prefs', JSON.stringify({ followedProducts: ['pain'] })));
        await setupApp(page2, context);
        await page2.evaluate((id) => window.toggleSubscription(id), idA);

        // Page 1 : connait le favori sans recharger
        await expect.poll(() => page.evaluate((id) => window.AppState.subscriptions.includes(id), idA), { timeout: 5000 }).toBe(true);
        await expect(page.locator('#favorites-badge')).toHaveText('1');

        // Page 1 : deux actions qui sauvegardent depuis sa memoire
        await page.evaluate(() => window.unfollowProduct('autre'));
        await page.evaluate((id) => window.toggleSubscription(id), idB);

        const stored = await page.evaluate(() => ({
            subscriptions: JSON.parse(localStorage.getItem('snackmatch_user')).subscriptions,
            followed: JSON.parse(localStorage.getItem('snackmatch_notification_prefs')).followedProducts
        }));
        expect(stored.subscriptions).toEqual(expect.arrayContaining([idA, idB]));
        expect(stored.followed).toEqual(['pain']);
        await page2.close();
    });

    test('« Effacer mes données » dans l autre onglet vide aussi les favoris ici', async ({ page, context }) => {
        const [idA, idB] = await page.evaluate(() => window.AppState.distributors.slice(0, 2).map(d => d.id));
        await page.evaluate((id) => window.toggleSubscription(id), idA);

        const page2 = await context.newPage();
        await setupApp(page2, context);
        await page2.evaluate(() => window.switchView('account'));
        await page2.waitForSelector('#account-view.view-active');
        await page2.click('#clear-data-btn');
        await page2.click('#confirm-ok');
        await expect(page2.locator('#toast-container .toast.success')).toContainText('Données effacées');

        await expect.poll(() => page.evaluate(() => window.AppState.subscriptions.length), { timeout: 5000 }).toBe(0);
        await page.evaluate((id) => window.toggleSubscription(id), idB);
        expect(await page.evaluate(() => JSON.parse(localStorage.getItem('snackmatch_user')).subscriptions)).toEqual([idB]);
        await page2.close();
    });
});
