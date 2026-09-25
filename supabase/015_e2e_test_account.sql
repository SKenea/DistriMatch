-- ============================================
-- DistriMatch - Migration 015 : compte de test des E2E connectes
-- ============================================
-- BACKLOG EPIC-T7, T7-US4b (decision Stephane 2026-09-25, option 1) : un vrai
-- compte, reserve aux tests E2E, pour verifier de bout en bout le parcours
-- connecte (signal sur une fiche de demo, puis purge).
--
--   * e2e@distrimatch.test : domaine reserve .test, aucun e-mail n'est envoye,
--     pas de mot de passe (connexion impossible hors tests).
--   * Les sessions sont ouvertes par tests/e2e/session.mjs, en tant que postgres
--     (API de gestion), pour CE compte uniquement ; elles sont supprimees a la fin
--     de chaque passage, avec les signaux du compte (purge_user_signals).
--   * Marque app_metadata.e2e = true pour le reconnaitre partout.
--
-- Idempotente. Execution : node scripts/supabase-sql.mjs supabase/015_e2e_test_account.sql
-- Suppression (si un jour on arrete) : delete from auth.users where email = 'e2e@distrimatch.test';

DO $$
DECLARE
  v_uid UUID;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = 'e2e@distrimatch.test';
  IF v_uid IS NOT NULL THEN
    RETURN;   -- deja cree
  END IF;
  v_uid := gen_random_uuid();

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    'e2e@distrimatch.test', '', now(),
    '{"provider":"email","providers":["email"],"e2e":true}', '{}', now(), now(),
    '', '', '', ''
  );

  INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (
    v_uid::text, v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', 'e2e@distrimatch.test', 'email_verified', true),
    'email', now(), now(), now()
  );
END $$;

-- VERIFICATION
-- select id, email, raw_app_meta_data->>'e2e' from auth.users where email = 'e2e@distrimatch.test';
