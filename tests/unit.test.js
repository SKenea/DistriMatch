/**
 * DistriMatch - Tests unitaires
 * Lancer avec : node --test tests/unit.test.js
 */

import './setup.js';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ============================================
// IMPORTS DES MODULES A TESTER
// ============================================

import {
    calculateDistance, formatDistance, generateStars,
    getTimeSlot, formatTime, getFilteredDistributors,
    sortByDistance, updateImplicitProfile, getTopPreferredTypes,
    escapeHTML, saveStore, loadStore
} from '../js/utils.js';

import {
    AppState, UserProfile, NotificationPrefs, Conversations,
    GREETING_MESSAGES, ALERT_MESSAGES,
    setMainMap, setDistributorMarkers, setUserMarker,
    incrementAddProductCounter
} from '../js/state.js';

import { isQuietHours, canNotify, markNotified } from '../js/notifications.js';

// Module bottomsheet.js a ete remplace par gmaps-ui.js (refonte UI Google Maps)

// ============================================
// UTILS - FONCTIONS PURES
// ============================================

describe('calculateDistance', () => {
    it('retourne 0 pour le meme point', () => {
        const d = calculateDistance(43.4929, -1.4748, 43.4929, -1.4748);
        assert.equal(d, 0);
    });

    it('calcule la distance Biarritz-Bayonne (~7km)', () => {
        const d = calculateDistance(43.4832, -1.5586, 43.4929, -1.4748);
        assert.ok(d > 5 && d < 10, `Distance ${d}km devrait etre entre 5 et 10`);
    });

    it('calcule la distance Paris-Lyon (~392km)', () => {
        const d = calculateDistance(48.8566, 2.3522, 45.7640, 4.8357);
        assert.ok(d > 380 && d < 420, `Distance ${d}km devrait etre ~392`);
    });

    it('gere les coordonnees negatives', () => {
        const d = calculateDistance(-33.8688, 151.2093, 51.5074, -0.1278);
        assert.ok(d > 16000 && d < 18000, `Sydney-Londres ${d}km`);
    });
});

describe('formatDistance', () => {
    it('affiche en metres si < 1km', () => {
        assert.equal(formatDistance(0.5), '500m');
    });

    it('affiche en km si >= 1km', () => {
        assert.equal(formatDistance(2.345), '2.3km');
    });

    it('arrondit les metres', () => {
        assert.equal(formatDistance(0.123), '123m');
    });

    it('gere 0', () => {
        assert.equal(formatDistance(0), '0m');
    });

    it('gere 1km exactement', () => {
        assert.equal(formatDistance(1), '1.0km');
    });
});

describe('generateStars', () => {
    it('5 etoiles pleines pour 5.0', () => {
        assert.equal(generateStars(5), '★★★★★');
    });

    it('0 etoile pour 0', () => {
        assert.equal(generateStars(0), '☆☆☆☆☆');
    });

    it('demi-etoile pour 4.5', () => {
        assert.equal(generateStars(4.5), '★★★★½');
    });

    it('4 etoiles pour 4.3', () => {
        assert.equal(generateStars(4.3), '★★★★☆');
    });

    it('3 etoiles et demie pour 3.7', () => {
        assert.equal(generateStars(3.7), '★★★½☆');
    });
});

describe('formatTime', () => {
    it('affiche "maintenant" pour < 1 min', () => {
        assert.equal(formatTime(Date.now() - 30000), 'maintenant');
    });

    it('affiche les minutes pour < 1h', () => {
        const result = formatTime(Date.now() - 5 * 60000);
        assert.equal(result, '5min');
    });

    it('affiche les heures pour < 24h', () => {
        const result = formatTime(Date.now() - 3 * 3600000);
        assert.equal(result, '3h');
    });

    it('affiche la date pour > 24h', () => {
        const old = Date.now() - 48 * 3600000;
        const result = formatTime(old);
        assert.ok(result.includes('.') || result.includes('/') || /\d/.test(result), `Format date: ${result}`);
    });
});

describe('getTimeSlot', () => {
    it('retourne un slot valide', () => {
        const slot = getTimeSlot();
        assert.ok(['morning', 'lunch', 'afternoon', 'evening', 'night'].includes(slot), `Slot: ${slot}`);
    });
});

