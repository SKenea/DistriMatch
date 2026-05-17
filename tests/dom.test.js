/**
 * DistriMatch - Tests DOM avec jsdom
 * Teste les fonctions qui manipulent le DOM
 * Lancer avec : node --test tests/dom.test.js
 */

import { JSDOM } from 'jsdom';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ============================================
// SETUP JSDOM
// ============================================

const html = `<!DOCTYPE html>
<html><body>
    <div id="toast-container"></div>

    <!-- Modal distributeur Google Maps style -->
    <div id="dist-modal-overlay" class="dist-modal-overlay">
        <div id="dist-modal">
            <button id="dist-modal-close"></button>
            <div id="dist-modal-photo" style="display:none">
                <div id="dist-modal-photos-gallery"></div>
            </div>
            <div class="dist-modal-header">
                <h2 id="dist-modal-name"></h2>
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
        <span id="stat-subscriptions"></span>
        <span id="stat-reports"></span>
        <span id="stat-conversations"></span>
        <span id="profile-points"></span>
        <span id="stat-contrib-distributors"></span>
        <span id="stat-contrib-photos"></span>
        <span id="stat-contrib-reports"></span>
        <div id="profile-preferences-list"></div>
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
const { openDistributorModal, closeDistModal, buildShareUrl } = await import('../js/gmaps-ui.js');
const { hideAllViews, switchView, switchTab, updateBadges, getTotalUnreadCount, updateProfileStats } = await import('../js/navigation.js');
const { updateUnreadCounts } = await import('../js/chat.js');

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

    it('marque les produits disponibles/indisponibles', () => {
        const dist = {
            products: [
                { name: 'Dispo', price: 5, available: true },
                { name: 'Pas dispo', price: 5, available: false }
            ]
        };
        renderProductsList(dist, 'dist-products-list');
        const items = document.getElementById('dist-products-list').querySelectorAll('.product-item-clean');
        assert.ok(items[0].classList.contains('available'));
        assert.ok(items[1].classList.contains('unavailable'));
    });

    it('affiche les prix', () => {
        renderProductsList({ products: [{ name: 'Test', price: 12.50, available: true }] }, 'dist-products-list');
        const price = document.getElementById('dist-products-list').querySelector('.product-price-clean');
        assert.ok(price.textContent.includes('12.50'));
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
