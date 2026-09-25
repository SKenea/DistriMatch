/**
 * DistriMatch - Tests d'integration contre la VRAIE base Supabase
 *
 * Verifie les regles de securite et de metier portees par la base (migrations
 * 007 a 014), la ou une regression coute le plus cher. Chaque cas tourne dans
 * UN bloc PL/pgSQL qui se termine par une exception : la transaction est
 * annulee, RIEN n'est ecrit en base.
 *
 * Roles simules : `set local role anon | authenticated` + claims JWT, comme
 * PostgREST. Le compte utilise est le plus ancien de auth.users (lecture de son
 * id seulement).
 *
 * Lancer : npm run test:integration (ou node --test tests/integration/db.test.js)
 * Prerequis : SUPABASE_ACCESS_TOKEN dans .env.local (API de gestion). Sans
 * jeton, le lot est saute avec un message.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readToken, runSql } from '../../scripts/lib/supabase-management.mjs';

const HAS_TOKEN = !!readToken();
const SKIP = HAS_TOKEN ? false : 'SUPABASE_ACCESS_TOKEN absent (.env.local) : tests contre la vraie base sautes';

const DEMO = 'dist-007';                       // fiche de demo (is_demo), jamais une fiche reelle
const DEVICE = 'itest-device-0000000001';      // >= 16 caracteres, comme un vrai appareil
// L'id est lu en tant que postgres, AVANT de passer en role connecte (qui ne
// peut pas lire auth.users) : variable v_uid declaree en tete de chaque bloc.
const USER = 'v_uid';
const AS_USER = `perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true); set local role authenticated;`;
const AS_ANON = `perform set_config('request.jwt.claims', '{"role":"anon"}', true); set local role anon;`;

// Execute un corps PL/pgSQL puis annule tout. Le corps peut poser `r` (texte)
// comme resultat. Retour : { reachedEnd, code, message, result }.
async function probe(body, declare = '') {
    const sql = `do $$ declare r text; v_uid uuid := (select id from auth.users order by created_at limit 1); ${declare} begin ${body}; raise exception 'PROBE_END %', coalesce(r, ''); end $$;`;
    const { ok, text } = await runSql(sql);
    assert.equal(ok, false, 'le bloc doit toujours se terminer par une exception (transaction annulee)');
    let message = text;
    try { message = JSON.parse(text).message || text; } catch (e) { /* texte brut */ }
    const m = message.match(/ERROR:\s+([0-9A-Z]{5}):\s+([^\n]*)/);
    const code = m ? m[1] : null;
    const msg = m ? m[2] : message;
    if (msg.startsWith('PROBE_END')) {
        return { reachedEnd: true, code: null, message: msg, result: msg.slice('PROBE_END'.length).trim() };
    }
    return { reachedEnd: false, code, message: msg, result: null };
}

async function query(sql) {
    const { ok, rows, text } = await runSql(sql);
    assert.ok(ok, text);
    return rows;
}

const signal = (machine) => `confirm_availability('${DEMO}', '${DEVICE}', '[]'::jsonb, '${machine}')`;

describe('base : signaux (007, 011, 012, 014)', { skip: SKIP }, () => {
    it('sans compte : refuse (28000, « Connexion requise »)', async () => {
        const p = await probe(`${AS_ANON} perform ${signal('working')}`);
        assert.equal(p.reachedEnd, false);
        assert.equal(p.code, '28000');
        assert.match(p.message, /Connexion requise/);
    });

    it('avec un compte : accepte, source « user »', async () => {
        const p = await probe(`${AS_USER} r := ${signal('working')}::text`);
        assert.ok(p.reachedEnd, p.message);
        const res = JSON.parse(p.result);
        assert.equal(res.inserted, 1);
        assert.equal(res.source, 'user');
    });

    it('meme etat deux fois dans l’heure : ignore ; changement d’etat : retenu (correction)', async () => {
        const p = await probe(`${AS_USER} r := json_build_array(${signal('empty')}, ${signal('empty')}, ${signal('working')})::text`);
        assert.ok(p.reachedEnd, p.message);
        const [a, b, c] = JSON.parse(p.result);
        assert.equal(a.inserted, 1);
        assert.equal(b.skipped, 1);
        assert.equal(c.inserted, 1);
    });

    it('produit : « Il y en a » puis « Plus rien » dans l’heure : les deux retenus', async () => {
        const p = await probe(`${AS_USER}
            select id into v_product from products where distributor_id = '${DEMO}' order by id limit 1;
            r := json_build_array(
                confirm_availability('${DEMO}', '${DEVICE}', jsonb_build_array(jsonb_build_object('product_id', v_product, 'state', 'available')), null),
                confirm_availability('${DEMO}', '${DEVICE}', jsonb_build_array(jsonb_build_object('product_id', v_product, 'state', 'absent')), null)
            )::text`, 'v_product bigint;');
        assert.ok(p.reachedEnd, p.message);
        const [a, b] = JSON.parse(p.result);
        assert.equal(a.inserted, 1);
        assert.equal(b.inserted, 1);
    });

    it('21e signal dans l’heure pour un compte : refuse (P0001, par compte)', async () => {
        const p = await probe(`
            insert into availability_signals (distributor_id, product_id, state, source, weight, device_hash, user_id)
            select '${DEMO}', null, 'working', 'user', 0.8, '${DEVICE}', ${USER} from generate_series(1, 20);
            ${AS_USER} perform ${signal('empty')}`);
        assert.equal(p.reachedEnd, false);
        assert.equal(p.code, 'P0001');
        assert.match(p.message, /ce compte/);
    });

    it('changer d’identifiant d’appareil ne contourne pas la limite', async () => {
        const p = await probe(`
            insert into availability_signals (distributor_id, product_id, state, source, weight, device_hash, user_id)
            select '${DEMO}', null, 'working', 'user', 0.8, 'itest-autre-appareil-' || g, ${USER} from generate_series(1, 20) g;
            ${AS_USER} perform confirm_availability('${DEMO}', 'itest-tout-nouvel-appareil', '[]'::jsonb, 'empty')`);
        assert.equal(p.code, 'P0001');
    });

    it('compte bloque : refuse (42501)', async () => {
        const p = await probe(`insert into signal_bans (user_id, reason) values (${USER}, 'itest'); ${AS_USER} perform ${signal('working')}`);
        assert.equal(p.reachedEnd, false);
        assert.equal(p.code, '42501');
        assert.match(p.message, /ne peut plus envoyer/);
    });

    it('ecriture directe dans availability_signals par l’API : refusee', async () => {
        const p = await probe(`${AS_USER}
            insert into availability_signals (distributor_id, product_id, state, source, weight, device_hash, user_id)
            values ('${DEMO}', null, 'working', 'user', 1, '${DEVICE}', ${USER})`);
        assert.equal(p.reachedEnd, false);
        assert.equal(p.code, '42501');
    });
});

