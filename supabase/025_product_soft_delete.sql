-- ============================================================================
-- 025 : produits : retrait doux, droits par colonne, garde-fous (SEC-03)
-- ============================================================================
-- Revue du 2026-10-21. Avant : tout compte connecte pouvait, en une requete,
-- supprimer tous les produits (DELETE ouvert par 005) et, par la cascade de 007
-- (availability_signals.product_id ON DELETE CASCADE), tous leurs signaux ;
-- aucune limite, aucune trace, comptes bloques acceptes, fiche non publiee d'un
-- autre membre modifiable, nom sans longueur maximale.
-- Apres :
--   1. « Retirer » = retrait doux (removed_at / removed_by) par la RPC
--      remove_product(id). Le produit et ses signaux restent en base ; il
--      disparait de la lecture publique (produits imbriques compris). Plus aucun
--      DELETE par l'API. Pas d'UPDATE direct de removed_at : la regle de lecture
--      masquant les produits retires, Postgres refuserait la nouvelle ligne.
--   2. Droits par colonne (modele de 013) : authenticated INSERT (distributor_id,
--      name, available) et UPDATE (name) ; anon : rien.
--   3. Nom de 1 a 80 caracteres apres trim ; fiche obligatoire.
--   4. Ecriture refusee sur une fiche non publiee sauf pour son auteur, aux comptes
--      bloques (signal_bans), au-dela de 30 ecritures / heure / compte. Chaque
--      ecriture est journalisee dans product_edits (illisible par l'API).
--   5. Une requete qui modifie plus de 5 produits, ou en ajoute plus de 10 (le
--      formulaire d'ajout d'une fiche en envoie jusqu'a 10), est refusee.
--   6. admin_pending_distributors() ne liste plus les produits retires.
--   7. Un produit retire n'a plus d'etat public (vue product_availability) et
--      ne recoit plus de signal (sauf les signaux de demo du seed nocturne).
-- En tant que postgres sans jeton (SQL Editor, scripts, pg_cron), les gardes
-- ne s'appliquent pas (auth.role() vide).
-- Idempotente, en une seule transaction (un echec entre « drop policy » et
-- « create policy » laisserait products illisible). Execution (Claude, apres relecture) :
--   node scripts/supabase-sql.mjs supabase/025_product_soft_delete.sql
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Colonnes et contraintes
-- ---------------------------------------------------------------------------
alter table products
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by uuid references auth.users(id) on delete set null;

-- Lignes sans fiche : invisibles (022) et sans signal possible (la RPC des signaux
-- exige la fiche) : supprimees, puis la fiche devient obligatoire
delete from products where distributor_id is null;
alter table products alter column distributor_id set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_name_len') then
    alter table products add constraint products_name_len
      check (char_length(btrim(name)) between 1 and 80) not valid;
  end if;
  -- Validee si les lignes existantes la respectent ; sinon elle ne vaut que pour
  -- les nouvelles ecritures (corriger les noms puis valider a la main)
  if not exists (select 1 from products where char_length(btrim(name)) not between 1 and 80) then
    alter table products validate constraint products_name_len;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Journal des ecritures : limite de debit + historique pour restaurer
-- ---------------------------------------------------------------------------
create table if not exists product_edits (
  id bigint generated always as identity primary key,
  product_id bigint,              -- sans cle etrangere : ecrit AVANT l'ajout du produit, survit au produit
  distributor_id text,
  user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('add', 'rename', 'remove')),
  old_name text,
  new_name text,
  created_at timestamptz not null default now()
);
create index if not exists product_edits_user_recent on product_edits (user_id, created_at desc);
create index if not exists product_edits_product on product_edits (product_id);
alter table product_edits enable row level security;   -- 0 policy : invisible par l'API
revoke all on product_edits from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Droits par colonne (les droits par defaut de Supabase couvraient tout)
-- ---------------------------------------------------------------------------
revoke insert, update, delete, truncate on products from anon, authenticated;
grant insert (distributor_id, name, available) on products to authenticated;
grant update (name) on products to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Regles RLS : remplacent celles de 005 et la lecture de 022
-- ---------------------------------------------------------------------------
drop policy if exists "Ajout produits par users authentifies" on products;
drop policy if exists "Modif produits par users authentifies" on products;
drop policy if exists "Suppression produits par users authentifies" on products;
drop policy if exists "Lecture publique produits" on products;
-- Regles presentes en base mais absentes des migrations (creees au tableau de bord) :
-- permissives (OU logique), elles rouvriraient l'ajout et la modification a tout compte
drop policy if exists "Ajout produits par users" on products;
drop policy if exists "Modification produits par users" on products;
drop policy if exists "Suppression produits par users" on products;

-- Lecture : produit non retire d'une fiche visible (la lecture des fiches filtre
-- deja publiee / auteur / admin). Aucun appel de fonction : rien a ouvrir a anon.
create policy "Lecture publique produits" on products for select
  using (removed_at is null and exists (select 1 from distributors d where d.id = products.distributor_id));

