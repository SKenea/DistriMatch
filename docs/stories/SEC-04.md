# SEC-04 — Abonnements aux notifications app fermée : plus d'abus ni de blocage

- **Lot** : 1. Sécurité · **Gravité** : élevé · **Niveau conseillé** : medium, relecture par un modèle plus fort avant fusion
- **Ordre** : s'exécute **après SEC-03** (fusionnée dans `master`). Branche créée à partir de `master` **à jour**
  (`git checkout master && git pull` d'abord). Import map : partir de la valeur `?v=` **courante de master** (celle
  que SEC-03 a pu monter), jamais d'une valeur citée dans cette fiche.
- **Branche** : `fix/push-abus` · **Taille** : 4 fichiers de code (1 migration SQL neuve, `index.ts`, `logic.js`,
  `js/push.js`) + 2 fichiers de tests + `index.html`. Au-dessus de la limite de 3, **exception acceptée** :
  une seule cause (l'abonnement anonyme sans garde-fou), base et fonction serveur doivent changer ensemble.
- **Constats couverts** (rapport du 2026-10-21) :
  - push_subscribe ouverte à l'anonyme sans aucune limite : base remplie et notifications bloquées — `supabase/024_push_notifications.sql:50`
  - Notifications : un abonnement anonyme pointant vers une adresse qui ne répond jamais bloque l'envoi à tous les autres abonnés — `supabase/functions/push-notify/index.ts:79`
  - SSRF / amplification : push_subscribe n'impose aucune restriction de domaine sur l'endpoint — `supabase/024_push_notifications.sql:57`
  - push-notify ne lit que les 1000 premiers abonnés d'un favori (pas de pagination) — `supabase/functions/push-notify/index.ts:56`
  - push-notify ignore toutes les erreurs Supabase : anti-rafale perdu, doublons, pannes invisibles — `supabase/functions/push-notify/index.ts:80`

## But
Personne ne peut plus remplir la base d'abonnements inventés ni bloquer l'envoi des notifications :
seules les adresses des vrais services push sont acceptées, les volumes sont plafonnés, un service
lent ne retient plus les autres envois, tous les abonnés sont lus, et chaque erreur est journalisée.

## User story
En tant que membre qui a mis un distributeur en favori et activé « Prévenu même app fermée », je veux
recevoir la notification même si quelqu'un a créé des milliers de faux abonnements, afin de pouvoir
compter sur ce service.

**Critères d'acceptation**
- [ ] `push_subscribe` refuse (22023) une adresse hors `fcm.googleapis.com`, `updates.push.services.mozilla.com`,
      `*.push.apple.com`, `*.notify.windows.com` ; la table refuse aussi une telle adresse en écriture directe (23514).
- [ ] `push_subscribe` refuse un tableau à 2 dimensions, plus de 200 favoris, plus de 30 produits suivis ou un
      produit suivi de plus de 60 caractères (22023).
- [ ] Les favoris enregistrés sont seulement des fiches publiées existantes (les autres sont ignorés sans erreur).
- [ ] Au-delà de 200 **nouveaux** abonnements dans l'heure (tout le service), ou de 5000 abonnements au total, un
      nouvel abonnement est refusé (P0001) ; la mise à jour d'un abonnement existant passe toujours et remet
      `fail_count` à 0.
- [ ] Un job pg_cron `distrimatch-push-purge` efface chaque nuit les abonnements non rafraîchis depuis 60 jours.
- [ ] `push-notify` : délai de 10 s par envoi, envois par lots de 20 en parallèle (`Promise.allSettled`), lecture
      paginée des abonnés, chaque erreur Supabase journalisée, échec réseau / 400 / 429 / 5xx compté (`fail_count`),
      abonnement effacé au 6e échec de suite ; 404 / 410 effacent comme avant.
- [ ] Le front n'envoie jamais plus de 200 favoris ni plus de 30 produits suivis de 60 caractères (il tronque).

## Pourquoi ça arrive (déjà analysé, ne pas refaire)
- `push_subscribe` (024) est accordée à `anon`, en `security definer`. Seuls contrôles : préfixe `https://`,
  `array_length(p_favorites, 1) <= 200`, valeurs de 100 caractères. `array_length(.., 1)` ne compte que la
  1re dimension : un tableau 2D de 200 × 200 passe. Aucune limite de volume, aucune vérification de l'hôte :
  un script peut créer des dizaines de milliers de lignes (base free-tier de 500 Mo pleine = lecture seule)
  et faire envoyer par le serveur des POST vers n'importe quel site.
- `push-notify` envoie **un par un** (`await` dans la boucle) **sans délai** : une fausse adresse qui accepte
  la connexion sans répondre bloque tous les abonnés suivants. La lecture des abonnés n'a pas de `.range()` :
  l'API coupe en silence à 1000 lignes. Le `.in('subscription_id', ids)` sur tous les abonnés fabrique une URL
  géante qui échoue. Aucun `error` n'est lu : supabase-js ne lève pas d'exception, il renvoie `{ error }`.
- Le front (`js/push.js`) renvoie l'abonnement à chaque ouverture de l'app (`syncPushSubscription`, `js/app.js:602`),
  donc `updated_at` d'un abonné actif est rafraîchi : la purge à 60 jours ne touche que les abandonnés (et un
  abonné qui revient est réabonné tout seul à l'ouverture suivante).
- Décision sur les codes d'échec : **400 est compté** comme un échec passager (une adresse FCM inventée répond
  400 : sinon elle ne serait jamais effacée). **401 / 403 et les autres 4xx sont journalisés seulement**, jamais
  comptés : une clé VAPID mal configurée renvoie 401 / 403 pour tout le monde, les compter effacerait tous les
  abonnés en 6 signaux.

