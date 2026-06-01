-- ============================================
-- DistriMatch - Ouverture des ecritures aux users authentifies (2026-06-01)
-- A coller dans Supabase SQL Editor > New query > Run
-- ============================================
--
-- Motivation : audit RLS post-PR #72 a revele que les tables `products`
-- et `distributors` ont RLS active mais aucune policy INSERT/UPDATE/DELETE
-- (au-dela de ce qui est deja en place). Resultat fonctionnel :
--
--   * Le code client tente des INSERT/UPDATE/DELETE sur ces tables
--     (CRUD produits via le stylo Modifier, mise a jour du price_range,
--     ajout de produits a la creation d'un distributeur) mais TOUS ces
--     appels echouent silencieusement en prod. Les modifs sont seulement
--     en local (AppState/localStorage), JAMAIS persistees en Supabase.
--
--   * L'utilisateur voit ses modifs sur sa machine mais elles n'apparaissent
--     pas pour les autres / sur un autre appareil / apres refresh.
--
-- C'est un gros bug fonctionnel non detecte avant l'audit.
--
-- Arbitrage utilisateur (2026-06-01) : modele communaute collaborative.
-- Tout user authentifie peut editer les produits et le price_range de
-- n'importe quel distributeur (modele Wikipedia / Google Maps). Aligne
-- sur le code client sans refactor.
--
-- Risque vandalisme : tolere (app petite, recuperable via rollback DB).
-- A surveiller. Si vandalisme reel observe, on basculera vers un modele
-- restreint (ownership = `auth.uid() = added_by` ou role moderateur).
--
-- Pour les DELETE distributors et distributor_photos : pas de feature
-- cote client -> on ne cree PAS de policy (deny par defaut). Si feature
-- future, ajouter une policy avec ownership a ce moment-la.

-- ============================================
-- 1. products : INSERT / UPDATE / DELETE pour authentifies
-- ============================================

CREATE POLICY "Ajout produits par users authentifies"
  ON products FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Modif produits par users authentifies"
  ON products FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Suppression produits par users authentifies"
  ON products FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- ============================================
-- 2. distributors : UPDATE pour authentifies
-- ============================================
--
-- DELETE volontairement non ouvert (pas de feature cote client, principe
-- de moindre privilege).
--
-- INSERT deja couvert par la policy existante "Ajout distributeurs par
-- users" (auth.uid() = added_by AND is_user_added = true).

CREATE POLICY "Modif distributeurs par users authentifies"
  ON distributors FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================
-- VERIFICATION POST-APPLICATION (a executer pour valider)
-- ============================================
--
-- A. Anonyme reste bloque (regression check). Console JS sur prod :
--
--   const cfg = await import('./js/config.js');
--   const supa = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
--
--   // 1. INSERT products anonyme -> doit echouer
--   const r1 = await supa.from('products').insert({ distributor_id: 'dist-001', name: 'PENTEST', available: true });
--   console.log('Anonyme INSERT products ->', r1.error?.code, r1.error?.message);
--   // attendu : code 42501, "new row violates row-level security policy"
--
--   // 2. UPDATE distributors anonyme -> doit echouer (0 row, pas d'erreur explicite)
--   const r2 = await supa.from('distributors').update({ price_range: '€€€' }).eq('id', 'dist-001');
--   console.log('Anonyme UPDATE distributors ->', r2.error, 'data:', r2.data);
--   // attendu : data=[] vide (RLS bloque silencieusement)
--
-- B. Authentifie peut maintenant ecrire. Apres connexion via magic link
--    sur https://skenea.github.io/DistriMatch/ , ouvrir une fiche d'un
--    distributeur en favori, cliquer le stylo Modifier, puis :
--    - Modifier le niveau de prix -> doit etre persiste apres refresh.
--    - Ajouter / renommer / toggle / supprimer un produit -> doit etre
--      persiste apres refresh.
--    - Refresh la page et reverifier que les modifs sont toujours la.
