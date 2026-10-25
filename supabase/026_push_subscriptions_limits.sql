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