## Avant de coder
**Lire en entier** : `supabase/024_push_notifications.sql` ; `supabase/017_demo_nightly.sql` (style pg_cron) ;
`supabase/functions/push-notify/index.ts` ; `supabase/functions/push-notify/logic.js` ; `js/push.js` lignes 1-70 ;
`tests/integration/db.test.js` lignes 1-56 et 584-669 ; `tests/unit/unit.test.js` lignes 1805-1875.

**Réutiliser** (ne pas réécrire) : `decideBaseEvent`, `eventForSubscriber`, `buildPushMessage`, `isQuietTime`,
`isInCooldown` (`logic.js`) ; `probe`, `query`, `AS_ANON`, `AS_USER`, `DEMO` (`db.test.js`).

**Contrôles** (chaque commande doit trouver ce qui est indiqué, sinon s'arrêter) :
```bash
ls supabase/*.sql | tail -2
# attendu : 024_push_notifications.sql en dernier, ou 025_... (autre story SEC-03). 026_* ne doit PAS exister.
# Si 025 n'existe pas encore : garder quand même le numéro 026.
grep -n "push_subscribe" supabase/025_*.sql 2>/dev/null     # attendu : rien (si 025 redéfinit push_subscribe : s'arrêter)
grep -n "if coalesce(array_length(p_favorites, 1), 0) > 200" supabase/024_push_notifications.sql   # 1 ligne : 61
grep -n "cron.schedule" supabase/017_demo_nightly.sql                                              # 1 ligne : 22
grep -n "contains('favorites', \[signal.distributor_id\])" supabase/functions/push-notify/index.ts  # 1 ligne : 56
grep -n "{ TTL: 3600 }" supabase/functions/push-notify/index.ts                                    # 1 ligne : 79
grep -n "^async function previousSignal" supabase/functions/push-notify/index.ts                   # 1 ligne : 24
grep -n "^export function isInCooldown" supabase/functions/push-notify/logic.js                    # 1 ligne : 72
grep -n "^function subscriptionParams" js/push.js                                                  # 1 ligne : 47
grep -n "p_followed: \[...NotificationPrefs.followedProducts\]," js/push.js                        # 1 ligne : 55
grep -n "push.itest.example" tests/integration/db.test.js        # exactement 3 lignes : 585, 612, 650
grep -n "^import { decideBaseEvent" tests/unit/unit.test.js      # 1 ligne : 1809
grep -n "EPIC-T26 : pastilles sous le doigt" tests/unit/unit.test.js   # 1 ligne : 1874
grep -n '"./js/push.js": "./js/push.js?v=' index.html            # valeur courante de master, après SEC-03 (noter la valeur N)
```
Les numéros de ligne peuvent avoir glissé de quelques lignes si une autre story est passée : seul le
**texte** doit correspondre exactement.

## Étapes

### 1. `supabase/026_push_subscriptions_limits.sql` — nouveau fichier, contenu complet
Créer le fichier avec exactement ce contenu (fins de ligne CRLF comme les autres migrations si l'outil
le permet ; sinon LF, ce n'est pas bloquant pour du SQL) :
```sql
-- ============================================================================
-- 026 : abonnements aux notifications app fermee sans abus ni blocage (SEC-04)
-- ============================================================================
-- Revue du 2026-10-21. push_subscribe (024) restait ouverte a l'anonyme sans
-- garde-fou : n'importe quelle adresse https, tableaux a plusieurs dimensions,
-- aucun plafond. Desormais :
--   - l'adresse d'abonnement doit etre celle d'un service push connu
--     (push_endpoint_allowed, aussi en contrainte CHECK sur la table) ;
--   - favoris : seulement des fiches publiees existantes (le reste est ignore) ;
--   - une seule dimension, au plus 200 favoris et 30 produits suivis de 60 caracteres ;
--   - au plus 200 NOUVEAUX abonnements par heure pour tout le service (aucune IP lue)
--     et au plus 5000 abonnements au total ;
--   - fail_count : echecs d'envoi de suite, tenu par la fonction push-notify ;
--   - pg_cron efface chaque nuit les abonnements non rafraichis depuis 60 jours
--     (l'app rafraichit le sien a chaque ouverture).
-- Numero 026 meme si 025 n'existe pas encore (025 reserve a une autre story).
-- Rejouable. Tout ou rien : une seule transaction.
-- ============================================================================

begin;

create extension if not exists pg_cron;

-- Hotes des services push des navigateurs : FCM (Chrome, Android, Edge Android,
-- Samsung), Mozilla (Firefox), Apple (Safari), WNS (Edge Windows). Le / juste
-- apres l'hote ecarte un port, un « user@ » ou un faux suffixe.
-- Meme liste : isAllowedPushEndpoint (supabase/functions/push-notify/logic.js).
create or replace function public.push_endpoint_allowed(p_endpoint text) returns boolean
language sql immutable set search_path = public as $$
    select coalesce(
        length(p_endpoint) <= 1000
        and p_endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/',
        false);
$$;
-- Utilisee par une contrainte CHECK : executable par tous (fonction pure, aucune donnee lue).
grant execute on function public.push_endpoint_allowed(text) to anon, authenticated;

alter table public.push_subscriptions add column if not exists fail_count smallint not null default 0;
create index if not exists push_subscriptions_created_at_idx on public.push_subscriptions (created_at);
create index if not exists push_subscriptions_updated_at_idx on public.push_subscriptions (updated_at);

-- Abonnements deja enregistres vers une adresse hors liste : effaces (aucun vrai navigateur n'en produit).
delete from public.push_subscriptions where not public.push_endpoint_allowed(endpoint);

alter table public.push_subscriptions drop constraint if exists push_subscriptions_endpoint_allowed;
alter table public.push_subscriptions add constraint push_subscriptions_endpoint_allowed
    check (public.push_endpoint_allowed(endpoint));

-- ----------------------------------------------------------------------------
-- RPC d'abonnement (anonyme) : memes parametres que 024, le front ne change pas d'appel
-- ----------------------------------------------------------------------------
create or replace function public.push_subscribe(
    p_endpoint text, p_p256dh text, p_auth text,
    p_favorites text[], p_followed text[],
    p_quiet_start integer, p_quiet_end integer, p_tz text
) returns void
language plpgsql security definer set search_path = public as $$
declare
    v_favorites text[];
begin
    if not push_endpoint_allowed(p_endpoint)
       or coalesce(p_p256dh, '') = '' or length(p_p256dh) > 200
       or coalesce(p_auth, '') = '' or length(p_auth) > 100 then
        raise exception 'Abonnement invalide' using errcode = '22023';
    end if;
    -- Une seule dimension : array_length(.., 1) ne comptait que la premiere
    if coalesce(array_ndims(p_favorites), 1) > 1 or coalesce(array_ndims(p_followed), 1) > 1
       or cardinality(coalesce(p_favorites, '{}')) > 200
       or exists (select 1 from unnest(coalesce(p_favorites, '{}')) v where length(v) > 100) then
        raise exception 'Trop de favoris' using errcode = '22023';
    end if;
    if cardinality(coalesce(p_followed, '{}')) > 30
       or array_position(coalesce(p_followed, '{}'), null) is not null
       or exists (select 1 from unnest(coalesce(p_followed, '{}')) v where length(v) > 60) then
        raise exception 'Trop de produits suivis' using errcode = '22023';
    end if;

    -- Seulement des fiches publiees qui existent ; le reste est ignore sans erreur
    select coalesce(array_agg(distinct d.id), '{}') into v_favorites
      from distributors d
     where d.id = any(coalesce(p_favorites, '{}')) and d.review_status = 'published';

    -- Plafonds globaux pour un NOUVEL abonnement : 200 par heure, 5000 au total.
    -- Une mise a jour d'un abonnement existant passe toujours.
    if not exists (select 1 from push_subscriptions where endpoint = p_endpoint) then
        if (select count(*) from push_subscriptions where created_at > now() - interval '1 hour') >= 200 then
            raise exception 'Trop d''abonnements en ce moment, reessaie plus tard' using errcode = 'P0001';
        end if;
        if (select count(*) from push_subscriptions) >= 5000 then
            raise exception 'Trop d''abonnements enregistres, reessaie plus tard' using errcode = 'P0001';
        end if;
    end if;

    insert into push_subscriptions (endpoint, p256dh, auth, user_id, favorites, followed_products, quiet_start, quiet_end, tz)
    values (p_endpoint, p_p256dh, p_auth, auth.uid(), v_favorites, coalesce(p_followed, '{}'),
            p_quiet_start, p_quiet_end, coalesce(nullif(left(p_tz, 64), ''), 'UTC'))
    on conflict (endpoint) do update set
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_id = coalesce(auth.uid(), push_subscriptions.user_id),
        favorites = excluded.favorites,
        followed_products = excluded.followed_products,
        quiet_start = excluded.quiet_start,
        quiet_end = excluded.quiet_end,
        tz = excluded.tz,
        fail_count = 0,
        updated_at = now();
end;
$$;

revoke all on function public.push_subscribe(text, text, text, text[], text[], integer, integer, text) from public;
grant execute on function public.push_subscribe(text, text, text, text[], text[], integer, integer, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Purge nocturne : abonnements non rafraichis depuis 60 jours (03:30 UTC).
-- Idempotent : rejouer cette migration remplace le job.
-- ----------------------------------------------------------------------------
select cron.unschedule(jobid) from cron.job where jobname = 'distrimatch-push-purge';

select cron.schedule(
  'distrimatch-push-purge',
  '30 3 * * *',
  $$delete from public.push_subscriptions where updated_at < now() - interval '60 days'$$
);

commit;
```

### 2. `supabase/functions/push-notify/logic.js` — trois fonctions pures ajoutées à la fin
Après la fonction `isInCooldown` (dernière du fichier, qui finit par
`    return lastSentAt != null && now - new Date(lastSentAt).getTime() < PUSH_COOLDOWN_MS;` puis `}`),
ajouter une ligne vide puis :
```js
// Adresses d'abonnement acceptees : celles des services push des navigateurs
// (FCM : Chrome, Android, Edge Android, Samsung ; Mozilla : Firefox ; Apple : Safari ;
// WNS : Edge Windows). Meme liste que push_endpoint_allowed (migration 026).
// Le / juste apres l'hote ecarte un port, un « user@ » ou un faux suffixe.
const PUSH_ENDPOINT_PATTERN = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//;

export function isAllowedPushEndpoint(endpoint) {
    return typeof endpoint === 'string' && endpoint.length <= 1000 && PUSH_ENDPOINT_PATTERN.test(endpoint);
}

// Echecs d'envoi de suite tolere avant d'effacer un abonnement.
export const PUSH_MAX_FAILURES = 5;

// Que faire d'un envoi en echec. 404 / 410 : abonnement retire par le navigateur
// -> 'delete'. Reseau, delai depasse, 400 (adresse inventee), 429 ou 5xx -> 'count'
// (fail_count + 1), puis 'delete' au-dela de PUSH_MAX_FAILURES echecs de suite.
// 401 / 403 et autres 4xx (cle VAPID mal configuree...) : 'log' seulement, pour ne
// pas effacer tout le monde sur une erreur de configuration.
// failCount = echecs deja comptes avant celui-ci.
export function pushFailureAction(statusCode, failCount) {
    if (statusCode === 404 || statusCode === 410) return 'delete';
    const transient = !statusCode || statusCode === 400 || statusCode === 429 || statusCode >= 500;
    if (!transient) return 'log';
    return (Number(failCount) || 0) + 1 > PUSH_MAX_FAILURES ? 'delete' : 'count';
}

// Decoupe une liste en lots de `size` (envois en parallele bornes).
export function chunk(items, size) {
    const out = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}
```

### 3. `supabase/functions/push-notify/index.ts` — import, puis tout le bas du fichier
a) Ligne 8, avant :
```ts
import { decideBaseEvent, eventForSubscriber, buildPushMessage, isQuietTime, isInCooldown } from './logic.js';
```
après :
```ts
import { decideBaseEvent, eventForSubscriber, buildPushMessage, isQuietTime, isInCooldown, isAllowedPushEndpoint, pushFailureAction, chunk } from './logic.js';
```

b) Remplacer **tout le texte depuis `async function previousSignal(` (ligne 24) jusqu'à la fin du fichier**
(le `});` final de `Deno.serve`). Ne pas toucher aux lignes 1-23 (en-tête, client, `setVapidDetails`, `reply`).
Avant (texte exact, lignes 24-89) :
```ts
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
```
Après :
```ts
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
```
Le fichier n'est pas exécutable en local (Deno absent) : la vérification de syntaxe se fait par la commande
de la section « Vérification ». **Ne pas déployer** (voir « Hors périmètre »).

