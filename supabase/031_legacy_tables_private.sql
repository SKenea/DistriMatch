-- ============================================================================
-- 031 : tables heritees : plus aucun identifiant de compte lisible (PRIV-03)
-- ============================================================================
-- Revue du 2026-10-21. Avant : profiles, reports et votes (001) etaient lisibles
-- par tous (USING (true), toutes les colonnes) : liste de tous les comptes avec
-- leur date d'inscription, chaque signalement et chaque vote relie a son compte.
-- 023 ne l'avait corrige que pour les signaux. distributor_photos (003, 006)
-- exposait aussi user_id et modified_by, et les photos en attente ou refusees.
-- Le front ne lit aucune de ces tables (photos inactives, FEATURES.photos =
-- false ; la modale Signaler appelle submit_report, fermee par 028).
-- Apres :
--   1. Toutes les regles de lecture (SELECT, ALL) de ces 4 tables sont retirees,
--      celles des migrations comme celles creees au tableau de bord (cf. 025).
--   2. profiles / reports / votes : rien pour anon ; un compte connecte ne lit
--      que ses propres lignes ; plus aucune ecriture directe par l'API. Les
--      fonctions SECURITY DEFINER (handle_new_user, submit_report, cast_vote)
--      ne dependent pas de ces droits. Les regles d'ecriture de 001 restent
--      mais n'ont plus d'effet sans droit.
--   3. distributor_photos : lecture sans user_id ni modified_by (droits par
--      colonne), seulement les photos approuvees d'une fiche publiee.
--      distributor_is_published() est appelee par une regle lisible par anon :
--      grant execute a anon obligatoire (incident du 2026-10-02, cf. 022).
-- Une seule transaction (begin / commit). Rejouable.
-- Execution (Claude, apres relecture) :
--   node scripts/supabase-sql.mjs supabase/031_legacy_tables_private.sql
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Regles de lecture existantes retirees (quel que soit leur nom)
-- ---------------------------------------------------------------------------
do $$
declare
  p record;
begin
  for p in
    select tablename, policyname from pg_policies
     where schemaname = 'public'
       and tablename in ('profiles', 'reports', 'votes', 'distributor_photos')
       and cmd in ('SELECT', 'ALL')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
    raise notice 'PRIV-03 : regle retiree : %.%', p.tablename, p.policyname;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. profiles, reports, votes : ses propres lignes, en lecture seulement
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.reports, public.votes from anon, authenticated;
grant select on public.profiles, public.reports, public.votes to authenticated;

create policy "Lecture de son profil" on public.profiles for select to authenticated
  using (id = auth.uid());
create policy "Lecture de ses signalements" on public.reports for select to authenticated
  using (user_id = auth.uid());
create policy "Lecture de ses votes" on public.votes for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. distributor_photos : sans auteur, photos approuvees d'une fiche publiee
-- (un REVOKE au niveau de la table retire aussi les droits par colonne poses)
-- ---------------------------------------------------------------------------
revoke select on public.distributor_photos from anon, authenticated;
grant select (id, distributor_id, storage_path, status, created_at)
  on public.distributor_photos to anon, authenticated;
grant execute on function public.distributor_is_published(text) to anon, authenticated;
create policy "Lecture publique photos" on public.distributor_photos for select
  using (status = 'approved' and distributor_is_published(distributor_id));

notify pgrst, 'reload schema';   -- envoye au commit

commit;

-- ============================================================================
-- VERIFICATION (Claude)
-- select tablename, policyname, cmd, roles::text from pg_policies
--  where schemaname = 'public' and tablename in ('profiles', 'reports', 'votes', 'distributor_photos')
--  order by 1, 2;
-- -> SELECT : « Lecture de son profil », « Lecture de ses signalements »,
--    « Lecture de ses votes », « Lecture publique photos » ; plus les regles
--    d'ecriture de 001 (sans effet, aucun droit d'ecriture)
-- ============================================================================
