/**
 * DistriMatch - Tests fonctionnels : Favoris et centre de notifications
 *
 * User stories couvertes : US-4a (chat inactif, favoris qui notifient), EPIC-T1 T1-US4 (notification fiable), suivre un produit.
 * Serveur simule la ou il le faut (voir helpers.js). Lancer : npm run test:functional
 */
import { test, expect } from '@playwright/test';
import { setupApp, loginForTest, RPC_ROUTE } from './helpers.js';

test.beforeEach(async ({ page, context }) => {
    await setupApp(page, context);
});

// ============================================
// 5ter. CENTRE DE NOTIFICATIONS (cloche)
// ============================================

test.describe('5ter. Centre de notifications', () => {
    test('la cloche ouvre la vue notifications (empty state)', async ({ page }) => {
        await page.click('.nav-icon-btn[data-view="notifications"]');
        await page.waitForSelector('#notifications-view.view-active', { timeout: 3000 });
        const r = await page.evaluate(() => ({
            emptyVisible: getComputedStyle(document.getElementById('notifications-empty')).display !== 'none',
            clearHidden: getComputedStyle(document.getElementById('clear-notifications')).display === 'none',
        }));
        expect(r.emptyVisible).toBe(true);
        expect(r.clearHidden).toBe(true); // pas de "Tout effacer" si vide
    });

    test('la cloche n\'affiche plus le compteur favoris', async ({ page }) => {
        // Ajouter un favori ne doit PAS faire apparaitre le badge de la cloche
        await page.evaluate(() => {
            const id = window.AppState.distributors[0].id;
            window.AppState.subscriptions = [id];
        });
        const r = await page.evaluate(() => ({
            hasOldBadge: !!document.getElementById('subscriptions-badge'),
            notifBadgeDisplay: getComputedStyle(document.getElementById('notifications-badge')).display,
        }));
        expect(r.hasOldBadge).toBe(false);            // plus de badge favoris sur la cloche
        expect(r.notifBadgeDisplay).toBe('none');     // pas de notif -> badge cache
    });

    test('reglages : bouton/etat permission navigateur present', async ({ page }) => {
        const r = await page.evaluate(() => ({
            stateEl: !!document.getElementById('notif-permission-state'),
            btnEl: !!document.getElementById('notif-permission-btn'),
        }));
        expect(r.stateEl).toBe(true);
        expect(r.btnEl).toBe(true);
    });
});

// ============================================
// 6. CHAT INACTIF, FAVORIS QUI NOTIFIENT
// ============================================

