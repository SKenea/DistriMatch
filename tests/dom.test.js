/**
 * DistriMatch - Tests DOM avec jsdom
 * Teste les fonctions qui manipulent le DOM
 * Lancer avec : node --test tests/dom.test.js
 */

import { JSDOM } from 'jsdom';
import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

// ============================================
// SETUP JSDOM
// ============================================

const html = `<!DOCTYPE html>
<html><body>
    <div id="toast-container" role="status" aria-live="polite" aria-atomic="true"></div>

    <!-- Modal distributeur Google Maps style -->
    <div id="dist-modal-overlay" class="dist-modal-overlay">
        <div id="dist-modal">
            <button id="dist-modal-close"></button>
            <div id="dist-hero" class="dist-hero is-unknown">
                <img id="dist-hero-photo" hidden>
                <p id="dist-hero-kpi"></p>
            </div>
            <div id="dist-modal-photo" hidden>
                <div id="dist-modal-photos-gallery"></div>
            </div>
            <div class="dist-modal-header">
                <div class="dist-modal-title"><h2 id="dist-modal-name"></h2><span class="demo-tag" id="dist-modal-demo" hidden>Démo</span></div>
                <span id="dist-modal-rating"></span>
                <span id="dist-modal-reviews"></span>
                <span id="dist-modal-type"></span>
            </div>
            <div class="dist-modal-actions">
                <button id="dist-action-directions"></button>
                <button id="dist-action-favorite"><span id="dist-action-favorite-label">Favori</span></button>
                <button id="dist-action-edit" style="display:none"></button>
            </div>
            <button class="dist-tab active" data-tab="produits"></button>
            <button class="dist-tab" data-tab="avis"></button>
            <button class="dist-tab" data-tab="apropos"></button>
            <div class="dist-tab-pane active" data-tab-pane="produits">
                <div id="dist-products-list"></div>
                <div id="dist-products-add-section" style="display:none"></div>
                <div id="dist-chat-section" style="display:none">
                    <button id="dist-open-chat"></button>
                </div>
            </div>
            <div class="dist-tab-pane" data-tab-pane="avis"></div>
            <div class="dist-tab-pane" data-tab-pane="apropos">
                <span id="dist-apropos-address"></span>
                <span id="dist-apropos-distance"></span>
                <div id="dist-apropos-added-row" style="display:none"></div>
                <div id="dist-apropos-demo-row" style="display:none"></div>
            </div>
        </div>
    </div>

    <div id="main-map"></div>
    <div id="products-list"></div>
    <div id="subscriptions-view" class="view-page view-hidden">
        <div id="subscriptions-list"></div>
        <div id="subscriptions-empty" style="display:none"></div>
        <span id="subscriptions-count"></span>
    </div>
    <div id="activity-view" class="view-page view-hidden"></div>
    <div id="profile-view" class="view-page view-hidden">
        <span id="profile-name"></span>
        <span id="profile-badge"></span>
        <span id="profile-points"></span>
        <div id="profile-level-bar"></div>
        <span id="profile-level-label"></span>
        <span id="stat-subscriptions"></span>
        <span id="stat-contrib-distributors"></span>
        <span id="stat-contrib-photos"></span>
        <span id="stat-contrib-reports"></span>
        <div id="profile-preferences-list"></div>
    </div>
    <div id="account-view" class="view-page view-hidden">
        <div class="account-status">
            <span class="auth-indicator" id="auth-indicator"><span id="account-auth-text"></span></span>
            <button id="account-auth-action">Se connecter</button>
        </div>
        <div class="account-reset">
            <h4 class="account-reset-title">Réinitialisation</h4>
            <button id="clear-data-btn">Effacer mes données</button>
        </div>
    </div>
    <div id="stats-view" class="view-page view-hidden">
        <p id="stats-empty" hidden></p>
        <div id="stats-content" hidden>
            <span id="stats-coverage-24h"></span><span id="stats-coverage-detail"></span><span id="stats-demo-note" hidden></span><p id="stats-coverage-threshold"></p>
            <div id="stats-contrib-cell" class="stats-cell"><span id="stats-contrib-rate"></span><span id="stats-contrib-detail"></span></div>
            <span id="stats-qr-share"></span><span id="stats-qr-detail"></span>
            <span id="stats-signals-30j"></span><span id="stats-routes-30j"></span>
            <ul id="stats-daily"></ul><ul id="stats-top"></ul>
        </div>
    </div>
    <div id="favorites-badge" style="display:none">0</div>
    <div id="conversations-count" style="display:none">0</div>
    <div id="chat-modal">
        <span id="chat-avatar"></span>
        <span id="chat-name"></span>
        <span id="chat-status"></span>
        <div id="chat-messages"></div>
        <div id="chat-quick-replies"></div>
        <button id="chat-subscribe"></button>
    </div>
    <div id="conversations-list"></div>
    <aside id="sidebar" class="sidebar side-panel">
        <span id="side-panel-title"></span>
        <button id="side-panel-close"></button>
        <div id="side-panel-list"></div>
    </aside>
    <div id="sidebar-overlay"></div>
    <span id="activity-badge" style="display:none">0</span>
    <span id="activity-count">0</span>
    <span id="notifications-badge" style="display:none">0</span>
    <div id="notifications-view" class="view-page view-hidden">
        <button id="clear-notifications" style="display:none">Tout effacer</button>
        <div id="notifications-list"></div>
        <div id="notifications-empty" style="display:none"></div>
    </div>
    <div id="product-follow-modal" class="modal-clean" role="dialog" aria-modal="true" aria-labelledby="product-follow-title" tabindex="-1">
        <div class="modal-content-clean">
            <button class="close-modal" id="product-follow-close"></button>
            <h2 id="product-follow-title">Suivre un produit</h2>
            <form id="product-follow-form">
                <input type="text" id="product-follow-input" maxlength="50" autofocus>
                <div class="modal-actions-clean">
                    <button type="button" id="product-follow-cancel">Annuler</button>
                    <button type="submit">Valider</button>
                </div>
            </form>
        </div>
    </div>
    <div id="confirm-modal" class="modal-clean" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" tabindex="-1">
        <div class="modal-content-clean">
            <button class="close-modal" id="confirm-close"></button>
            <h2 id="confirm-title">Confirmer ?</h2>
            <p id="confirm-message"></p>
            <div class="modal-actions-clean">
                <button type="button" id="confirm-cancel" autofocus>Annuler</button>
                <button type="button" id="confirm-ok">Confirmer</button>
            </div>
        </div>
    </div>
    <nav class="bottom-nav">
        <button class="nav-tab active" data-tab="explore"></button>
        <button class="nav-tab" data-tab="favorites"></button>
        <button class="nav-tab" data-tab="activity"></button>
    </nav>
</body></html>`;

const dom = new JSDOM(html, { url: 'http://localhost:8080' });

// Injecter dans globalThis AVANT les imports des modules
Object.defineProperty(globalThis, 'window', { value: dom.window, writable: true, configurable: true });
Object.defineProperty(globalThis, 'document', { value: dom.window.document, writable: true, configurable: true });
Object.defineProperty(globalThis, 'localStorage', { value: dom.window.localStorage, writable: true, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, writable: true, configurable: true });
Object.defineProperty(globalThis, 'HTMLElement', { value: dom.window.HTMLElement, writable: true, configurable: true });

