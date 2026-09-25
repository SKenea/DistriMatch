-- ============================================
-- DistriMatch - Migration 013 : ce qu'un compte connecte peut modifier d'une fiche
-- ============================================
-- BACKLOG EPIC-T5, T5-US3 (2026-09-25). La regle RLS de 005 laisse tout compte
-- connecte modifier une fiche (modele collaboratif), et les droits par defaut de
-- Supabase couvrent TOUTES les colonnes : via l'API, on pouvait renommer,
-- deplacer ou changer l'adresse d'une machine. L'app n'edite que le niveau de
-- prix (updateDistributorPriceRange, js/gmaps-ui.js).
--
-- Droits par colonne :
--   * anon          : plus aucun UPDATE sur distributors (la RLS le refusait deja)
--   * authenticated : UPDATE limite a price_range
-- Inchange : la regle RLS « auth.uid() IS NOT NULL » (005), l'ajout d'une fiche
-- (INSERT), les produits (tout compte connecte les edite, UC2), last_verified
-- rafraichi par la RPC confirm_availability (SECURITY DEFINER, proprietaire
-- postgres), updated_at / modified_by poses par le trigger d'audit (006), la
-- garde is_demo (010).
--
-- Idempotente. Execution : node scripts/supabase-sql.mjs supabase/013_distributor_update_columns.sql

REVOKE UPDATE ON distributors FROM anon, authenticated;
GRANT UPDATE (price_range) ON distributors TO authenticated;

-- ============================================
-- VERIFICATION (en role simule, transaction annulee)
-- ============================================
-- select grantee, column_name from information_schema.column_privileges
--  where table_name = 'distributors' and privilege_type = 'UPDATE'
--    and grantee in ('anon', 'authenticated');
-- -> une seule ligne : authenticated | price_range
