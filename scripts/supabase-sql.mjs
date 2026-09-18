#!/usr/bin/env node
/**
 * DistriMatch - Execute du SQL sur le projet Supabase via l'API de gestion.
 *
 * Usage (depuis la racine du depot) :
 *   node scripts/supabase-sql.mjs supabase/010_is_demo.sql      # un fichier de migration
 *   node scripts/supabase-sql.mjs -e "select count(*) from distributors;"
 *
 * Le jeton d'acces (Dashboard > Account > Access Tokens, portee Database
 * read-write sur le projet) est lu dans .env.local (ignore par git) :
 *   SUPABASE_ACCESS_TOKEN=...
 * Le projet est deduit de SUPABASE_URL dans js/config.js. Le jeton n'est
 * jamais affiche. La requete tourne en tant que postgres : c'est l'equivalent
 * du SQL Editor du dashboard, sans passer par le navigateur.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readToken() {
    let env = '';
    try { env = readFileSync(resolve(ROOT, '.env.local'), 'utf8'); } catch (e) { /* absent */ }
    const token = (env.match(/SUPABASE_ACCESS_TOKEN\s*=\s*"?([^"\r\n]+)"?/) || [])[1] || process.env.SUPABASE_ACCESS_TOKEN;
    if (!token) {
        console.error('SUPABASE_ACCESS_TOKEN absent : cree .env.local a la racine avec SUPABASE_ACCESS_TOKEN=<jeton>');
        process.exit(2);
    }
    return token.trim();
}

function projectRef() {
    const cfg = readFileSync(resolve(ROOT, 'js/config.js'), 'utf8');
    const ref = (cfg.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1];
    if (!ref) { console.error('SUPABASE_URL introuvable dans js/config.js'); process.exit(2); }
    return ref;
}

const [arg, inline] = process.argv.slice(2);
if (!arg) {
    console.error('Usage : node scripts/supabase-sql.mjs <fichier.sql> | -e "<sql>"');
    process.exit(2);
}
const query = arg === '-e' ? inline : readFileSync(resolve(ROOT, arg), 'utf8');

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef()}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${readToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, read_only: false })
});
const text = await res.text();
console.log(`HTTP ${res.status}`);
console.log(text.slice(0, 8000));
process.exit(res.ok ? 0 : 1);
