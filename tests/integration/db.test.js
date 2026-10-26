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

    it('les horaires (019) se lisent sans compte', async () => {
        const rows = await query("select count(*)::int as n from distributors where opening_hours is not null and review_status = 'published'");
        const p = await probe(`${AS_ANON} select count(*)::text into r from distributors where opening_hours is not null`);
        assert.ok(p.reachedEnd, p.message);
        assert.equal(p.result, String(rows[0].n));
    });

    // EPIC-T21 : les fiches OSM ont ete retirees (types non souhaites) ; si un import revient, ids et provenance restent coherents
    it('fiches d’OSM eventuelles : id osm-..., jamais de demo', async () => {
        const rows = await query("select count(*) filter (where id not like 'osm-%')::int as bad, count(*) filter (where is_demo)::int as demo from distributors where source = 'osm'");
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
    const REQUEST = `insert into operator_requests (distributor_id, company, relation, message) values ('${DEMO}', 'Societe itest', 'operator', 'itest')`;
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
        for (const call of ['admin_operator_requests()', 'admin_operators()', "admin_decide_operator_request(1, true)", `admin_revoke_operator('${DEMO}', ${USER})`,
            'admin_request_siret(1)', "admin_send_operator_code(1, 'phone')", "admin_reject_operator_request(1, 'x')"]) {
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
            reset role; select source || '/' || (weight = 1)::text into r from availability_signals where distributor_id = '${DEMO}' and user_id = ${USER} order by created_at desc limit 1`);
        assert.equal(src.result, 'owner/true');
    });

    it('priorite : exploitant contredit a moins de 30 min l’emporte ; au-dela, le plus recent', async () => {
        const at = (min, state, source) => `insert into availability_signals (distributor_id, product_id, state, source, weight, device_hash, user_id, created_at)
            values ('${DEMO}', v_product, '${state}', '${source}', 0.8, '${DEVICE}', null, now() - interval '${min} minutes')`;
        const read = `select state || '/' || source into r from product_availability where product_id = v_product`;
        const pre = `select id into v_product from products where distributor_id = '${DEMO}' and removed_at is null order by id limit 1; delete from availability_signals where product_id = v_product;`;
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

// EPIC-T20 (021) : echange direct, SIRET, code par courrier
describe('base : verification d’un exploitant (021)', { skip: SKIP }, () => {
    const REQUEST = `insert into operator_requests (distributor_id, company, relation, message) values ('${DEMO}', 'Societe itest', 'owner', 'itest') returning id into v_req`;
    const MAKE_ADMIN = `insert into app_admins (user_id) values (${USER}) on conflict do nothing;`;
    const VALID_SIRET = '41816609600069';   // SIRET public bien forme (cle valide), jamais enregistre

    it('parcours complet : demande -> SIRET demande -> SIRET (cle verifiee) -> code -> 1 essai rate -> bon code -> exploitant', async () => {
        const p = await probe(`${MAKE_ADMIN} ${AS_USER} ${REQUEST};
            perform admin_request_siret(v_req);
            begin perform submit_operator_siret(v_req, '41816609600068'); exception when others then v_bad := sqlstate; end;
            perform submit_operator_siret(v_req, '418 166 096 00069');
            v_code := admin_send_operator_code(v_req, 'mail', 'SOCIETE ITEST', '1 rue Itest 64000 Bayonne');
            v_wrong := verify_operator_code(v_req, case when v_code = '00000' then '11111' else '00000' end);
            v_ok := verify_operator_code(v_req, v_code);
            r := json_build_object(
                'bad', v_bad, 'code', v_code ~ '^[0-9]{5}$', 'wrong', v_wrong, 'ok', v_ok,
                'status', (select status from operator_requests where id = v_req),
                'operator', (select count(*) from my_operated_distributors() m where m = '${DEMO}'),
                'events', (select json_agg(body order by id) from operator_request_messages where request_id = v_req and author = 'system'),
                'admin_msg', (select count(*) from operator_request_messages where request_id = v_req and author = 'admin')
            )::text`, 'v_req bigint; v_bad text; v_code text; v_wrong jsonb; v_ok jsonb;');
        assert.ok(p.reachedEnd, p.message);
        const r = JSON.parse(p.result);
        assert.equal(r.bad, '22023', 'SIRET a cle fausse refuse');
        assert.equal(r.code, true);
        assert.deepEqual(r.wrong, { ok: false, reason: 'wrong', left: 4 });
        assert.deepEqual(r.ok, { ok: true });
        assert.equal(r.status, 'approved');
        assert.equal(r.operator, 1);
        assert.equal(r.admin_msg, 1);
        assert.equal(r.events[0], 'Demande envoyée');
        assert.ok(r.events.some(e => e.startsWith('Courrier envoyé')));
        assert.ok(r.events.some(e => e.startsWith('Code validé')));
    });

    it('le code n’est lisible par personne via l’API ; 5 essais puis bloque ; expire au bout de 30 jours', async () => {
        const hidden = await probe(`${AS_USER} perform code_hash from operator_requests`);
        assert.equal(hidden.code, '42501');
        const locked = await probe(`${MAKE_ADMIN} ${AS_USER} ${REQUEST};
            perform admin_request_siret(v_req); perform submit_operator_siret(v_req, '${VALID_SIRET}');
            perform admin_send_operator_code(v_req, 'phone');
            for i in 1..5 loop v_last := verify_operator_code(v_req, '99999x'); end loop;
            r := verify_operator_code(v_req, '12345')::text`, 'v_req bigint; v_last jsonb; i int;');
        assert.ok(locked.reachedEnd, locked.message);
        assert.equal(JSON.parse(locked.result).reason, 'locked');
        const expired = await probe(`${MAKE_ADMIN} ${AS_USER} ${REQUEST};
            perform admin_request_siret(v_req); perform submit_operator_siret(v_req, '${VALID_SIRET}');
            v_code := admin_send_operator_code(v_req, 'phone');
            reset role; update operator_requests set code_expires_at = now() - interval '1 minute' where id = v_req;
            ${AS_USER} r := verify_operator_code(v_req, v_code)::text`, 'v_req bigint; v_code text;');
        assert.ok(expired.reachedEnd, expired.message);
        assert.equal(JSON.parse(expired.result).reason, 'expired');
    });

    it('echange direct : le demandeur ecrit et lit son fil ; un autre compte ne lit ni n’ecrit', async () => {
        const own = await probe(`${AS_USER} ${REQUEST}; perform post_operator_message(v_req, 'Bonjour itest');
            r := (select count(*) from operator_request_messages where request_id = v_req)::text`, 'v_req bigint;');
        assert.ok(own.reachedEnd, own.message);
        assert.equal(own.result, '2');   // « Demande envoyée » + le message
        const other = await probe(`${AS_USER} ${REQUEST};
            reset role; update operator_requests set user_id = (select id from auth.users where id <> ${USER} order by created_at limit 1) where id = v_req;
            ${AS_USER} perform post_operator_message(v_req, 'intrus')`, 'v_req bigint;');
        assert.equal(other.code, '42501');
        const unseen = await probe(`${AS_USER} ${REQUEST};
            reset role; update operator_requests set user_id = (select id from auth.users where id <> ${USER} order by created_at limit 1) where id = v_req;
            ${AS_USER} r := (select count(*) from operator_request_messages where request_id = v_req)::text`, 'v_req bigint;');
        assert.equal(unseen.result, '0', 'fil d’un autre compte invisible');
        const direct = await probe(`${AS_USER} ${REQUEST}; insert into operator_request_messages (request_id, author, body) values (v_req, 'admin', 'faux')`, 'v_req bigint;');
        assert.equal(direct.code, '42501', 'ecriture directe refusee : passer par post_operator_message');
    });

    it('le SIRET ne se donne que s’il est demande ; refus avec motif dans le fil ; une seule demande en cours', async () => {
        const early = await probe(`${AS_USER} ${REQUEST}; perform submit_operator_siret(v_req, '${VALID_SIRET}')`, 'v_req bigint;');
        assert.equal(early.code, 'P0001');
        const rejected = await probe(`${MAKE_ADMIN} ${AS_USER} ${REQUEST}; perform admin_reject_operator_request(v_req, 'itest motif');
            r := (select status || '|' || reject_reason from operator_requests where id = v_req)
              || '|' || (select body from operator_request_messages where request_id = v_req order by id desc limit 1)`, 'v_req bigint;');
        assert.ok(rejected.reachedEnd, rejected.message);
        assert.equal(rejected.result, 'rejected|itest motif|Demande refusée : itest motif');
        const twice = await probe(`${AS_USER} ${REQUEST}; ${REQUEST}`, 'v_req bigint;');
        assert.equal(twice.code, '23505');
    });
});

// EPIC-T21 (022) : une fiche ajoutee par un membre attend la validation de l'admin
describe('base : validation des nouvelles fiches (022)', { skip: SKIP }, () => {
    const ADD = (id = 'itest-rev') => `insert into distributors (id, name, type, lat, lng, is_user_added, added_by, review_status)
        values ('${id}', 'Fiche itest', 'pizza', 43.49, -1.47, true, ${USER}, 'published')`;
    const MAKE_ADMIN = `insert into app_admins (user_id) values (${USER}) on conflict do nothing;`;
    const OTHER = `(select id from auth.users where id <> ${USER} order by created_at limit 1)`;

    it('un ajout par l’API est toujours « en attente » : visible par son auteur, pas par un visiteur ni ses produits', async () => {
        const p = await probe(`${AS_USER} ${ADD()};
            insert into products (distributor_id, name, available) values ('itest-rev', 'Produit itest', true);
            v_mine := (select review_status from distributors where id = 'itest-rev');
            ${AS_ANON} r := v_mine || '|' || (select count(*) from distributors where id = 'itest-rev')::text
                || '|' || (select count(*) from products where distributor_id = 'itest-rev')::text`, 'v_mine text;');
        assert.ok(p.reachedEnd, p.message);
        assert.equal(p.result, 'pending|0|0');
    });

    it('fiche en attente : ni signal, ni avis, ni demande d’exploitant', async () => {
        const signal = await probe(`${AS_USER} ${ADD()}; perform confirm_availability('itest-rev', '${DEVICE}', '[]'::jsonb, 'working')`);
        assert.equal(signal.code, 'P0001');
        const review = await probe(`${AS_USER} ${ADD()}; insert into reviews (distributor_id, rating, body) values ('itest-rev', 4, 'itest avis')`);
        assert.equal(review.code, 'P0001');
        const claim = await probe(`${AS_USER} ${ADD()}; insert into operator_requests (distributor_id, company, relation) values ('itest-rev', 'Societe itest', 'owner')`);
        assert.equal(claim.code, 'P0001');
    });

    it('admin : publier avec corrections (nom, position) ; refuser sans motif ; un non-admin ne peut pas', async () => {
        const denied = await probe(`${AS_USER} ${ADD()}; perform admin_review_distributor('itest-rev', 'publish')`);
        assert.equal(denied.code, '42501');
        const pub = await probe(`${MAKE_ADMIN} ${AS_USER} ${ADD()};
            perform admin_review_distributor('itest-rev', 'publish', null, 'Nom corrige itest', null, null, 43.5, -1.48);
            ${AS_ANON} r := (select name || '|' || review_status || '|' || lat from distributors where id = 'itest-rev')`);
        assert.ok(pub.reachedEnd, pub.message);
        assert.equal(pub.result, 'Nom corrige itest|published|43.5');
        const rej = await probe(`${MAKE_ADMIN} ${AS_USER} ${ADD()};
            perform admin_review_distributor('itest-rev', 'reject');
            reset role;   -- PRIV-01 (029) : review_reason ne se lit plus par l'API (l'auteur : my_distributors)
            r := (select review_status || '|' || coalesce(review_reason, '-') from distributors where id = 'itest-rev')
                || '|' || (select body from distributor_review_messages where distributor_id = 'itest-rev' order by id desc limit 1)`);
        assert.ok(rej.reachedEnd, rej.message);
        assert.equal(rej.result, 'rejected|-|Fiche refusée');
    });

    it('liste admin des fiches en attente ; echange : l’auteur ecrit, un autre compte non', async () => {
        const list = await probe(`${MAKE_ADMIN} ${AS_USER} ${ADD()}; perform post_review_message('itest-rev', 'Bonjour itest');
            r := (select count(*) || '|' || max(unread) from admin_pending_distributors() where id = 'itest-rev')`);
        assert.ok(list.reachedEnd, list.message);
        assert.equal(list.result, '1|1');
        const other = await probe(`${AS_USER} ${ADD()};
            reset role; update distributors set added_by = ${OTHER} where id = 'itest-rev';
            ${AS_USER} perform post_review_message('itest-rev', 'intrus')`);
        assert.equal(other.code, '42501');
    });

    it('6e ajout du jour pour un compte : refuse (P0001)', async () => {
        const p = await probe(`${AS_USER} ${ADD('itest-rev-1')}; ${ADD('itest-rev-2')}; ${ADD('itest-rev-3')}; ${ADD('itest-rev-4')}; ${ADD('itest-rev-5')}; ${ADD('itest-rev-6')}`);
        assert.equal(p.code, 'P0001');
    });
});

// SEC-03 (025) : produits : retrait doux, droits par colonne, garde-fous
describe('base : produits (025)', { skip: SKIP }, () => {
    // Journal du compte vide (dans la transaction annulee) : la limite de 30 / heure ne gene pas les autres cas
    const FRESH = `delete from product_edits where user_id = ${USER};`;
    // Retour en postgres SANS jeton : comme le SQL Editor (gardes inactives)
    const AS_POSTGRES = `perform set_config('request.jwt.claims', '', true); reset role;`;
    const FIRST = `select id into v_product from products where distributor_id = '${DEMO}' and removed_at is null order by id limit 1;`;
    const OTHER = `(select id from auth.users where id <> ${USER} order by created_at limit 1)`;
    const ADD_PENDING = `insert into distributors (id, name, type, lat, lng, is_user_added, added_by) values ('itest-prod', 'Fiche itest', 'pizza', 43.49, -1.47, true, ${USER})`;
    const insertProduct = (name = "'Produit itest'", fiche = DEMO) =>
        `insert into products (distributor_id, name, available) values ('${fiche}', ${name}, true)`;

    // La base avait 3 regles en double creees au tableau de bord (permissives : elles
    // rouvraient l'ajout et la modification). Seules les 3 regles de 025 doivent rester.
    it('products n’a que les 3 regles de 025 (aucune regle oubliee au tableau de bord)', async () => {
        const p = await probe(`r := (select string_agg(polname, ' | ' order by polname) from pg_policy where polrelid = 'public.products'::regclass)`);
        assert.ok(p.reachedEnd, p.message);
        assert.equal(p.result, 'Ajout produits par users authentifies | Lecture publique produits | Modif produits par users authentifies');
    });

    it('personne ne supprime un produit par l’API (DELETE refuse, 42501)', async () => {
        for (const role of [AS_USER, AS_ANON]) {
            const p = await probe(`${FIRST} ${role} delete from products where id = v_product`, 'v_product bigint;');
            assert.equal(p.reachedEnd, false);
            assert.equal(p.code, '42501');
        }
    });

    it('retirer = retrait doux : les signaux restent, le produit disparait pour tous, l’admin le restaure en SQL', async () => {
        const p = await probe(`${FRESH} ${FIRST}
            insert into availability_signals (distributor_id, product_id, state, source, weight, device_hash, user_id)
            values ('${DEMO}', v_product, 'available', 'user', 0.8, '${DEVICE}', null);
            v_before := (select count(*) from availability_signals where product_id = v_product);
            ${AS_USER} perform remove_product(v_product);
            v_seen_user := (select count(*) from products where id = v_product);
            ${AS_ANON} v_seen_anon := (select count(*) from products where id = v_product);
            v_state_anon := (select count(*) from product_availability where product_id = v_product);
            ${AS_POSTGRES}
            r := json_build_object(
                'signaux_avant', v_before,
                'signaux_apres', (select count(*) from availability_signals where product_id = v_product),
                'retire_par_moi', (select removed_at is not null and removed_by = ${USER} from products where id = v_product),
                'journal', (select action from product_edits where product_id = v_product and user_id = ${USER} order by id desc limit 1),
                'vu_membre', v_seen_user,
                'vu_visiteur', v_seen_anon,
                'etat_visiteur', v_state_anon
            )::text;
            update products set removed_at = null, removed_by = null where id = v_product;
            ${AS_ANON} r := r || '|' || (select count(*) from products where id = v_product)::text`,
            'v_product bigint; v_before int; v_seen_user int; v_seen_anon int; v_state_anon int;');
        assert.ok(p.reachedEnd, p.message);
        const [json, restored] = p.result.split('|');
        const res = JSON.parse(json);
        assert.ok(res.signaux_avant >= 1);
        assert.equal(res.signaux_apres, res.signaux_avant, 'aucun signal efface');
        assert.equal(res.retire_par_moi, true);
        assert.equal(res.journal, 'remove');
        assert.equal(res.vu_membre, 0);
        assert.equal(res.vu_visiteur, 0);
        assert.equal(res.etat_visiteur, 0, 'plus d’etat public (vue product_availability)');
        assert.equal(restored, '1', 'restaure par l’admin : de nouveau visible');
    });

    it('produit retire : plus aucun signal accepte (P0002)', async () => {
        const p = await probe(`${FRESH} ${FIRST} ${AS_USER} perform remove_product(v_product);
            perform confirm_availability('${DEMO}', '${DEVICE}', jsonb_build_array(jsonb_build_object('product_id', v_product, 'state', 'available')), null)`,
            'v_product bigint;');
        assert.equal(p.reachedEnd, false);
        assert.equal(p.code, 'P0002');
        assert.match(p.message, /retire/);
    });

    it('retirer deux fois : P0002 ; sans compte : refuse (42501)', async () => {
        const twice = await probe(`${FRESH} ${FIRST} ${AS_USER} perform remove_product(v_product); perform remove_product(v_product)`, 'v_product bigint;');
        assert.equal(twice.code, 'P0002');
        const anon = await probe(`${FIRST} ${AS_ANON} perform remove_product(v_product)`, 'v_product bigint;');
        assert.equal(anon.code, '42501');
    });

    it('renommer : accepte, nom nettoye, ancien nom journalise ; rien d’autre ne se change par l’API', async () => {
        const p = await probe(`${FRESH} ${FIRST} ${AS_USER}
            update products set name = '  Nom itest  ' where id = v_product;
            ${AS_POSTGRES}
            r := (select name from products where id = v_product) || '|'
              || (select action || '|' || (old_name is not null)::text || '|' || new_name
                    from product_edits where product_id = v_product and user_id = ${USER} order by id desc limit 1)`,
            'v_product bigint;');
        assert.ok(p.reachedEnd, p.message);
        assert.equal(p.result, 'Nom itest|rename|true|Nom itest');
        for (const set of ['distributor_id = distributor_id', 'price = 1', 'removed_at = now()', 'available = false']) {
            const k = await probe(`${FIRST} ${AS_USER} update products set ${set} where id = v_product`, 'v_product bigint;');
            assert.equal(k.code, '42501', set);
        }
        const price = await probe(`${AS_USER} insert into products (distributor_id, name, price, available) values ('${DEMO}', 'Produit itest', 1, true)`);
        assert.equal(price.code, '42501');
        const anon = await probe(`${AS_ANON} ${insertProduct()}`);
        assert.equal(anon.code, '42501');
    });

    it('une requete qui modifie plus de 5 produits ou en ajoute plus de 10 : refusee (P0001)', async () => {
        const [c] = await query("select count(*)::int as n from products p join distributors d on d.id = p.distributor_id where d.is_demo and d.review_status = 'published'");
        assert.ok(c.n >= 6, 'il faut au moins 6 produits de demo');
        const demo6 = (n) => `update products set name = name where id in (
            select id from products where distributor_id in (select id from distributors where is_demo) order by id limit ${n})`;
        const six = await probe(`${FRESH} ${AS_USER} ${demo6(6)}`);
        assert.equal(six.reachedEnd, false);
        assert.equal(six.code, 'P0001');
        assert.match(six.message, /une seule requete/);
        const five = await probe(`${FRESH} ${AS_USER} ${demo6(5)}; get diagnostics v_n = row_count; r := v_n::text`, 'v_n int;');
        assert.ok(five.reachedEnd, five.message);
        assert.equal(five.result, '5');
        const eleven = await probe(`${FRESH} ${AS_USER}
            insert into products (distributor_id, name, available)
            select '${DEMO}', 'Produit itest ' || g, true from generate_series(1, 11) g`);
        assert.equal(eleven.code, 'P0001');
        assert.match(eleven.message, /une seule requete/);
    });

    it('compte bloque : ni ajout, ni renommage, ni retrait (42501)', async () => {
        const BAN = `insert into signal_bans (user_id, reason) values (${USER}, 'itest');`;
        for (const action of [insertProduct(), 'update products set name = name where id = v_product', 'perform remove_product(v_product)']) {
            const p = await probe(`${BAN} ${FIRST} ${AS_USER} ${action}`, 'v_product bigint;');
            assert.equal(p.code, '42501', action);
            assert.match(p.message, /ne peut plus modifier/, action);
        }
    });

    it('nom vide ou de plus de 80 caracteres : refuse (23514) ; 80 caracteres : accepte', async () => {
        assert.equal((await probe(`${FRESH} ${AS_USER} ${insertProduct("repeat('a', 81)")}`)).code, '23514');
        assert.equal((await probe(`${FRESH} ${AS_USER} ${insertProduct("'   '")}`)).code, '23514');
        const ok = await probe(`${FRESH} ${AS_USER} ${insertProduct("repeat('a', 80)")}`);
        assert.ok(ok.reachedEnd, ok.message);
    });

    it('31e ecriture de produit dans l’heure pour un compte : refusee (P0001)', async () => {
        const p = await probe(`${FRESH}
            insert into product_edits (distributor_id, user_id, action, new_name)
            select '${DEMO}', ${USER}, 'add', 'itest' from generate_series(1, 30);
            ${AS_USER} ${insertProduct()}`);
        assert.equal(p.code, 'P0001');
        assert.match(p.message, /ce compte/);
    });

    it('fiche en attente : son auteur y ajoute un produit, un autre compte non ; sans fiche : refuse', async () => {
        const own = await probe(`${FRESH} ${AS_USER} ${ADD_PENDING}; ${insertProduct("'Produit itest'", 'itest-prod')};
            r := (select count(*) from products where distributor_id = 'itest-prod')::text`);
        assert.ok(own.reachedEnd, own.message);
        assert.equal(own.result, '1');
        const other = await probe(`${FRESH} ${AS_USER} ${ADD_PENDING};
            ${AS_POSTGRES} update distributors set added_by = ${OTHER} where id = 'itest-prod';
            ${AS_USER} ${insertProduct("'Produit itest'", 'itest-prod')}`);
        assert.equal(other.code, '42501');
        const orphan = await probe(`${FRESH} ${AS_USER} insert into products (distributor_id, name, available) values (null, 'Produit itest', true)`);
        assert.equal(orphan.code, '42501');
    });
});

// SEC-05 (027) : la base impose les valeurs d'un ajout et du niveau de prix
describe('base : ajout de fiche et niveau de prix (027, SEC-05)', { skip: SKIP }, () => {
    const COLS = 'id, name, type, lat, lng, is_user_added, added_by, address, price_range';
    // Autre compte, lu en tant que postgres avant le changement de role
    const DECLARE_OTHER = 'v_other uuid := (select id from auth.users where id <> v_uid order by created_at limit 1);';

    it('ajout par l’API : date, auteur, etat, note et fraicheur poses par la base ; fuseau inconnu efface', async () => {
        const p = await probe(`${AS_USER}
            insert into distributors (id, name, type, lat, lng, is_user_added, added_by, created_at, updated_at,
                                      modified_by, last_verified, status, rating, review_count, tz)
            values ('itest-forge', 'Fiche itest', 'other', 43.49, -1.47, true, ${USER}, '2000-01-01', '2000-01-01',
                    v_other, now(), 'warning', 4.9, 999, 'Pas/Un_Fuseau');
            reset role;   -- PRIV-01 (029) : modified_by ne se lit plus par l'API
            r := (select (created_at = now())::text || '|' || (updated_at = now())::text
                  || '|' || coalesce((modified_by = ${USER})::text, 'null') || '|' || coalesce(last_verified::text, 'null')
                  || '|' || status || '|' || rating::text || '|' || review_count::text || '|' || coalesce(tz, 'null')
                  from distributors where id = 'itest-forge')`, DECLARE_OTHER);
        assert.ok(p.reachedEnd, p.message);
        assert.equal(p.result, 'true|true|true|null|verified|0.0|0|null');
    });

    it('un fuseau connu envoye par l’app est conserve', async () => {
        const p = await probe(`${AS_USER}
            insert into distributors (id, name, type, lat, lng, is_user_added, added_by, tz)
            values ('itest-tz', 'Fiche itest', 'other', 43.49, -1.47, true, ${USER}, 'Europe/Paris');
            r := (select coalesce(tz, 'null') from distributors where id = 'itest-tz')`);
        assert.ok(p.reachedEnd, p.message);
        assert.equal(p.result, 'Europe/Paris');
    });

    it('antidater created_at ne contourne plus la limite de 5 ajouts par jour (P0001)', async () => {
        const add = (n) => `insert into distributors (id, name, type, lat, lng, is_user_added, added_by, created_at)
            values ('itest-old-${n}', 'Fiche itest', 'other', 43.49, -1.47, true, ${USER}, '2000-01-01')`;
        const p = await probe(`${AS_USER} ${add(1)}; ${add(2)}; ${add(3)}; ${add(4)}; ${add(5)}; ${add(6)}`);
        assert.equal(p.reachedEnd, false, 'le 6e ajout aurait du etre refuse');
        assert.equal(p.code, 'P0001');
    });

    it('valeurs hors bornes a l’ajout : refusees (23514)', async () => {
        const CASES = [
            ['id hors format', `('itest bad!', 'Fiche itest', 'other', 43.49, -1.47, true, ${USER}, null, null)`],
            ['nom d’un caractere', `('itest-court', 'x', 'other', 43.49, -1.47, true, ${USER}, null, null)`],
            ['nom de 101 caracteres', `('itest-long', repeat('x', 101), 'other', 43.49, -1.47, true, ${USER}, null, null)`],
            ['latitude 91', `('itest-lat', 'Fiche itest', 'other', 91, -1.47, true, ${USER}, null, null)`],
            ['adresse de 201 caracteres', `('itest-adr', 'Fiche itest', 'other', 43.49, -1.47, true, ${USER}, repeat('a', 201), null)`],
            ['prix hors liste', `('itest-prix', 'Fiche itest', 'other', 43.49, -1.47, true, ${USER}, null, 'XXXX')`],
        ];
        for (const [label, values] of CASES) {
            const p = await probe(`${AS_USER} insert into distributors (${COLS}) values ${values}`);
            assert.equal(p.code, '23514', label);
        }
        const emoji = await probe(`${AS_USER} insert into distributors (id, name, type, emoji, lat, lng, is_user_added, added_by)
            values ('itest-emoji', 'Fiche itest', 'other', '<img>', 43.49, -1.47, true, ${USER})`);
        assert.equal(emoji.code, '23514', 'emoji avec chevrons');
    });

    it('niveau de prix hors liste : refuse (23514)', async () => {
        const p = await probe(`${AS_USER} update distributors set price_range = 'XXXX' where id = '${DEMO}'`);
        assert.equal(p.code, '23514');
    });

    it('niveau de prix : une seule fiche par requete pour l’API (42501) ; postgres n’est pas limite', async () => {
        const api = await probe(`${AS_USER} update distributors set price_range = price_range
            where id in (select id from distributors where is_demo and review_status = 'published' order by id limit 2)`);
        assert.equal(api.code, '42501');
        assert.match(api.message, /Une seule fiche/);
        const admin = await probe(`update distributors set price_range = price_range where is_demo;
            get diagnostics v_n = row_count; r := v_n::text`, 'v_n int;');
        assert.ok(admin.reachedEnd, admin.message);
        assert.ok(Number(admin.result) >= 2, admin.result);
    });

    it('compte bloque : ne change plus le niveau de prix (42501)', async () => {
        const p = await probe(`insert into signal_bans (user_id, reason) values (${USER}, 'itest');
            ${AS_USER} update distributors set price_range = price_range where id = '${DEMO}'`);
        assert.equal(p.code, '42501');
        assert.match(p.message, /Compte bloque/);
    });
});

// EPIC-T22 (023) : un signal ne revele pas son auteur ; journal du compte
describe('base : confidentialite des signaux et « Mon activité » (023)', { skip: SKIP }, () => {
    it('personne ne lit l’auteur d’un signal (user_id, device_hash) ; l’etat public reste lisible', async () => {
        for (const role of [AS_ANON, AS_USER]) {
            const who = await probe(`${role} perform user_id from availability_signals limit 1`);
            assert.equal(who.code, '42501');
            const device = await probe(`${role} perform device_hash from availability_signals limit 1`);
            assert.equal(device.code, '42501');
        }
        const ok = await probe(`${AS_ANON} r := (select count(*) from availability_signals)::text
            || '|' || (select count(*) from distributor_status)::text`);
        assert.ok(ok.reachedEnd, ok.message);
    });

    it('my_activity : mes signaux, mes ajouts, mes avis ; refuse sans compte', async () => {
        const p = await probe(`${AS_USER}
            perform confirm_availability('${DEMO}', '${DEVICE}', '[]'::jsonb, 'working');
            insert into distributors (id, name, type, lat, lng, is_user_added, added_by) values ('itest-act', 'Fiche itest', 'pizza', 43.49, -1.47, true, ${USER});
            insert into reviews (distributor_id, rating, body) values ('${DEMO}', 4, 'itest avis');
            r := (select string_agg(kind || ':' || coalesce(state, '-'), ',' order by kind) from my_activity()
                  where at > now() - interval '1 minute')`);
        assert.ok(p.reachedEnd, p.message);
        assert.equal(p.result, 'addition:pending,review:4,signal:working');
        const anon = await probe(`${AS_ANON} perform my_activity()`);
        assert.equal(anon.code, '42501');
    });
});

describe('base : notifications app fermee (024)', { skip: SKIP }, () => {
    const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/itest-abc';
    const sub = (followed) => `push_subscribe('${ENDPOINT}', 'p256dh-itest', 'auth-itest', array['${DEMO}'], array['${followed}'], 22, 8, 'Europe/Paris')`;

    it('un visiteur s’abonne sans compte, met a jour, se desabonne ; il ne lit jamais les abonnements', async () => {
        const p = await probe(`${AS_ANON} perform ${sub('œufs')}; perform ${sub('pain')};
            set local role postgres;
            r := (select count(*)::text || '|' || max(followed_products[1]) || '|' || coalesce(max(user_id::text), 'anonyme') from push_subscriptions where endpoint = '${ENDPOINT}');
            set local role anon;
            perform push_unsubscribe('${ENDPOINT}');
            set local role postgres;
            r := r || '|' || (select count(*) from push_subscriptions where endpoint = '${ENDPOINT}')::text`);
        assert.ok(p.reachedEnd, p.message);
        assert.equal(p.result, '1|pain|anonyme|0');
        const read = await probe(`${AS_ANON} perform endpoint from push_subscriptions limit 1`);
        assert.equal(read.code, '42501');
    });

    it('un membre abonne est reconnu (pour ne pas recevoir son propre signal)', async () => {
        const p = await probe(`${AS_USER} perform ${sub('œufs')}; set local role postgres;
            r := (select (user_id = ${USER})::text from push_subscriptions where endpoint = '${ENDPOINT}')`);
        assert.ok(p.reachedEnd, p.message);
        assert.equal(p.result, 'true');
    });

    it('refuse une adresse qui n’est pas https et une liste trop longue', async () => {
        const bad = await probe(`${AS_ANON} perform push_subscribe('http://x', 'k', 'a', '{}', '{}', null, null, 'UTC')`);
        assert.equal(bad.code, '22023');
        const big = await probe(`${AS_ANON} perform push_subscribe('https://fcm.googleapis.com/fcm/send/itest-big', 'k', 'a', (select array_agg(g::text) from generate_series(1, 201) g), '{}', null, null, 'UTC')`);
        assert.equal(big.code, '22023');
    });

    it('un signal passe toujours, declencheur en place', async () => {
        const p = await probe(`${AS_USER} perform ${signal('working')};
            set local role postgres;
            r := (select count(*) from pg_trigger where tgname = 'notify_push_on_signal')::text`);
        assert.ok(p.reachedEnd, p.message);
        assert.equal(p.result, '1');
    });
});

// SEC-04 (026) : abonnements sans abus ni blocage
describe('base : abonnements aux notifications sans abus (026)', { skip: SKIP }, () => {
    const FCM = 'https://fcm.googleapis.com/fcm/send/itest-';
    const subscribe = (endpoint, favorites = "'{}'", followed = "'{}'") =>
        `push_subscribe('${endpoint}', 'p256dh-itest', 'auth-itest', ${favorites}, ${followed}, null, null, 'UTC')`;

    it('refuse une adresse qui n’est pas celle d’un service push, aussi en ecriture directe', async () => {
        for (const endpoint of ['https://evil.example/itest', 'https://fcm.googleapis.com.evil.example/itest', 'https://fcm.googleapis.com:8443/itest']) {
            const p = await probe(`${AS_ANON} perform ${subscribe(endpoint)}`);
            assert.equal(p.code, '22023', endpoint);
        }
        const direct = await probe(`insert into push_subscriptions (endpoint, p256dh, auth) values ('https://evil.example/itest', 'k', 'a')`);
        assert.equal(direct.code, '23514');
    });

    it('refuse un tableau a deux dimensions, plus de 30 produits suivis ou un produit de plus de 60 caracteres', async () => {
        const fav2d = await probe(`${AS_ANON} perform ${subscribe(FCM + '2d', `array[array['${DEMO}', 'a'], array['b', 'c']]`)}`);
        assert.equal(fav2d.code, '22023');
        const followed2d = await probe(`${AS_ANON} perform ${subscribe(FCM + '2d', "'{}'", "array[array['pain', 'oeufs'], array['lait', 'miel']]")}`);
        assert.equal(followed2d.code, '22023');
        const many = await probe(`${AS_ANON} perform ${subscribe(FCM + 'many', "'{}'", "(select array_agg('p' || g) from generate_series(1, 31) g)")}`);
        assert.equal(many.code, '22023');
        const long = await probe(`${AS_ANON} perform ${subscribe(FCM + 'long', "'{}'", "array[repeat('x', 61)]")}`);
        assert.equal(long.code, '22023');
        const max = await probe(`${AS_ANON} perform ${subscribe(FCM + 'max', "'{}'", "(select array_agg(lpad(g::text, 60, 'x')) from generate_series(1, 30) g)")}`);
        assert.ok(max.reachedEnd, max.message);
    });

    it('ne garde que les favoris publies qui existent', async () => {
        const p = await probe(`insert into distributors (id, name, type, lat, lng, review_status)
                values ('itest-push-pending', 'Fiche itest', 'pizza', 43.49, -1.47, 'pending');
            ${AS_ANON} perform ${subscribe(FCM + 'fav', `array['${DEMO}', 'itest-push-pending', 'itest-inexistante', '${DEMO}']`)};
            set local role postgres;
            r := (select favorites::text from push_subscriptions where endpoint = '${FCM}fav')`);
        assert.ok(p.reachedEnd, p.message);
        assert.equal(p.result, `{${DEMO}}`);
    });

    it('au plus 200 nouveaux abonnements par heure ; une mise a jour passe toujours et remet les echecs a zero', async () => {
        const fill = `insert into push_subscriptions (endpoint, p256dh, auth) select '${FCM}cap-' || g, 'k', 'a' from generate_series(1, 200) g;`;
        const blocked = await probe(`${fill} ${AS_ANON} perform ${subscribe(FCM + 'cap-new')}`);
        assert.equal(blocked.code, 'P0001');
        const update = await probe(`${fill} update push_subscriptions set fail_count = 3 where endpoint = '${FCM}cap-1';
            ${AS_ANON} perform ${subscribe(FCM + 'cap-1', `array['${DEMO}']`)};
            set local role postgres;
            r := (select fail_count || '|' || favorites::text from push_subscriptions where endpoint = '${FCM}cap-1')`);
        assert.ok(update.reachedEnd, update.message);
        assert.equal(update.result, `0|{${DEMO}}`);
    });

    it('au plus 5000 abonnements au total pour un nouvel abonnement ; une mise a jour passe toujours', async () => {
        // Lignes datees d'il y a 2 h : le plafond horaire ne joue pas, seul le plafond total est teste
        const fill = `insert into push_subscriptions (endpoint, p256dh, auth, created_at, updated_at)
            select '${FCM}total-' || g, 'k', 'a', now() - interval '2 hours', now() - interval '2 hours' from generate_series(1, 5000) g;`;
        const blocked = await probe(`${fill} ${AS_ANON} perform ${subscribe(FCM + 'total-new')}`);
        assert.equal(blocked.code, 'P0001');
        assert.match(blocked.message, /Trop d'abonnements enregistres/);
        const update = await probe(`${fill} ${AS_ANON} perform ${subscribe(FCM + 'total-1')}`);
        assert.ok(update.reachedEnd, update.message);
    });

    it('purge nocturne des abonnements non rafraichis depuis 60 jours (pg_cron)', async () => {
        const rows = await query("select schedule, command, active from cron.job where jobname = 'distrimatch-push-purge'");
        assert.equal(rows.length, 1);
        assert.equal(rows[0].schedule, '30 3 * * *');
        assert.match(rows[0].command, /updated_at < now\(\) - interval '60 days'/);
        assert.equal(rows[0].active, true);
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

// SEC-06 (028) : petites failles de la base fermees
describe('base : petites failles fermees (028)', { skip: SKIP }, () => {
    it('demo_backup : ni un visiteur ni un compte ne la lisent (42501)', async () => {
        for (const role of [AS_ANON, AS_USER]) {
            const p = await probe(`${role} perform count(*) from demo_backup`);
            assert.equal(p.reachedEnd, false, p.message);
            assert.equal(p.code, '42501');
        }
    });

    it('20e et 21e signal de l’heure dans le meme appel : refuse (P0001), rien d’enregistre', async () => {
        const p = await probe(`
            insert into availability_signals (distributor_id, product_id, state, source, weight, device_hash, user_id)
            select '${DEMO}', null, 'working', 'user', 0.8, '${DEVICE}', ${USER} from generate_series(1, 19);
            select id into v_product from products where distributor_id = '${DEMO}' and removed_at is null order by id limit 1;
            ${AS_USER} perform confirm_availability('${DEMO}', '${DEVICE}', jsonb_build_array(
                jsonb_build_object('product_id', v_product, 'state', 'available'),
                jsonb_build_object('product_id', v_product, 'state', 'absent')), null)`, 'v_product bigint;');
        assert.equal(p.reachedEnd, false, p.message);
        assert.equal(p.code, 'P0001');
        assert.match(p.message, /ce compte/);
    });

    it('device_hash « demo-… » envoye par l’API : refuse (22023)', async () => {
        const p = await probe(`${AS_USER} perform confirm_availability('${DEMO}', 'demo-itest-000000001', '[]'::jsonb, 'working')`);
        assert.equal(p.reachedEnd, false, p.message);
        assert.equal(p.code, '22023');
        assert.match(p.message, /device_hash/);
    });

    it('vues KPI : une fiche en attente n’apparait pas et ne compte pas', async () => {
        const p = await probe(`${AS_USER}
            insert into distributors (id, name, type, lat, lng, is_user_added, added_by)
            values ('itest-kpi', 'Fiche itest', 'pizza', 43.49, -1.47, true, ${USER});
            ${AS_ANON} r := json_build_object(
                'top', (select count(*) from kpi_top_distributors where id = 'itest-kpi'),
                'machines', (select machines from kpi_coverage),
                'publiees', (select count(*) from distributors)
            )::text`);
        assert.ok(p.reachedEnd, p.message);
        const res = JSON.parse(p.result);
        assert.equal(res.top, 0);
        assert.equal(res.machines, res.publiees);
    });

    it('garde-fous : verrou par compte, RPC heritees fermees, search_path fixe, envoi de photos ferme', async () => {
        const [r] = await query(`select
            position('pg_advisory_xact_lock' in pg_get_functiondef('public.confirm_availability'::regproc)) > 0 as verrou,
            has_function_privilege('anon', 'public.submit_report(text,text,text,integer)', 'execute') as anon_report,
            has_function_privilege('authenticated', 'public.submit_report(text,text,text,integer)', 'execute') as auth_report,
            has_function_privilege('authenticated', 'public.cast_vote(bigint,text)', 'execute') as auth_vote,
            (select count(*)::int from pg_proc where pronamespace = 'public'::regnamespace
                and proname in ('submit_report', 'cast_vote', 'handle_new_user')
                and 'search_path=public' = any(coalesce(proconfig, '{}'::text[]))) as search_path_fixe,
            (select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Upload photos par users') as envoi_photos,
            (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'distributor_photos' and cmd = 'INSERT') as ajout_photos,
            (select file_size_limit::int from storage.buckets where id = 'distributor-photos') as taille_max`);
        assert.deepEqual(r, { verrou: true, anon_report: false, auth_report: false, auth_vote: false, search_path_fixe: 3, envoi_photos: 0, ajout_photos: 0, taille_max: 2097152 });
    });
});

// PRIV-01 (029) : le compte qui signale, modifie ou ajoute une fiche n'est plus lisible
describe('base : auteurs des fiches et des produits illisibles (029)', { skip: SKIP }, () => {
    // Retour en postgres SANS jeton (comme le SQL Editor)
    const AS_POSTGRES = `perform set_config('request.jwt.claims', '', true); reset role;`;
    const ADD = `insert into distributors (id, name, type, lat, lng, is_user_added, added_by) values ('itest-priv', 'Fiche itest', 'pizza', 43.49, -1.47, true, ${USER})`;
    const OTHER = `(select id from auth.users where id <> ${USER} order by created_at limit 1)`;
    // Copie de DISTRIBUTOR_PUBLIC_COLUMNS (js/utils.js) ; produits : PRODUCT_PUBLIC_COLUMNS + distributor_id (imbrication)
    const FRONT_DISTRIBUTOR_COLUMNS = 'id, name, type, emoji, address, city, lat, lng, rating, review_count, status, last_verified, price_range, is_user_added, is_demo, source, tz, opening_hours, review_status, created_at';
    const FRONT_PRODUCT_COLUMNS = 'id, distributor_id, name, price, available';

    it('ni un visiteur ni un compte ne lisent l’auteur, le moderateur ou le motif d’une fiche, ni l’auteur d’un produit (42501)', async () => {
        for (const role of [AS_ANON, AS_USER]) {
            for (const col of ['added_by', 'modified_by', 'reviewed_by', 'reviewed_at', 'review_reason', 'author_read_at']) {
                const p = await probe(`${role} perform ${col} from distributors limit 1`);
                assert.equal(p.code, '42501', `distributors.${col}`);
            }
            for (const col of ['modified_by', 'removed_by']) {
                const p = await probe(`${role} perform ${col} from products limit 1`);
                assert.equal(p.code, '42501', `products.${col}`);
            }
            const star = await probe(`${role} perform * from distributors limit 1`);
            assert.equal(star.code, '42501', 'select * refuse : l’app liste ses colonnes');
        }
    });

    it('les colonnes lues par l’app, les produits et les vues d’etat restent lisibles', async () => {
        for (const role of [AS_ANON, AS_USER]) {
            const p = await probe(`${role}
                r := (select count(*) from (select ${FRONT_DISTRIBUTOR_COLUMNS} from distributors) d)::text
                  || '|' || (select count(*) from (select ${FRONT_PRODUCT_COLUMNS} from products) p)::text
                  || '|' || (select count(*) from product_availability)::text
                  || '|' || (select count(*) from distributor_status)::text`);
            assert.ok(p.reachedEnd, p.message);
            const [fiches, produits] = p.result.split('|').map(Number);
            assert.ok(fiches > 0, 'fiches');
            assert.ok(produits > 0, 'produits');
        }
    });

    it('ajouter un produit et relire son id (insert ... returning id, comme l’app) : accepte', async () => {
        const p = await probe(`delete from product_edits where user_id = ${USER};
            ${AS_USER} insert into products (distributor_id, name, available) values ('${DEMO}', 'Produit itest', true) returning id into v_pid;
            r := (v_pid is not null)::text`, 'v_pid bigint;');
        assert.ok(p.reachedEnd, p.message);
        assert.equal(p.result, 'true');
    });

    it('un signal rafraichit last_verified sans ecrire le compte dans modified_by', async () => {
        const p = await probe(`delete from availability_signals where user_id = ${USER} and created_at > now() - interval '1 hour';
            update distributors set modified_by = null where id = '${DEMO}';
            ${AS_USER} perform ${signal('working')};
            ${AS_POSTGRES}
            r := (select coalesce(modified_by::text, 'null') || '|' || (last_verified = now())::text
                  from distributors where id = '${DEMO}')`);
        assert.ok(p.reachedEnd, p.message);
        assert.equal(p.result, 'null|true');
    });

    it('changer le niveau de prix garde son auteur dans le journal (lisible en SQL seulement)', async () => {
        const p = await probe(`${AS_USER} update distributors set price_range = price_range where id = '${DEMO}';
            ${AS_POSTGRES} r := (select (modified_by = ${USER})::text from distributors where id = '${DEMO}')`);
        assert.ok(p.reachedEnd, p.message);
        assert.equal(p.result, 'true');
    });

    it('l’auteur lit toujours sa fiche en attente (la regle de lecture compare added_by), un visiteur non', async () => {
        const p = await probe(`${AS_USER} ${ADD}; v_mine := (select count(*) from distributors where id = 'itest-priv');
            ${AS_ANON} r := v_mine::text || '|' || (select count(*) from distributors where id = 'itest-priv')::text`, 'v_mine int;');
        assert.ok(p.reachedEnd, p.message);
        assert.equal(p.result, '1|0');
    });

    it('my_distributors : l’auteur retrouve ses fiches, leur statut et le motif d’un refus ; un autre compte et un visiteur, rien', async () => {
        const own = await probe(`${AS_USER} ${ADD};
            ${AS_POSTGRES} update distributors set review_status = 'rejected', review_reason = 'Motif itest' where id = 'itest-priv';
            ${AS_USER} r := (select review_status || '|' || coalesce(review_reason, '-') || '|' || (added_by = ${USER})::text
                             from my_distributors() where id = 'itest-priv')`);
        assert.ok(own.reachedEnd, own.message);
        assert.equal(own.result, 'rejected|Motif itest|true');
        const other = await probe(`${AS_USER} ${ADD};
            ${AS_POSTGRES} update distributors set added_by = ${OTHER} where id = 'itest-priv';
            ${AS_USER} r := (select count(*) from my_distributors() where id = 'itest-priv')::text`);
        assert.ok(other.reachedEnd, other.message);
        assert.equal(other.result, '0');
        const anon = await probe(`${AS_USER} ${ADD}; ${AS_ANON} r := (select count(*) from my_distributors())::text`);
        assert.ok(anon.reachedEnd, anon.message);
        assert.equal(anon.result, '0');
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
            (select count(*) from operator_requests where company = 'Societe itest') as demandes,
            (select count(*) from push_subscriptions where endpoint like 'https://fcm.googleapis.com/fcm/send/itest-%') as abonnements`);
        assert.deepEqual(r, { signaux: 0, fiches: 0, bans: 0, avis: 0, demandes: 0, abonnements: 0 });
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