### 4. `js/push.js` — le front tronque ce que le serveur refuserait
Décision : le serveur **refuse** tout l'abonnement au-delà des bornes (contrat strict) ; le front **tronque**
avant l'envoi, pour qu'un membre avec 31 produits suivis garde quand même ses notifications.

a) Juste après la ligne 13 `const ASKED_KEY = 'distrimatch_push_asked';`, ajouter :
```js
// Bornes de push_subscribe (migration 026) : au-dela, le serveur refuse tout l'abonnement.
const PUSH_MAX_FAVORITES = 200;
const PUSH_MAX_FOLLOWED = 30;
const PUSH_MAX_PRODUCT_LENGTH = 60;
```
b) Avant :
```js
function subscriptionParams(subscription) {
```
après (exportée pour le test unitaire) :
```js
export function subscriptionParams(subscription) {
```
c) Avant :
```js
        p_favorites: AppState.subscriptions.map(String),
        p_followed: [...NotificationPrefs.followedProducts],
```
après :
```js
        p_favorites: AppState.subscriptions.map(String).slice(0, PUSH_MAX_FAVORITES),
        p_followed: NotificationPrefs.followedProducts.slice(0, PUSH_MAX_FOLLOWED).map(p => String(p).slice(0, PUSH_MAX_PRODUCT_LENGTH)),
```
Ne rien changer d'autre dans `push.js` (`p_endpoint`, `p_tz`, `sendToServer`... restent identiques).

