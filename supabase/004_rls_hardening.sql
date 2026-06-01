-- ============================================
-- DistriMatch - Durcissement RLS (2026-05-31)
-- A coller dans Supabase SQL Editor > New query > Run
-- ============================================
--
-- Motivation : audit RLS post-formalisation politique d'auth (CLAUDE.md
-- > "Politique d'authentification", PR #70). Le pentest anonyme via SDK
-- a revele que les RPC `submit_report` et `cast_vote` (SECURITY DEFINER)
-- ne verifient pas `auth.uid() IS NOT NULL`. Consequence : un appelant
-- anonyme peut creer un signalement (avec user_id = NULL silencieusement)
-- via `supabase.rpc('submit_report', ...)`.
--
-- Tous les autres INSERT/UPDATE/DELETE anonymes sont correctement
-- bloques par les policies RLS existantes (verifie : code 42501 sur
-- distributors, products, subscriptions, reports, votes,
-- distributor_photos, profiles, storage).
--
-- Cette migration corrige le RPC en ajoutant un check explicite. C'est
-- une defense en profondeur : RLS bloque deja les INSERT directs ; le
-- RPC etait le seul chemin oublie car SECURITY DEFINER bypass RLS.

-- ============================================
-- 1. RPC submit_report : refuser les appels anonymes
-- ============================================
CREATE OR REPLACE FUNCTION submit_report(
  p_distributor_id TEXT,
  p_report_type    TEXT,
  p_product_name   TEXT DEFAULT NULL,
  p_points         INTEGER DEFAULT 10
)
RETURNS BIGINT AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_report_id BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentification requise pour signaler'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO reports (user_id, distributor_id, report_type, product_name, points)
  VALUES (v_user_id, p_distributor_id, p_report_type, p_product_name, p_points)
  RETURNING id INTO v_report_id;

  UPDATE profiles
  SET points = points + p_points, report_count = report_count + 1
  WHERE id = v_user_id;

  RETURN v_report_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 2. RPC cast_vote : refuser les appels anonymes (defense en profondeur)
-- ============================================
-- Note : aujourd'hui un anonyme tombe sur une erreur FK car l'INSERT
-- echouerait quand meme (votes.user_id FK auth.users). Mais on ajoute le
-- check explicite pour un message clair + coherence avec submit_report.
CREATE OR REPLACE FUNCTION cast_vote(p_report_id BIGINT, p_vote_type TEXT)
RETURNS void AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentification requise pour voter'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO votes (user_id, report_id, vote_type)
  VALUES (v_user_id, p_report_id, p_vote_type);

  IF p_vote_type = 'confirm' THEN
    UPDATE reports SET confirmations = confirmations + 1 WHERE id = p_report_id;
  ELSE
    UPDATE reports SET denials = denials + 1 WHERE id = p_report_id;
  END IF;

  UPDATE reports
  SET resolved = TRUE
  WHERE id = p_report_id AND (confirmations >= 3 OR denials >= 3);

  UPDATE profiles SET points = points + 2 WHERE id = v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- NOTES HORS SCOPE (a arbitrer produit, pas de correction ici)
-- ============================================
--
-- Plusieurs tables ont RLS active mais aucune policy INSERT/UPDATE/DELETE
-- au-dela de celles deja en place. Resultat fonctionnel : les actions
-- correspondantes sont impossibles (RLS active + 0 policy = tout refuse),
-- meme pour un user authentifie. A confirmer si voulu ou si bug :
--
--   * products : aucune policy INSERT/UPDATE/DELETE. Si le code client
--     (distributor.js submitDetailProduct) tente un INSERT direct, il
--     echoue silencieusement. Les produits user-added pourraient n'exister
--     qu'en local (AppState/localStorage), jamais en Supabase. A verifier.
--
--   * distributors : pas de policy UPDATE/DELETE. Un createur ne peut pas
--     modifier ou supprimer son propre distributeur. Si la feature
--     "Modifier la fiche complete" doit fonctionner cote serveur, il
--     faudra ajouter :
--       CREATE POLICY "Modif distributeurs par createur"
--         ON distributors FOR UPDATE
--         USING (auth.uid() = added_by);
--
--   * distributor_photos : pas de policy DELETE. Le storage a une policy
--     DELETE par proprietaire (003_photos.sql), mais la ligne en DB
--     reste orpheline. Si feature "supprimer ma photo" voulue, ajouter :
--       CREATE POLICY "Suppression photos par proprietaire"
--         ON distributor_photos FOR DELETE
--         USING (auth.uid() = user_id);
--
-- Ces points sortent du scope strict "anonyme = pas d'ecriture" et
-- relevent de decisions produit. Ils ne creent pas de faille de
-- securite (RLS bloque tout), juste des trous fonctionnels.

-- ============================================
-- VERIFICATION POST-APPLICATION (a executer pour valider)
-- ============================================
-- Ouvrir la console JS sur https://skenea.github.io/DistriMatch/ et coller :
--
--   const cfg = await import('./js/config.js');
--   const supa = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
--   const r = await supa.rpc('submit_report', {
--     p_distributor_id: 'dist-001',
--     p_report_type: 'empty',
--     p_product_name: null,
--     p_points: 10
--   });
--   console.log('Anonyme submit_report ->', r);  // attendu : error 42501
--
-- Attendu : { error: { message: "Authentification requise pour signaler", code: "42501" } }