// Mock Leaflet
globalThis.L = {
    map: () => ({ setView: () => ({}), addTo: () => ({}), invalidateSize: () => {}, removeLayer: () => {}, fitBounds: () => {} }),
    tileLayer: () => ({ addTo: () => {} }),
    marker: () => ({ addTo: () => ({}), bindPopup: () => ({}), on: () => ({}) }),
    divIcon: () => ({}),
    featureGroup: () => ({ getBounds: () => ({ pad: () => ({}) }) }),
    control: { zoom: () => ({ addTo: () => {} }) }
};

globalThis.supabase = undefined;

// ============================================
// IMPORTS (apres setup DOM)
// ============================================

const { AppState, Conversations, UserProfile, NotificationPrefs } = await import('../js/state.js');
const {
    escapeHTML, showToast, saveToLocalStorage, loadFromLocalStorage,
    saveStore, loadStore, saveProfile, loadProfile,
    saveConversations, loadConversations
} = await import('../js/utils.js');
const { renderProductsList, toggleSubscription, displaySubscriptions } = await import('../js/distributor.js');
const { openDistributorModal, closeDistModal, buildShareUrl, openSidePanelForFilters, closeSidePanel } = await import('../js/gmaps-ui.js');
const { hideAllViews, switchView, switchTab, updateBadges, getTotalUnreadCount, updateProfileStats } = await import('../js/navigation.js');
const { updateUnreadCounts } = await import('../js/chat.js');
const { getUnreadCount, updateNotificationsBadge, openNotificationsView, deleteNotification, clearAllNotifications, promptAddProductFollow } = await import('../js/notifications.js');
const { NotificationQueue, setSupabaseClient } = await import('../js/state.js');
const { checkFavoriteUpdates } = await import('../js/favorites-watch.js');
const { activateFocusTrap, deactivateFocusTrap } = await import('../js/focus-trap.js');
const { buildStatsModel, renderStatsView, percent, formatPercent } = await import('../js/stats.js');

// ============================================
// ESCAPEHTML (DOM)
// ============================================

describe('escapeHTML (DOM)', () => {
    it('echappe les balises script', () => {
        const result = escapeHTML('<script>alert("xss")</script>');
        assert.ok(!result.includes('<script>'));
        assert.ok(result.includes('&lt;script&gt;'));
    });

    it('echappe les guillemets et ampersands', () => {
        const result = escapeHTML('a & b "c"');
        assert.ok(result.includes('&amp;'));
    });

    it('garde le texte normal intact', () => {
        assert.equal(escapeHTML('Bonjour monde'), 'Bonjour monde');
    });

    it('echappe les guillemets pour usage en attribut HTML (XSS attr)', () => {
        const result = escapeHTML('foo" onclick="alert(1)');
        assert.ok(!result.includes('"'), `Guillemets non echappes (XSS): ${result}`);
        assert.ok(result.includes('&quot;'), `Devrait contenir &quot;: ${result}`);
    });

    it('echappe les apostrophes', () => {
        const result = escapeHTML("foo' onclick='alert(1)");
        assert.ok(!result.includes("'"), `Apostrophes non echappees: ${result}`);
        assert.ok(result.includes('&#39;'), `Devrait contenir &#39;: ${result}`);
    });
});

// ============================================
// SHOWTOAST
// ============================================

describe('showToast', () => {
    it('ajoute un element toast dans le container', () => {
        const container = document.getElementById('toast-container');
        container.innerHTML = '';
        showToast('Test message', 'success');
        assert.equal(container.children.length, 1);
        assert.ok(container.children[0].className.includes('toast'));
        assert.ok(container.children[0].className.includes('success'));
        assert.equal(container.children[0].textContent, 'Test message');
    });

    it('cree des toasts multiples', () => {
        const container = document.getElementById('toast-container');
        container.innerHTML = '';
        showToast('Message 1');
        showToast('Message 2');
        assert.equal(container.children.length, 2);
    });

    // WCAG 4.1.3 : les notifications doivent etre annoncees aux lecteurs
    // d'ecran. Le container porte aria-live="polite" (annonces non-
    // interruptives), et chaque toast d'erreur porte role="alert" pour
    // forcer une lecture assertive (= interrompt l'utilisateur).
    it('le container toast a aria-live="polite" et role="status"', () => {
        const container = document.getElementById('toast-container');
        assert.equal(container.getAttribute('aria-live'), 'polite');
        assert.equal(container.getAttribute('role'), 'status');
        assert.equal(container.getAttribute('aria-atomic'), 'true');
    });

    it('un toast type="error" porte role="alert" (annonce assertive)', () => {
        const container = document.getElementById('toast-container');
        container.innerHTML = '';
        showToast('Echec de l\'envoi', 'error');
        assert.equal(container.children.length, 1);
        assert.equal(container.children[0].getAttribute('role'), 'alert');
    });

    it('un toast non-error n\'ajoute PAS role="alert" (reste polite via container)', () => {
        const container = document.getElementById('toast-container');
        container.innerHTML = '';
        showToast('Sauvegarde OK', 'success');
        assert.equal(container.children[0].getAttribute('role'), null);
        container.innerHTML = '';
        showToast('Info neutre');
        assert.equal(container.children[0].getAttribute('role'), null);
    });
});

// ============================================
// MODAL DISTRIBUTEUR (Google Maps style)
// ============================================

describe('openDistributorModal', () => {
    beforeEach(() => {
        AppState.distributors = [
            {
                id: 'dist-test',
                name: 'Test Distrib',
                type: 'pizza',
                emoji: '🍕',
                address: '1 Rue Test',
                rating: 4.5,
                reviewCount: 42,
                distance: 1.2,
                products: [
                    { name: 'Pizza', price: 8.5, available: true },
                    { name: 'Calzone', price: 10, available: false }
                ]
            }
        ];
        AppState.typeConfig = { pizza: { label: 'Pizza' } };
        AppState.subscriptions = [];
    });

    it('ouvre la modal avec les infos du distributeur', () => {
        openDistributorModal('dist-test');
        const overlay = document.getElementById('dist-modal-overlay');
        assert.ok(overlay.classList.contains('active'));
        assert.equal(document.getElementById('dist-modal-name').textContent, 'Test Distrib');
    });

    it('remplit le rating et les reviews', () => {
        openDistributorModal('dist-test');
        assert.ok(document.getElementById('dist-modal-rating').textContent.includes('★'));
        assert.ok(document.getElementById('dist-modal-reviews').textContent.includes('42'));
    });

    it('remplit l\'onglet "A propos"', () => {
        openDistributorModal('dist-test');
        assert.equal(document.getElementById('dist-apropos-address').textContent, '1 Rue Test');
    });

    it('set AppState.currentDistributor', () => {
        openDistributorModal('dist-test');
        assert.equal(AppState.currentDistributor.id, 'dist-test');
    });

    it('ne fait rien pour un id inexistant', () => {
        const before = AppState.currentDistributor;
        openDistributorModal('fake-id');
        assert.equal(AppState.currentDistributor, before);
    });

    // EPIC-T5 : Modifier est un privilege de compte, d'ou que la fiche soit ouverte
    it('visiteur : pas de stylo « Modifier » (ni depuis Favoris, ni ailleurs)', () => {
        window.__testLogout();
        openDistributorModal('dist-test', false, true);
        assert.equal(document.getElementById('dist-action-edit').style.display, 'none');
        openDistributorModal('dist-test', false, false);
        assert.equal(document.getElementById('dist-action-edit').style.display, 'none');
    });

    it('connecte : stylo visible en lecture, masque en edition', () => {
        window.__testLogin();
        openDistributorModal('dist-test', false, false);
        assert.notEqual(document.getElementById('dist-action-edit').style.display, 'none');
        openDistributorModal('dist-test', true, false);
        assert.equal(document.getElementById('dist-action-edit').style.display, 'none');
        window.__testLogout();
    });
});