test.describe('6. Chat inactif, favoris qui notifient', () => {
    // Decision produit 2026-09-20 : le chatbot par distributeur est inactif
    // (FEATURES.chat = false, code conserve). Tout ce qui menait au chat mene a la fiche.
    test('openConversation n\'ouvre rien, et un favori ne cree aucune conversation', async ({ page }) => {
        const id = await page.evaluate(() => window.AppState.distributors[0].id);
        await page.evaluate((distId) => window.openConversation(distId), id);
        await page.evaluate((distId) => window.toggleSubscription(distId), id);
        await page.waitForTimeout(300);

        const r = await page.evaluate(() => ({
            chatActive: document.getElementById('chat-modal').classList.contains('active'),
            chatInert: document.getElementById('chat-modal').hasAttribute('inert'),
            conversations: JSON.parse(localStorage.getItem('snackmatch_conversations') || '{}')
        }));
        expect(r.chatActive).toBe(false);
        expect(r.chatInert).toBe(true);
        expect(r.conversations.list || []).toEqual([]);
        expect(Object.keys(r.conversations.history || {})).toEqual([]);
    });

    test('la fiche en mode edition ne propose plus « Discuter »', async ({ page }) => {
        await page.evaluate(() => window.openDistributorModal(window.AppState.distributors[0].id, true, true));
        await page.waitForSelector('#dist-modal-overlay.active');
        await expect(page.locator('#dist-chat-section')).toBeHidden();
    });

    test('un resultat de recherche ouvre la fiche, pas le chat', async ({ page }) => {
        const name = await page.evaluate(() => window.AppState.distributors[0].name);
        await page.click('#search-toggle');
        await page.fill('#quick-search', name);
        await page.locator('#search-results .search-item-clean').first().click();
        await page.waitForSelector('#dist-modal-overlay.active', { timeout: 5000 });
        await expect(page.locator('#dist-modal-name')).toHaveText(name);
        await expect(page.locator('#chat-modal')).not.toHaveClass(/active/);
    });

    // Un favori notifie quand sa machine change : vues distributor_status /
    // product_availability (migration 007) interceptees, aucun appel reel.
    test('machine en favori signalee vide : cloche a 1, ligne dans le centre, clic = fiche', async ({ page, context }) => {
        const signals = { status: [], products: [] };
        await page.route(url => url.pathname.endsWith('/rest/v1/distributor_status'), route =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(signals.status) }));
        await page.route(url => url.pathname.endsWith('/rest/v1/product_availability'), route =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(signals.products) }));

        // Heures calmes coupees : le test doit passer aussi la nuit
        await page.evaluate(() => localStorage.setItem('snackmatch_notification_prefs', JSON.stringify({
            enabled: true, quietHours: { enabled: false, start: 22, end: 8 }
        })));
        await setupApp(page, context);

        const dist = await page.evaluate(() => {
            const d = window.AppState.distributors[0];
            return { id: d.id, name: d.name };
        });

        // 1er passage, a l'abonnement : on memorise, on ne notifie pas
        await page.evaluate((id) => window.toggleSubscription(id), dist.id);
        await expect.poll(() => page.evaluate((id) => {
            const prefs = JSON.parse(localStorage.getItem('snackmatch_notification_prefs') || '{}');
            return !!(prefs.lastSeenSignals && prefs.lastSeenSignals[id]);
        }, dist.id)).toBe(true);
        await expect(page.locator('#notifications-badge')).toBeHidden();

        // Quelqu'un signale la machine vide ; l'app le voit au retour sur l'onglet
        signals.status = [{
            distributor_id: dist.id, state: 'empty', source: 'anon', weight: 0.5,
            created_at: new Date(Date.now() - 40 * 60000).toISOString(), age_seconds: 2400
        }];
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await expect(page.locator('#notifications-badge')).toHaveText('1');

        // Le bandeau in-app mene a la fiche
        const banner = page.locator('.notification-banner');
        await expect(banner).toContainText(`${dist.name} a été signalée vide`);
        await banner.locator('.notif-action').click();
        await page.waitForSelector('#dist-modal-overlay.active');
        await expect(page.locator('#dist-modal-name')).toHaveText(dist.name);
        await page.click('#dist-modal-close');

        // Le centre de notifications garde la trace, datee du signal
        await page.click('.nav-icon-btn[data-view="notifications"]');
        await page.waitForSelector('#notifications-view.view-active');
        const row = page.locator('#notifications-list .notif-item-open');
        await expect(row).toHaveCount(1);
        await expect(row).toContainText('Machine signalée vide');
        await expect(row).toContainText(`${dist.name} a été signalée vide`);
        await expect(row).toContainText('il y a 40 min');

        await row.click();
        await page.waitForSelector('#dist-modal-overlay.active');
        await expect(page.locator('#dist-modal-name')).toHaveText(dist.name);

        // Rien de plus au passage suivant (meme signal)
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await page.waitForTimeout(500);
        const count = await page.evaluate(() =>
            JSON.parse(localStorage.getItem('snackmatch_notification_queue')).history.length);
        expect(count).toBe(1);
    });
});

