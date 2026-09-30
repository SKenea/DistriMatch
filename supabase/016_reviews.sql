-- ============================================
-- DistriMatch - Migration 016 : des avis reels sur les machines
-- ============================================
-- BACKLOG EPIC-T8 (Stephane, 2026-09-30). « Comment je depose un avis ? » :
-- c'etait impossible, et la note des fiches de demo etait inventee (colonnes
-- rating / review_count sans aucun avis derriere).
--
--   1. Table reviews : un avis par compte et par machine (note 1..5 +
--      commentaire facultatif <= 500 caracteres). Avis de demo : user_id NULL.
--   2. RLS + droits par colonne : lecture publique ; un compte connecte
--      n'ecrit, ne modifie et ne supprime que SON avis (rating, body).
--   3. Trigger guard_review (appels par l'API) : compte obligatoire (28000),
--      compte bloque refuse (42501, table signal_bans de 014, partagee),
--      10 avis / heure / compte (P0001), auteur force a « Membre DistriMatch ».
--   4. Vue distributor_ratings (nombre d'avis, moyenne), lisible par tous :
--      c'est elle qui donne la note affichee, plus les colonnes du seed.
--   5. Admin (SQL, jamais l'API) : purge_user_reviews(user_id),
--      seed_demo_reviews() (avis de demo realistes sur les fiches is_demo),
--      purge_demo_data() etendue aux avis de demo.
--
-- Idempotente. Execution : node scripts/supabase-sql.mjs supabase/016_reviews.sql
-- puis : select seed_demo_reviews();

-- ============================================
-- 1. Table
-- ============================================

CREATE TABLE IF NOT EXISTS reviews (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  distributor_id TEXT NOT NULL REFERENCES distributors(id) ON DELETE CASCADE,
  user_id        UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,   -- NULL = avis de demo
  author_name    TEXT NOT NULL DEFAULT 'Membre DistriMatch',
  rating         SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body           TEXT CHECK (body IS NULL OR char_length(body) <= 500),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS reviews_one_per_account ON reviews (distributor_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_distributor_recent ON reviews (distributor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_user_recent ON reviews (user_id, created_at DESC);

-- ============================================
-- 2. RLS et droits
-- ============================================

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reviews_select ON reviews;
DROP POLICY IF EXISTS reviews_insert_own ON reviews;
DROP POLICY IF EXISTS reviews_update_own ON reviews;
DROP POLICY IF EXISTS reviews_delete_own ON reviews;
CREATE POLICY reviews_select ON reviews FOR SELECT USING (true);
CREATE POLICY reviews_insert_own ON reviews FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY reviews_update_own ON reviews FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY reviews_delete_own ON reviews FOR DELETE TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON reviews FROM anon, authenticated;
GRANT SELECT ON reviews TO anon, authenticated;
GRANT INSERT (distributor_id, rating, body) ON reviews TO authenticated;   -- user_id = auth.uid() par defaut
GRANT UPDATE (rating, body) ON reviews TO authenticated;
GRANT DELETE ON reviews TO authenticated;

-- ============================================
-- 3. Garde des ecritures par l'API
-- ============================================
-- auth.role() vaut 'anon' / 'authenticated' pour un appel PostgREST, NULL pour
-- postgres (SQL Editor, seed) : le seed n'est donc pas concerne.

CREATE OR REPLACE FUNCTION guard_review()
RETURNS TRIGGER AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_recent INTEGER;
BEGIN
  IF coalesce(auth.role(), '') NOT IN ('anon', 'authenticated') THEN
    IF TG_OP = 'UPDATE' THEN NEW.updated_at := now(); END IF;
    RETURN NEW;
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Connexion requise pour donner un avis' USING ERRCODE = '28000';
  END IF;
  IF EXISTS (SELECT 1 FROM signal_bans WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'Ce compte ne peut plus publier d''avis' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT count(*) INTO v_recent FROM reviews
     WHERE user_id = v_uid AND created_at > now() - INTERVAL '1 hour';
    IF v_recent >= 10 THEN
      RAISE EXCEPTION 'Trop d''avis pour ce compte, reessaie plus tard' USING ERRCODE = 'P0001';
    END IF;
    NEW.user_id := v_uid;
    NEW.author_name := 'Membre DistriMatch';
    NEW.created_at := now();
  END IF;
  NEW.updated_at := now();
  IF NEW.body IS NOT NULL AND btrim(NEW.body) = '' THEN NEW.body := NULL; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_guard_review ON reviews;
CREATE TRIGGER trg_guard_review BEFORE INSERT OR UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION guard_review();

-- ============================================
-- 4. Note affichee : calculee depuis les avis
-- ============================================

CREATE OR REPLACE VIEW distributor_ratings
WITH (security_invoker = true) AS
SELECT distributor_id,
       count(*)::INTEGER             AS avis,
       round(avg(rating)::NUMERIC, 1) AS moyenne
FROM reviews
GROUP BY distributor_id;

GRANT SELECT ON distributor_ratings TO anon, authenticated;

-- ============================================
-- 5. Admin
-- ============================================

CREATE OR REPLACE FUNCTION purge_user_reviews(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_n INTEGER;
BEGIN
  DELETE FROM reviews WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Avis de demo : sur chaque fiche is_demo, exactement review_count avis, de
-- moyenne rating (+/- 0,1), dates etalees sur 18 mois, textes courts selon le
-- type de machine. user_id NULL = demo (l'API ne peut pas en creer).
CREATE OR REPLACE FUNCTION seed_demo_reviews()
RETURNS JSONB AS $$
DECLARE
  d            RECORD;
  v_base       INTEGER;
  v_high       INTEGER;
  v_rating     INTEGER;
  v_ratings    INTEGER[];
  v_body       TEXT;
  v_total      INTEGER := 0;
  v_fiches     INTEGER := 0;
  prenoms TEXT[] := ARRAY['Camille','Léa','Hugo','Manon','Lucas','Chloé','Louis','Inès','Jules','Sarah',
                          'Mathis','Emma','Nathan','Jade','Théo','Lina','Maël','Zoé','Enzo','Clara',
                          'Arthur','Alice','Paul','Anna','Tom','Eva','Noah','Lou','Gabriel','Nina',
                          'Maite','Peio','Amaia','Xabi','Ane','Iban','Maddi','Beñat','Garazi','Unai'];
  initiales TEXT := 'ABCDEFGHIJKLMNOPRSTUVZ';
  generiques_bons TEXT[] := ARRAY[
    'Toujours bien approvisionné, rien à redire.',
    'Pratique et rapide, paiement sans contact qui marche bien.',
    'Produits frais, je repasse régulièrement.',
    'Super dépannage le soir quand tout est fermé.',
    'Machine propre et bien entretenue.',
    'Rapport qualité-prix correct, je recommande.'];
  generiques_moyens TEXT[] := ARRAY[
    'Correct, mais parfois vide en fin de journée.',
    'Bien dans l''ensemble, le choix pourrait être plus large.',
    'Un peu cher, mais pratique.',
    'Le terminal de paiement a mis du temps à répondre.'];
  generiques_mauvais TEXT[] := ARRAY[
    'Machine vide deux fois de suite, dommage.',
    'En panne quand je suis passé.',
    'Produit pas très frais cette fois.',
    'Paiement refusé, j''ai dû revenir plus tard.'];
  par_type JSONB := '{
    "pizza": ["Pizza chaude en 3 minutes, pâte croustillante.", "La 4 fromages est excellente.", "Parfait après l''entraînement, bien garnie."],
    "bakery": ["Baguette encore croustillante le matin.", "Les viennoiseries sont top, surtout le pain au chocolat.", "Pratique le dimanche quand la boulangerie est fermée."],
    "fries": ["Frites croustillantes et bien chaudes.", "Portion généreuse pour le prix.", "La sauce maison vaut le détour."],
    "meals": ["Plats cuisinés maison, comme au restaurant.", "Le poulet basquaise est une tuerie.", "Idéal pour le déjeuner au bureau."],
    "cheese": ["Fromages du coin, affinage parfait.", "Le brebis est excellent.", "Bonne sélection de fromages fermiers."],
    "dairy": ["Lait frais et yaourts de la ferme, un régal.", "Les yaourts au lait de brebis sont délicieux.", "Produits laitiers ultra frais."],
    "agricultural": ["Légumes de saison cueillis le matin.", "Le panier de légumes est bien rempli.", "Direct du producteur, on sent la différence."],
    "meat": ["Viande de qualité, bien emballée.", "Les saucisses sont excellentes au barbecue.", "Producteur local, traçabilité au top."],
    "terroir": ["Produits du terroir, parfait pour offrir.", "Le piment d''Espelette et le miel sont top.", "Belle sélection de produits locaux."],
    "general": ["Un peu de tout, bien pratique.", "Boissons fraîches et snacks, dépannage idéal.", "Bon choix pour une machine mixte."]
  }'::jsonb;
BEGIN
  -- Idempotent : on repart de zero sur les fiches de demo
  DELETE FROM reviews r USING distributors dist
   WHERE r.distributor_id = dist.id AND dist.is_demo AND r.user_id IS NULL;

  FOR d IN SELECT id, type, coalesce(rating, 0) AS rating, coalesce(review_count, 0) AS n
             FROM distributors WHERE is_demo AND coalesce(review_count, 0) > 0 AND coalesce(rating, 0) >= 1 LOOP
    v_fiches := v_fiches + 1;
    -- Notes : part de (base + 1) calibree pour que la moyenne tombe sur rating
    v_base := LEAST(GREATEST(floor(d.rating)::INTEGER, 1), 5);
    v_high := round((d.rating - v_base) * d.n)::INTEGER;
    v_ratings := ARRAY[]::INTEGER[];
    FOR i IN 1..d.n LOOP
      v_ratings := v_ratings || CASE WHEN i <= v_high THEN LEAST(v_base + 1, 5) ELSE v_base END;
    END LOOP;
    -- Un peu de relief sans bouger la moyenne : un cran de moins + un cran de plus
    IF d.n >= 10 AND v_base > 1 AND v_base < 5 THEN
      v_ratings[d.n] := v_base - 1;
      v_ratings[d.n - 1] := LEAST(v_base + 1, 5);
    END IF;

    FOR i IN 1..d.n LOOP
      v_rating := v_ratings[i];
      v_body := CASE
        WHEN random() < 0.2 THEN NULL
        WHEN v_rating >= 4 AND random() < 0.6 AND par_type ? d.type
          THEN par_type->d.type->>(floor(random() * jsonb_array_length(par_type->d.type))::INTEGER)
        WHEN v_rating >= 4 THEN generiques_bons[1 + floor(random() * array_length(generiques_bons, 1))::INTEGER]
        WHEN v_rating = 3 THEN generiques_moyens[1 + floor(random() * array_length(generiques_moyens, 1))::INTEGER]
        ELSE generiques_mauvais[1 + floor(random() * array_length(generiques_mauvais, 1))::INTEGER]
      END;
      INSERT INTO reviews (distributor_id, user_id, author_name, rating, body, created_at, updated_at)
      VALUES (
        d.id, NULL,
        prenoms[1 + floor(random() * array_length(prenoms, 1))::INTEGER] || ' ' ||
          substr(initiales, 1 + floor(random() * length(initiales))::INTEGER, 1) || '.',
        v_rating, v_body,
        now() - (random() * INTERVAL '540 days'),
        now()
      );
      v_total := v_total + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('fiches_demo', v_fiches, 'avis', v_total);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- purge_demo_data (reprise de 010) : supprime aussi les avis de demo
CREATE OR REPLACE FUNCTION purge_demo_data()
RETURNS JSONB AS $$
DECLARE
  v_s INTEGER;
  v_e INTEGER;
  v_a INTEGER;
BEGIN
  DELETE FROM availability_signals WHERE device_hash LIKE 'demo-%';
  GET DIAGNOSTICS v_s = ROW_COUNT;
  DELETE FROM events WHERE device_hash LIKE 'demo-%';
  GET DIAGNOSTICS v_e = ROW_COUNT;
  DELETE FROM reviews r USING distributors dist
   WHERE r.distributor_id = dist.id AND dist.is_demo AND r.user_id IS NULL;
  GET DIAGNOSTICS v_a = ROW_COUNT;
  UPDATE distributors dist SET last_verified = b.last_verified
  FROM demo_backup b WHERE b.distributor_id = dist.id AND dist.is_demo;
  RETURN jsonb_build_object('signaux_supprimes', v_s, 'evenements_supprimes', v_e, 'avis_supprimes', v_a);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Reservees a l'admin (SQL Editor / scripts/supabase-sql.mjs) : jamais l'API
REVOKE ALL ON FUNCTION purge_user_reviews(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION seed_demo_reviews() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION purge_demo_data() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION guard_review() FROM PUBLIC, anon, authenticated;

-- ============================================
-- VERIFICATION
-- ============================================
-- select seed_demo_reviews();
-- select d.id, d.review_count, r.avis, d.rating, r.moyenne
--   from distributors d left join distributor_ratings r on r.distributor_id = d.id
--  where d.is_demo order by d.id;
-- -> avis = review_count, |moyenne - rating| <= 0,1 ; aucune ligne pour une fiche reelle