### 5. `index.html` — versions `?v=`
`js/push.js` change : monter le `?v=` de **toutes** les entrées de l'import map à la même valeur N+1
(N relevé dans les contrôles, ex. `?v=91` → `?v=92` partout, 29 entrées). Aucun CSS ne change.

## Tests

### Test 1 — logique pure et front (unitaire)
- **Fichier** : `tests/unit/unit.test.js`.
- a) Ligne 1809, avant :
  ```js
  import { decideBaseEvent, eventForSubscriber, buildPushMessage, isQuietTime, isInCooldown, PUSH_COOLDOWN_MS } from '../../supabase/functions/push-notify/logic.js';
  ```
  après :
  ```js
  import { decideBaseEvent, eventForSubscriber, buildPushMessage, isQuietTime, isInCooldown, PUSH_COOLDOWN_MS, isAllowedPushEndpoint, pushFailureAction, chunk, PUSH_MAX_FAILURES } from '../../supabase/functions/push-notify/logic.js';
  ```
- b) Juste **avant** les deux lignes
  ```js
  // ============================================
  // EPIC-T26 : pastilles sous le doigt
  ```
  ajouter (`AppState` et `NotificationPrefs` sont déjà importés en tête du fichier) :
  ```js
  // ============================================
  // SEC-04 : abonnements push sans abus ni blocage
  // ============================================
  import { subscriptionParams } from '../../js/push.js';

  describe('Notifications app fermee : sans abus ni blocage (SEC-04)', () => {
      it('seules les adresses des services push sont acceptees', () => {
          for (const ok of [
              'https://fcm.googleapis.com/fcm/send/abc',
              'https://updates.push.services.mozilla.com/wpush/v2/abc',
              'https://web.push.apple.com/QK1xyz',
              'https://wns2-par02p.notify.windows.com/w/?token=abc'
          ]) assert.equal(isAllowedPushEndpoint(ok), true, ok);
          for (const bad of [
              'http://fcm.googleapis.com/fcm/send/abc',
              'https://fcm.googleapis.com.evil.example/x',
              'https://evil.example/fcm.googleapis.com/',
              'https://fcm.googleapis.com:8443/x',
              'https://user@fcm.googleapis.com/x',
              'https://push.apple.com.evil.example/x',
              'https://fcm.googleapis.com',
              'https://fcm.googleapis.com/' + 'x'.repeat(1000),
              '', null, undefined
          ]) assert.equal(isAllowedPushEndpoint(bad), false, String(bad));
      });

      it('echec d envoi : 404 / 410 efface ; reseau, 400, 429, 5xx comptent puis effacent au 6e ; 401 / 403 journalises', () => {
          assert.equal(pushFailureAction(410, 0), 'delete');
          assert.equal(pushFailureAction(404, 0), 'delete');
          assert.equal(pushFailureAction(undefined, 0), 'count');
          assert.equal(pushFailureAction(429, 0), 'count');
          assert.equal(pushFailureAction(503, PUSH_MAX_FAILURES - 1), 'count');
          assert.equal(pushFailureAction(500, PUSH_MAX_FAILURES), 'delete');
          assert.equal(pushFailureAction(undefined, PUSH_MAX_FAILURES), 'delete');
          assert.equal(pushFailureAction(400, 0), 'count');
          assert.equal(pushFailureAction(400, PUSH_MAX_FAILURES), 'delete');
          assert.equal(pushFailureAction(403, 9), 'log');
          assert.equal(pushFailureAction(401, 0), 'log');
          assert.equal(PUSH_MAX_FAILURES, 5);
      });

      it('envois par lots de 20', () => {
          const items = Array.from({ length: 45 }, (_, i) => i);
          assert.deepEqual(chunk(items, 20).map(b => b.length), [20, 20, 5]);
          assert.deepEqual(chunk(items, 20)[2], [40, 41, 42, 43, 44]);
          assert.deepEqual(chunk([], 20), []);
      });

      it('le front envoie au plus 200 favoris et 30 produits suivis de 60 caracteres', () => {
          const savedSubs = AppState.subscriptions;
          const savedFollowed = NotificationPrefs.followedProducts;
          AppState.subscriptions = Array.from({ length: 250 }, (_, i) => `dist-${i}`);
          NotificationPrefs.followedProducts = Array.from({ length: 40 }, (_, i) => `produit ${i} ${'x'.repeat(80)}`);
          try {
              const p = subscriptionParams({ toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'k', auth: 'a' } }) });
              assert.equal(p.p_endpoint, 'https://fcm.googleapis.com/fcm/send/abc');
              assert.equal(p.p_favorites.length, 200);
              assert.equal(p.p_favorites[0], 'dist-0');
              assert.equal(p.p_followed.length, 30);
              assert.ok(p.p_followed.every(v => v.length <= 60));
              assert.equal(p.p_followed[0], `produit 0 ${'x'.repeat(80)}`.slice(0, 60));
          } finally {
              AppState.subscriptions = savedSubs;
              NotificationPrefs.followedProducts = savedFollowed;
          }
      });
  });

  ```