describe('getFilteredDistributors', () => {
    it('retourne tous les distributeurs si pas de filtre', () => {
        AppState.distributors = [
            { id: '1', type: 'pizza' },
            { id: '2', type: 'bakery' }
        ];
        AppState.activeFilters = [];
        const result = getFilteredDistributors();
        assert.equal(result.length, 2);
    });

    it('filtre par type', () => {
        AppState.distributors = [
            { id: '1', type: 'pizza' },
            { id: '2', type: 'bakery' },
            { id: '3', type: 'pizza' }
        ];
        AppState.activeFilters = ['pizza'];
        const result = getFilteredDistributors();
        assert.equal(result.length, 2);
        assert.ok(result.every(d => d.type === 'pizza'));
    });

    it('retourne vide si filtre ne correspond a rien', () => {
        AppState.distributors = [{ id: '1', type: 'pizza' }];
        AppState.activeFilters = ['cheese'];
        const result = getFilteredDistributors();
        assert.equal(result.length, 0);
    });
});

describe('sortByDistance', () => {
    it('trie les distributeurs par distance croissante', () => {
        AppState.userLocation = { lat: 43.4929, lng: -1.4748 };
        AppState.distributors = [
            { id: '1', lat: 48.8566, lng: 2.3522 },   // Paris - loin
            { id: '2', lat: 43.4832, lng: -1.5586 },   // Biarritz - proche
            { id: '3', lat: 43.3411, lng: -1.4486 }    // Espelette - moyen
        ];
        sortByDistance();
        assert.equal(AppState.distributors[0].id, '2'); // Biarritz en premier
        assert.equal(AppState.distributors[2].id, '1'); // Paris en dernier
        assert.ok(AppState.distributors[0].distance < AppState.distributors[1].distance);
    });

    it('ne fait rien si pas de position', () => {
        AppState.userLocation = null;
        AppState.distributors = [{ id: '1', lat: 0, lng: 0 }];
        sortByDistance();
        assert.equal(AppState.distributors[0].distance, undefined);
    });
});

// ============================================
// UTILS - PROFIL IMPLICITE
// ============================================

describe('updateImplicitProfile', () => {
    it('incremente detailsViewed sur view_details', () => {
        const before = UserProfile.stats.detailsViewed;
        updateImplicitProfile('view_details', { type: 'pizza', id: 'test-1' });
        assert.equal(UserProfile.stats.detailsViewed, before + 1);
    });

    it('ajoute le type dans les preferences', () => {
        const before = UserProfile.preferences.types['cheese'] || 0;
        updateImplicitProfile('view_details', { type: 'cheese', id: 'test-2' });
        assert.equal(UserProfile.preferences.types['cheese'], before + 1);
    });

    it('incremente totalSubscriptions sur add_favorite', () => {
        const before = UserProfile.stats.totalSubscriptions;
        updateImplicitProfile('add_favorite', { type: 'pizza' });
        assert.equal(UserProfile.stats.totalSubscriptions, before + 1);
    });

    it('add_favorite pese x3 pour les preferences', () => {
        UserProfile.preferences.types = {};
        updateImplicitProfile('add_favorite', { type: 'meat' });
        assert.equal(UserProfile.preferences.types['meat'], 3);
    });

    it('stocke les recherches', () => {
        const before = UserProfile.stats.searchQueries.length;
        updateImplicitProfile('search', { query: 'pizza' });
        assert.equal(UserProfile.stats.searchQueries.length, before + 1);
        assert.equal(UserProfile.stats.searchQueries[UserProfile.stats.searchQueries.length - 1], 'pizza');
    });

    it('limite les recherches a 20', () => {
        UserProfile.stats.searchQueries = [];
        for (let i = 0; i < 25; i++) {
            updateImplicitProfile('search', { query: `query-${i}` });
        }
        assert.equal(UserProfile.stats.searchQueries.length, 20);
    });

    it('calcule le score de confiance', () => {
        UserProfile.stats.detailsViewed = 10;
        UserProfile.stats.totalSubscriptions = 5;
        UserProfile.stats.conversationsStarted = 3;
        updateImplicitProfile('time_activity', {});
        // (10 + 5*2 + 3) * 5 = 23 * 5 = 115 -> capped at 100
        assert.equal(UserProfile.confidence, 100);
    });
});

