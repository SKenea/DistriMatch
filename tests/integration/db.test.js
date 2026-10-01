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

    // EPIC-T15 (018) : un membre ne se fait pas passer pour OpenStreetMap
    it('une fiche ajoutee par un compte est toujours source « user », meme si elle dit « osm »', async () => {
        const p = await probe(`${AS_USER}
            insert into distributors (id, name, type, lat, lng, is_user_added, added_by, source)
            values ('itest-osm', 'Fiche itest', 'other', 43.49, -1.47, true, ${USER}, 'osm');
            select source into r from distributors where id = 'itest-osm'`);
        assert.ok(p.reachedEnd, p.message);
        assert.equal(p.result, 'user');
    });

    // EPIC-T17 (019) : les horaires viennent d'OSM, un membre n'en pose pas
    it('un compte connecte ne pose ni ne change les horaires d’une fiche', async () => {
        const ins = await probe(`${AS_USER}
            insert into distributors (id, name, type, lat, lng, is_user_added, added_by, opening_hours)
            values ('itest-oh', 'Fiche itest', 'other', 43.49, -1.47, true, ${USER}, '24/7');
            select coalesce(opening_hours, 'null') into r from distributors where id = 'itest-oh'`);
        assert.ok(ins.reachedEnd, ins.message);
        assert.equal(ins.result, 'null');
        const upd = await probe(`${AS_USER} update distributors set opening_hours = '24/7' where id = '${DEMO}'`);
        assert.equal(upd.code, '42501');
    });

    it('les fiches OSM ont leurs horaires (019) et un visiteur les lit', async () => {
        const rows = await query("select count(*)::int as n from distributors where source = 'osm' and opening_hours is not null");
        assert.ok(rows[0].n > 0);
        const p = await probe(`${AS_ANON} select count(*)::text into r from distributors where opening_hours is not null`);
        assert.ok(p.reachedEnd, p.message);
        assert.equal(p.result, String(rows[0].n));
    });

    it('les fiches importees d’OSM existent (source « osm », id osm-..., pas encore verifiees)', async () => {
        const rows = await query("select count(*)::int as n, count(*) filter (where id not like 'osm-%')::int as bad, count(*) filter (where is_demo)::int as demo from distributors where source = 'osm'");
        assert.ok(rows[0].n > 0);
        assert.equal(rows[0].bad, 0);
        assert.equal(rows[0].demo, 0);
    });
});

