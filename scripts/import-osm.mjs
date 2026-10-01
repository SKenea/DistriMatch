#!/usr/bin/env node
/**
 * DistriMatch - Import des distributeurs alimentaires d'OpenStreetMap (EPIC-T15)
 *
 * Interroge Overpass sur une zone (bbox en parametre : rien en dur dans l'app),
 * cree une fiche par machine (id osm-<node|way>-<id>, source 'osm', sans produit,
 * last_verified null = « Pas encore vérifié »), complete la rue / ville par
 * Nominatim (1 requete / s, politique d'usage OSM), ignore une machine a moins de
 * 50 m d'une fiche reelle existante, et n'ecrase jamais une fiche deja importee
 * (rejouable sans doublon) : seuls ses horaires (opening_hours, EPIC-T17) sont
 * remis a jour. Donnees © OpenStreetMap contributors, ODbL.
 *
 * Usage (jeton de gestion dans .env.local, cf. scripts/supabase-sql.mjs) :
 *   node scripts/import-osm.mjs --bbox 43.25,-1.80,43.60,-1.25 --tz Europe/Paris --dry-run
 *   node scripts/import-osm.mjs --bbox 43.25,-1.80,43.60,-1.25 --tz Europe/Paris
 */
import { runSql } from './lib/supabase-management.mjs';

const UA = 'DistriMatch-import/1.0 (https://skenea.github.io/DistriMatch/)';
const VENDING = 'pizza|bread|baguette|food|milk|cheese|dairy|eggs|vegetables|fruit|farm|honey|meat|ice';
const DUPLICATE_RADIUS_M = 50;

// vending OSM -> type DistriMatch (+ emoji, libelle d'une machine sans nom)
const TYPES = [
    [/pizza/, 'pizza', '🍕', 'Distributeur de pizzas'],
    [/bread|baguette/, 'bakery', '🥖', 'Distributeur de pain'],
    [/ice/, 'ice', '🧊', 'Distributeur de glaçons'],
    [/milk|cheese|dairy/, 'dairy', '🥛', 'Distributeur de produits laitiers'],
    [/eggs|vegetables|fruit|farm|honey/, 'agricultural', '🥕', 'Distributeur de produits fermiers'],
    [/meat/, 'meat', '🥩', 'Distributeur de viande'],
    [/food/, 'general', '🏪', 'Distributeur alimentaire']
];

function arg(name) {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : null;
}

function mapType(vending = '') {
    const v = vending.toLowerCase();
    const hit = TYPES.find(([re]) => re.test(v));
    return hit ? { type: hit[1], emoji: hit[2], label: hit[3] } : null;
}