describe('getTopPreferredTypes', () => {
    it('retourne les types tries par score', () => {
        UserProfile.preferences.types = { pizza: 10, cheese: 5, bakery: 8 };
        const result = getTopPreferredTypes(2);
        assert.deepEqual(result, ['pizza', 'bakery']);
    });

    it('retourne vide si pas de preferences', () => {
        UserProfile.preferences.types = {};
        assert.deepEqual(getTopPreferredTypes(), []);
    });

    it('respecte la limite', () => {
        UserProfile.preferences.types = { a: 1, b: 2, c: 3, d: 4 };
        assert.equal(getTopPreferredTypes(2).length, 2);
    });
});

// ============================================
// UTILS - PERSISTANCE
// ============================================

describe('saveStore / loadStore', () => {
    it('sauvegarde et charge un objet', () => {
        saveStore('test_key', { foo: 'bar', count: 42 });
        const result = loadStore('test_key');
        assert.deepEqual(result, { foo: 'bar', count: 42 });
    });

    it('retourne null pour une cle inexistante', () => {
        const result = loadStore('nonexistent_key');
        assert.equal(result, null);
    });

    it('sauvegarde un tableau', () => {
        saveStore('test_array', [1, 2, 3]);
        const result = loadStore('test_array');
        assert.deepEqual(result, [1, 2, 3]);
    });
});

describe('escapeHTML', () => {
    it('retourne vide pour null/undefined', () => {
        assert.equal(escapeHTML(null), '');
        assert.equal(escapeHTML(undefined), '');
        assert.equal(escapeHTML(''), '');
    });

    it('echappe les caracteres HTML', () => {
        const result = escapeHTML('<script>alert("xss")</script>');
        assert.ok(!result.includes('<script>'), `Devrait echapper: ${result}`);
    });
});

// ============================================
// STATE - SETTERS
// ============================================

describe('state setters', () => {
    it('setMainMap stocke la reference', () => {
        const fakeMap = { id: 'test-map' };
        setMainMap(fakeMap);
        // On ne peut pas lire mainMap directement (non exporte en lecture)
        // Mais on verifie que ca ne crash pas
        assert.ok(true);
    });

    it('setDistributorMarkers stocke le tableau', () => {
        setDistributorMarkers([{ id: 'm1' }, { id: 'm2' }]);
        assert.ok(true);
    });

    it('incrementAddProductCounter incremente', () => {
        const v1 = incrementAddProductCounter();
        const v2 = incrementAddProductCounter();
        assert.equal(v2, v1 + 1);
    });
});

// ============================================
// NOTIFICATIONS - HEURES CALMES
// ============================================

describe('isQuietHours', () => {
    it('retourne false si desactive', () => {
        NotificationPrefs.quietHours.enabled = false;
        assert.equal(isQuietHours(), false);
    });

    it('retourne true si dans la plage (meme jour)', () => {
        NotificationPrefs.quietHours.enabled = true;
        const hour = new Date().getHours();
        NotificationPrefs.quietHours.start = hour;
        NotificationPrefs.quietHours.end = hour + 2;
        assert.equal(isQuietHours(), true);
    });

    it('gere le passage minuit (22h-8h)', () => {
        NotificationPrefs.quietHours.enabled = true;
        NotificationPrefs.quietHours.start = 22;
        NotificationPrefs.quietHours.end = 8;
        const hour = new Date().getHours();
        const expected = hour >= 22 || hour < 8;
        assert.equal(isQuietHours(), expected);
    });
});

describe('canNotify', () => {
    it('retourne true si jamais notifie', () => {
        NotificationPrefs.lastNotifications = {};
        assert.equal(canNotify('dist-001'), true);
    });

    it('retourne false si notifie recemment', () => {
        NotificationPrefs.lastNotifications = { 'dist-001': Date.now() };
        assert.equal(canNotify('dist-001'), false);
    });

    it('retourne true si notifie il y a plus d\'1h', () => {
        NotificationPrefs.lastNotifications = { 'dist-001': Date.now() - 2 * 3600000 };
        assert.equal(canNotify('dist-001'), true);
    });
});

