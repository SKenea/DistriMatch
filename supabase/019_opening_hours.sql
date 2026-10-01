-- ============================================================================
-- 019 : horaires d'ouverture d'une fiche (EPIC-T17)
-- ============================================================================
-- distributors.opening_hours : texte au format OpenStreetMap (« 24/7 »,
-- « Mo-Fr 08:00-19:00; Sa 09:00-12:00 »...), rempli par scripts/import-osm.mjs
-- (en tant que postgres). L'app le lit et le traduit (describeOpeningHours,
-- js/utils.js) ; elle ne l'ecrit jamais.
--
-- Droits : l'UPDATE par l'API est deja limite a price_range (013) ; a l'INSERT
-- (ajout d'une fiche par un membre), le trigger vide la colonne : un membre ne
-- pose pas d'horaires. Idempotent.
-- Execution : node scripts/supabase-sql.mjs supabase/019_opening_hours.sql
-- ============================================================================

alter table distributors add column if not exists opening_hours text;

create or replace function guard_distributor_hours() returns trigger
language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.opening_hours := null;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_distributor_hours on distributors;
create trigger guard_distributor_hours
  before insert on distributors
  for each row execute function guard_distributor_hours();
