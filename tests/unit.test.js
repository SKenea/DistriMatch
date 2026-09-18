/**
 * DistriMatch - Tests unitaires
 * Lancer avec : node --test tests/unit.test.js
 */

import './setup.js';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ============================================
// IMPORTS DES MODULES A TESTER
// ============================================

import {
    calculateDistance, formatDistance, generateStars,
    getTimeSlot, formatTime, getFilteredDistributors,
    sortByDistance, updateImplicitProfile, getTopPreferredTypes,
    escapeHTML, saveStore, loadStore,
    saveUserDistributor, loadUserDistributors, getLevelInfo,
    timeAgo, getFreshness, getDeviceId, buildAvailabilityPayload, describeRhythm
} from '../js/utils.js';

import {
    AppState, UserProfile, NotificationPrefs, Conversations,
    GREETING_MESSAGES, ALERT_MESSAGES,
    setMainMap, setDistributorMarkers, setUserMarker,
    incrementAddProductCounter
} from '../js/state.js';

import { isQuietHours, canNotify, markNotified } from '../js/notifications.js';
import { generateGreetingMessage } from '../js/chat.js';
import { readFileSync, readdirSync } from 'node:fs';
import { buildEventArgs, logEvent, rememberEntrySource, getEntrySource, EVENT_TYPES, ENTRY_SOURCE_KEY } from '../js/events.js';
import { setSupabaseClient } from '../js/state.js';

// Module bottomsheet.js a ete remplace par gmaps-ui.js (refonte UI Google Maps)

// ============================================
// FRAICHEUR - getFreshness / timeAgo
// ============================================
// La confiance = l'horodatage : vert seulement si < 2 h, jamais un vert perime,
// "Pas encore verifie" quand la date est absente, invalide ou dans le futur.

describe('getFreshness / timeAgo (fraicheur distributeur)', () => {
    const now = Date.parse('2026-09-15T12:00:00Z');
    const MIN = 60000;
    const H = 3600000;

    it('59 min -> fresh, "Vérifié il y a 59 min"', () => {
        const f = getFreshness(new Date(now - 59 * MIN), now);
        assert.equal(f.state, 'fresh');
        assert.equal(f.label, 'Vérifié il y a 59 min');
    });

    it('60 min -> fresh (< 2 h), "Vérifié il y a 1 h"', () => {
        const f = getFreshness(now - 60 * MIN, now);
        assert.equal(f.state, 'fresh');
        assert.equal(f.label, 'Vérifié il y a 1 h');
    });

    it('2 h pile -> stale (le vert s\'eteint a 2 h)', () => {
        const f = getFreshness(now - 2 * H, now);
        assert.equal(f.state, 'stale');
        assert.equal(f.label, 'Vérifié il y a 2 h');
    });

    it('24 h -> stale, "Vérifié il y a 1 j"', () => {
        const f = getFreshness(now - 24 * H, now);
        assert.equal(f.state, 'stale');
        assert.equal(f.label, 'Vérifié il y a 1 j');
    });

    it('absent ou invalide -> unknown, "Pas encore vérifié"', () => {
        for (const v of [undefined, null, '', 'n/a', 'demain']) {
            const f = getFreshness(v, now);
            assert.equal(f.state, 'unknown', `valeur ${String(v)}`);
            assert.equal(f.label, 'Pas encore vérifié');
        }
    });

    it('date dans le futur -> unknown (jamais un faux vert)', () => {
        assert.equal(getFreshness(now + 10 * MIN, now).state, 'unknown');
    });

    it('accepte l\'ISO Supabase et la date courte du JSON', () => {
        for (const v of ['2025-12-05T00:00:00+00:00', '2025-12-05']) {
            const f = getFreshness(v, now);
            assert.equal(f.state, 'stale');
            assert.match(f.label, /^Vérifié il y a \d+ j$/);
        }
    });

    it('timeAgo : moins d\'une minute -> "a l\'instant"', () => {
        assert.equal(timeAgo(now - 30000, now), "a l'instant");
    });
});

// ============================================
// SIGNAL DE DISPO EN UN TAP (UC11) - payload + identifiant d'appareil
// ============================================