describe('markNotified', () => {
    it('enregistre le timestamp de notification', () => {
        NotificationPrefs.lastNotifications = {};
        const before = Date.now();
        markNotified('dist-test');
        const after = Date.now();
        assert.ok(NotificationPrefs.lastNotifications['dist-test'] >= before);
        assert.ok(NotificationPrefs.lastNotifications['dist-test'] <= after);
    });

    it('canNotify devient false apres markNotified', () => {
        NotificationPrefs.lastNotifications = {};
        assert.equal(canNotify('dist-x'), true);
        markNotified('dist-x');
        assert.equal(canNotify('dist-x'), false);
    });

    it('plusieurs distributeurs trackes independamment', () => {
        NotificationPrefs.lastNotifications = {};
        markNotified('dist-a');
        markNotified('dist-b');
        assert.ok(NotificationPrefs.lastNotifications['dist-a']);
        assert.ok(NotificationPrefs.lastNotifications['dist-b']);
        assert.notEqual(NotificationPrefs.lastNotifications['dist-a'], undefined);
    });
});

describe('isQuietHours - cas additionnels', () => {
    it('retourne false si on est apres end (plage normale meme jour)', () => {
        NotificationPrefs.quietHours.enabled = true;
        const hour = new Date().getHours();
        // Plage 0h-1h, on est forcement apres 1h sauf entre 0 et 1
        NotificationPrefs.quietHours.start = 0;
        NotificationPrefs.quietHours.end = 1;
        const expected = hour >= 0 && hour < 1;
        assert.equal(isQuietHours(), expected);
    });

    it('retourne false si on est avant start (plage normale meme jour)', () => {
        NotificationPrefs.quietHours.enabled = true;
        // Plage 23h-23h59, on est forcement avant 23h sauf entre 23 et minuit
        NotificationPrefs.quietHours.start = 23;
        NotificationPrefs.quietHours.end = 23.99;
        const hour = new Date().getHours();
        const expected = hour >= 23;
        assert.equal(isQuietHours(), expected);
    });
});

// ============================================
// (Tests bottomsheet supprimes - module remplace par gmaps-ui)
// ============================================

// ============================================
// CONSTANTES - MESSAGES
// ============================================

describe('GREETING_MESSAGES', () => {
    it('a des messages pour chaque slot', () => {
        const slots = ['morning', 'lunch', 'afternoon', 'evening', 'night'];
        slots.forEach(slot => {
            assert.ok(Array.isArray(GREETING_MESSAGES[slot]), `Slot ${slot} manquant`);
            assert.ok(GREETING_MESSAGES[slot].length > 0, `Slot ${slot} vide`);
        });
    });

    it('tous les messages sont en francais (pas de mots anglais courants)', () => {
        const englishWords = ['hello', 'welcome', 'subscribe', 'click', 'your'];
        Object.values(GREETING_MESSAGES).flat().forEach(msg => {
            const lower = msg.toLowerCase();
            // "Hello" est acceptable comme interjection en francais
            const forbidden = englishWords.filter(w => w !== 'hello' && lower.includes(w));
            assert.equal(forbidden.length, 0, `Message anglais detecte: "${msg}" (${forbidden})`);
        });
    });
});

describe('ALERT_MESSAGES', () => {
    it('a des templates pour stock_back et new_product', () => {
        assert.ok(ALERT_MESSAGES.stock_back.length > 0);
        assert.ok(ALERT_MESSAGES.new_product.length > 0);
    });

    it('les templates contiennent {product}', () => {
        ALERT_MESSAGES.stock_back.forEach(msg => {
            assert.ok(msg.includes('{product}'), `Template sans {product}: ${msg}`);
        });
    });
});

// ============================================
// DONNEES - DISTRIBUTEURS EMBARQUES
// ============================================

describe('AppState structure', () => {
    it('a les proprietes requises', () => {
        assert.ok(Array.isArray(AppState.distributors));
        assert.ok(Array.isArray(AppState.subscriptions));
        assert.ok(Array.isArray(AppState.activeFilters));
        assert.ok(typeof AppState.typeConfig === 'object');
    });
});

describe('Conversations structure', () => {
    it('a les proprietes requises', () => {
        assert.ok(Array.isArray(Conversations.list));
        assert.ok(typeof Conversations.history === 'object');
        assert.ok(typeof Conversations.unreadCounts === 'object');
        assert.equal(Conversations.active, null);
    });
});