describe('closeDistModal', () => {
    it('ferme la modal', () => {
        AppState.distributors = [{ id: 'd1', name: 'X', type: 'pizza', emoji: '🍕', address: '', rating: 4, reviewCount: 0, products: [] }];
        AppState.typeConfig = { pizza: { label: 'Pizza' } };
        openDistributorModal('d1');
        closeDistModal();
        const overlay = document.getElementById('dist-modal-overlay');
        assert.ok(!overlay.classList.contains('active'));
    });
});

describe('Vue Compte (connexion + reinitialisation)', () => {
    it('a un bouton "Se connecter" dans le bloc statut', () => {
        const btn = document.getElementById('account-auth-action');
        assert.ok(btn, 'bouton #account-auth-action present');
        assert.equal(btn.textContent.trim(), 'Se connecter');
    });

    it('aucun mot "danger" dans la vue Compte', () => {
        const view = document.getElementById('account-view');
        assert.ok(!/danger/i.test(view.innerHTML), 'le terme "danger" est proscrit');
    });

    it('le bouton d\'effacement existe toujours (id conserve)', () => {
        const btn = document.getElementById('clear-data-btn');
        assert.ok(btn);
        assert.equal(btn.textContent.trim(), 'Effacer mes données');
    });
});

describe('buildShareUrl', () => {
    it('construit une URL valide avec le param id', () => {
        const url = buildShareUrl('dist-005');
        assert.ok(url.includes('?id=dist-005'));
        assert.ok(url.startsWith('http'));
    });

    it('encode les caracteres speciaux dans l\'id', () => {
        const url = buildShareUrl('user/abc 123');
        assert.ok(url.includes('id=user%2Fabc%20123'));
    });
});

// ============================================
// RENDER PRODUCTS LIST
// ============================================

describe('renderProductsList', () => {
    it('affiche les produits dans la target', () => {
        const dist = {
            products: [
                { name: 'Pizza', price: 8.50, available: true },
                { name: 'Burger', price: 6.00, available: false }
            ]
        };
        renderProductsList(dist, 'dist-products-list');
        const list = document.getElementById('dist-products-list');
        const items = list.querySelectorAll('.product-item-clean');
        assert.equal(items.length, 2);
    });

    it('affiche l\'empty state si pas de produits', () => {
        renderProductsList({ products: [] }, 'dist-products-list');
        const list = document.getElementById('dist-products-list');
        assert.ok(list.querySelector('.products-empty-state'));
    });

    it('affiche l\'empty state si products est null', () => {
        renderProductsList({ products: null }, 'dist-products-list');
        const list = document.getElementById('dist-products-list');
        assert.ok(list.querySelector('.products-empty-state'));
    });

    // EPIC-T2 : en lecture, trois mots seulement ; marque « Non disponible » -> Pas dispo
    it('lecture : « Pas d\'info » sans signal, « Pas dispo » si marque non disponible, jamais « catalogue »', () => {
        const dist = {
            products: [
                { id: 1, name: 'Baguette', price: 5, available: true },
                { id: 2, name: 'Croissant', price: 5, available: false }
            ]
        };
        renderProductsList(dist, 'dist-products-list');
        const rows = document.getElementById('dist-products-list').querySelectorAll('.product-row');
        assert.equal(rows[0].querySelector('.product-pill').textContent, "Pas d'info");
        assert.ok(rows[0].classList.contains('is-unknown'));
        assert.equal(rows[1].querySelector('.product-pill').textContent, 'Pas dispo');
        assert.equal(rows[1].querySelector('.product-seen').textContent, '');
        assert.ok(!/catalogue/i.test(document.getElementById('dist-products-list').textContent));
    });

    it('lecture : la ligne est un bouton qui deplie « Il y en a / Plus rien », AUCUN prix', () => {
        renderProductsList({ products: [{ id: 7, name: 'Test', available: true }] }, 'dist-products-list', { canInform: true });
        const list = document.getElementById('dist-products-list');
        assert.equal(list.querySelector('.product-price-clean'), null, 'plus de prix');
        const main = list.querySelector('button.product-row-main');
        assert.ok(main, 'ligne touchable');
        assert.equal(main.getAttribute('aria-expanded'), 'false');
        assert.equal(main.getAttribute('aria-controls'), 'product-choices-7');
        const choices = list.querySelector('#product-choices-7');
        assert.ok(choices.hidden, 'choix replies par defaut');
        assert.deepEqual([...choices.querySelectorAll('.product-choice')].map(c => c.dataset.state), ['available', 'absent']);
        assert.ok(list.querySelector('.product-name-clean').textContent.includes('Test'));
    });

    it('lecture : un produit sans id Supabase (local) n\'est pas touchable', () => {
        renderProductsList({ products: [{ name: 'Local', available: true }] }, 'dist-products-list');
        const list = document.getElementById('dist-products-list');
        assert.equal(list.querySelector('button.product-row-main'), null);
        assert.equal(list.querySelector('.product-choices'), null);
        assert.ok(list.querySelector('.product-pill'));
    });

    // EPIC-T5 : informer est un privilege de compte
    it('visiteur : lignes en lecture seule, pas de « Ajouter les produits »', () => {
        renderProductsList({ products: [{ id: 7, name: 'Test', available: true }] }, 'dist-products-list');
        assert.equal(document.querySelector('#dist-products-list button.product-row-main'), null);
        renderProductsList({ products: [] }, 'dist-products-list');
        assert.equal(document.getElementById('dist-products-add-first'), null);
    });

    it('lecture connecte, machine sans produit : bouton « Ajouter les produits »', () => {
        renderProductsList({ products: [] }, 'dist-products-list', { canInform: true });
        const btn = document.getElementById('dist-products-add-first');
        assert.ok(btn);
        assert.equal(btn.textContent, 'Ajouter les produits');
        renderProductsList({ products: [] }, 'dist-products-list', { readonly: false });
        assert.equal(document.getElementById('dist-products-add-first'), null, 'pas en edition');
    });

    it('edition : nom editable, pas de champ prix, pas de crayon', () => {
        renderProductsList({ products: [{ name: 'Pizza', available: true }] }, 'dist-products-list', { readonly: false });
        const list = document.getElementById('dist-products-list');
        assert.ok(list.querySelector('.product-edit-name'), 'input nom present');
        assert.equal(list.querySelector('.product-edit-price'), null, 'pas d\'input prix');
        assert.equal(list.querySelector('.product-btn-edit'), null, 'pas de crayon');
        assert.ok(list.querySelector('.product-btn-delete svg'), 'corbeille (svg) supprimer');
        const chip = list.querySelector('.product-availability-chip');
        assert.ok(chip, 'pastille etat presente');
        assert.ok(chip.classList.contains('is-available'), 'etat disponible');
        // EPIC-T2 : le catalogue dit son nom, sans confusion avec la dispo du moment
        assert.equal(chip.textContent.trim(), 'Disponible');
    });

    it('edition : « Non disponible » si available=false', () => {
        renderProductsList({ products: [{ name: 'X', available: false }] }, 'dist-products-list', { readonly: false });
        const chip = document.getElementById('dist-products-list').querySelector('.product-availability-chip');
        assert.ok(chip.classList.contains('is-unavailable'));
        assert.equal(chip.textContent.trim(), 'Non disponible');
    });

    it('utilise le target par defaut (products-list)', () => {
        renderProductsList({ products: [{ name: 'A', price: 1, available: true }] });
        const list = document.getElementById('products-list');
        assert.equal(list.querySelectorAll('.product-item-clean').length, 1);
    });
});

