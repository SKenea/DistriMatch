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
 * Acces partage avec les tests d'integration : scripts/lib/supabase-management.mjs.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, readToken, runSql } from './lib/supabase-management.mjs';

const [arg, inline] = process.argv.slice(2);
if (!arg) {
    console.error('Usage : node scripts/supabase-sql.mjs <fichier.sql> | -e "<sql>"');
    process.exit(2);
}
if (!readToken()) {
    console.error('SUPABASE_ACCESS_TOKEN absent : cree .env.local a la racine avec SUPABASE_ACCESS_TOKEN=<jeton>');
    process.exit(2);
}
const query = arg === '-e' ? inline : readFileSync(resolve(ROOT, arg), 'utf8');

const { ok, status, text } = await runSql(query);
console.log(`HTTP ${status}`);
console.log(text.slice(0, 8000));
process.exit(ok ? 0 : 1);
