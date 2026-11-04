-- ============================================================================
-- 033 : un compte peut etre supprime (PRIV-07, RGPD)
-- ============================================================================
-- Revue du 2026-10-21. Six cles etrangeres vers auth.users n'avaient aucune regle
-- ON DELETE (NO ACTION) : des qu'un membre avait ajoute une fiche, change un niveau
-- de prix ou envoye un signal (avant 029, le declencheur d'audit de 006 posait alors
-- distributors.modified_by), renomme un produit ou fait un signalement,
-- « delete from auth.users » (ou « Delete user » du tableau de bord) echouait en 23503.
-- Apres : ces six cles passent en ON DELETE SET NULL. La contribution reste
-- (fiche, produit, photo, signalement), sans auteur.
-- Cles deja posees, inchangees :
--   SET NULL : availability_signals.user_id (007), distributor_operators.granted_by,
--     operator_requests.decided_by (020), distributors.reviewed_by (022),
--     push_subscriptions.user_id (024), products.removed_by, product_edits.user_id (025)
--   CASCADE (donnees du compte, effacees avec lui) : profiles.id, subscriptions.user_id,
--     votes.user_id (001), signal_bans.user_id (014), reviews.user_id (016),
--     app_admins.user_id, distributor_operators.user_id, operator_requests.user_id (020)
-- push_subscribe (026) recopiee avec une seule ligne changee : un reabonnement sans
-- compte (celui qui suit la deconnexion, PRIV-06) retire le compte de l'abonnement.
-- Garde finale : la migration echoue si une cle de public vers auth.users reste sans
-- regle (NO ACTION / RESTRICT), y compris une cle ajoutee apres 028.
-- Supprimer un compte : TOUJOURS en postgres sans jeton (SQL Editor ou
-- scripts/supabase-sql.mjs) ; mode d'emploi en fin de fichier.
-- Idempotente, tout ou rien (begin / commit). Execution (Claude, apres relecture) :
--   node scripts/supabase-sql.mjs supabase/033_account_deletion.sql
-- ============================================================================

begin;

-- 1. Fiches : auteur (001) et dernier modificateur (006)
alter table if exists public.distributors
  drop constraint if exists distributors_added_by_fkey,
  add constraint distributors_added_by_fkey
    foreign key (added_by) references auth.users(id) on delete set null;

alter table if exists public.distributors
  drop constraint if exists distributors_modified_by_fkey,
  add constraint distributors_modified_by_fkey
    foreign key (modified_by) references auth.users(id) on delete set null;

-- 2. Produits et photos : dernier modificateur (006), auteur de la photo (003)
alter table if exists public.products
  drop constraint if exists products_modified_by_fkey,
  add constraint products_modified_by_fkey
    foreign key (modified_by) references auth.users(id) on delete set null;

alter table if exists public.distributor_photos
  drop constraint if exists distributor_photos_modified_by_fkey,
  add constraint distributor_photos_modified_by_fkey
    foreign key (modified_by) references auth.users(id) on delete set null;

alter table if exists public.distributor_photos
  drop constraint if exists distributor_photos_user_id_fkey,
  add constraint distributor_photos_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;

-- 3. Signalements (001)
alter table if exists public.reports
  drop constraint if exists reports_user_id_fkey,
  add constraint reports_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;

-- 4. push_subscribe (recopie de 026, une seule ligne change) : un reabonnement
--    sans compte (synchronisation qui suit la deconnexion, js/push.js) retire le
--    compte de l'abonnement ; un reabonnement connecte le repose.
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
        user_id = auth.uid(),   -- PRIV-06 : un reabonnement sans compte retire le compte
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

-- 5. Garde : plus aucune cle de public vers auth.users sans regle ON DELETE
do $$
declare
  v_left text;
begin
  select string_agg(c.conrelid::regclass::text || '.' || c.conname, ', ' order by c.conrelid::regclass::text, c.conname)
    into v_left
    from pg_constraint c
   where c.contype = 'f'
     and c.confrelid = 'auth.users'::regclass
     and c.connamespace = 'public'::regnamespace
     and c.confdeltype not in ('n', 'c');   -- n = SET NULL, c = CASCADE
  if v_left is not null then
    raise exception 'Cles vers auth.users encore sans regle ON DELETE : %', v_left;
  end if;
end $$;

commit;

-- ============================================================================
-- MODE D'EMPLOI : supprimer un compte a la demande d'un membre
-- (Claude, sur demande de Stephane ; detail dans docs/stories/PRIV-07.md)
-- ============================================================================
-- 1. Bilan, lecture seule (remplacer l'e-mail) :
--    with u as (select id from auth.users where email = 'membre@exemple.fr')
--    select (select count(*) from u) as compte,
--           (select count(*) from app_admins where user_id in (select id from u)) as admin,
--           (select count(*) from distributor_operators where user_id in (select id from u)) as exploitant,
--           (select count(*) from distributors where added_by in (select id from u)) as fiches_ajoutees,
--           (select count(*) from availability_signals where user_id in (select id from u)) as signaux,
--           (select count(*) from reviews where user_id in (select id from u)) as avis,
--           (select count(*) from operator_requests where user_id in (select id from u)) as demandes;
--    compte = 1 attendu ; admin = 1 : s'arreter et demander a Stephane.
-- 2. Suppression (postgres SANS jeton) :
--    delete from auth.users where email = 'membre@exemple.fr' returning id;
-- 3. Controle : select count(*) from auth.users where email = 'membre@exemple.fr';   -- 0
-- Ne jamais supprimer e2e@distrimatch.test (compte des tests E2E, 015) sans accord de Stephane.