describe('base : administration des tricheurs (014)', { skip: SKIP }, () => {
    it('purge_user_signals efface les signaux du compte et le bloque', async () => {
        const p = await probe(`
            insert into availability_signals (distributor_id, product_id, state, source, weight, device_hash, user_id)
            select '${DEMO}', null, 'empty', 'user', 0.8, '${DEVICE}', ${USER} from generate_series(1, 3);
            v_purge := purge_user_signals(${USER}, true, 'itest');
            r := json_build_object(
                'purge', v_purge,
                'reste', (select count(*) from availability_signals where user_id = ${USER}),
                'bloque', exists(select 1 from signal_bans where user_id = ${USER})
            )::text`, 'v_purge jsonb;');
        assert.ok(p.reachedEnd, p.message);
        const res = JSON.parse(p.result);
        assert.ok(res.purge.signaux_supprimes >= 3);
        assert.equal(res.reste, 0);
        assert.equal(res.bloque, true);
    });

    it('fonctions d’admin et de demo : jamais appelables par l’API', async () => {
        const [r] = await query(`select
            has_function_privilege('anon', 'public.purge_user_signals(uuid,boolean,text)', 'execute') as anon_purge,
            has_function_privilege('authenticated', 'public.purge_user_signals(uuid,boolean,text)', 'execute') as auth_purge,
            has_function_privilege('authenticated', 'public.unban_user(uuid)', 'execute') as auth_unban,
            has_function_privilege('anon', 'public.seed_demo_signals(integer)', 'execute') as anon_seed,
            has_function_privilege('authenticated', 'public.purge_demo_data()', 'execute') as auth_purge_demo`);
        assert.deepEqual(r, { anon_purge: false, auth_purge: false, auth_unban: false, anon_seed: false, auth_purge_demo: false });
    });
});

describe('base : fiches (010, 013)', { skip: SKIP }, () => {
    it('un compte connecte change le niveau de prix d’une fiche', async () => {
        const p = await probe(`${AS_USER} update distributors set price_range = price_range where id = '${DEMO}'; get diagnostics v_n = row_count; r := v_n::text`, 'v_n int;');
        assert.ok(p.reachedEnd, p.message);
        assert.equal(p.result, '1');
    });

    it('un compte connecte ne renomme ni ne deplace une fiche (013)', async () => {
        for (const set of ["name = name", "lat = lat", "address = address"]) {
            const p = await probe(`${AS_USER} update distributors set ${set} where id = '${DEMO}'`);
            assert.equal(p.code, '42501', set);
        }
    });

    it('un visiteur ne modifie rien', async () => {
        const p = await probe(`${AS_ANON} update distributors set price_range = price_range where id = '${DEMO}'`);
        assert.equal(p.code, '42501');
    });

    it('une fiche ajoutee par un compte ne peut pas se declarer « demo » (010)', async () => {
        const p = await probe(`${AS_USER}
            insert into distributors (id, name, type, lat, lng, is_user_added, added_by, is_demo)
            values ('itest-fiche', 'Fiche itest', 'other', 43.49, -1.47, true, ${USER}, true);
            select is_demo::text into r from distributors where id = 'itest-fiche'`);
        assert.ok(p.reachedEnd, p.message);
        assert.equal(p.result, 'false');
    });
});

describe('base : lectures anonymes', { skip: SKIP }, () => {
    it('un visiteur lit les fiches, les produits et les vues de signaux', async () => {
        const p = await probe(`${AS_ANON}
            r := json_build_object(
                'fiches', (select count(*) from distributors),
                'produits', (select count(*) from products),
                'etat', (select count(*) from distributor_status),
                'dispo', (select count(*) from product_availability)
            )::text`);
        assert.ok(p.reachedEnd, p.message);
        const res = JSON.parse(p.result);
        assert.ok(res.fiches > 0);
        assert.ok(res.produits > 0);
    });
});

describe('base : rien n’a ete ecrit par ces tests', { skip: SKIP }, () => {
    before(async () => { /* les blocs precedents sont tous annules */ });
    it('aucune trace « itest » en base', async () => {
        const [r] = await query(`select
            (select count(*) from availability_signals where device_hash like 'itest-%') as signaux,
            (select count(*) from distributors where id like 'itest-%') as fiches,
            (select count(*) from signal_bans where reason = 'itest') as bans`);
        assert.deepEqual(r, { signaux: 0, fiches: 0, bans: 0 });
    });
});
