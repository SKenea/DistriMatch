-- ============================================================================
-- 029 : le compte d'un contributeur n'est plus lisible par tous (PRIV-01)
-- ============================================================================
-- Revue du 2026-10-21. Avant :
--   * chaque signal retenu par confirm_availability fait
--     « update distributors set last_verified = now() » ; le declencheur d'audit
--     de 006 (before update, toutes colonnes) y ecrivait modified_by = auth.uid(),
--     soit le compte qui signale. distributors etant lisible en entier, le dernier
--     compte qui avait signale sur chaque fiche etait public (ce que 023 voulait
--     empecher), exploitant verifie compris ;
--   * distributors.added_by (auteur), reviewed_by (admin), review_reason,
--     author_read_at, products.modified_by / removed_by : lisibles par tous.
-- Apres :
--   1. Le declencheur d'audit de distributors ne part plus que sur les colonnes
--      modifiables (nom, type, position, prix, etat, fuseau, horaires,
--      validation) : ni last_verified (signaux), ni author_read_at (fil, 022).
--   2. modified_by remis a NULL sur toutes les fiches (les valeurs des signaux
--      ne se distinguent pas des autres).
--   3. Lecture par colonne pour anon et authenticated sur distributors et
--      products (modele de 023). Plus de select('*') possible : le front liste
--      ses colonnes (DISTRIBUTOR_PUBLIC_COLUMNS / PRODUCT_PUBLIC_COLUMNS,
--      js/utils.js). products.removed_at reste lisible : la vue
--      product_availability (security_invoker, 025) le lit avec les droits du
--      visiteur. INSERT / UPDATE inchanges (013, 025, 027).
--   4. my_distributors() : l'auteur relit ses propres fiches (statut, motif de
--      refus, lecture du fil, son id) pour « Mes ajouts » et Mon profil. Vide
--      pour un visiteur (executable par anon : l'app l'appelle au chargement).
-- Inchanges : les regles RLS (elles lisent toujours added_by), les fonctions
-- SECURITY DEFINER, les vues KPI / product_rhythm (droits du proprietaire),
-- service_role (fonction push-notify).
-- INCOMPATIBLE avec le front d'avant PRIV-01 (select('*') -> 42501 : l'app
-- retombe sur le JSON de demo). Appliquer APRES le deploiement du front de
-- PRIV-01 et l'expiration du cache (docs/stories/PRIV-01.md).
-- Secours si le site casse : grant select on distributors, products to anon, authenticated;
-- Rejouable, tout ou rien (begin / commit). Execution (Claude, apres relecture) :
--   node scripts/supabase-sql.mjs supabase/029_private_contributors.sql
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Audit de distributors : seulement les colonnes modifiables
--    (un « update of » ne part que si la colonne est dans le SET)
-- ---------------------------------------------------------------------------
drop trigger if exists distributors_audit_trigger on distributors;
create trigger distributors_audit_trigger
  before update of name, type, emoji, address, city, lat, lng, price_range, status, tz, opening_hours, review_status
  on distributors
  for each row execute function set_audit_columns();

-- ---------------------------------------------------------------------------
-- 2. Valeurs deja ecrites (apres le point 1 : cet UPDATE ne declenche plus l'audit)
-- ---------------------------------------------------------------------------
update distributors set modified_by = null where modified_by is not null;

-- ---------------------------------------------------------------------------
-- 3. Lecture par colonne (le REVOKE retire aussi les droits par colonne existants)
-- ---------------------------------------------------------------------------
revoke select on distributors from anon, authenticated;
grant select (id, name, type, emoji, address, city, lat, lng, rating, review_count, status,
              last_verified, price_range, is_user_added, created_at, updated_at, tz, is_demo,
              source, opening_hours, review_status)
  on distributors to anon, authenticated;

revoke select on products from anon, authenticated;
grant select (id, distributor_id, name, price, available, created_at, updated_at, removed_at)
  on products to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Les fiches du compte appelant (« Mes ajouts », Mon profil, bandeau de la fiche)
-- ---------------------------------------------------------------------------
create or replace function my_distributors()
returns table (id text, name text, type text, emoji text, city text, review_status text,
               review_reason text, author_read_at timestamptz, created_at timestamptz, added_by uuid)
language sql stable security definer set search_path = public as $$
  select d.id, d.name, d.type, d.emoji, d.city, d.review_status, d.review_reason,
         d.author_read_at, d.created_at, d.added_by
    from distributors d
   where auth.uid() is not null and d.added_by = auth.uid()
   order by d.created_at desc;
$$;
revoke execute on function my_distributors() from public;
grant execute on function my_distributors() to anon, authenticated;

notify pgrst, 'reload schema';   -- envoye au commit

commit;

-- ============================================================================
-- VERIFICATION (en tant que postgres)
-- ============================================================================
-- select grantee, count(*) from information_schema.column_privileges
--  where table_name = 'distributors' and privilege_type = 'SELECT'
--    and grantee in ('anon', 'authenticated') group by 1;
-- -> anon 21, authenticated 21 (products : 8 chacun)
-- select count(*) from distributors where modified_by is not null;   -- -> 0
-- select tgname, pg_get_triggerdef(oid) from pg_trigger where tgname = 'distributors_audit_trigger';
-- -> BEFORE UPDATE OF name, type, ... ON public.distributors
-- ============================================================================
