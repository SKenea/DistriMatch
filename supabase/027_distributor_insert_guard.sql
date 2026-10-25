-- ============================================================================
-- 027 : ajout d'une fiche et niveau de prix, la base impose les valeurs (SEC-05)
-- ============================================================================
-- Revue du 2026-10-21. Avant : 013 ne restreint que l'UPDATE, l'API inserait
-- donc toutes les colonnes de distributors : created_at antidate = limite de
-- 5 ajouts / jour contournee ; status, rating, review_count, last_verified,
-- modified_by falsifiables ; aucune borne sur id, name, address, city, lat, lng.
-- price_range : texte libre, modifiable en une requete sur toutes les fiches
-- publiees, meme par un compte bloque.
--
-- 1. guard_distributor_review (022) : pour l'API, le serveur pose created_at,
--    updated_at, added_by, modified_by, is_user_added, last_verified, status,
--    rating, review_count, author_read_at ; tz garde s'il existe dans
--    pg_timezone_names, sinon null.
-- 2. Contraintes (NOT VALID puis VALIDATE) : format de l'id, nom 2..100,
--    adresse et ville <= 200, lat / lng bornees, price_range dans la liste,
--    emoji court et sans caractere de balisage ou de code.
-- 3. UPDATE direct par l'API (current_user anon / authenticated) : une seule
--    fiche par requete, compte bloque refuse. Les fonctions SECURITY DEFINER
--    (confirm_availability, admin_*, post_review_message...) tournent en
--    postgres : non concernees.
-- Aucun droit par colonne retire : compatible avec le front actuel.
-- Idempotent, tout ou rien (begin / commit). Execution (Claude, apres la
-- requete de controle de docs/stories/SEC-05.md) :
-- node scripts/supabase-sql.mjs supabase/027_distributor_insert_guard.sql
-- ============================================================================

begin;

-- 1. Ajout par l'API : valeurs posees par le serveur (remplace la version de 022)
create or replace function guard_distributor_review() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    new.review_status := 'pending';
    new.review_reason := null;
    new.reviewed_at := null;
    new.reviewed_by := null;
    -- SEC-05 : jamais fournies par le client
    new.created_at := now();
    new.updated_at := now();
    new.added_by := auth.uid();
    new.modified_by := auth.uid();
    new.is_user_added := true;
    new.last_verified := null;
    new.status := 'verified';
    new.rating := 0;
    new.review_count := 0;
    new.author_read_at := null;
    if new.tz is not null and not exists (select 1 from pg_timezone_names where name = new.tz) then
      new.tz := null;
    end if;
    if exists (select 1 from signal_bans where user_id = auth.uid()) then
      raise exception 'Compte bloque' using errcode = '42501';
    end if;
    if (select count(*) from distributors
        where added_by = auth.uid() and created_at > now() - interval '1 day') >= 5 then
      raise exception 'Trop d''ajouts aujourd''hui' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
-- Le declencheur guard_distributor_review (022, before insert, for each row) reste en place.

-- 2. Contraintes de valeur (aussi pour postgres et l'admin)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'distributors_id_format_check') then
    alter table distributors add constraint distributors_id_format_check
      check (id ~ '^[A-Za-z0-9_-]{1,64}$') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'distributors_name_length_check') then
    alter table distributors add constraint distributors_name_length_check
      check (char_length(btrim(name)) between 2 and 100) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'distributors_address_length_check') then
    alter table distributors add constraint distributors_address_length_check
      check (char_length(address) <= 200) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'distributors_city_length_check') then
    alter table distributors add constraint distributors_city_length_check
      check (char_length(city) <= 200) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'distributors_lat_range_check') then
    alter table distributors add constraint distributors_lat_range_check
      check (lat between -90 and 90) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'distributors_lng_range_check') then
    alter table distributors add constraint distributors_lng_range_check
      check (lng between -180 and 180) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'distributors_price_range_check') then
    alter table distributors add constraint distributors_price_range_check
      check (price_range is null or price_range in ('€', '€€', '€€€')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'distributors_emoji_check') then
    alter table distributors add constraint distributors_emoji_check
      check (char_length(emoji) <= 16 and emoji !~ '[<>"''`;=]') not valid;
  end if;
end $$;

alter table distributors validate constraint distributors_id_format_check;
alter table distributors validate constraint distributors_name_length_check;
alter table distributors validate constraint distributors_address_length_check;
alter table distributors validate constraint distributors_city_length_check;
alter table distributors validate constraint distributors_lat_range_check;
alter table distributors validate constraint distributors_lng_range_check;
alter table distributors validate constraint distributors_price_range_check;
alter table distributors validate constraint distributors_emoji_check;

-- 3. UPDATE direct par l'API : une fiche par requete, compte bloque refuse
-- signal_bans est illisible par l'API : lecture par une fonction SECURITY DEFINER
create or replace function account_is_banned() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from signal_bans where user_id = auth.uid());
$$;
revoke execute on function account_is_banned() from public, anon;
grant execute on function account_is_banned() to authenticated;

-- Pas SECURITY DEFINER : current_user doit rester le role de l'API (cf. 010)
create or replace function guard_distributor_update_scope() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('anon', 'authenticated') then
    if (select count(*) from changed_rows) > 1 then
      raise exception 'Une seule fiche par modification' using errcode = '42501';
    end if;
    if account_is_banned() then
      raise exception 'Compte bloque' using errcode = '42501';
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists guard_distributor_update_scope on distributors;
create trigger guard_distributor_update_scope
  after update on distributors
  referencing new table as changed_rows
  for each statement execute function guard_distributor_update_scope();

commit;

-- ============================================================================
-- VERIFICATION (en tant que postgres)
-- ============================================================================
-- select conname, convalidated from pg_constraint
--  where conrelid = 'distributors'::regclass and conname like 'distributors\_%\_check' escape '\'
--  order by conname;
-- -> les 8 contraintes de 027 avec convalidated = true (+ source et review_status)
-- select tgname from pg_trigger where tgrelid = 'distributors'::regclass and not tgisinternal order by tgname;
-- -> contient guard_distributor_review et guard_distributor_update_scope