function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function distanceM(a, b) {
    const R = 6371000;
    const toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

function sqlText(v) {
    return v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`;
}

async function fetchOverpass([s, w, n, e]) {
    const box = `(${s},${w},${n},${e})`;
    const q = `[out:json][timeout:60];(node["amenity"="vending_machine"]["vending"~"${VENDING}"]${box};way["amenity"="vending_machine"]["vending"~"${VENDING}"]${box};);out center tags;`;
    // Serveurs publics souvent charges (504) : deux serveurs, trois essais chacun
    const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
    let last = '';
    for (const url of endpoints) {
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `data=${encodeURIComponent(q)}`
                });
                if (res.ok) return (await res.json()).elements || [];
                last = `${url} : HTTP ${res.status}`;
            } catch (e) {
                last = `${url} : ${e.message}`;
            }
            await sleep(5000 * attempt);
        }
    }
    throw new Error(`Overpass indisponible (${last})`);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function reverse(lat, lng) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&addressdetails=1&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'fr' } });
    if (!res.ok) return {};
    const a = (await res.json()).address || {};
    return { road: a.road || a.pedestrian || a.square || null, city: a.city || a.town || a.village || a.municipality || null };
}

async function main() {
    const bbox = (arg('bbox') || '').split(',').map(Number);
    const tz = arg('tz');
    const dryRun = process.argv.includes('--dry-run');
    if (bbox.length !== 4 || bbox.some(Number.isNaN) || !tz) {
        console.error('Usage : node scripts/import-osm.mjs --bbox sud,ouest,nord,est --tz Europe/Paris [--dry-run]');
        process.exit(1);
    }

    const elements = await fetchOverpass(bbox);
    const existing = await runSql('select id, name, lat, lng, is_demo from distributors;');
    if (!existing.ok) throw new Error(`Lecture des fiches : ${existing.text}`);
    const known = new Set(existing.rows.map(r => r.id));
    const real = existing.rows.filter(r => !r.is_demo && !String(r.id).startsWith('osm-'));

    const rows = [];
    const skipped = [];
    const hours = [];   // fiches OSM deja importees : horaires remis a jour (EPIC-T17)
    for (const el of elements) {
        const t = el.tags || {};
        const lat = el.lat ?? el.center?.lat;
        const lng = el.lon ?? el.center?.lon;
        // « food » est vague : un nom qui parle de pizza ou de pain l'emporte
        const osmName = t.name || t.brand || t.operator || '';
        const nameHint = /pizza/i.test(osmName) ? 'pizza' : /pain|boulang/i.test(osmName) ? 'bread' : '';
        const mapped = mapType(/food/i.test(t.vending || '') && nameHint ? nameHint : t.vending);
        const id = `osm-${el.type}-${el.id}`;
        if (!mapped || lat === undefined) { skipped.push(`${id} (type ${t.vending})`); continue; }
        if (known.has(id)) {
            hours.push({ id, openingHours: t.opening_hours || null });
            skipped.push(`${id} (deja importee)`);
            continue;
        }
        const near = real.find(r => distanceM({ lat, lng }, r) < DUPLICATE_RADIUS_M);
        if (near) { skipped.push(`${id} (doublon de « ${near.name} »)`); continue; }

        let street = t['addr:street'] ? `${t['addr:housenumber'] ? `${t['addr:housenumber']} ` : ''}${t['addr:street']}` : null;
        let city = t['addr:city'] || null;
        if (!street || !city) {
            await sleep(1100);   // politique d'usage Nominatim : 1 requete / s
            const r = await reverse(lat, lng);
            street = street || r.road;
            city = city || r.city;
        }
        const name = capitalize(osmName) || mapped.label;
        const address = street || (city ? `Près de ${city}` : null);
        rows.push({ id, name, type: mapped.type, emoji: mapped.emoji, address, city, lat, lng, openingHours: t.opening_hours || null });
    }

    console.log(`${elements.length} machines OSM, ${rows.length} a importer, ${skipped.length} ignorees`);
    for (const r of rows) console.log(`  + ${r.id} | ${r.type} | ${r.name} | ${r.address || '-'} | ${r.city || '-'}`);
    for (const s of skipped) console.log(`  - ${s}`);
    for (const h of hours) if (h.openingHours) console.log(`  ~ ${h.id} horaires : ${h.openingHours}`);
    if (dryRun) return;

    if (rows.length) {
        const values = rows.map(r => `(${sqlText(r.id)}, ${sqlText(r.name)}, ${sqlText(r.type)}, ${sqlText(r.emoji)}, ${sqlText(r.address)}, ${sqlText(r.city)}, ${r.lat}, ${r.lng}, null, null, 'osm', ${sqlText(tz)}, false, ${sqlText(r.openingHours)})`).join(',\n');
        const sql = `insert into distributors (id, name, type, emoji, address, city, lat, lng, last_verified, price_range, source, tz, is_user_added, opening_hours)
values ${values}
on conflict (id) do nothing;`;
        const res = await runSql(sql);
        if (!res.ok) throw new Error(`Insertion : ${res.text}`);
        console.log(`Importees : ${rows.length}`);
    }
    // Horaires des fiches deja importees : seule colonne remise a jour, fiches OSM seulement
    if (hours.length) {
        const values = hours.map(h => `(${sqlText(h.id)}, ${sqlText(h.openingHours)})`).join(',\n');
        const res = await runSql(`update distributors d set opening_hours = v.oh
from (values ${values}) as v(id, oh)
where d.id = v.id and d.source = 'osm' and d.opening_hours is distinct from v.oh;`);
        if (!res.ok) throw new Error(`Horaires : ${res.text}`);
        console.log(`Horaires verifies : ${hours.length} fiches deja importees`);
    }
}

main().catch(e => {
    console.error('[import-osm]', e.message);
    process.exit(1);
});