// ============================================
// TOGGLE SUBSCRIPTION
// ============================================

describe('toggleSubscription (favori local, sans auth)', () => {
    beforeEach(() => {
        AppState.subscriptions = [];
        AppState.distributors = [
            { id: 'dist-sub', name: 'Sub Test', type: 'pizza', emoji: '🍕', address: 'Addr', rating: 4, reviewCount: 10, products: [] }
        ];
        AppState.currentDistributor = null;
        localStorage.clear();
    });

    it('ajoute un abonnement sans demander d\'auth', async () => {
        await toggleSubscription('dist-sub');
        assert.ok(AppState.subscriptions.includes('dist-sub'));
    });

    it('un 2e appel retire l\'abonnement (toggle)', async () => {
        await toggleSubscription('dist-sub');
        await toggleSubscription('dist-sub');
        assert.ok(!AppState.subscriptions.includes('dist-sub'));
    });

    // Chat inactif (FEATURES.chat = false) : un favori ne cree plus de conversation
    it('ne cree aucune conversation avec le bot', async () => {
        Conversations.list = [];
        Conversations.history = {};
        await toggleSubscription('dist-sub');
        assert.deepEqual(Conversations.list, []);
        assert.deepEqual(Conversations.history, {});
    });

    it('la carte Favoris n\'affiche plus « N nouveau(x) » (messages du bot)', async () => {
        AppState.subscriptions = ['dist-sub'];
        Conversations.unreadCounts = { 'dist-sub': 3 };
        displaySubscriptions();
        assert.equal(document.querySelectorAll('#subscriptions-list .unread-indicator').length, 0);
        Conversations.unreadCounts = {};
    });
});

// ============================================
// VEILLE DES FAVORIS (js/favorites-watch.js)
// ============================================

describe('checkFavoriteUpdates (un favori notifie quand sa machine change)', () => {
    let tables;
    const fakeClient = {
        from(table) {
            return { select() { return { in() { return Promise.resolve({ data: tables[table] || [], error: null }); } }; } };
        }
    };
    const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();

    // Les suites suivantes tournent hors ligne (pas de client Supabase)
    after(() => { setSupabaseClient(null); AppState.subscriptions = []; });

    beforeEach(() => {
        tables = { distributor_status: [], product_availability: [] };
        setSupabaseClient(fakeClient);
        AppState.subscriptions = ['dist-fav'];
        AppState.distributors = [
            { id: 'dist-fav', name: 'Pain du Coin', type: 'bakery', emoji: '🥖', address: 'Addr', products: [{ id: 7, name: 'Baguette', price: 1, available: true }] }
        ];
        NotificationPrefs.enabled = true;
        NotificationPrefs.quietHours.enabled = false;
        NotificationPrefs.followedProducts = [];
        NotificationPrefs.lastNotifications = {};
        NotificationPrefs.lastSeenSignals = {};
        NotificationQueue.pending = [];
        NotificationQueue.history = [];
    });

    it('premier passage : memorise sans notifier', async () => {
        tables.distributor_status = [{ distributor_id: 'dist-fav', state: 'empty', created_at: minutesAgo(40) }];
        const sent = await checkFavoriteUpdates();
        assert.deepEqual(sent, []);
        assert.equal(NotificationQueue.history.length, 0);
        assert.equal(NotificationPrefs.lastSeenSignals['dist-fav'].machineState, 'empty');
    });

    it('nouveau signal « vide » : une notification non lue, datee du signal, badge a 1', async () => {
        await checkFavoriteUpdates();
        tables.distributor_status = [{ distributor_id: 'dist-fav', state: 'empty', created_at: minutesAgo(40) }];
        const sent = await checkFavoriteUpdates();
        assert.equal(sent.length, 1);
        const notif = NotificationQueue.history[0];
        assert.equal(notif.type, 'empty');
        assert.equal(notif.distributorId, 'dist-fav');
        assert.match(notif.message, /Pain du Coin a été signalée vide/);
        assert.equal(notif.read, false);
        assert.ok(Date.now() - notif.timestamp >= 39 * 60000, 'horodatage = celui du signal');
        assert.equal(document.getElementById('notifications-badge').textContent, '1');
    });

    it('meme etat au passage suivant : rien de plus', async () => {
        await checkFavoriteUpdates();
        tables.distributor_status = [{ distributor_id: 'dist-fav', state: 'broken', created_at: minutesAgo(5) }];
        await checkFavoriteUpdates();
        await checkFavoriteUpdates();
        assert.equal(NotificationQueue.history.length, 1);
    });

    it('cooldown d\'1 h : l\'evenement n\'est pas perdu, il part au passage suivant', async () => {
        await checkFavoriteUpdates();
        NotificationPrefs.lastNotifications['dist-fav'] = Date.now();
        tables.distributor_status = [{ distributor_id: 'dist-fav', state: 'empty', created_at: minutesAgo(2) }];
        assert.deepEqual(await checkFavoriteUpdates(), []);
        NotificationPrefs.lastNotifications = {};
        assert.equal((await checkFavoriteUpdates()).length, 1);
    });

    it('produit suivi vu dispo : notification « stock »', async () => {
        NotificationPrefs.followedProducts = ['baguette'];
        await checkFavoriteUpdates();
        tables.product_availability = [{ distributor_id: 'dist-fav', product_id: 7, state: 'available', created_at: minutesAgo(3) }];
        await checkFavoriteUpdates();
        assert.equal(NotificationQueue.history[0].type, 'stock');
        assert.match(NotificationQueue.history[0].message, /Baguette vu dispo chez Pain du Coin/);
    });

    it('sans favori ou sans Supabase : aucun appel, aucune erreur', async () => {
        AppState.subscriptions = [];
        assert.deepEqual(await checkFavoriteUpdates(), []);
        AppState.subscriptions = ['dist-fav'];
        setSupabaseClient(null);
        assert.deepEqual(await checkFavoriteUpdates(), []);
    });

    it('un favori retire ne garde pas d\'etat', async () => {
        AppState.subscriptions = ['dist-fav', 'dist-other'];
        NotificationPrefs.lastSeenSignals = { 'dist-gone': { machineState: null, machineAt: 0, products: {} } };
        await checkFavoriteUpdates();
        assert.equal(NotificationPrefs.lastSeenSignals['dist-gone'], undefined);
        assert.ok(NotificationPrefs.lastSeenSignals['dist-fav']);
    });
});

// ============================================
// NAVIGATION
// ============================================

describe('hideAllViews', () => {
    it('masque toutes les vues', () => {
        document.getElementById('subscriptions-view').classList.add('view-active');
        hideAllViews();
        const views = document.querySelectorAll('.view-page');
        views.forEach(v => {
            assert.ok(v.classList.contains('view-hidden'), `${v.id} devrait etre hidden`);
            assert.ok(!v.classList.contains('view-active'), `${v.id} ne devrait pas etre active`);
        });
    });
});

