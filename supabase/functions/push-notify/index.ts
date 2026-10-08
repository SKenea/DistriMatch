// DistriMatch - Fonction serveur push-notify (EPIC-T25).
// Appelee par le declencheur notify_push_on_signal (migration 024) a chaque
// nouveau signal : envoie une notification aux abonnes qui ont ce distributeur
// en favori. Deployee sans verification JWT ; l'appel est authentifie par
// l'en-tete x-push-secret (secret partage, aussi range dans le Vault).
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { decideBaseEvent, eventForSubscriber, buildPushMessage, isQuietTime, isInCooldown } from './logic.js';

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

async function previousSignal(signal: any, productId: number | null) {
    let query = supabase.from('availability_signals')
        .select('product_id, state, created_at')
        .eq('distributor_id', signal.distributor_id)
        .lt('created_at', signal.created_at)
        .order('created_at', { ascending: false })
        .limit(1);
    query = productId == null ? query.is('product_id', null) : query.eq('product_id', productId);
    const { data } = await query;
    return data?.[0] || null;
}

Deno.serve(async (req) => {
    if (!TRIGGER_SECRET || req.headers.get('x-push-secret') !== TRIGGER_SECRET) return reply(401, { error: 'unauthorized' });
    const { signal_id } = await req.json().catch(() => ({}));
    if (!signal_id) return reply(400, { error: 'signal_id manquant' });

    const { data: signal } = await supabase.from('availability_signals')
        .select('id, distributor_id, product_id, state, user_id, device_hash, created_at')
        .eq('id', signal_id).maybeSingle();
    if (!signal || String(signal.device_hash || '').startsWith('demo-')) return reply(200, { sent: 0 });

    const [previousProduct, previousMachine] = await Promise.all([
        signal.product_id == null ? null : previousSignal(signal, signal.product_id),
        previousSignal(signal, null)
    ]);
    const base = decideBaseEvent(signal, previousProduct, previousMachine);
    if (!base) return reply(200, { sent: 0 });

    const [{ data: distributor }, { data: product }, { data: subscriptions }] = await Promise.all([
        supabase.from('distributors').select('name').eq('id', signal.distributor_id).maybeSingle(),
        signal.product_id == null ? Promise.resolve({ data: null }) : supabase.from('products').select('name').eq('id', signal.product_id).maybeSingle(),
        supabase.from('push_subscriptions').select('*').contains('favorites', [signal.distributor_id])
    ]);
    if (!distributor || !subscriptions?.length) return reply(200, { sent: 0 });

    const ids = subscriptions.map((s: any) => s.id);
    const { data: sentRows } = await supabase.from('push_sent').select('subscription_id, sent_at')
        .eq('distributor_id', signal.distributor_id).in('subscription_id', ids);
    const lastSent = new Map((sentRows || []).map((r: any) => [r.subscription_id, r.sent_at]));

    let sent = 0;
    for (const sub of subscriptions) {
        if (sub.user_id && sub.user_id === signal.user_id) continue;   // son propre signal
        const event = eventForSubscriber(base, product?.name, sub.followed_products);
        if (!event) continue;
        if (isQuietTime(sub.quiet_start, sub.quiet_end, sub.tz)) continue;
        if (isInCooldown(lastSent.get(sub.id))) continue;
        const payload = JSON.stringify({
            title: 'DistriMatch',
            body: buildPushMessage(distributor.name, event),
            url: `./?id=${encodeURIComponent(signal.distributor_id)}`,
            tag: `distrimatch-${signal.distributor_id}`
        });
        try {
            await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 3600 });
            await supabase.from('push_sent').upsert({ subscription_id: sub.id, distributor_id: signal.distributor_id, sent_at: new Date().toISOString() });
            sent++;
        } catch (e: any) {
            // Abonnement expire ou retire par le navigateur : on l'efface.
            if (e?.statusCode === 404 || e?.statusCode === 410) await supabase.from('push_subscriptions').delete().eq('id', sub.id);
            else console.error('push', e?.statusCode, e?.body || e?.message);
        }
    }
    return reply(200, { sent });
});
