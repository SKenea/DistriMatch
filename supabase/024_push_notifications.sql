-- ============================================================================
-- 024 : notifications app fermee (EPIC-T25, Stephane 2026-10-08)
-- ============================================================================
-- Un telephone s'abonne SANS compte (comme les favoris) : son adresse
-- d'abonnement (endpoint, fournie par le navigateur, impossible a deviner) sert
-- de cle. L'API ne lit jamais les abonnements ; elle passe par deux RPC.
-- A chaque nouveau signal (hors demo), un declencheur appelle la fonction
-- serveur push-notify (supabase/functions/push-notify) par pg_net.
--
-- Prerequis hors SQL (scripts/deploy-push.mjs) : fonction push-notify deployee,
-- secrets VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / PUSH_TRIGGER_SECRET, et dans le
-- Vault : push_notify_url, push_trigger_secret. Sans eux, le declencheur ne fait
-- rien (aucun signal n'est jamais bloque).
-- Rejouable.
-- ============================================================================

create extension if not exists pg_net;

create table if not exists public.push_subscriptions (
    id uuid primary key default gen_random_uuid(),
    endpoint text not null unique check (endpoint like 'https://%' and length(endpoint) <= 1000),
    p256dh text not null check (length(p256dh) <= 200),
    auth text not null check (length(auth) <= 100),
    user_id uuid references auth.users(id) on delete set null,   -- pour ne pas notifier son propre signal
    favorites text[] not null default '{}',
    followed_products text[] not null default '{}',
    quiet_start smallint check (quiet_start between 0 and 23),
    quiet_end smallint check (quiet_end between 0 and 23),
    tz text not null default 'UTC' check (length(tz) <= 64),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_favorites_idx on public.push_subscriptions using gin (favorites);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- Anti-rafale : dernier envoi par abonne et par distributeur.
create table if not exists public.push_sent (
    subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
    distributor_id text not null,
    sent_at timestamptz not null default now(),
    primary key (subscription_id, distributor_id)
);
alter table public.push_sent enable row level security;
revoke all on public.push_sent from anon, authenticated;

-- ----------------------------------------------------------------------------
-- RPC d'abonnement (anonymes)
-- ----------------------------------------------------------------------------
create or replace function public.push_subscribe(
    p_endpoint text, p_p256dh text, p_auth text,
    p_favorites text[], p_followed text[],
    p_quiet_start integer, p_quiet_end integer, p_tz text
) returns void
language plpgsql security definer set search_path = public as $$
begin
    if p_endpoint is null or p_endpoint not like 'https://%' or length(p_endpoint) > 1000
       or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
        raise exception 'Abonnement invalide' using errcode = '22023';
    end if;
    if coalesce(array_length(p_favorites, 1), 0) > 200 or coalesce(array_length(p_followed, 1), 0) > 50
       or exists (select 1 from unnest(coalesce(p_favorites, '{}') || coalesce(p_followed, '{}')) v where length(v) > 100) then
        raise exception 'Trop de favoris' using errcode = '22023';
    end if;
    insert into push_subscriptions (endpoint, p256dh, auth, user_id, favorites, followed_products, quiet_start, quiet_end, tz)
    values (p_endpoint, p_p256dh, p_auth, auth.uid(), coalesce(p_favorites, '{}'), coalesce(p_followed, '{}'),
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
        updated_at = now();
end;
$$;

create or replace function public.push_unsubscribe(p_endpoint text) returns void
language sql security definer set search_path = public as $$
    delete from push_subscriptions where endpoint = p_endpoint;
$$;

revoke all on function public.push_subscribe(text, text, text, text[], text[], integer, integer, text) from public;
revoke all on function public.push_unsubscribe(text) from public;
grant execute on function public.push_subscribe(text, text, text, text[], text[], integer, integer, text) to anon, authenticated;
grant execute on function public.push_unsubscribe(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Declencheur : chaque nouveau signal (hors demo) -> push-notify
-- ----------------------------------------------------------------------------
create or replace function public.notify_push_on_signal() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    v_url text;
    v_secret text;
begin
    if coalesce(new.device_hash, '') like 'demo-%' then return new; end if;
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_notify_url';
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_trigger_secret';
    if v_url is null or v_secret is null then return new; end if;
    perform net.http_post(
        url := v_url,
        body := jsonb_build_object('signal_id', new.id),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret)
    );
    return new;
exception when others then
    -- Une notification ne bloque jamais un signal.
    raise warning 'push-notify : %', sqlerrm;
    return new;
end;
$$;
revoke all on function public.notify_push_on_signal() from public, anon, authenticated;

drop trigger if exists notify_push_on_signal on public.availability_signals;
create trigger notify_push_on_signal
    after insert on public.availability_signals
    for each row execute function public.notify_push_on_signal();