describe('switchView', () => {
    it('active la vue favorites', () => {
        hideAllViews();
        switchView('favorites');
        const view = document.getElementById('subscriptions-view');
        assert.ok(view.classList.contains('view-active'));
        assert.ok(!view.classList.contains('view-hidden'));
    });

    it('active la vue activity', () => {
        hideAllViews();
        switchView('activity');
        const view = document.getElementById('activity-view');
        assert.ok(view.classList.contains('view-active'));
    });

    it('ne crash pas pour une vue inconnue', () => {
        assert.doesNotThrow(() => switchView('nonexistent'));
    });
});

// ============================================
// BADGES
// ============================================

describe('updateBadges', () => {
    it('affiche le badge favoris quand il y a des abonnements', () => {
        AppState.subscriptions = ['a', 'b', 'c'];
        updateBadges();
        const badge = document.getElementById('favorites-badge');
        assert.equal(badge.textContent, '3');
        assert.notEqual(badge.style.display, 'none');
    });

    it('masque le badge si 0 abonnements', () => {
        AppState.subscriptions = [];
        updateBadges();
        const badge = document.getElementById('favorites-badge');
        assert.equal(badge.style.display, 'none');
    });
});

// ============================================
// UNREAD COUNTS
// ============================================

describe('getTotalUnreadCount', () => {
    it('retourne 0 si pas de non lus', () => {
        Conversations.unreadCounts = {};
        assert.equal(getTotalUnreadCount(), 0);
    });

    it('somme les non lus', () => {
        Conversations.unreadCounts = { 'a': 3, 'b': 2 };
        assert.equal(getTotalUnreadCount(), 5);
    });
});

// ============================================
// PERSISTANCE CONVERSATIONS
// ============================================

describe('saveConversations / loadConversations', () => {
    it('round-trip conversations', () => {
        Conversations.list = ['dist-1', 'dist-2'];
        Conversations.history = { 'dist-1': [{ type: 'bot', text: 'Salut', timestamp: 123 }] };
        saveConversations();

        Conversations.list = [];
        Conversations.history = {};
        loadConversations();

        assert.deepEqual(Conversations.list, ['dist-1', 'dist-2']);
        assert.equal(Conversations.history['dist-1'][0].text, 'Salut');
    });
});

// ============================================
// PERSISTANCE PROFIL
// ============================================

describe('saveProfile / loadProfile', () => {
    it('round-trip profil', () => {
        UserProfile.stats.detailsViewed = 42;
        UserProfile.preferences.types = { pizza: 10 };
        saveProfile();

        UserProfile.stats.detailsViewed = 0;
        UserProfile.preferences.types = {};
        loadProfile();

        assert.equal(UserProfile.stats.detailsViewed, 42);
        assert.equal(UserProfile.preferences.types.pizza, 10);
    });
});

// ============================================
// DISPLAY SUBSCRIPTIONS
// ============================================

describe('displaySubscriptions', () => {
    beforeEach(() => {
        AppState.subscriptions = [];
        AppState.distributors = [
            { id: 'd1', name: 'Distrib 1', type: 'pizza', emoji: '🍕', address: 'Addr 1', rating: 4.5, reviewCount: 10, products: [], distance: 1.2 },
            { id: 'd2', name: 'Distrib 2', type: 'bakery', emoji: '🥖', address: 'Addr 2', rating: 4.0, reviewCount: 5, products: [], distance: 3.0 }
        ];
        AppState.typeConfig = { pizza: { label: 'Pizza', gradient: '' }, bakery: { label: 'Boulangerie', gradient: '' } };
        Conversations.history = {};
        Conversations.unreadCounts = {};
    });

    it('affiche l\'empty state si 0 abonnements', () => {
        displaySubscriptions();
        const empty = document.getElementById('subscriptions-empty');
        assert.notEqual(empty.style.display, 'none');
    });

    it('affiche les cartes d\'abonnement', () => {
        AppState.subscriptions = ['d1', 'd2'];
        displaySubscriptions();
        const list = document.getElementById('subscriptions-list');
        const cards = list.querySelectorAll('.subscription-card');
        assert.equal(cards.length, 2);
    });

    it('met a jour le compteur', () => {
        AppState.subscriptions = ['d1'];
        displaySubscriptions();
        const count = document.getElementById('subscriptions-count');
        assert.ok(count.textContent.includes('1'));
    });
});

// ============================================
// PROFIL : COMPTEUR CONTRIBUTIONS
// ============================================

describe('updateProfileStats - contributions', () => {
    beforeEach(() => {
        AppState.distributors = [
            { id: 'd1', name: 'Officiel', type: 'pizza' },
            { id: 'other-user-1', name: 'Distrib autre user', type: 'pizza', isUserAdded: true, addedBy: 'someone-else' }
        ];
        AppState.subscriptions = [];
        AppState.reports = 3;
        AppState.points = 0;
        Conversations.list = [];
        UserProfile.stats.photosUploaded = 5;
        UserProfile.preferences.types = {};
        // Distributeurs ajoutes localement (this device only)
        localStorage.setItem('snackmatch_user_distributors', JSON.stringify([
            { id: 'user-1', name: 'Mon distrib', type: 'ice' },
            { id: 'user-2', name: 'Autre distrib', type: 'other' }
        ]));
    });

    it('compte uniquement les distributeurs ajoutes sur cet appareil', () => {
        updateProfileStats();
        // 2 dans localStorage, ignore le distributeur Supabase d'un autre user
        assert.equal(document.getElementById('stat-contrib-distributors').textContent, '2');
    });

    it('retourne 0 si aucun distributeur ajoute', () => {
        localStorage.setItem('snackmatch_user_distributors', JSON.stringify([]));
        updateProfileStats();
        assert.equal(document.getElementById('stat-contrib-distributors').textContent, '0');
    });

    it('affiche le nombre de photos uploadees', () => {
        updateProfileStats();
        assert.equal(document.getElementById('stat-contrib-photos').textContent, '5');
    });

    it('affiche le nombre de signalements', () => {
        updateProfileStats();
        assert.equal(document.getElementById('stat-contrib-reports').textContent, '3');
    });

    it('gere photosUploaded undefined (defaut 0)', () => {
        UserProfile.stats.photosUploaded = undefined;
        updateProfileStats();
        assert.equal(document.getElementById('stat-contrib-photos').textContent, '0');
    });
});

describe('Profil Local Guides (niveau + favoris)', () => {
    beforeEach(() => {
        AppState.distributors = [];
        AppState.subscriptions = ['a', 'b'];
        AppState.reports = 0;
        UserProfile.stats.photosUploaded = 0;
        UserProfile.preferences.types = {};
        localStorage.setItem('snackmatch_user_distributors', JSON.stringify([]));
    });

    it('points=0 -> Explorateur, barre 0%, label vers Eclaireur', () => {
        AppState.points = 0;
        updateProfileStats();
        assert.equal(document.getElementById('profile-badge').textContent, 'Explorateur');
        assert.equal(document.getElementById('profile-points').textContent, '0');
        assert.equal(document.getElementById('profile-level-bar').style.width, '0%');
        assert.match(document.getElementById('profile-level-label').textContent, /Éclaireur/);
    });

    it('points=100 -> Habitué, progression intermediaire', () => {
        AppState.points = 100;
        updateProfileStats();
        assert.equal(document.getElementById('profile-badge').textContent, 'Habitué');
        // (100-60)/(150-60) = 44%
        assert.equal(document.getElementById('profile-level-bar').style.width, '44%');
        assert.match(document.getElementById('profile-level-label').textContent, /Ambassadeur/);
    });

    it('points tres eleves -> niveau max', () => {
        AppState.points = 9999;
        updateProfileStats();
        assert.equal(document.getElementById('profile-badge').textContent, 'Légende du coin');
        assert.equal(document.getElementById('profile-level-bar').style.width, '100%');
        assert.match(document.getElementById('profile-level-label').textContent, /max/i);
    });

    it('favoris affiches dans le breakdown contribution', () => {
        AppState.points = 0;
        updateProfileStats();
        assert.equal(document.getElementById('stat-subscriptions').textContent, '2');
    });
});

