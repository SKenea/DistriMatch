-- ============================================================================
-- 020 : exploitants d'un distributeur et page admin (EPIC-T18)
-- ============================================================================
-- Un membre connecte demande le statut d'exploitant d'une fiche (societe +
-- telephone ou SIRET) ; l'admin valide ou refuse depuis la page admin de l'app.
-- Effets du statut :
--   * badge « Exploitant vérifié » sur la fiche (table distributor_operators,
--     seule la colonne distributor_id est lisible par l'API) ;
--   * ses signaux sont marques source 'owner', poids 1 (trigger) ;
--   * vues product_availability / distributor_status : le plus recent gagne,
--     sauf un signal d'exploitant contredit par un membre a moins de 30 min
--     d'ecart : l'exploitant l'emporte.
--
-- Tables :
--   app_admins (user_id)                     : qui voit la page admin (aucun droit API)
--   operator_requests                        : demandes ; un membre lit et cree LES SIENNES
--   distributor_operators (distributor_id, user_id) : statuts accordes
-- Fonctions :
--   is_admin()                                       : l'appelant est-il admin ?
--   my_operated_distributors()                       : fiches dont l'appelant est exploitant
--   admin_operator_requests()                        : demandes en attente (admin)
--   admin_decide_operator_request(id, approuver)     : valider / refuser (admin)
--   admin_operators()                                : exploitants accordes (admin)
--   admin_revoke_operator(distributor_id, user_id)   : retirer un statut (admin)
--
-- Designer l'admin (une fois, SQL Editor ou scripts/supabase-sql.mjs) :
--   insert into app_admins (user_id) select id from auth.users where email = '<email>'
--   on conflict do nothing;
-- Idempotent.
-- ============================================================================

create table if not exists app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table app_admins enable row level security;
revoke all on app_admins from anon, authenticated;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_admins where user_id = auth.uid());
$$;
revoke execute on function is_admin() from public, anon;
grant execute on function is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Statuts accordes
-- ---------------------------------------------------------------------------
create table if not exists distributor_operators (
  distributor_id text not null references distributors(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null,
  primary key (distributor_id, user_id)
);
alter table distributor_operators enable row level security;
drop policy if exists "Badge exploitant lisible par tous" on distributor_operators;
create policy "Badge exploitant lisible par tous" on distributor_operators for select using (true);
revoke all on distributor_operators from anon, authenticated;
grant select (distributor_id) on distributor_operators to anon, authenticated;

create or replace function my_operated_distributors() returns setof text
language sql stable security definer set search_path = public as $$
  select distributor_id from distributor_operators where user_id = auth.uid();
$$;
revoke execute on function my_operated_distributors() from public, anon;
grant execute on function my_operated_distributors() to authenticated;

-- ---------------------------------------------------------------------------
-- Demandes
-- ---------------------------------------------------------------------------
create table if not exists operator_requests (
  id bigint generated always as identity primary key,
  distributor_id text not null references distributors(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  company text not null check (char_length(btrim(company)) between 2 and 100),
  contact text not null check (char_length(btrim(contact)) between 6 and 100),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null
);
-- Une seule demande en attente par compte et par fiche
create unique index if not exists operator_requests_one_pending
  on operator_requests (user_id, distributor_id) where status = 'pending';

alter table operator_requests enable row level security;
drop policy if exists "Je cree ma demande" on operator_requests;
create policy "Je cree ma demande" on operator_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');
drop policy if exists "Je lis mes demandes" on operator_requests;
create policy "Je lis mes demandes" on operator_requests for select to authenticated
  using (user_id = auth.uid());
revoke all on operator_requests from anon, authenticated;
grant insert (distributor_id, company, contact) on operator_requests to authenticated;
grant select (id, distributor_id, status, created_at) on operator_requests to authenticated;

-- Garde : auteur force, compte bloque refuse, 5 demandes par jour et par compte
create or replace function guard_operator_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- SECURITY DEFINER : current_user est le proprietaire ; le role vient du jeton
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    if auth.uid() is null then
      raise exception 'Connexion requise' using errcode = '28000';
    end if;
    new.user_id := auth.uid();
    new.status := 'pending';
    new.decided_at := null;
    new.decided_by := null;
    if exists (select 1 from signal_bans where user_id = auth.uid()) then
      raise exception 'Compte bloque' using errcode = '42501';
    end if;
    if (select count(*) from operator_requests
        where user_id = auth.uid() and created_at > now() - interval '1 day') >= 5 then
      raise exception 'Trop de demandes aujourd''hui' using errcode = 'P0001';
    end if;
  end if;
  new.company := btrim(new.company);
  new.contact := btrim(new.contact);
  return new;
end;
$$;
drop trigger if exists guard_operator_request on operator_requests;
create trigger guard_operator_request before insert on operator_requests
  for each row execute function guard_operator_request();

-- ---------------------------------------------------------------------------
-- Administration (l'appelant doit etre admin)
-- ---------------------------------------------------------------------------
create or replace function admin_operator_requests()
returns table (id bigint, distributor_id text, distributor_name text, city text,
               company text, contact text, email text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Reserve a l''admin' using errcode = '42501';
  end if;
  return query
    select r.id, r.distributor_id, d.name, d.city, r.company, r.contact, u.email::text, r.created_at
    from operator_requests r
    join distributors d on d.id = r.distributor_id
    left join auth.users u on u.id = r.user_id
    where r.status = 'pending'
    order by r.created_at;
end;
$$;

create or replace function admin_decide_operator_request(p_id bigint, p_approve boolean) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_req operator_requests;
begin
  if not is_admin() then
    raise exception 'Reserve a l''admin' using errcode = '42501';
  end if;
  update operator_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_at = now(), decided_by = auth.uid()
   where id = p_id and status = 'pending'
   returning * into v_req;
  if v_req.id is null then
    raise exception 'Demande introuvable ou deja traitee' using errcode = 'P0002';
  end if;
  if p_approve then
    insert into distributor_operators (distributor_id, user_id, granted_by)
    values (v_req.distributor_id, v_req.user_id, auth.uid())
    on conflict (distributor_id, user_id) do nothing;
  end if;
  return v_req.status;
end;
$$;

create or replace function admin_operators()
returns table (distributor_id text, distributor_name text, user_id uuid, email text, granted_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Reserve a l''admin' using errcode = '42501';
  end if;
  return query
    select o.distributor_id, d.name, o.user_id, u.email::text, o.granted_at
    from distributor_operators o
    join distributors d on d.id = o.distributor_id
    left join auth.users u on u.id = o.user_id
    order by o.granted_at desc;
end;
$$;

create or replace function admin_revoke_operator(p_distributor_id text, p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'Reserve a l''admin' using errcode = '42501';
  end if;
  delete from distributor_operators where distributor_id = p_distributor_id and user_id = p_user_id;
end;
$$;

revoke execute on function admin_operator_requests() from public, anon;
revoke execute on function admin_decide_operator_request(bigint, boolean) from public, anon;
revoke execute on function admin_operators() from public, anon;
revoke execute on function admin_revoke_operator(text, uuid) from public, anon;
grant execute on function admin_operator_requests() to authenticated;
grant execute on function admin_decide_operator_request(bigint, boolean) to authenticated;
grant execute on function admin_operators() to authenticated;
grant execute on function admin_revoke_operator(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Signaux de l'exploitant : source 'owner', poids 1
-- ---------------------------------------------------------------------------
create or replace function mark_owner_signal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null and exists (
    select 1 from distributor_operators
    where distributor_id = new.distributor_id and user_id = new.user_id
  ) then
    new.source := 'owner';
    new.weight := 1;
  end if;
  return new;
end;
$$;
drop trigger if exists mark_owner_signal on availability_signals;
create trigger mark_owner_signal before insert on availability_signals
  for each row execute function mark_owner_signal();

-- ---------------------------------------------------------------------------
-- Vues : le plus recent gagne, sauf exploitant contredit a moins de 30 min
-- (memes colonnes qu'en 007 ; security_invoker conserve)
-- ---------------------------------------------------------------------------
create or replace view product_availability with (security_invoker = true) as
with latest as (
  select distinct on (distributor_id, product_id) id, distributor_id, product_id, state, source, created_at
  from availability_signals where product_id is not null
  order by distributor_id, product_id, created_at desc
), owner_latest as (
  select distinct on (distributor_id, product_id) id, distributor_id, product_id, state, created_at
  from availability_signals where product_id is not null and source = 'owner'
  order by distributor_id, product_id, created_at desc
)
select s.distributor_id, s.product_id, s.state, s.source, s.weight, s.created_at,
       (extract(epoch from (now() - s.created_at)))::bigint as age_seconds
from latest l
left join owner_latest o on o.distributor_id = l.distributor_id and o.product_id = l.product_id
join availability_signals s on s.id = case
  when o.id is not null and l.source <> 'owner' and o.state <> l.state
       and l.created_at - o.created_at <= interval '30 minutes' then o.id
  else l.id end;

create or replace view distributor_status with (security_invoker = true) as
with latest as (
  select distinct on (distributor_id) id, distributor_id, state, source, created_at
  from availability_signals where product_id is null
  order by distributor_id, created_at desc
), owner_latest as (
  select distinct on (distributor_id) id, distributor_id, state, created_at
  from availability_signals where product_id is null and source = 'owner'
  order by distributor_id, created_at desc
)
select s.distributor_id, s.state, s.source, s.weight, s.created_at,
       (extract(epoch from (now() - s.created_at)))::bigint as age_seconds
from latest l
left join owner_latest o on o.distributor_id = l.distributor_id
join availability_signals s on s.id = case
  when o.id is not null and l.source <> 'owner' and o.state <> l.state
       and l.created_at - o.created_at <= interval '30 minutes' then o.id
  else l.id end;