- **Doit échouer avant la correction** parce que : tout le fichier `unit.test.js` échoue au chargement
  avec `SyntaxError: The requested module '../../supabase/functions/push-notify/logic.js' does not provide an
  export named 'isAllowedPushEndpoint'` (puis la même chose pour `subscriptionParams` de `js/push.js`).
  C'est le seul échec attendu ; écrire le test, constater cet échec, puis appliquer les étapes 2 et 4.

### Test 2 — règles de la base (intégration, transactions annulées)
- **Fichier** : `tests/integration/db.test.js`.
- a) Les tests 024 existants utilisent une adresse `push.itest.example`, que la base refusera désormais.
  Ligne 585, avant :
  ```js
      const ENDPOINT = 'https://push.itest.example/abc';
  ```
  après :
  ```js
      const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/itest-abc';
  ```
  Ligne 612, avant :
  ```js
          const big = await probe(`${AS_ANON} perform push_subscribe('https://push.itest.example/big', 'k', 'a', (select array_agg(g::text) from generate_series(1, 201) g), '{}', null, null, 'UTC')`);
  ```
  après :
  ```js
          const big = await probe(`${AS_ANON} perform push_subscribe('https://fcm.googleapis.com/fcm/send/itest-big', 'k', 'a', (select array_agg(g::text) from generate_series(1, 201) g), '{}', null, null, 'UTC')`);
  ```
  Ligne 650, avant :
  ```js
              (select count(*) from push_subscriptions where endpoint like 'https://push.itest.example/%') as abonnements`);
  ```
  après :
  ```js
              (select count(*) from push_subscriptions where endpoint like 'https://fcm.googleapis.com/fcm/send/itest-%') as abonnements`);
  ```