// ============================================
// CENTRE DE NOTIFICATIONS
// ============================================

describe('Centre de notifications', () => {
    beforeEach(() => {
        NotificationQueue.pending = [];
        NotificationQueue.history = [];
        document.getElementById('notifications-list').innerHTML = '';
        const badge = document.getElementById('notifications-badge');
        badge.style.display = 'none';
        badge.textContent = '0';
    });

    it('getUnreadCount compte les items read===false', () => {
        NotificationQueue.history = [
            { type: 'proximity', message: 'a', read: false },
            { type: 'proximity', message: 'b', read: true },
            { type: 'stock', message: 'c', read: false }
        ];
        assert.equal(getUnreadCount(), 2);
    });

    it('updateNotificationsBadge affiche le compteur non-lus, cache si 0', () => {
        const badge = document.getElementById('notifications-badge');
        NotificationQueue.history = [{ type: 'proximity', message: 'x', read: false }];
        updateNotificationsBadge();
        assert.equal(badge.textContent, '1');
        assert.notEqual(badge.style.display, 'none');

        NotificationQueue.history = [];
        updateNotificationsBadge();
        assert.equal(badge.style.display, 'none');
    });

    it('updateNotificationsBadge plafonne a 9+', () => {
        NotificationQueue.history = Array.from({ length: 12 }, () => ({ type: 'proximity', message: 'm', read: false }));
        updateNotificationsBadge();
        assert.equal(document.getElementById('notifications-badge').textContent, '9+');
    });

    it('openNotificationsView rend la liste puis marque tout lu (badge 0)', () => {
        NotificationQueue.history = [
            { type: 'proximity', message: 'Proche !', read: false, timestamp: Date.now() },
            { type: 'stock', message: 'Dispo', read: false, timestamp: Date.now() }
        ];
        openNotificationsView();
        const list = document.getElementById('notifications-list');
        assert.equal(list.querySelectorAll('.notif-item').length, 2);
        assert.equal(getUnreadCount(), 0, 'tout marque lu');
        assert.equal(document.getElementById('notifications-badge').style.display, 'none');
    });

    it('openNotificationsView : empty state si aucun', () => {
        openNotificationsView();
        assert.equal(document.getElementById('notifications-list').innerHTML, '');
        assert.notEqual(document.getElementById('notifications-empty').style.display, 'none');
    });

    it('deleteNotification retire l\'item par son identifiant et recalcule le badge', () => {
        NotificationQueue.history = [
            { id: 'n-a', type: 'proximity', message: 'A', read: false, timestamp: Date.now() },
            { id: 'n-b', type: 'stock', message: 'B', read: false, timestamp: Date.now() }
        ];
        openNotificationsView();           // rend + marque lu
        NotificationQueue.history[0].read = false; // simuler 1 non-lue
        deleteNotification('n-a');
        assert.equal(NotificationQueue.history.length, 1);
        assert.equal(NotificationQueue.history[0].message, 'B');
        assert.equal(document.querySelectorAll('#notifications-list .notif-item').length, 1);
        assert.equal(getUnreadCount(), 0);
    });

    it('deleteNotification ignore un identifiant inconnu', () => {
        NotificationQueue.history = [{ id: 'n-x', type: 'proximity', message: 'X', read: true }];
        deleteNotification('n-inconnu');
        deleteNotification(undefined);
        assert.equal(NotificationQueue.history.length, 1);
    });

    // Retour terrain 2026-09-25 (T1-US4) : la liste a pu bouger entre
    // l'affichage et le clic ; la corbeille retire toujours SA ligne.
    it('la corbeille d\'une ligne retire cette ligne, meme si une notification est arrivee avant', () => {
        NotificationQueue.history = [
            { type: 'empty', message: 'A vide', read: true, timestamp: Date.now() - 60000 },
            { type: 'broken', message: 'B panne', read: true, timestamp: Date.now() - 120000 }
        ];
        openNotificationsView();
        const trashOfB = document.querySelectorAll('#notifications-list .notif-item-delete')[1];
        // Une nouvelle notification arrive en tete sans re-rendu
        NotificationQueue.history.unshift({ id: 'n-new', type: 'empty', message: 'C vide', read: false, timestamp: Date.now() });
        trashOfB.click();
        assert.deepEqual(NotificationQueue.history.map(n => n.message), ['C vide', 'A vide']);
    });

    // Plus de confirm() natif : la modale maison (#confirm-modal, js/confirm-dialog.js)
    // s'ouvre, et l'action n'a lieu qu'apres le clic sur Confirmer.
    it('clearAllNotifications ouvre la modale maison ; Confirmer vide tout + empty state + bouton cache', async () => {
        NotificationQueue.history = [
            { type: 'proximity', message: 'A', read: false },
            { type: 'stock', message: 'B', read: false }
        ];
        const done = clearAllNotifications();
        const modal = document.getElementById('confirm-modal');
        assert.ok(modal.classList.contains('active'), 'modale de confirmation ouverte');
        assert.equal(document.getElementById('confirm-ok').textContent, 'Tout effacer');
        assert.equal(NotificationQueue.history.length, 2, 'rien n\'est efface avant confirmation');

        document.getElementById('confirm-ok').click();
        await done;
        assert.ok(!modal.classList.contains('active'), 'modale fermee');
        assert.equal(NotificationQueue.history.length, 0);
        assert.notEqual(document.getElementById('notifications-empty').style.display, 'none');
        assert.equal(document.getElementById('clear-notifications').style.display, 'none');
        assert.equal(document.getElementById('notifications-badge').style.display, 'none');
    });

    it('clearAllNotifications : Annuler conserve les notifications', async () => {
        NotificationQueue.history = [{ type: 'proximity', message: 'A', read: false }];
        const done = clearAllNotifications();
        document.getElementById('confirm-cancel').click();
        await done;
        assert.ok(!document.getElementById('confirm-modal').classList.contains('active'));
        assert.equal(NotificationQueue.history.length, 1);
    });

    it('une ligne ouvre la fiche de la machine (plus le chat) et porte l\'icone de son type', () => {
        NotificationQueue.history = [
            { type: 'empty', distributorId: 'dist-x', message: 'X a été signalée vide', read: false, timestamp: Date.now() }
        ];
        openNotificationsView();
        const row = document.querySelector('#notifications-list .notif-item-open');
        assert.ok(row, 'ligne cliquable');
        assert.equal(row.tagName, 'BUTTON');
        assert.match(row.querySelector('.notif-item-icon').textContent, /🚫/);
        assert.match(row.textContent, /Machine signalée vide/);

        const opened = [];
        const previous = window.openDistributorModal;
        window.openDistributorModal = (id) => opened.push(id);
        row.click();
        window.openDistributorModal = previous;
        assert.deepEqual(opened, ['dist-x']);
    });

    it('bouton Tout effacer visible si liste non vide', () => {
        NotificationQueue.history = [{ type: 'proximity', message: 'A', read: true, timestamp: Date.now() }];
        openNotificationsView();
        assert.notEqual(document.getElementById('clear-notifications').style.display, 'none');
    });
});

