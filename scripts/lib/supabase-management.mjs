/**
 * DistriMatch - Acces SQL au projet Supabase par l'API de gestion.
 *
 * Partage par scripts/supabase-sql.mjs (ligne de commande) et par les tests
 * d'integration contre la vraie base (tests/integration/db.test.js).
 * Le jeton d'acces (portee Database read-write) est lu dans .env.local (ignore
 * par git) ou dans la variable SUPABASE_ACCESS_TOKEN. Il n'est jamais affiche.
 * La requete tourne en tant que postgres (equivalent du SQL Editor).
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function readToken() {
    let env = '';
    try { env = readFileSync(resolve(ROOT, '.env.local'), 'utf8'); } catch (e) { /* absent */ }
    const token = (env.match(/SUPABASE_ACCESS_TOKEN\s*=\s*"?([^"\r\n]+)"?/) || [])[1] || process.env.SUPABASE_ACCESS_TOKEN;
    return token ? token.trim() : null;
}

export function projectRef() {
    const cfg = readFileSync(resolve(ROOT, 'js/config.js'), 'utf8');
    const ref = (cfg.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1];
    if (!ref) throw new Error('SUPABASE_URL introuvable dans js/config.js');
    return ref;
}

// Execute une requete SQL. Retour : { ok, status, text, rows } ; rows est le
// JSON renvoye par l'API quand la requete reussit.
export async function runSql(query) {
    const token = readToken();
    if (!token) throw new Error('SUPABASE_ACCESS_TOKEN absent : cree .env.local a la racine avec SUPABASE_ACCESS_TOKEN=<jeton>');
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef()}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, read_only: false })
    });
    const text = await res.text();
    let rows = null;
    if (res.ok) {
        try { rows = JSON.parse(text); } catch (e) { rows = null; }
    }
    return { ok: res.ok, status: res.status, text, rows };
}