- b) Juste **après** la fin du bloc `describe('base : notifications app fermee (024)', ...)` (son `});` final,
  juste avant `describe('base : lectures anonymes', ...)`), ajouter :
  ```js
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
  ```
- **Doit échouer avant la correction** : la migration 026 n'est **pas** appliquée par l'exécutant (c'est Claude,
  modèle principal, qui l'applique après relecture). Donc, au moment de la PR, `node --test tests/integration/db.test.js`
  doit donner exactement : **les 6 tests du bloc « (026) » en échec** (adresse acceptée, tableau 2D accepté,
  favoris non filtrés, plafond horaire absent / colonne `fail_count` inexistante, plafond total absent, job pg_cron
  absent) et **tous les autres
  verts**, dont le bloc « (024) » modifié et « rien n'a ete ecrit ». Recopier cette sortie dans la PR. Ils
  passeront une fois la migration appliquée par Claude.
- Si `.env.local` n'a pas de jeton, tout le fichier est sauté : le noter dans la PR, ne pas chercher à le contourner.

## Vérification (dans l'ordre)
```bash
npm test
# attendu : tout vert, dont les 4 tests « (SEC-04) » et « cache-busting »
node --test --test-name-pattern="SEC-04" tests/unit/unit.test.js
# attendu : 4 tests passent
node -e "const fs=require('fs');const {stripTypeScriptTypes}=require('node:module');fs.writeFileSync('test-results/sec04-index.mjs', stripTypeScriptTypes(fs.readFileSync('supabase/functions/push-notify/index.ts','utf8')))" && node --check test-results/sec04-index.mjs && echo SYNTAXE-OK
# attendu : SYNTAXE-OK (un avertissement « ExperimentalWarning » est normal). Supprimer ensuite test-results/sec04-index.mjs
grep -n "timeout: 10000" supabase/functions/push-notify/index.ts      # 1 ligne
grep -n "Promise.allSettled" supabase/functions/push-notify/index.ts  # 1 ligne
grep -n "\.range(" supabase/functions/push-notify/index.ts            # 1 ligne
grep -nE "const \{ data(: [a-zA-Z]+)? \} = await" supabase/functions/push-notify/index.ts   # attendu : rien (chaque lecture regarde error)
grep -n "array_length" supabase/026_push_subscriptions_limits.sql     # attendu : rien
grep -n "push.itest.example" tests/integration/db.test.js             # attendu : rien
node --test tests/integration/db.test.js
# attendu AVANT application de la migration par Claude : 6 échecs, tous dans « (026) », le reste vert
npx playwright test --project=functional -g "Notifications app fermee"
# attendu : tout vert (le serveur y est simulé, le front envoie toujours push_subscribe avec les mêmes paramètres)
npm run test:functional
# en arrière-plan (~10 min) : tout vert, instables notés dans la PR
```

## Après la PR — réservé à Claude (modèle principal), JAMAIS à l'exécutant
L'exécutant **n'exécute pas** ces commandes et ne les mentionne que dans la PR comme « à faire par Claude » :
1. Relire la PR (SQL et `index.ts`).
2. Avant d'appliquer, compter ce que la migration effacera, hôte par hôte (les anciens abonnements GCM
   `android.googleapis.com` en font partie : ils seront effacés, ce service ne fonctionne plus) :
   `node scripts/supabase-sql.mjs -e "select substring(endpoint from '^https?://([^/]+)') as hote, count(*) from push_subscriptions where endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/' group by 1 order by 2 desc;"`
   (attendu : aucune ligne, ou seulement `android.googleapis.com` ; tout autre hôte = vrai service oublié dans
   la liste : ne pas appliquer, corriger la regex d'abord). Vérifier aussi le total, qui doit rester loin de 5000 :
   `node scripts/supabase-sql.mjs -e "select count(*) from push_subscriptions;"`.
3. `node scripts/supabase-sql.mjs supabase/026_push_subscriptions_limits.sql`
4. `node scripts/deploy-push.mjs` (redéploie `index.ts` + `logic.js` ; **après** la migration, car la fonction lit `fail_count`).
5. `node --test tests/integration/db.test.js` : tout vert, puis `npm run test:e2e`.
6. Mettre à jour la liste des migrations de `CLAUDE.md` (026) dans un commit séparé.

## Hors périmètre
- Appliquer la migration, déployer la fonction, lancer `scripts/supabase-sql.mjs` ou `scripts/deploy-push.mjs` : Claude seul.
- Plafond par IP (aucune IP collectée, décision prise) ; plafond pour `log_event` (autre story).
- Règle « exploitant » (020) et anti-rafale qui bloque une correction dans push-notify, filtrage des produits
  suivis par sous-chaîne, désabonnement à la déconnexion, resynchronisation après échec côté front : autres stories NOTIF.
- Les textes des notifications, `sw.js`, `scripts/deploy-push.mjs`, `CLAUDE.md` : ne pas toucher.
- Une fonction SQL `push_targets` côté base (proposée par le rapport) : non retenue, la pagination `.range()` suffit.

## Pièges connus
- **Ne jamais exécuter de SQL** sur la vraie base (ni `supabase-sql.mjs`, ni le SQL Editor) : `db.test.js` seul,
  il annule tout. Les 6 échecs « (026) » avant application sont **attendus** : ne pas « corriger » les tests.
- Ne pas renuméroter la migration : 026 même si 025 n'existe pas. Si un `025_*.sql` redéfinit `push_subscribe`,
  s'arrêter (les deux versions se marcheraient dessus).
- Dans `push_subscribe`, garder **exactement** les 8 paramètres et leurs types : le front appelle la RPC par
  noms (`p_endpoint`, `p_p256dh`, `p_auth`, `p_favorites`, `p_followed`, `p_quiet_start`, `p_quiet_end`, `p_tz`),
  et changer la signature créerait une 2e fonction au lieu de remplacer l'ancienne.
- `array_ndims('{}')` vaut NULL : d'où le `coalesce(..., 1)`. `cardinality` compte tous les éléments, quelle que
  soit la dimension.
- La regex est écrite **deux fois** (SQL et `logic.js`) : les garder identiques caractère pour caractère (aux
  échappements près : `/` est échappé `\/` en JavaScript seulement).
- `index.ts` : pas de `enum`, pas de propriété de paramètre de constructeur (`constructor(private x)`) : la
  vérification de syntaxe (`stripTypeScriptTypes`) ne les accepte pas. Le code de l'étape 3 n'en contient pas.
- Ne pas lire les abonnés et envoyer en même temps page par page : on lit **toutes** les pages d'abord
  (`subscribersOf`), sinon les suppressions pendant l'envoi décaleraient les pages suivantes.
- `results.filter(... r.value === true)` : `sendOne` renvoie `false` sur échec, jamais d'exception.
- Bump de **toutes** les entrées de l'import map à la **même** valeur, sinon `cache-busting` échoue.
- `git add` fichier par fichier : `supabase/026_push_subscriptions_limits.sql`, `supabase/functions/push-notify/index.ts`,
  `supabase/functions/push-notify/logic.js`, `js/push.js`, `index.html`, `tests/unit/unit.test.js`,
  `tests/integration/db.test.js` (+ `BACKLOG.md` si la story y figure). Jamais `test-results/`.

## Terminé quand
- [ ] Contrôles passés, tests écrits (unitaires : échouent avant, passent après ; base : 6 échecs « (026) » attendus tant que la migration n'est pas appliquée)
- [ ] Vérifications vertes (hors les 6 échecs « (026) » annoncés)
- [ ] Captures iPhone : non (aucun écran ne change)
- [ ] Story cochée dans BACKLOG.md (si elle n'y figure pas : le noter dans la PR, ne pas l'ajouter), PR ouverte (non fusionnée)

## Modèle de PR
**Titre** : `fix(securite): abonnements push bornes et envois qui ne se bloquent plus`

**Corps** : constats corrigés (liste ci-dessus) ; cause (RPC anonyme sans garde-fou, envois un par un sans
délai, lecture coupée à 1000, erreurs ignorées) ; correction (migration 026 : hôtes des services push, une
dimension, bornes, favoris publiés, plafond de 200 nouveaux par heure, `fail_count`, purge pg_cron à 60 jours ;
push-notify : délai 10 s, lots de 20, pagination, erreurs journalisées, échecs comptés ; front qui tronque) ;
tests ajoutés ; sorties des commandes de vérification, dont la sortie de `db.test.js` avec les 6 échecs
« (026) » attendus ; section « À faire par Claude » : relecture, comptage, application de la migration 026,
`node scripts/deploy-push.mjs`, relance de `db.test.js` et des E2E, mise à jour de `CLAUDE.md`.
