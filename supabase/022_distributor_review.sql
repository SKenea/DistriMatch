-- ============================================================================
-- 022 : valider les nouvelles fiches dans la console admin (EPIC-T21)
-- ============================================================================
-- distributors.review_status :
--   pending    ajoutee par un membre, en attente : visible par son auteur et l'admin
--   published  visible par tous (toutes les fiches existantes)
--   rejected   refusee (motif facultatif) : visible par son auteur seulement
-- Un ajout par l'API est toujours « pending » (trigger), 5 par jour et par compte,
-- comptes bloques refuses. Les produits suivent leur fiche (lecture filtree par la
-- lecture des fiches). Signaux, avis et demandes d'exploitant sont refuses sur une
-- fiche non publiee. Echange direct admin <-> auteur : distributor_review_messages.
-- Fonctions admin : admin_pending_distributors(), admin_review_distributor(...).
-- Idempotent. Execution : node scripts/supabase-sql.mjs supabase/022_distributor_review.sql
-- ============================================================================

alter table distributors
  add column if not exists review_status text not null default 'published',
  add column if not exists review_reason text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists author_read_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'distributors_review_status_check') then
    alter table distributors add constraint distributors_review_status_check
      check (review_status in ('pending', 'published', 'rejected'));
  end if;
end $$;

-- Lecture : publiee pour tous ; l'auteur voit les siennes ; l'admin voit tout.
-- La regle appelle is_admin() : un visiteur (anon) doit pouvoir l'executer (elle
-- rend false), sinon TOUTE lecture des fiches echoue (incident du 2026-10-02).
grant execute on function is_admin() to anon;
drop policy if exists "Lecture publique distributeurs" on distributors;
create policy "Lecture publique distributeurs" on distributors for select
  using (review_status = 'published' or added_by = auth.uid() or is_admin());

-- Produits : visibles si leur fiche l'est (la lecture des fiches filtre deja)
drop policy if exists "Lecture publique produits" on products;
create policy "Lecture publique produits" on products for select
  using (exists (select 1 from distributors d where d.id = products.distributor_id));

-- Ajout par l'API : toujours en attente, 5 / jour / compte, compte bloque refuse
create or replace function guard_distributor_review() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    new.review_status := 'pending';
    new.review_reason := null;
    new.reviewed_at := null;
    new.reviewed_by := null;
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
drop trigger if exists guard_distributor_review on distributors;
create trigger guard_distributor_review before insert on distributors
  for each row execute function guard_distributor_review();

-- Rien a signaler, noter ni revendiquer sur une fiche non publiee
create or replace function distributor_is_published(p_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from distributors where id = p_id and review_status = 'published');
$$;

create or replace function guard_published_distributor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not distributor_is_published(new.distributor_id) then
    raise exception 'Distributeur pas encore publie' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_published_signal on availability_signals;
create trigger guard_published_signal before insert on availability_signals
  for each row execute function guard_published_distributor();
drop trigger if exists guard_published_review on reviews;
create trigger guard_published_review before insert on reviews
  for each row execute function guard_published_distributor();
drop trigger if exists guard_published_operator on operator_requests;
create trigger guard_published_operator before insert on operator_requests
  for each row execute function guard_published_distributor();