// ============================================
// FOCUS TRAP (modales accessibles - WCAG 2.4.3 / 2.1.2)
// ============================================

describe('focus-trap', () => {
    // jsdom n'a pas de layout -> offsetWidth vaut 0 partout. On le stub sur les
    // boutons du fixture pour que getFocusable les considere visibles.
    function makeVisible(...els) {
        els.forEach(el => Object.defineProperty(el, 'offsetWidth', { configurable: true, value: 10 }));
    }

    beforeEach(() => {
        document.querySelectorAll('.ft-fixture').forEach(n => n.remove());
        document.body.insertAdjacentHTML('beforeend', `
            <button id="ft-trigger" class="ft-fixture">ouvrir</button>
            <div id="ft-modal" class="ft-fixture" tabindex="-1">
                <button id="ft-a">A</button>
                <button id="ft-b">B</button>
            </div>
        `);
        makeVisible(document.getElementById('ft-a'), document.getElementById('ft-b'));
    });

    it('deplace le focus sur le 1er focusable a l\'ouverture', () => {
        document.getElementById('ft-trigger').focus();
        activateFocusTrap(document.getElementById('ft-modal'), () => {});
        assert.equal(document.activeElement, document.getElementById('ft-a'));
    });

    it('Echap declenche le callback onEscape', () => {
        let escaped = false;
        const modal = document.getElementById('ft-modal');
        activateFocusTrap(modal, () => { escaped = true; });
        modal.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        assert.equal(escaped, true);
    });

    it('Shift+Tab depuis le 1er element boucle vers le dernier', () => {
        const modal = document.getElementById('ft-modal');
        activateFocusTrap(modal, () => {});
        // focus est sur ft-a (1er). Shift+Tab -> doit aller sur ft-b (dernier).
        modal.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
        assert.equal(document.activeElement, document.getElementById('ft-b'));
    });

    it('deactivate rend le focus au declencheur', () => {
        const trigger = document.getElementById('ft-trigger');
        trigger.focus();
        const modal = document.getElementById('ft-modal');
        activateFocusTrap(modal, () => {});
        assert.equal(document.activeElement, document.getElementById('ft-a'));
        deactivateFocusTrap(modal);
        assert.equal(document.activeElement, trigger);
    });

    it('respecte [autofocus] s\'il est present', () => {
        const modal = document.getElementById('ft-modal');
        const b = document.getElementById('ft-b');
        b.setAttribute('autofocus', '');
        activateFocusTrap(modal, () => {});
        assert.equal(document.activeElement, b);
        b.removeAttribute('autofocus');
    });
});

// ============================================
// SUIVRE UN PRODUIT (modale maison, plus de prompt() natif)
// ============================================

describe('promptAddProductFollow (modale)', () => {
    beforeEach(() => {
        NotificationPrefs.followedProducts = [];
        const modal = document.getElementById('product-follow-modal');
        modal.classList.remove('active');
        document.getElementById('product-follow-input').value = '';
        // NB: on ne reset PAS form.dataset.wired -> les listeners sont poses une
        // seule fois (comportement reel), pas de doublon entre tests.
    });

    function submitForm() {
        document.getElementById('product-follow-form')
            .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    }

    it('ouvre la modale (active) sans prompt natif', () => {
        promptAddProductFollow();
        assert.ok(document.getElementById('product-follow-modal').classList.contains('active'));
    });

    it('submit avec une valeur -> produit suivi (normalise) + modale fermee', () => {
        promptAddProductFollow();
        document.getElementById('product-follow-input').value = 'Pizza Margherita';
        submitForm();
        assert.ok(NotificationPrefs.followedProducts.includes('pizza margherita'));
        assert.ok(!document.getElementById('product-follow-modal').classList.contains('active'));
    });

    it('submit vide -> rien suivi, la modale reste ouverte', () => {
        promptAddProductFollow();
        document.getElementById('product-follow-input').value = '   ';
        submitForm();
        assert.equal(NotificationPrefs.followedProducts.length, 0);
        assert.ok(document.getElementById('product-follow-modal').classList.contains('active'));
    });

    it('bouton Annuler ferme sans rien suivre', () => {
        promptAddProductFollow();
        document.getElementById('product-follow-input').value = 'Frites';
        document.getElementById('product-follow-cancel').click();
        assert.equal(NotificationPrefs.followedProducts.length, 0);
        assert.ok(!document.getElementById('product-follow-modal').classList.contains('active'));
    });
});

// ============================================
// TABLEAU DE BORD DU PILOTE (js/stats.js)
// ============================================
// Rendu a partir de donnees fixes : pourcentages arrondis, denominateur nul
// -> "—", 7 jours completes a 0, top 5 max, etat vide explicite.