// Retour terrain 2026-09-25 (T1-US4) : une notification, une seule fois, et la
// suppression retire la ligne choisie. Vues interceptees, aucun appel reel.
test.describe('6bis. Centre de notifications fiable', () => {
    async function setupSignals(page, context) {
        const signals = { status: [] };
        await page.route(url => url.pathname.endsWith('/rest/v1/distributor_status'), route =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(signals.status) }));
        await page.route(url => url.pathname.endsWith('/rest/v1/product_availability'), route =>
            route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
        await page.evaluate(() => localStorage.setItem('snackmatch_notification_prefs', JSON.stringify({
            enabled: true, quietHours: { enabled: false, start: 22, end: 8 }
        })));
        await setupApp(page, context);
        return signals;
    }
    const historyLength = (page) => page.evaluate(() =>
        (JSON.parse(localStorage.getItem('snackmatch_notification_queue') || '{"history":[]}').history || []).length);
    const statusRow = (id, state, minutesAgo) => ({
        distributor_id: id, state, source: 'anon', weight: 0.5,
        created_at: new Date(Date.now() - minutesAgo * 60000).toISOString(), age_seconds: minutesAgo * 60
    });

    test('mon propre signal sur un favori ne me notifie pas', async ({ page, context }) => {
        const signals = await setupSignals(page, context);
        // La RPC "enregistre" le signal : la vue renvoie desormais ce signal
        await page.route(RPC_ROUTE, route => {
            const body = route.request().postDataJSON();
            signals.status = [statusRow(body.p_distributor_id, body.p_machine_state, 0)];
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ inserted: 1, skipped: 0, source: 'anon' }) });
        });
        const id = await page.evaluate(() => window.AppState.distributors[0].id);
        await page.evaluate((distId) => window.toggleSubscription(distId), id);
        await expect.poll(() => page.evaluate((distId) =>
            !!JSON.parse(localStorage.getItem('snackmatch_notification_prefs')).lastSeenSignals?.[distId], id)).toBe(true);

        await loginForTest(page);
        await page.evaluate((distId) => window.openDistributorModal(distId), id);
        await page.click('#dist-machine-choices .machine-choice[data-machine="empty"]');
        await expect(page.locator('#dist-hero-kpi')).toHaveText('Vide');

        await page.waitForTimeout(500);
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await page.waitForTimeout(800);
        expect(await historyLength(page)).toBe(0);
        await expect(page.locator('#notifications-badge')).toBeHidden();
    });

    test('page Notifications ouverte : la liste suit les arrivees et la suppression retire la bonne ligne', async ({ page, context }) => {
        const signals = await setupSignals(page, context);
        const [a, b] = await page.evaluate(() => window.AppState.distributors.slice(0, 2).map(d => ({ id: d.id, name: d.name })));
        await page.evaluate(([x, y]) => { window.toggleSubscription(x); window.toggleSubscription(y); }, [a.id, b.id]);
        await expect.poll(() => page.evaluate((ids) => {
            const seen = JSON.parse(localStorage.getItem('snackmatch_notification_prefs')).lastSeenSignals || {};
            return ids.every(i => !!seen[i]);
        }, [a.id, b.id])).toBe(true);

        await page.click('.nav-icon-btn[data-view="notifications"]');
        await page.waitForSelector('#notifications-view.view-active');

        // Machine A signalee vide pendant que la page est ouverte
        signals.status = [statusRow(a.id, 'empty', 20)];
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        const rows = page.locator('#notifications-list .notif-item');
        await expect(rows).toHaveCount(1);
        await expect(rows.first()).toContainText(a.name);

        // Puis machine B en panne : elle arrive en tete, sans recharger la page
        signals.status = [statusRow(a.id, 'empty', 20), statusRow(b.id, 'broken', 2)];
        await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await expect(rows).toHaveCount(2);
        await expect(rows.first()).toContainText(b.name);

        // Supprimer la ligne de A (la 2e affichee) retire bien A, pas B
        await rows.nth(1).locator('.notif-item-delete').click();
        await expect(rows).toHaveCount(1);
        await expect(rows.first()).toContainText(b.name);
        const kept = await page.evaluate(() =>
            JSON.parse(localStorage.getItem('snackmatch_notification_queue')).history.map(n => n.distributorId));
        expect(kept).toEqual([b.id]);
    });
});

// ============================================
// 12. SUIVRE UN PRODUIT (modale maison, Lot 2.2)
// ============================================

test.describe('12. Suivre un produit (modale)', () => {
    test('ouvre une modale maison (pas de prompt natif), focus au champ, valide et enregistre', async ({ page }) => {
        // Si un prompt() natif etait encore utilise, Playwright recevrait un
        // evenement "dialog" : on echoue alors explicitement.
        let nativeDialog = false;
        page.on('dialog', async (d) => { nativeDialog = true; await d.dismiss().catch(() => {}); });

        await page.evaluate(() => window.promptAddProductFollow());

        const modal = page.locator('#product-follow-modal');
        await expect(modal).toHaveClass(/active/);
        await expect(modal).toHaveAttribute('role', 'dialog');

        // Le focus est sur le champ (autofocus respecte par le focus-trap)
        const focusOnInput = await page.evaluate(() => document.activeElement?.id === 'product-follow-input');
        expect(focusOnInput).toBe(true);

        await page.fill('#product-follow-input', 'Pizza Test E2E');
        await page.click('#product-follow-form button[type="submit"]');

        // Modale fermee + produit persiste en localStorage (normalise en minuscules)
        await expect(modal).not.toHaveClass(/active/);
        const stored = await page.evaluate(() => localStorage.getItem('snackmatch_notification_prefs'));
        expect(stored).toContain('pizza test e2e');

        expect(nativeDialog).toBe(false);
    });

    test('Echap ferme la modale sans rien enregistrer', async ({ page }) => {
        await page.evaluate(() => window.promptAddProductFollow());
        await expect(page.locator('#product-follow-modal')).toHaveClass(/active/);
        await page.fill('#product-follow-input', 'Ne Doit Pas Etre Suivi');
        await page.keyboard.press('Escape');
        await expect(page.locator('#product-follow-modal')).not.toHaveClass(/active/);
        const stored = await page.evaluate(() => localStorage.getItem('snackmatch_notification_prefs') || '');
        expect(stored.toLowerCase()).not.toContain('ne doit pas etre suivi');
    });
});
