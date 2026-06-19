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
    <div id="toast-container" role="status" aria-live="polite" aria-atomic="true"></div>

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
const { getUnreadCount, updateNotificationsBadge, openNotificationsView, deleteNotification, clearAllNotifications, promptAddProductFollow } = await import('../js/notifications.js');
const { NotificationQueue } = await import('../js/state.js');
const { activateFocusTrap, deactivateFocusTrap } = await import('../js/focus-trap.js');

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

    it('canEdit + lecture : stylo "Modifier" visible (gate au clic)', () => {
        openDistributorModal('dist-test', false, true);
        assert.notEqual(document.getElementById('dist-action-edit').style.display, 'none');
    });

    it('sans canEdit : stylo masque', () => {
        openDistributorModal('dist-test', false, false);
        assert.equal(document.getElementById('dist-action-edit').style.display, 'none');
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

    it('lecture : affiche la dispo, AUCUN prix', () => {
        renderProductsList({ products: [{ name: 'Test', available: true }] }, 'dist-products-list');
        const list = document.getElementById('dist-products-list');
        assert.equal(list.querySelector('.product-price-clean'), null, 'plus de prix');
        assert.ok(list.querySelector('.product-availability-clean'), 'dispo affichee');
        assert.ok(list.querySelector('.product-name-clean').textContent.includes('Test'));
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
        assert.ok(chip.textContent.includes('Disponible'), 'libelle Disponible');
    });

    it('edition : pastille indisponible si available=false', () => {
        renderProductsList({ products: [{ name: 'X', available: false }] }, 'dist-products-list', { readonly: false });
        const chip = document.getElementById('dist-products-list').querySelector('.product-availability-chip');
        assert.ok(chip.classList.contains('is-unavailable'));
        assert.ok(chip.textContent.includes('Indisponible'));
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

    it('deleteNotification retire un item et recalcule le badge', () => {
        NotificationQueue.history = [
            { type: 'proximity', message: 'A', read: false, timestamp: Date.now() },
            { type: 'stock', message: 'B', read: false, timestamp: Date.now() }
        ];
        openNotificationsView();           // rend + marque lu
        NotificationQueue.history[0].read = false; // simuler 1 non-lue
        deleteNotification(0);
        assert.equal(NotificationQueue.history.length, 1);
        assert.equal(NotificationQueue.history[0].message, 'B');
        assert.equal(document.querySelectorAll('#notifications-list .notif-item').length, 1);
        assert.equal(getUnreadCount(), 0);
    });

    it('deleteNotification ignore un index hors borne', () => {
        NotificationQueue.history = [{ type: 'proximity', message: 'X', read: true }];
        deleteNotification(5);
        deleteNotification(-1);
        assert.equal(NotificationQueue.history.length, 1);
    });

    it('clearAllNotifications vide tout (confirm ok) + empty state + bouton cache', () => {
        const prev = globalThis.confirm;
        globalThis.confirm = () => true;
        NotificationQueue.history = [
            { type: 'proximity', message: 'A', read: false },
            { type: 'stock', message: 'B', read: false }
        ];
        clearAllNotifications();
        globalThis.confirm = prev;
        assert.equal(NotificationQueue.history.length, 0);
        assert.notEqual(document.getElementById('notifications-empty').style.display, 'none');
        assert.equal(document.getElementById('clear-notifications').style.display, 'none');
        assert.equal(document.getElementById('notifications-badge').style.display, 'none');
    });

    it('clearAllNotifications annule si confirm refuse', () => {
        const prev = globalThis.confirm;
        globalThis.confirm = () => false;
        NotificationQueue.history = [{ type: 'proximity', message: 'A', read: false }];
        clearAllNotifications();
        globalThis.confirm = prev;
        assert.equal(NotificationQueue.history.length, 1);
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