describe('base : avis (016)', { skip: SKIP }, () => {
    const insertReview = (rating = 4, body = "'itest avis'") =>
        `insert into reviews (distributor_id, rating, body) values ('${DEMO}', ${rating}, ${body})`;

    it('sans compte : impossible de deposer un avis', async () => {
        const p = await probe(`${AS_ANON} ${insertReview()}`);
        assert.equal(p.reachedEnd, false);
        assert.equal(p.code, '42501');
    });

    it('avec un compte : avis depose, auteur et compte forces par la base', async () => {
        const p = await probe(`${AS_USER} ${insertReview()};
            select json_build_object('auteur', author_name, 'moi', user_id = auth.uid())::text into r
              from reviews where distributor_id = '${DEMO}' and user_id = auth.uid()`);
        assert.ok(p.reachedEnd, p.message);
        assert.deepEqual(JSON.parse(p.result), { auteur: 'Membre DistriMatch', moi: true });
    });

    it('un seul avis par compte et par machine (23505)', async () => {
        const p = await probe(`${AS_USER} ${insertReview()}; ${insertReview(5)}`);
        assert.equal(p.code, '23505');
    });

    it('on modifie et supprime son avis, jamais celui d\u2019un autre', async () => {
        const p = await probe(`${AS_USER} ${insertReview(2)};
            update reviews set rating = 5 where distributor_id = '${DEMO}' and user_id = auth.uid();
            update reviews set rating = 1 where distributor_id = '${DEMO}' and user_id is null;
            get diagnostics v_n = row_count;
            r := json_build_object(
                'mien', (select rating from reviews where distributor_id = '${DEMO}' and user_id = auth.uid()),
                'autres_modifies', v_n
            )::text;
            delete from reviews where distributor_id = '${DEMO}' and user_id is null;
            get diagnostics v_n = row_count;
            r := (r::jsonb || jsonb_build_object('autres_supprimes', v_n))::text`, 'v_n int;');
        assert.ok(p.reachedEnd, p.message);
        assert.deepEqual(JSON.parse(p.result), { mien: 5, autres_modifies: 0, autres_supprimes: 0 });
    });

    it('on ne choisit ni l\u2019auteur ni le compte (droits par colonne)', async () => {
        const p = await probe(`${AS_USER} insert into reviews (distributor_id, rating, author_name) values ('${DEMO}', 5, 'Faux nom')`);
        assert.equal(p.code, '42501');
    });

    it('note hors bornes ou commentaire de plus de 500 caracteres : refuses (23514)', async () => {
        assert.equal((await probe(`${AS_USER} ${insertReview(6)}`)).code, '23514');
        assert.equal((await probe(`${AS_USER} ${insertReview(4, "repeat('a', 501)")}`)).code, '23514');
    });

    it('11e avis dans l\u2019heure pour un compte : refuse (P0001)', async () => {
        const p = await probe(`
            insert into reviews (distributor_id, user_id, rating)
            select id, ${USER}, 4 from distributors where is_demo and id <> '${DEMO}' order by id limit 10;
            ${AS_USER} ${insertReview()}`);
        assert.equal(p.code, 'P0001');
        assert.match(p.message, /ce compte/);
    });

    it('compte bloque : refuse (42501)', async () => {
        const p = await probe(`insert into signal_bans (user_id, reason) values (${USER}, 'itest'); ${AS_USER} ${insertReview()}`);
        assert.equal(p.code, '42501');
        assert.match(p.message, /publier/);
    });

    it('la note affichee vient des avis (vue lisible par un visiteur)', async () => {
        const p = await probe(`${AS_ANON}
            select json_build_object('avis', avis, 'moyenne', moyenne)::text into r
              from distributor_ratings where distributor_id = '${DEMO}'`);
        assert.ok(p.reachedEnd, p.message);
        const res = JSON.parse(p.result);
        assert.ok(res.avis > 0);
        assert.ok(res.moyenne >= 1 && res.moyenne <= 5);
    });

    it('demo : chaque fiche de demo a ses avis annonces, aucune fiche reelle n\u2019a d\u2019avis de demo', async () => {
        const [r] = await query(`select
            count(*) filter (where coalesce(x.avis, 0) <> d.review_count) as ecarts,
            count(*) filter (where x.avis > 0 and abs(x.moyenne - d.rating) > 0.1) as moyennes_hors,
            (select count(*) from reviews rv join distributors f on f.id = rv.distributor_id where not f.is_demo and rv.user_id is null) as demo_sur_reel
            from distributors d left join distributor_ratings x on x.distributor_id = d.id
            where d.is_demo and d.review_count > 0 and d.rating >= 1`);
        assert.deepEqual(r, { ecarts: 0, moyennes_hors: 0, demo_sur_reel: 0 });
    });

    it('purge_user_reviews efface les avis du compte', async () => {
        const p = await probe(`
            insert into reviews (distributor_id, user_id, rating) values ('${DEMO}', ${USER}, 3);
            r := purge_user_reviews(${USER})::text`);
        assert.ok(p.reachedEnd, p.message);
        assert.ok(Number(p.result) >= 1);
    });

    it('fonctions d\u2019admin des avis : jamais appelables par l\u2019API', async () => {
        const [r] = await query(`select
            has_function_privilege('authenticated', 'public.purge_user_reviews(uuid)', 'execute') as auth_purge,
            has_function_privilege('anon', 'public.seed_demo_reviews()', 'execute') as anon_seed,
            has_function_privilege('authenticated', 'public.seed_demo_reviews()', 'execute') as auth_seed`);
        assert.deepEqual(r, { auth_purge: false, anon_seed: false, auth_seed: false });
    });
});