describe('signal de dispo (UC11) : getDeviceId / buildAvailabilityPayload', () => {
    const DEVICE = 'device-0123456789abcdef';

    it('getDeviceId est stable entre deux appels et assez long pour la RPC (>= 16)', () => {
        const a = getDeviceId();
        const b = getDeviceId();
        assert.equal(a, b);
        assert.ok(a.length >= 16);
    });

    it('exclut les produits "pas regarde" et les ids non numeriques', () => {
        const p = buildAvailabilityPayload('dist-001', DEVICE, { 1: 'available', 2: 'unseen', abc: 'absent', 3: 'absent' }, null);
        assert.deepEqual(p.p_product_signals, [{ product_id: 1, state: 'available' }, { product_id: 3, state: 'absent' }]);
        assert.equal(p.p_machine_state, null);
        assert.equal(p.p_distributor_id, 'dist-001');
        assert.equal(p.p_device_hash, DEVICE);
    });

    it('etat machine borne a empty / broken, sinon null', () => {
        assert.equal(buildAvailabilityPayload('d', DEVICE, {}, 'empty').p_machine_state, 'empty');
        assert.equal(buildAvailabilityPayload('d', DEVICE, {}, 'broken').p_machine_state, 'broken');
        assert.equal(buildAvailabilityPayload('d', DEVICE, {}, 'autre').p_machine_state, null);
    });

    it('rien de coche -> payload vide (cote UI, Envoyer reste desactive)', () => {
        const p = buildAvailabilityPayload('d', DEVICE);
        assert.deepEqual(p.p_product_signals, []);
        assert.equal(p.p_machine_state, null);
    });
});

// ============================================
// A11Y - CONTRASTE DU TEXTE SECONDAIRE (WCAG 1.4.3 AA)
// ============================================
// --gray-light (#A89B8C) est trop clair pour du texte (~2,6:1). Le texte et
// les icones secondaires utilisent --text-muted, qui doit tenir >= 4,5:1 sur
// les trois fonds clairs de l'app ; --gray-light reste reserve au non-texte.

function relativeLuminance(hex) {
    const c = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4]
        .map(i => parseInt(c.substr(i, 2), 16) / 255)
        .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a, b) {
    const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
}

// ============================================
// MESURE DU PILOTE (008) : buildEventArgs / rememberEntrySource / logEvent
// ============================================
// Les evenements passent par la RPC log_event et ne portent aucune donnee
// personnelle ; un type inconnu n'est jamais envoye ; sans client Supabase
// c'est un no-op silencieux : la mesure ne casse jamais l'app.

describe('mesure du pilote : buildEventArgs / rememberEntrySource / logEvent', () => {
    beforeEach(() => { sessionStorage.clear(); setSupabaseClient(null); });

    it('type inconnu -> null (rien n\'est envoye)', () => {
        assert.equal(buildEventArgs('clic_random'), null);
        assert.equal(buildEventArgs(undefined), null);
        assert.equal(EVENT_TYPES.length, 6);
    });

    it('arguments nommes comme la RPC, source organic par defaut, sans distributeur', () => {
        const args = buildEventArgs('app_ouverte', {}, 'device-0123456789abcdef');
        assert.deepEqual(args, {
            p_type: 'app_ouverte', p_device_hash: 'device-0123456789abcdef', p_distributor_id: null, p_source: 'organic'
        });
    });

    it('l\'appareil est identifie par getDeviceId (aleatoire local), rien d\'autre ne part', () => {
        const args = buildEventArgs('fiche_ouverte', { distributorId: 'dist-002' });
        assert.equal(args.p_device_hash, getDeviceId());
        assert.equal(args.p_distributor_id, 'dist-002');
        assert.deepEqual(Object.keys(args).sort(), ['p_device_hash', 'p_distributor_id', 'p_source', 'p_type']);
    });

    it('la source suit l\'origine de la session (&src=qr) ; une source explicite prime', () => {
        assert.equal(rememberEntrySource('?id=dist-001'), null);
        assert.equal(getEntrySource(), 'organic');
        assert.equal(rememberEntrySource('?id=dist-001&confirm=1&src=qr'), 'qr');
        assert.equal(getEntrySource(), 'qr');
        assert.equal(sessionStorage.getItem(ENTRY_SOURCE_KEY), 'qr');
        assert.equal(buildEventArgs('qr_scan', { distributorId: 'dist-001' }).p_source, 'qr');
        assert.equal(buildEventArgs('itineraire', { source: 'organic' }).p_source, 'organic');
    });

    it('logEvent sans client Supabase : no-op silencieux', () => {
        assert.doesNotThrow(() => logEvent('app_ouverte'));
    });

    it('logEvent appelle la RPC log_event en fire-and-forget, ignore les types inconnus et avale les erreurs', async () => {
        const calls = [];
        setSupabaseClient({ rpc: async (name, args) => { calls.push([name, args]); return { error: { message: 'boom' } }; } });
        logEvent('itineraire', { distributorId: 'dist-003' });
        logEvent('type_inconnu');
        await new Promise(r => setTimeout(r, 10));
        assert.equal(calls.length, 1);
        assert.equal(calls[0][0], 'log_event');
        assert.equal(calls[0][1].p_type, 'itineraire');
        assert.equal(calls[0][1].p_distributor_id, 'dist-003');

        setSupabaseClient({ rpc: async () => { throw new Error('reseau'); } });
        assert.doesNotThrow(() => logEvent('app_ouverte'));
        await new Promise(r => setTimeout(r, 10));
    });
});

