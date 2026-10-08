#!/usr/bin/env node
/**
 * DistriMatch - Deploie les notifications app fermee (EPIC-T25).
 *
 * Usage (depuis la racine du depot) :
 *   node scripts/deploy-push.mjs            # secrets + Vault + fonction push-notify
 *   node scripts/deploy-push.mjs --vault    # seulement le Vault (droits Database suffisent)
 *
 * Lit dans .env.local (ignore par git) : SUPABASE_ACCESS_TOKEN (droits Database
 * read-write ET Edge Functions read-write + secrets), VAPID_PUBLIC_KEY,
 * VAPID_PRIVATE_KEY, PUSH_TRIGGER_SECRET. Aucune valeur n'est affichee.
 * Rejouable : la fonction est redeployee, les secrets remplaces.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, readToken, projectRef, runSql } from './lib/supabase-management.mjs';

const FUNCTION_SLUG = 'push-notify';
const FUNCTION_DIR = resolve(ROOT, 'supabase/functions', FUNCTION_SLUG);
const FUNCTION_FILES = ['index.ts', 'logic.js'];

function readEnv(name) {
    const env = readFileSync(resolve(ROOT, '.env.local'), 'utf8');
    const value = (env.match(new RegExp(`^${name}\\s*=\\s*"?([^"\\r\\n]+)"?`, 'm')) || [])[1];
    if (!value) throw new Error(`${name} absent de .env.local`);
    return value.trim();
}

function sqlLiteral(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
}

async function api(path, options = {}) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef()}${path}`, {
        ...options,
        headers: { Authorization: `Bearer ${readToken()}`, ...(options.headers || {}) }
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${path} : HTTP ${res.status} ${text.slice(0, 300)}`);
    return text;
}

async function setVault() {
    const url = `https://${projectRef()}.supabase.co/functions/v1/${FUNCTION_SLUG}`;
    const upsert = (name, value) => `
        do $$ begin
            if exists (select 1 from vault.secrets where name = ${sqlLiteral(name)}) then
                perform vault.update_secret((select id from vault.secrets where name = ${sqlLiteral(name)}), ${sqlLiteral(value)});
            else
                perform vault.create_secret(${sqlLiteral(value)}, ${sqlLiteral(name)});
            end if;
        end $$;`;
    const { ok, status, text } = await runSql(upsert('push_notify_url', url) + upsert('push_trigger_secret', readEnv('PUSH_TRIGGER_SECRET')));
    if (!ok) throw new Error(`Vault : HTTP ${status} ${text.slice(0, 300)}`);
    console.log('Vault : push_notify_url et push_trigger_secret en place');
}

async function setSecrets() {
    const names = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'PUSH_TRIGGER_SECRET'];
    await api('/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(names.map(name => ({ name, value: readEnv(name) })))
    });
    console.log(`Secrets : ${names.join(', ')}`);
}

async function deployFunction() {
    const form = new FormData();
    form.append('metadata', JSON.stringify({ entrypoint_path: 'index.ts', name: FUNCTION_SLUG, verify_jwt: false }));
    for (const file of FUNCTION_FILES) {
        form.append('file', new Blob([readFileSync(resolve(FUNCTION_DIR, file))]), file);
    }
    await api(`/functions/deploy?slug=${FUNCTION_SLUG}`, { method: 'POST', body: form });
    console.log(`Fonction ${FUNCTION_SLUG} deployee (sans verification JWT, en-tete x-push-secret)`);
}

if (!readToken()) {
    console.error('SUPABASE_ACCESS_TOKEN absent de .env.local');
    process.exit(2);
}
try {
    await setVault();
    if (!process.argv.includes('--vault')) {
        await setSecrets();
        await deployFunction();
    }
} catch (e) {
    console.error(e.message);
    process.exit(1);
}
