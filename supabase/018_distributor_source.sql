-- ============================================================================
-- 018 : provenance d'une fiche (EPIC-T15, import OpenStreetMap)
-- ============================================================================
-- distributors.source : 'user' (ajoutee par un membre), 'osm' (importee
-- d'OpenStreetMap par scripts/import-osm.mjs, en tant que postgres), 'demo'
-- (jeu fictif, cf. 010). L'API (anon / authenticated) ne peut creer que des
-- fiches 'user' et ne peut pas changer la provenance : un membre ne se fait pas
-- passer pour OSM. Idempotent.
-- ============================================================================

alter table distributors add column if not exists source text not null default 'user';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'distributors_source_check') then
    alter table distributors add constraint distributors_source_check check (source in ('user', 'osm', 'demo'));
  end if;
end $$;

update distributors set source = 'demo' where is_demo and source <> 'demo';

create or replace function guard_distributor_source() returns trigger
language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.source := 'user';
    elsif new.source is distinct from old.source then
      new.source := old.source;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_distributor_source on distributors;
create trigger guard_distributor_source
  before insert or update on distributors
  for each row execute function guard_distributor_source();