create policy "Ajout produits par users authentifies" on products for insert to authenticated
  with check (auth.uid() is not null
              and (distributor_is_published(distributor_id) or is_my_distributor(distributor_id)));

create policy "Modif produits par users authentifies" on products for update to authenticated
  using (auth.uid() is not null and removed_at is null)
  with check (auth.uid() is not null
              and (distributor_is_published(distributor_id) or is_my_distributor(distributor_id)));
-- Aucune regle DELETE : refus par defaut (et droit DELETE retire ci-dessus)

-- ---------------------------------------------------------------------------
-- 5. Garde par ligne : compte, blocage, fiche, debit, journal
-- ---------------------------------------------------------------------------
create or replace function guard_product_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_action text;
  v_old_name text;
begin
  -- postgres sans jeton (SQL Editor, scripts, pg_cron) : pas de garde
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return new;
  end if;
  if v_uid is null then
    raise exception 'Connexion requise pour modifier un produit' using errcode = '28000';
  end if;
  if exists (select 1 from signal_bans where user_id = v_uid) then
    raise exception 'Ce compte ne peut plus modifier de produits' using errcode = '42501';
  end if;
  -- Aussi verifie ici car la RPC remove_product ne passe pas par la RLS
  if not (distributor_is_published(new.distributor_id) or is_my_distributor(new.distributor_id)) then
    raise exception 'Distributeur pas encore publie' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    v_action := 'add';
    new.removed_at := null;
    new.removed_by := null;
  else
    v_old_name := old.name;
    if old.removed_at is not null then
      raise exception 'Produit deja retire' using errcode = 'P0002';
    elsif new.removed_at is not null then
      v_action := 'remove';
      new.removed_at := now();
      new.removed_by := v_uid;
    else
      v_action := 'rename';
    end if;
  end if;
  new.name := btrim(new.name);
  if (select count(*) from product_edits
      where user_id = v_uid and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Trop de modifications de produits pour ce compte, reessaie plus tard' using errcode = 'P0001';
  end if;
  insert into product_edits (product_id, distributor_id, user_id, action, old_name, new_name)
  values (new.id, new.distributor_id, v_uid, v_action, v_old_name, new.name);
  return new;
end;
$$;
drop trigger if exists guard_product_write on products;
create trigger guard_product_write before insert or update on products
  for each row execute function guard_product_write();

-- ---------------------------------------------------------------------------
-- 6. Garde par requete : pas d'ecriture en masse
-- (deux declencheurs : une table de transition n'accepte qu'un seul evenement)
-- ---------------------------------------------------------------------------
create or replace function guard_product_bulk() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  -- Seuil calcule a part : dans un IF, PL/pgSQL coupe la condition au premier THEN,
  -- y compris celui d'un CASE
  v_max int := case when tg_op = 'INSERT' then 10 else 5 end;
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated')
     and (select count(*) from changed_rows) > v_max then
    raise exception 'Trop de produits en une seule requete' using errcode = 'P0001';
  end if;
  return null;
end;
$$;
drop trigger if exists guard_product_bulk_insert on products;
create trigger guard_product_bulk_insert after insert on products
  referencing new table as changed_rows
  for each statement execute function guard_product_bulk();
drop trigger if exists guard_product_bulk_update on products;
create trigger guard_product_bulk_update after update on products
  referencing new table as changed_rows
  for each statement execute function guard_product_bulk();

-- ---------------------------------------------------------------------------
-- 7. Retirer un produit : seule voie (« Retirer » de la fiche, js/fiche-edit.js)
-- ---------------------------------------------------------------------------
create or replace function remove_product(p_product_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Connexion requise pour retirer un produit' using errcode = '28000';
  end if;
  -- guard_product_write verifie blocage, fiche et debit, pose removed_at /
  -- removed_by et journalise
  update products set removed_at = now() where id = p_product_id and removed_at is null;
  if not found then
    raise exception 'Produit % introuvable ou deja retire', p_product_id using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function remove_product(bigint) from public, anon;
grant execute on function remove_product(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Console admin : fiches en attente sans les produits retires (copie de 022)
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
           coalesce((select array_agg(p.name order by p.id) from products p where p.distributor_id = d.id and p.removed_at is null), '{}'),
           (select count(*) from distributor_review_messages m where m.distributor_id = d.id and m.author = 'member'
              and m.created_at > coalesce((select max(a.created_at) from distributor_review_messages a where a.distributor_id = d.id and a.author = 'admin'), '-infinity'))
    from distributors d
    left join auth.users u on u.id = d.added_by
    where d.review_status = 'pending'
    order by d.created_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Un produit retire n'a plus d'etat public
-- (reprise exacte de la vue de 020, seule la clause « where exists » est ajoutee)
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
  else l.id end
where exists (select 1 from products p where p.id = l.product_id and p.removed_at is null);

-- ---------------------------------------------------------------------------
-- 10. Plus de signal sur un produit retire (sauf demo : seed nocturne de 017)
-- confirm_availability n'est pas recopiee ici (SEC-06 la reprend) : le refus
-- vient de ce declencheur, appele par son INSERT.
-- ---------------------------------------------------------------------------
create or replace function guard_signal_removed_product() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.product_id is not null
     and coalesce(new.device_hash, '') not like 'demo-%'
     and exists (select 1 from products where id = new.product_id and removed_at is not null) then
    raise exception 'Produit % retire', new.product_id using errcode = 'P0002';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_signal_removed_product on availability_signals;
create trigger guard_signal_removed_product before insert on availability_signals
  for each row execute function guard_signal_removed_product();

commit;

-- ============================================================================
-- MODE D'EMPLOI (admin : SQL Editor ou node scripts/supabase-sql.mjs -e "...")
-- ============================================================================
-- Restaurer un produit retire :
--   update products set removed_at = null, removed_by = null where id = <id>;
-- Restaurer tout ce qu'un compte a retire depuis une date :
--   update products set removed_at = null, removed_by = null
--    where id in (select product_id from product_edits
--                  where user_id = '<uuid>' and action = 'remove' and created_at > '<date>');
-- Historique d'un compte (ancien nom pour annuler un renommage) :
--   select product_id, action, old_name, new_name, created_at from product_edits
--    where user_id = '<uuid>' order by created_at desc;
-- Bloquer un compte (produits, signaux, avis, demandes) : select purge_user_signals('<uuid>', true, 'motif'); (014)
--
-- VERIFICATION
-- select grantee, privilege_type, column_name from information_schema.column_privileges
--  where table_name = 'products' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
--    and grantee in ('anon', 'authenticated') order by 1, 2, 3;
-- -> authenticated | INSERT | available / distributor_id / name ; authenticated | UPDATE | name