// ============================================
// RYTHME INFERE (couche 2) : describeRhythm
// ============================================
// Jamais une phrase inventee : il faut >= 3 signaux produit sur la tranche,
// >= 70 % de "vu dispo" pour "plein", <= 30 % pour "souvent vide".

describe('describeRhythm (rythme infere depuis product_rhythm)', () => {
    const row = (tranche, signaux_produit, pct_dispo) => ({ distributor_id: 'dist-002', tranche, signaux_produit, pct_dispo, signaux_machine_ko: 0 });

    it('profil boulangerie : plein le matin, souvent vide l\'apres-midi et le soir', () => {
        const rows = [row('matin', 40, 86), row('midi', 40, 55), row('apres-midi', 40, 15), row('soir', 40, 4)];
        assert.equal(describeRhythm(rows), 'Habituellement plein le matin, souvent vide l\'après-midi et le soir');
    });

    it('les tranches sortent toujours dans l\'ordre de la journee, quel que soit l\'ordre des lignes', () => {
        const rows = [row('soir', 10, 90), row('matin', 10, 90), row('midi', 10, 90)];
        assert.equal(describeRhythm(rows), 'Habituellement plein le matin, à midi et le soir');
    });

    it('seuils : 70 % est plein, 30 % est vide, entre les deux rien ; moins de 3 signaux ne compte pas', () => {
        assert.equal(describeRhythm([row('matin', 3, 70)]), 'Habituellement plein le matin');
        assert.equal(describeRhythm([row('matin', 3, 30)]), 'Souvent vide le matin');
        assert.equal(describeRhythm([row('matin', 3, 69)]), null);
        assert.equal(describeRhythm([row('matin', 3, 31)]), null);
        assert.equal(describeRhythm([row('matin', 2, 100)]), null);
        assert.equal(describeRhythm([row('matin', 0, null)]), null);
    });

    it('valeurs numeriques en chaines (PostgREST) acceptees', () => {
        assert.equal(describeRhythm([row('soir', '12', '75')]), 'Habituellement plein le soir');
    });

    it('rien a dire -> null (aucune ligne, tableau vide, valeur absente, tranche inconnue)', () => {
        assert.equal(describeRhythm([]), null);
        assert.equal(describeRhythm(null), null);
        assert.equal(describeRhythm(undefined), null);
        assert.equal(describeRhythm([row('nuit', 50, 100)]), null);
    });
});

