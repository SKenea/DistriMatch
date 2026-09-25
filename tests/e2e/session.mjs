/**
 * DistriMatch - Session du compte de test des E2E connectes (EPIC-T7 T7-US4b)
 *
 * Autorise par Stephane le 2026-09-25 (option 1), pour CE compte uniquement :
 * e2e@distrimatch.test (migration 015, app_metadata.e2e = true).
 *
 * Le magic link ne peut pas etre suivi par un test, et le captcha du projet
 * bloque la connexion par mot de passe. On ouvre donc une session en base (en
 * tant que postgres, par l'API de gestion) puis on l'echange contre de vrais
 * jetons aupres du serveur d'authentification Supabase : la suite du parcours
 * est 100 % reelle (JWT verifie par la base, RLS, RPC).
 *
 * closeTestSession() purge les signaux du compte et supprime ses sessions.
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readToken, runSql } from '../../scripts/lib/supabase-management.mjs';

export const TEST_EMAIL = 'e2e@distrimatch.test';

const config = readFileSync(new URL('../../js/config.js', import.meta.url), 'utf8');
export const SUPABASE_URL = config.match(/SUPABASE_URL = '([^']+)'/)[1];
export const ANON_KEY = config.match(/SUPABASE_ANON_KEY = '([^']+)'/)[1];
export const STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

export function canOpenTestSession() {
    return !!readToken();
}

async function sql(query) {
    const res = await runSql(query);
    if (!res.ok) throw new Error(`SQL refuse : ${res.text.slice(0, 300)}`);
    return res.rows;
}

// Ouvre une session pour le compte de test et renvoie { uid, session } ;
// session a le format stocke par supabase-js (localStorage[STORAGE_KEY]).
export async function openTestSession() {
    // Format « legacy » accepte par le serveur d'auth Supabase (supabase/auth,
    // internal/api/token_refresh.go) : exactement ^[a-z0-9]{12}$
    const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const refresh = Array.from(randomBytes(12), b => ALPHABET[b % ALPHABET.length]).join('');
    await sql(`do $$
        declare v_uid uuid; v_sid uuid := gen_random_uuid();
        begin
          select id into v_uid from auth.users
           where email = '${TEST_EMAIL}' and raw_app_meta_data->>'e2e' = 'true';
          if v_uid is null then raise exception 'compte de test e2e absent (migration 015)'; end if;
          insert into auth.sessions (id, user_id, created_at, updated_at, aal) values (v_sid, v_uid, now(), now(), 'aal1');
          insert into auth.refresh_tokens (instance_id, token, user_id, revoked, created_at, updated_at, session_id)
          values ('00000000-0000-0000-0000-000000000000', '${refresh}', v_uid::text, false, now(), now(), v_sid);
        end $$;`);

    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh })
    });
    const session = await res.json();
    if (!res.ok || !session.access_token) {
        throw new Error(`echange de session refuse (${res.status}) : ${JSON.stringify(session).slice(0, 200)}`);
    }
    if (session.user?.email !== TEST_EMAIL) throw new Error('la session ne correspond pas au compte de test');
    return { uid: session.user.id, session };
}

// Purge les signaux du compte de test et supprime ses sessions.
export async function closeTestSession() {
    const rows = await sql(`
        with u as (select id from auth.users where email = '${TEST_EMAIL}' and raw_app_meta_data->>'e2e' = 'true'),
             purge as (select purge_user_signals((select id from u), false, null) as r),
             del as (delete from auth.sessions where user_id = (select id from u) returning 1)
        select (select r from purge) as purge, (select count(*) from del) as sessions_supprimees;`);
    return rows[0];
}

// Signaux du compte de test sur une fiche (verification apres le parcours).
export async function testAccountSignals(distributorId) {
    return sql(`select s.state, s.source, s.product_id from availability_signals s
                join auth.users u on u.id = s.user_id
                where u.email = '${TEST_EMAIL}' and s.distributor_id = '${distributorId}'
                order by s.created_at desc`);
}