-- ---------------------------------------------------------------------------
-- Echange direct admin <-> auteur d'une fiche
-- ---------------------------------------------------------------------------
create table if not exists distributor_review_messages (
  id bigint generated always as identity primary key,
  distributor_id text not null references distributors(id) on delete cascade,
  author text not null check (author in ('member', 'admin', 'system')),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists distributor_review_messages_distributor on distributor_review_messages (distributor_id, created_at);

create or replace function is_my_distributor(p_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from distributors where id = p_id and added_by = auth.uid());
$$;
revoke execute on function is_my_distributor(text) from public, anon;
grant execute on function is_my_distributor(text) to authenticated;

alter table distributor_review_messages enable row level security;
drop policy if exists "Fil lisible par l'auteur et l'admin" on distributor_review_messages;
create policy "Fil lisible par l'auteur et l'admin" on distributor_review_messages for select to authenticated
  using (is_admin() or is_my_distributor(distributor_id));
revoke all on distributor_review_messages from anon, authenticated;
grant select on distributor_review_messages to authenticated;

create or replace function post_review_message(p_distributor_id text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_author text;
begin
  if is_my_distributor(p_distributor_id) then
    v_author := 'member';
  elsif is_admin() then
    v_author := 'admin';
  else
    raise exception 'Fil reserve a l''auteur et a l''admin' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 1000 then
    raise exception 'Message vide ou trop long' using errcode = '23514';
  end if;
  if (select count(*) from distributor_review_messages
      where distributor_id = p_distributor_id and author = v_author and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Trop de messages, reessaie plus tard' using errcode = 'P0001';
  end if;
  insert into distributor_review_messages (distributor_id, author, body) values (p_distributor_id, v_author, btrim(p_body));
  if v_author = 'member' then
    update distributors set author_read_at = now() where id = p_distributor_id;
  end if;
end;
$$;

create or replace function mark_review_thread_read(p_distributor_id text) returns void
language sql security definer set search_path = public as $$
  update distributors set author_read_at = now() where id = p_distributor_id and added_by = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Administration
-- ---------------------------------------------------------------------------
create or replace function admin_pending_distributors()
returns table (id text, name text, type text, emoji text, address text, city text, lat double precision, lng double precision,
               created_at timestamptz, email text, products text[], unread bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Reserve a l''admin' using errcode = '42501';
  end if;
  return query
    select d.id, d.name, d.type, d.emoji, d.address, d.city, d.lat::double precision, d.lng::double precision,
           d.created_at, u.email::text,
           coalesce((select array_agg(p.name order by p.id) from products p where p.distributor_id = d.id), '{}'),
           (select count(*) from distributor_review_messages m where m.distributor_id = d.id and m.author = 'member'
              and m.created_at > coalesce((select max(a.created_at) from distributor_review_messages a where a.distributor_id = d.id and a.author = 'admin'), '-infinity'))
    from distributors d
    left join auth.users u on u.id = d.added_by
    where d.review_status = 'pending'
    order by d.created_at;
end;
$$;

-- p_decision : 'publish' (corrections facultatives) | 'reject' (motif facultatif)
create or replace function admin_review_distributor(p_id text, p_decision text, p_reason text default null,
  p_name text default null, p_type text default null, p_emoji text default null,
  p_lat double precision default null, p_lng double precision default null)
returns text
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Reserve a l''admin' using errcode = '42501';
  end if;
  if p_decision not in ('publish', 'reject') then
    raise exception 'Decision inconnue' using errcode = '22023';
  end if;
  update distributors
     set review_status = case when p_decision = 'publish' then 'published' else 'rejected' end,
         review_reason = case when p_decision = 'reject' then nullif(btrim(p_reason), '') else null end,
         reviewed_at = now(), reviewed_by = auth.uid(),
         name = coalesce(nullif(btrim(p_name), ''), name),
         type = coalesce(nullif(btrim(p_type), ''), type),
         emoji = coalesce(nullif(btrim(p_emoji), ''), emoji),
         lat = coalesce(p_lat, lat),
         lng = coalesce(p_lng, lng)
   where id = p_id and review_status = 'pending';
  if not found then
    raise exception 'Fiche introuvable ou deja traitee' using errcode = 'P0002';
  end if;
  insert into distributor_review_messages (distributor_id, author, body)
  values (p_id, 'system', case when p_decision = 'publish' then 'Fiche publiée : visible par tous'
    else 'Fiche refusée' || coalesce(' : ' || nullif(btrim(p_reason), ''), '') end);
  return case when p_decision = 'publish' then 'published' else 'rejected' end;
end;
$$;

revoke execute on function post_review_message(text, text) from public, anon;
revoke execute on function mark_review_thread_read(text) from public, anon;
revoke execute on function admin_pending_distributors() from public, anon;
revoke execute on function admin_review_distributor(text, text, text, text, text, text, double precision, double precision) from public, anon;
grant execute on function post_review_message(text, text) to authenticated;
grant execute on function mark_review_thread_read(text) to authenticated;
grant execute on function admin_pending_distributors() to authenticated;
grant execute on function admin_review_distributor(text, text, text, text, text, text, double precision, double precision) to authenticated;
