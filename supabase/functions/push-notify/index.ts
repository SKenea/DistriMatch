// DistriMatch - Fonction serveur push-notify (EPIC-T25).
// Appelee par le declencheur notify_push_on_signal (migration 024) a chaque
// nouveau signal : envoie une notification aux abonnes qui ont ce distributeur
// en favori. Deployee sans verification JWT ; l'appel est authentifie par
// l'en-tete x-push-secret (secret partage, aussi range dans le Vault).
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { decideBaseEvent, eventForSubscriber, buildPushMessage, isQuietTime, isInCooldown, isAllowedPushEndpoint, pushFailureAction, chunk } from './logic.js';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false }
});
const TRIGGER_SECRET = Deno.env.get('PUSH_TRIGGER_SECRET') || '';
webpush.setVapidDetails(
    'https://skenea.github.io/DistriMatch/',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!
);

function reply(status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const PAGE_SIZE = 500;                                  // sous le plafond de 1000 lignes par reponse de l'API
const BATCH_SIZE = 20;                                  // envois en parallele, par lot
const SEND_OPTIONS = { TTL: 3600, timeout: 10000 };     // un service push muet est lache apres 10 s
const SUBSCRIBER_COLUMNS = 'id, endpoint, p256dh, auth, user_id, followed_products, quiet_start, quiet_end, tz, fail_count';

// Lecture Supabase : supabase-js ne leve pas d'exception, il renvoie { error }.
// Une lecture en echec arrete tout (journalisee, reponse 500) : mieux vaut ne
// rien envoyer que notifier sur un historique incomplet.
async function readOrThrow(step: string, request: any) {
    const { data, error } = await request;
    if (error) throw new Error(`${step} : ${error.message || error}`);
    return data;
}

async function previousSignal(signal: any, productId: number | null) {
    let query = supabase.from('availability_signals')
        .select('product_id, state, created_at')
        .eq('distributor_id', signal.distributor_id)
        .lt('created_at', signal.created_at)
        .order('created_at', { ascending: false })
        .limit(1);
    query = productId == null ? query.is('product_id', null) : query.eq('product_id', productId);
    const data = await readOrThrow('signal precedent', query);
    return data?.[0] || null;
}

// Tous les abonnes qui ont ce distributeur en favori, page par page
// (sans range, l'API coupait en silence a 1000 lignes).
async function subscribersOf(distributorId: string) {
    const all: any[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
        const page = await readOrThrow('abonnes', supabase.from('push_subscriptions').select(SUBSCRIBER_COLUMNS)
            .contains('favorites', [distributorId]).order('id').range(from, from + PAGE_SIZE - 1));
        all.push(...(page || []));
        if (!page || page.length < PAGE_SIZE) return all;
    }
}

async function forgetSubscription(sub: any, reason: string) {
    const { error } = await supabase.from('push_subscriptions').delete().eq('id', sub.id);
    if (error) console.error('push : suppression impossible', sub.id, reason, error.message);
}

async function setFailCount(sub: any, value: number) {
    const { error } = await supabase.from('push_subscriptions').update({ fail_count: value }).eq('id', sub.id);
    if (error) console.error('push : compteur d echecs non mis a jour', sub.id, error.message);
}

// Un envoi ; true si la notification est partie. Ne leve jamais.
async function sendOne(sub: any, payload: string, distributorId: string) {
    try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, SEND_OPTIONS);
    } catch (e: any) {
        const action = pushFailureAction(e?.statusCode, sub.fail_count);
        if (action === 'delete') {
            await forgetSubscription(sub, `echec ${e?.statusCode ?? 'reseau'}`);
        } else {
            console.error('push', sub.id, e?.statusCode ?? 'reseau', e?.body || e?.message);
            if (action === 'count') await setFailCount(sub, (sub.fail_count || 0) + 1);
        }
        return false;
    }
    const { error } = await supabase.from('push_sent').upsert({ subscription_id: sub.id, distributor_id: distributorId, sent_at: new Date().toISOString() });
    if (error) console.error('push : anti-rafale non enregistre', sub.id, error.message);
    if (sub.fail_count > 0) await setFailCount(sub, 0);
    return true;
}

async function notifySignal(signalId: unknown) {
    const signal = await readOrThrow('signal', supabase.from('availability_signals')
        .select('id, distributor_id, product_id, state, user_id, device_hash, created_at')
        .eq('id', signalId).maybeSingle());
    if (!signal || String(signal.device_hash || '').startsWith('demo-')) return 0;

    const [previousProduct, previousMachine] = await Promise.all([
        signal.product_id == null ? null : previousSignal(signal, signal.product_id),
        previousSignal(signal, null)
    ]);
    const base = decideBaseEvent(signal, previousProduct, previousMachine);
    if (!base) return 0;

    const [distributor, product, subscriptions] = await Promise.all([
        readOrThrow('distributeur', supabase.from('distributors').select('name').eq('id', signal.distributor_id).maybeSingle()),
        signal.product_id == null ? null : readOrThrow('produit', supabase.from('products').select('name').eq('id', signal.product_id).maybeSingle()),
        subscribersOf(signal.distributor_id)
    ]);
    if (!distributor || !subscriptions.length) return 0;

    // Qui recoit quoi, sans reseau : ni son propre signal, ni hors evenement, ni heures calmes.
    const targets: any[] = [];
    for (const sub of subscriptions) {
        if (sub.user_id && sub.user_id === signal.user_id) continue;   // son propre signal
        if (!isAllowedPushEndpoint(sub.endpoint)) {                     // la base l'interdit deja (026)
            await forgetSubscription(sub, 'adresse hors services push');
            continue;
        }
        const event = eventForSubscriber(base, product?.name, sub.followed_products);
        if (!event) continue;
        if (isQuietTime(sub.quiet_start, sub.quiet_end, sub.tz)) continue;
        targets.push({ sub, body: buildPushMessage(distributor.name, event) });
    }

    let sent = 0;
    for (const batch of chunk(targets, BATCH_SIZE)) {
        // Anti-rafale lu lot par lot (URL courte). Illisible : ce lot n'est pas envoye (echec ferme).
        const { data: sentRows, error } = await supabase.from('push_sent').select('subscription_id, sent_at')
            .eq('distributor_id', signal.distributor_id).in('subscription_id', batch.map((t: any) => t.sub.id));
        if (error) {
            console.error('push : anti-rafale illisible, lot non envoye', signal.id, error.message);
            continue;
        }
        const lastSent = new Map((sentRows || []).map((r: any) => [r.subscription_id, r.sent_at]));
        const results = await Promise.allSettled(batch
            .filter((t: any) => !isInCooldown(lastSent.get(t.sub.id)))
            .map((t: any) => sendOne(t.sub, JSON.stringify({
                title: 'DistriMatch',
                body: t.body,
                url: `./?id=${encodeURIComponent(signal.distributor_id)}`,
                tag: `distrimatch-${signal.distributor_id}`
            }), signal.distributor_id)));
        sent += results.filter((r: any) => r.status === 'fulfilled' && r.value === true).length;
    }
    return sent;
}

Deno.serve(async (req) => {
    if (!TRIGGER_SECRET || req.headers.get('x-push-secret') !== TRIGGER_SECRET) return reply(401, { error: 'unauthorized' });
    const { signal_id } = await req.json().catch(() => ({}));
    if (!signal_id) return reply(400, { error: 'signal_id manquant' });
    try {
        return reply(200, { sent: await notifySignal(signal_id) });
    } catch (e: any) {
        console.error('push-notify', signal_id, e?.message || e);
        return reply(500, { error: 'echec' });
    }
});