describe('a11y : contraste du texte secondaire (WCAG 1.4.3 AA)', () => {
    const cssDir = new URL('../css/', import.meta.url);
    const base = readFileSync(new URL('base.css', cssDir), 'utf8');
    const cssVar = (name) => base.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
    const BACKGROUNDS = ['--white', '--light', '--lighter'];

    it('les variables de couleur sont definies dans base.css', () => {
        for (const name of ['--text-muted', '--gray', '--gray-light', ...BACKGROUNDS]) {
            assert.ok(cssVar(name), `${name} manquante dans :root`);
        }
    });

    it('--text-muted et --gray tiennent >= 4.5:1 sur --white, --light et --lighter', () => {
        for (const fg of ['--text-muted', '--gray']) {
            for (const bg of BACKGROUNDS) {
                const ratio = contrastRatio(cssVar(fg), cssVar(bg));
                assert.ok(ratio >= 4.5, `${fg} ${cssVar(fg)} sur ${bg} ${cssVar(bg)} : ${ratio.toFixed(2)}:1 < 4.5`);
            }
        }
    });

    it('--primary-text et --success-dark (texte rouge / vert, fonds a texte blanc) tiennent >= 4.5:1', () => {
        for (const fg of ['--primary-text', '--success-dark']) {
            assert.ok(cssVar(fg), `${fg} manquante dans :root`);
            for (const bg of BACKGROUNDS) {
                const ratio = contrastRatio(cssVar(fg), cssVar(bg));
                assert.ok(ratio >= 4.5, `${fg} ${cssVar(fg)} sur ${bg} ${cssVar(bg)} : ${ratio.toFixed(2)}:1 < 4.5`);
            }
            assert.ok(contrastRatio('#ffffff', cssVar(fg)) >= 4.5, `blanc sur ${fg} < 4.5`);
        }
    });

    it('aucune regle CSS n\'utilise --primary (4,17:1) ni --success (3,35:1) comme couleur de texte', () => {
        const offenders = [];
        for (const file of readdirSync(cssDir).filter(f => f.endsWith('.css'))) {
            const css = readFileSync(new URL(file, cssDir), 'utf8');
            for (const block of css.split('}')) {
                const open = block.indexOf('{');
                if (open === -1) continue;
                const body = block.slice(open + 1);
                if (/(^|[\s;{])color:\s*var\(--(primary|success)\)/.test(body)) {
                    offenders.push(`${file} : ${block.slice(0, open).trim().split('\n').pop().trim()}`);
                }
            }
        }
        assert.deepEqual(offenders, [], `texte en --primary / --success :\n${offenders.join('\n')}`);
    });

    it('aucune regle CSS n\'utilise --gray-light comme couleur de texte (color:)', () => {
        const offenders = [];
        for (const file of readdirSync(cssDir).filter(f => f.endsWith('.css'))) {
            const css = readFileSync(new URL(file, cssDir), 'utf8');
            for (const block of css.split('}')) {
                const open = block.indexOf('{');
                if (open === -1) continue;
                const body = block.slice(open + 1);
                if (/(^|[\s;{])color:\s*var\(--gray-light\)/.test(body)) {
                    offenders.push(`${file} : ${block.slice(0, open).trim().split('\n').pop().trim()}`);
                }
            }
        }
        assert.deepEqual(offenders, [], `texte en --gray-light :\n${offenders.join('\n')}`);
    });
});

// ============================================
// CACHE-BUSTING - IMPORT MAP DE index.html
// ============================================
// Pas de build : la version des modules ES est portee par l'import map de
// index.html. Ce test verrouille que tout module de js/ importe par un autre
// (ou par index.html) y figure, avec une seule et meme version ?v=N.

describe('cache-busting : import map de index.html', () => {
    const root = new URL('../', import.meta.url);
    const jsDir = new URL('js/', root);
    const html = readFileSync(new URL('index.html', root), 'utf8');
    const match = html.match(/<script type="importmap">\s*([\s\S]*?)\s*<\/script>/);
    const imports = match ? JSON.parse(match[1]).imports : {};
    const modules = readdirSync(jsDir).filter(f => f.endsWith('.js'));

    // Modules de js/ importes (statiquement ou dynamiquement) par un autre module
    function importedModules() {
        const found = new Set(['app.js']); // point d'entree charge par index.html
        const staticRe = /import\s+(?:[^'"]*?\s+from\s+)?['"]\.\/([\w-]+\.js)['"]/g;
        const dynamicRe = /import\(\s*['"]\.\/([\w-]+\.js)['"]\s*\)/g;
        for (const file of modules) {
            const src = readFileSync(new URL(file, jsDir), 'utf8');
            for (const m of src.matchAll(staticRe)) if (modules.includes(m[1])) found.add(m[1]);
            for (const m of src.matchAll(dynamicRe)) if (modules.includes(m[1])) found.add(m[1]);
        }
        return found;
    }

    it('index.html declare une import map avec des entrees', () => {
        assert.ok(match, 'pas de <script type="importmap"> dans index.html');
        assert.ok(Object.keys(imports).length > 0, 'import map vide');
    });

    it('chaque module importe est couvert par l\'import map', () => {
        for (const file of importedModules()) {
            assert.ok(imports[`./js/${file}`], `js/${file} est importe mais absent de l'import map`);
        }
    });

    it('toutes les entrees partagent une seule version ?v=N et pointent vers leur propre fichier', () => {
        const versions = new Set();
        for (const [key, value] of Object.entries(imports)) {
            const m = value.match(/^(\.\/js\/[\w-]+\.js)\?v=(\d+)$/);
            assert.ok(m, `entree ${key} -> ${value} : attendu ./js/<fichier>.js?v=N`);
            assert.equal(m[1], key, `entree ${key} pointe vers un autre fichier (${m[1]})`);
            versions.add(m[2]);
        }
        assert.equal(versions.size, 1, `plusieurs versions dans l'import map : ${[...versions].join(', ')}`);
    });

    it('aucune entree ne pointe vers un fichier absent de js/', () => {
        for (const key of Object.keys(imports)) {
            assert.ok(modules.includes(key.replace('./js/', '')), `${key} n'existe pas dans js/`);
        }
    });

    it('app.js est charge via l\'import map, pas via un src="js/app.js?v=" a part', () => {
        assert.doesNotMatch(html, /src="js\/app\.js/);
    });
});

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
    const ORIGINAL_DATE = global.Date;

    function mockHour(hour) {
        global.Date = class extends ORIGINAL_DATE {
            constructor(...args) {
                if (args.length === 0) {
                    super(2026, 0, 1, hour, 0, 0);
                } else {
                    super(...args);
                }
            }
            static now() {
                return new ORIGINAL_DATE(2026, 0, 1, hour, 0, 0).getTime();
            }
        };
    }

    function withMockedHour(hour, fn) {
        mockHour(hour);
        try {
            fn();
        } finally {
            global.Date = ORIGINAL_DATE;
        }
    }

    it('retourne un slot valide', () => {
        const slot = getTimeSlot();
        assert.ok(['morning', 'lunch', 'afternoon', 'evening', 'night'].includes(slot), `Slot: ${slot}`);
    });

    it('6h-10h59 = morning', () => {
        withMockedHour(6, () => assert.equal(getTimeSlot(), 'morning'));
        withMockedHour(10, () => assert.equal(getTimeSlot(), 'morning'));
    });

    it('11h-13h59 = lunch', () => {
        withMockedHour(11, () => assert.equal(getTimeSlot(), 'lunch'));
        withMockedHour(13, () => assert.equal(getTimeSlot(), 'lunch'));
    });

    it('14h-17h59 = afternoon', () => {
        withMockedHour(14, () => assert.equal(getTimeSlot(), 'afternoon'));
        withMockedHour(17, () => assert.equal(getTimeSlot(), 'afternoon'));
    });

    it('18h-21h59 = evening', () => {
        withMockedHour(18, () => assert.equal(getTimeSlot(), 'evening'));
        withMockedHour(21, () => assert.equal(getTimeSlot(), 'evening'));
    });

    it('22h-5h59 = night', () => {
        withMockedHour(22, () => assert.equal(getTimeSlot(), 'night'));
        withMockedHour(3, () => assert.equal(getTimeSlot(), 'night'));
        withMockedHour(5, () => assert.equal(getTimeSlot(), 'night'));
    });
});

// ============================================
// CHAT - generateGreetingMessage
// ============================================

describe('generateGreetingMessage', () => {
    it('retourne un objet avec text et category', () => {
        const result = generateGreetingMessage({ id: 'd1', name: 'Test' }, 'morning');
        assert.ok(typeof result.text === 'string');
        assert.equal(result.category, 'greeting_morning');
    });

    it('utilise les messages du timeSlot demande', () => {
        const result = generateGreetingMessage({ id: 'd1' }, 'lunch');
        assert.ok(GREETING_MESSAGES.lunch.includes(result.text));
        assert.equal(result.category, 'greeting_lunch');
    });

    it('fallback sur morning si timeSlot inconnu', () => {
        const result = generateGreetingMessage({ id: 'd1' }, 'invalid');
        assert.ok(GREETING_MESSAGES.morning.includes(result.text));
        assert.equal(result.category, 'greeting_invalid');
    });

    it('fonctionne pour chaque timeSlot valide', () => {
        ['morning', 'lunch', 'afternoon', 'evening', 'night'].forEach(slot => {
            const result = generateGreetingMessage({ id: 'd1' }, slot);
            assert.ok(GREETING_MESSAGES[slot].includes(result.text), `Slot ${slot} non couvert`);
        });
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

describe('getLevelInfo (niveau Local Guides)', () => {
    it('0 point -> Explorateur niveau 1, 0%', () => {
        const i = getLevelInfo(0);
        assert.equal(i.level, 1);
        assert.equal(i.name, 'Explorateur');
        assert.equal(i.progress, 0);
        assert.equal(i.isMax, false);
        assert.equal(i.next.name, 'Éclaireur');
        assert.equal(i.toNext, 20);
    });

    it('pile sur un palier -> niveau de ce palier', () => {
        const i = getLevelInfo(60);
        assert.equal(i.name, 'Habitué');
        assert.equal(i.progress, 0); // (60-60)/(150-60)
        assert.equal(i.toNext, 90);
    });

    it('entre 2 paliers -> progression correcte', () => {
        const i = getLevelInfo(100); // Habitué[60] -> Ambassadeur[150]
        assert.equal(i.name, 'Habitué');
        assert.equal(i.progress, 44); // round(40/90*100)
        assert.equal(i.next.name, 'Ambassadeur');
        assert.equal(i.toNext, 50);
    });

    it('au-dela du dernier palier -> niveau max', () => {
        const i = getLevelInfo(99999);
        assert.equal(i.name, 'Légende du coin');
        assert.equal(i.isMax, true);
        assert.equal(i.next, null);
        assert.equal(i.progress, 100);
        assert.equal(i.toNext, 0);
    });

    it('points invalides/negatifs -> niveau 1', () => {
        assert.equal(getLevelInfo(undefined).level, 1);
        assert.equal(getLevelInfo(-50).level, 1);
        assert.equal(getLevelInfo(NaN).name, 'Explorateur');
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

describe('saveUserDistributor (upsert par id)', () => {
    it('sauvegarde un nouveau distributeur', () => {
        localStorage.clear();
        saveUserDistributor({ id: 'user-1', name: 'A' });
        assert.deepEqual(loadUserDistributors(), [{ id: 'user-1', name: 'A' }]);
    });

    it('ne cree pas de doublon si appele 2 fois avec le meme id', () => {
        localStorage.clear();
        saveUserDistributor({ id: 'user-1', name: 'A' });
        saveUserDistributor({ id: 'user-1', name: 'A' });
        const all = loadUserDistributors();
        assert.equal(all.length, 1);
        assert.equal(all.filter((d) => d.id === 'user-1').length, 1);
    });

    it('remplace l\'entree existante (version la plus recente conservee)', () => {
        localStorage.clear();
        saveUserDistributor({ id: 'user-1', name: 'Ancien' });
        saveUserDistributor({ id: 'user-1', name: 'Nouveau' });
        const all = loadUserDistributors();
        assert.equal(all.length, 1);
        assert.equal(all[0].name, 'Nouveau');
    });

    it('conserve les distributeurs d\'ids differents', () => {
        localStorage.clear();
        saveUserDistributor({ id: 'user-1', name: 'A' });
        saveUserDistributor({ id: 'user-2', name: 'B' });
        assert.equal(loadUserDistributors().length, 2);
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
