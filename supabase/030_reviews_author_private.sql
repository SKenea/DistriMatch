-- ============================================================================
-- 030 : avis vraiment anonymes : l'API ne lit plus l'auteur d'un avis (PRIV-02)
-- ============================================================================
-- Revue du 2026-10-21. Avant : « GRANT SELECT ON reviews TO anon, authenticated »
-- (016) rendait toutes les colonnes lisibles, dont user_id : un avis affiche
-- « Membre DistriMatch » etait relie a son compte, et n'importe qui listait
-- tous les avis d'un meme compte (filtre user_id=eq.<uuid>).
-- Apres :
--   1. Lecture par colonne (modele de 023) : toutes les colonnes sauf user_id,
--      pour anon et authenticated. Ecritures inchangees (016). Les regles RLS
--      « son propre avis » (user_id = auth.uid()) marchent toujours : Postgres
--      ne controle pas les droits par colonne dans l'expression d'une regle de
--      la table elle-meme. Le front vise l'id de l'avis, jamais user_id.
--   2. my_review(p_distributor_id) : l'avis du compte connecte sur une fiche
--      (0 ou 1 ligne, sans user_id). Seule voie pour retrouver « mon avis ».
-- Une seule transaction (begin / commit). Rejouable.
-- Execution (Claude, apres relecture) :
--   node scripts/supabase-sql.mjs supabase/030_reviews_author_private.sql
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Lecture : tout sauf user_id
-- (un REVOKE au niveau de la table retire aussi les droits par colonne poses)
-- ---------------------------------------------------------------------------
revoke select on public.reviews from anon, authenticated;
grant select (id, distributor_id, author_name, rating, body, created_at, updated_at)
  on public.reviews to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Mon avis (onglet Avis de la fiche, js/reviews.js)
-- ---------------------------------------------------------------------------
create or replace function public.my_review(p_distributor_id text)
returns table (id bigint, author_name text, rating smallint, body text,
               created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.author_name, r.rating, r.body, r.created_at, r.updated_at
    from reviews r
   where r.distributor_id = p_distributor_id
     and r.user_id = auth.uid()
   limit 1;
$$;
revoke execute on function public.my_review(text) from public, anon;
grant execute on function public.my_review(text) to authenticated;

notify pgrst, 'reload schema';   -- envoye au commit

commit;

-- ============================================================================
-- VERIFICATION (Claude)
-- select grantee, column_name from information_schema.column_privileges
--  where table_name = 'reviews' and privilege_type = 'SELECT'
--    and grantee in ('anon', 'authenticated') order by 1, 2;
-- -> 7 colonnes par role, jamais user_id
-- ============================================================================