// EPIC-T18 (020) : exploitants, demandes, page admin, priorite des signaux
describe('base : exploitants (020)', { skip: SKIP }, () => {
    const REQUEST = `insert into operator_requests (distributor_id, company, contact) values ('${DEMO}', 'Societe itest', '06 00 00 00 00')`;
    // v_uid devient admin dans la transaction (annulee), avant de passer en role connecte
    const MAKE_ADMIN = `insert into app_admins (user_id) values (${USER}) on conflict do nothing;`;

    it('un membre demande le statut : auteur force, une seule demande en attente par fiche', async () => {
        const p = await probe(`${AS_USER} ${REQUEST}; reset role; select (user_id = ${USER})::text || '/' || status into r from operator_requests where distributor_id = '${DEMO}' and user_id = ${USER}`);
        assert.ok(p.reachedEnd, p.message);
        assert.equal(p.result, 'true/pending');
        const twice = await probe(`${AS_USER} ${REQUEST}; ${REQUEST}`);
        assert.equal(twice.code, '23505');
    });

    it('un visiteur ne demande rien ; un compte bloque non plus', async () => {
        const anon = await probe(`${AS_ANON} ${REQUEST}`);
        assert.equal(anon.code, '42501');
        const banned = await probe(`insert into signal_bans (user_id, reason) values (${USER}, 'itest'); ${AS_USER} ${REQUEST}`);
        assert.equal(banned.code, '42501');
    });

    it('un membre non admin n’accede a rien d’admin', async () => {
        for (const call of ['admin_operator_requests()', 'admin_operators()', "admin_decide_operator_request(1, true)", `admin_revoke_operator('${DEMO}', ${USER})`]) {
            const p = await probe(`${AS_USER} perform ${call}`);
            assert.equal(p.code, '42501', call);
        }
        const p = await probe(`${AS_USER} r := is_admin()::text`);
        assert.equal(p.result, 'false');
    });

    it('admin : liste, valide -> exploitant ; ses signaux deviennent « owner » ; retrait possible', async () => {
        const p = await probe(`${MAKE_ADMIN} ${AS_USER} ${REQUEST};
            select id into v_req from admin_operator_requests() where distributor_id = '${DEMO}' limit 1;
            perform admin_decide_operator_request(v_req, true);
            r := json_build_object(
                'admin', is_admin(),
                'mine', (select count(*) from my_operated_distributors() m where m = '${DEMO}'),
                'signal', ${signal('working')},
                'listed', (select count(*) from admin_operators() where distributor_id = '${DEMO}')
            )::text;
            perform admin_revoke_operator('${DEMO}', ${USER});
            r := r || '|' || (select count(*) from my_operated_distributors())::text`, 'v_req bigint;');
        assert.ok(p.reachedEnd, p.message);
        const [json, after] = p.result.split('|');
        const res = JSON.parse(json);
        assert.equal(res.admin, true);
        assert.equal(res.mine, 1);
        assert.equal(res.signal.inserted, 1);
        assert.equal(res.listed, 1);
        assert.equal(after, '0');
        const src = await probe(`${MAKE_ADMIN}
            insert into distributor_operators (distributor_id, user_id) values ('${DEMO}', ${USER});
            ${AS_USER} perform ${signal('broken')};
            select source || '/' || (weight = 1)::text into r from availability_signals where distributor_id = '${DEMO}' and user_id = ${USER} order by created_at desc limit 1`);
        assert.equal(src.result, 'owner/true');
    });

    it('priorite : exploitant contredit a moins de 30 min l’emporte ; au-dela, le plus recent', async () => {
        const at = (min, state, source) => `insert into availability_signals (distributor_id, product_id, state, source, weight, device_hash, user_id, created_at)
            values ('${DEMO}', v_product, '${state}', '${source}', 0.8, '${DEVICE}', null, now() - interval '${min} minutes')`;
        const read = `select state || '/' || source into r from product_availability where product_id = v_product`;
        const pre = `select id into v_product from products where distributor_id = '${DEMO}' order by id limit 1; delete from availability_signals where product_id = v_product;`;
        const near = await probe(`${pre} ${at(20, 'available', 'owner')}; ${at(5, 'absent', 'user')}; ${read}`, 'v_product bigint;');
        assert.equal(near.result, 'available/owner');
        const far = await probe(`${pre} ${at(60, 'available', 'owner')}; ${at(5, 'absent', 'user')}; ${read}`, 'v_product bigint;');
        assert.equal(far.result, 'absent/user');
        const same = await probe(`${pre} ${at(20, 'available', 'owner')}; ${at(5, 'available', 'user')}; ${read}`, 'v_product bigint;');
        assert.equal(same.result, 'available/user');
        const machine = await probe(`delete from availability_signals where distributor_id = '${DEMO}' and product_id is null;
            insert into availability_signals (distributor_id, product_id, state, source, weight, device_hash, created_at) values
              ('${DEMO}', null, 'working', 'owner', 1, '${DEVICE}', now() - interval '10 minutes'),
              ('${DEMO}', null, 'empty', 'user', 0.8, '${DEVICE}', now() - interval '2 minutes');
            select state || '/' || source into r from distributor_status where distributor_id = '${DEMO}'`);
        assert.equal(machine.result, 'working/owner');
    });

    it('lecture API : le badge (distributor_id) oui, l’identite de l’exploitant non', async () => {
        const ok = await probe(`${AS_ANON} select count(*)::text into r from distributor_operators`);
        assert.ok(ok.reachedEnd, ok.message);
        const ko = await probe(`${AS_ANON} perform user_id from distributor_operators`);
        assert.equal(ko.code, '42501');
        const reqs = await probe(`${AS_ANON} perform id from operator_requests`);
        assert.equal(reqs.code, '42501');
        const admins = await probe(`${AS_USER} perform user_id from app_admins`);
        assert.equal(admins.code, '42501');
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
            (select count(*) from signal_bans where reason = 'itest') as bans,
            (select count(*) from reviews where body = 'itest avis') as avis,
            (select count(*) from operator_requests where company = 'Societe itest') as demandes`);
        assert.deepEqual(r, { signaux: 0, fiches: 0, bans: 0, avis: 0, demandes: 0 });
    });
});

// US-2 (017) : la demo se regenere chaque nuit, sans toucher aux vrais signaux
describe('base : demo toujours vivante (017)', { skip: SKIP }, () => {
    it('le job pg_cron nocturne existe, actif, et appelle seed_demo_signals', async () => {
        const rows = await query("select schedule, command, active from cron.job where jobname = 'distrimatch-demo-nightly'");
        assert.equal(rows.length, 1);
        assert.equal(rows[0].schedule, '0 2 * * *');
        assert.match(rows[0].command, /seed_demo_signals\(14\)/);
        assert.equal(rows[0].active, true);
    });

    it('les signaux de demo ne visent que des fiches is_demo', async () => {
        const rows = await query("select count(*)::int as n from availability_signals s join distributors d on d.id = s.distributor_id where s.device_hash like 'demo-%' and not d.is_demo");
        assert.equal(rows[0].n, 0);
    });
});