describe('Tableau de bord du pilote (buildStatsModel / renderStatsView)', () => {
    const NOW = Date.parse('2026-09-16T14:00:00Z');
    const raw = {
        coverage: { machines: 30, machines_signal_24h: 21, machines_signal_7j: 25, machines_verifiees_24h: 21, signaux_7j: 1500, signaux_30j: 3320 },
        contribution: { signaux_30j: 3320, fiches_ouvertes_30j: 267, fiches_via_qr_30j: 60, scans_qr_30j: 60, signaux_envoyes_30j: 200, signaux_via_qr_30j: 15, itineraires_30j: 85 },
        signalsDaily: [
            { jour: '2026-09-16', source: 'anon', signaux: 100 }, { jour: '2026-09-16', source: 'user', signaux: 20 },
            { jour: '2026-09-15', source: 'anon', signaux: 80 }, { jour: '2026-09-01', source: 'anon', signaux: 999 }
        ],
        topDistributors: Array.from({ length: 6 }, (_, i) => ({
            id: `dist-00${i}`, name: `Machine ${i} <b>x</b>`, type: 'bakery',
            fiches_ouvertes_30j: 60 - i, signaux_30j: 10 * i, last_verified: i === 0 ? '2026-09-16T13:50:00Z' : null
        }))
    };

    it('percent : arrondi entier, null si denominateur nul', () => {
        assert.equal(percent(21, 30), 70);
        assert.equal(percent(15, 60), 25);
        assert.equal(percent(2, 3), 67);
        assert.equal(percent(5, 0), null);
        assert.equal(percent(5, undefined), null);
        assert.equal(formatPercent(null), '—');
        assert.equal(formatPercent(70), '70 %');
    });

    it('modele : KPI directeur, seuils, contribution, 7 jours completes a 0 (sources additionnees), top 5', () => {
        const m = buildStatsModel(raw, NOW);
        assert.equal(m.empty, false);
        assert.equal(m.coverage24h.pct, 70);
        assert.equal(m.coverage7d.pct, 83);
        assert.equal(m.coverage7d.threshold, 30);
        assert.equal(m.contribution.pct, 25);
        assert.equal(m.contribution.threshold, 5);
        assert.equal(m.qrShare.pct, 22);
        assert.equal(m.signals30d, 3320);
        assert.equal(m.routes30d, 85);
        assert.equal(m.daily.length, 7);
        assert.deepEqual(m.daily.slice(0, 3).map(d => [d.day, d.n]), [['2026-09-16', 120], ['2026-09-15', 80], ['2026-09-14', 0]]);
        assert.equal(m.top.length, 5);
        assert.equal(m.top[0].freshness.state, 'fresh');
        assert.equal(m.top[1].freshness.state, 'unknown');
    });

    it('modele sans donnees : vide, denominateurs nuls -> null, 7 jours a 0', () => {
        const m = buildStatsModel({}, NOW);
        assert.equal(m.empty, true);
        assert.equal(m.coverage24h.pct, null);
        assert.equal(m.contribution.pct, null);
        assert.deepEqual(m.daily.map(d => d.n), [0, 0, 0, 0, 0, 0, 0]);
        assert.deepEqual(m.top, []);
    });

    it('rendu : chiffres, seuils atteints (is-ok), 7 lignes, top 5 echappe', () => {
        renderStatsView(buildStatsModel(raw, NOW));
        assert.equal(document.getElementById('stats-empty').hidden, true);
        assert.equal(document.getElementById('stats-content').hidden, false);
        assert.equal(document.getElementById('stats-coverage-24h').textContent, '70 %');
        assert.equal(document.getElementById('stats-coverage-detail').textContent, '21 machines sur 30');
        assert.match(document.getElementById('stats-coverage-threshold').textContent, /30 %.*7 j.*83 %/);
        assert.ok(document.getElementById('stats-coverage-threshold').classList.contains('is-ok'));
        assert.equal(document.getElementById('stats-contrib-rate').textContent, '25 %');
        assert.equal(document.getElementById('stats-contrib-detail').textContent, '15 signaux pour 60 scans · seuil 5 %');
        assert.ok(document.getElementById('stats-contrib-cell').classList.contains('is-ok'));
        assert.equal(document.getElementById('stats-qr-share').textContent, '22 %');
        assert.equal(document.getElementById('stats-signals-30j').textContent, '3320');
        assert.equal(document.getElementById('stats-routes-30j').textContent, '85');
        assert.equal(document.querySelectorAll('#stats-daily .stats-row').length, 7);
        assert.equal(document.querySelector('#stats-daily .stats-row-value').textContent, '120');
        const top = document.querySelectorAll('#stats-top .stats-row');
        assert.equal(top.length, 5);
        assert.ok(top[0].innerHTML.includes('Machine 0 &lt;b&gt;x&lt;/b&gt;'), 'nom echappe');
        assert.equal(top[0].querySelector('b'), null);
    });

    it('rendu : sous les seuils -> is-ko ; denominateur nul -> "—" ; aucune fiche -> ligne vide', () => {
        renderStatsView(buildStatsModel({
            coverage: { machines: 30, machines_signal_24h: 3, machines_signal_7j: 6, signaux_30j: 40 },
            contribution: { signaux_via_qr_30j: 1, scans_qr_30j: 100, fiches_via_qr_30j: 0, fiches_ouvertes_30j: 0 }
        }, NOW));
        assert.ok(document.getElementById('stats-coverage-threshold').classList.contains('is-ko'));
        assert.ok(document.getElementById('stats-contrib-cell').classList.contains('is-ko'));
        assert.equal(document.getElementById('stats-qr-share').textContent, '—');
        assert.equal(document.querySelector('#stats-top .stats-row--empty').textContent.trim(), 'Aucune fiche ouverte sur 30 jours');
    });

    it('etat vide explicite : aucune donnee, puis message service', () => {
        renderStatsView(buildStatsModel({}, NOW));
        assert.equal(document.getElementById('stats-empty').hidden, false);
        assert.equal(document.getElementById('stats-content').hidden, true);
        assert.match(document.getElementById('stats-empty').textContent, /Pas encore de données/);
        renderStatsView(buildStatsModel(raw, NOW), 'Service indisponible');
        assert.equal(document.getElementById('stats-empty').textContent, 'Service indisponible');
        assert.equal(document.getElementById('stats-content').hidden, true);
    });
});

// ============================================
// FICHE FICTIVE (distributors.is_demo) : tag « Démo » dans la fiche, le panneau, les stats
// ============================================

describe('Tag « Démo » (isDemo)', () => {
    const base = { type: 'pizza', emoji: '🍕', address: '1 Rue Test', rating: 4.5, reviewCount: 3, products: [] };

    beforeEach(() => {
        AppState.distributors = [
            { ...base, id: 'demo-1', name: 'Fiche fictive', isDemo: true, isUserAdded: true },
            { ...base, id: 'real-1', name: 'Vraie machine', isDemo: false, isUserAdded: true }
        ];
        AppState.typeConfig = { pizza: { label: 'Pizza' } };
        AppState.userLocation = null;
    });

    it('fiche fictive : tag visible, rangee « À propos » visible, nom intact, « communauté » masquee meme si isUserAdded', () => {
        openDistributorModal('demo-1');
        assert.equal(document.getElementById('dist-modal-demo').hidden, false);
        assert.equal(document.getElementById('dist-modal-name').textContent, 'Fiche fictive');
        assert.equal(document.getElementById('dist-apropos-demo-row').style.display, 'flex');
        assert.equal(document.getElementById('dist-apropos-added-row').style.display, 'none');
        closeDistModal();
    });

    it('fiche reelle : aucun tag, rangee demo masquee, « communauté » visible', () => {
        openDistributorModal('real-1');
        assert.equal(document.getElementById('dist-modal-demo').hidden, true);
        assert.equal(document.getElementById('dist-apropos-demo-row').style.display, 'none');
        assert.equal(document.getElementById('dist-apropos-added-row').style.display, 'flex');
        closeDistModal();
    });

    it('panneau lateral : le tag n\'apparait que sur la fiche fictive', () => {
        openSidePanelForFilters([]);
        assert.ok(document.querySelector('#side-panel-list .side-panel-item[data-id="demo-1"] .demo-tag'), 'tag sur la fiche fictive');
        assert.equal(document.querySelector('#side-panel-list .side-panel-item[data-id="real-1"] .demo-tag'), null, 'pas de tag sur la vraie');
        closeSidePanel();
    });

    it('tableau de bord : « dont N de démo » et tags du top, masques sans la colonne ou a 0', () => {
        const NOW = Date.parse('2026-09-18T14:00:00Z');
        const top = [
            { id: 'a', name: 'A', fiches_ouvertes_30j: 5, signaux_30j: 1, last_verified: null, is_demo: true },
            { id: 'b', name: 'B', fiches_ouvertes_30j: 4, signaux_30j: 1, last_verified: null, is_demo: false }
        ];
        const withDemo = buildStatsModel({ coverage: { machines: 30, machines_signal_24h: 21, machines_demo: 29 }, topDistributors: top }, NOW);
        assert.equal(withDemo.machinesDemo, 29);
        assert.deepEqual(withDemo.top.map(t => t.isDemo), [true, false]);
        renderStatsView(withDemo);
        assert.equal(document.getElementById('stats-demo-note').hidden, false);
        assert.equal(document.getElementById('stats-demo-note').textContent, 'dont 29 de démo (données fictives)');
        assert.equal(document.getElementById('stats-coverage-detail').textContent, '21 machines sur 30');
        assert.equal(document.querySelectorAll('#stats-top .demo-tag').length, 1);

        const without = buildStatsModel({ coverage: { machines: 30, machines_signal_24h: 21 }, topDistributors: top.map(t => ({ ...t, is_demo: undefined })) }, NOW);
        assert.equal(without.machinesDemo, null);
        renderStatsView(without);
        assert.equal(document.getElementById('stats-demo-note').hidden, true);
        assert.equal(document.querySelectorAll('#stats-top .demo-tag').length, 0);

        renderStatsView(buildStatsModel({ coverage: { machines: 30, machines_signal_24h: 21, machines_demo: 0 } }, NOW));
        assert.equal(document.getElementById('stats-demo-note').hidden, true);
    });
});
