-- ============================================
-- DistriMatch - Schema Supabase
-- A coller dans SQL Editor > New query > Run
-- ============================================

-- Table distributeurs
CREATE TABLE distributors (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL,
  emoji           TEXT NOT NULL DEFAULT '🏪',
  address         TEXT,
  city            TEXT,
  lat             DOUBLE PRECISION NOT NULL,
  lng             DOUBLE PRECISION NOT NULL,
  rating          NUMERIC(2,1) DEFAULT 0,
  review_count    INTEGER DEFAULT 0,
  status          TEXT DEFAULT 'verified',
  last_verified   TIMESTAMPTZ,
  price_range     TEXT,
  is_user_added   BOOLEAN DEFAULT FALSE,
  added_by        UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Table produits
CREATE TABLE products (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  distributor_id  TEXT REFERENCES distributors(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  price           NUMERIC(6,2),
  available       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Table profils utilisateurs
CREATE TABLE profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name    TEXT,
  points          INTEGER DEFAULT 0,
  report_count    INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Table abonnements
CREATE TABLE subscriptions (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  distributor_id  TEXT REFERENCES distributors(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, distributor_id)
);

-- Table signalements
CREATE TABLE reports (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id),
  distributor_id  TEXT REFERENCES distributors(id) ON DELETE CASCADE,
  report_type     TEXT NOT NULL,
  product_name    TEXT,
  points          INTEGER DEFAULT 10,
  confirmations   INTEGER DEFAULT 0,
  denials         INTEGER DEFAULT 0,
  resolved        BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Table votes
CREATE TABLE votes (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  report_id       BIGINT REFERENCES reports(id) ON DELETE CASCADE,
  vote_type       TEXT NOT NULL CHECK (vote_type IN ('confirm', 'deny')),
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, report_id)
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE distributors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture publique distributeurs" ON distributors FOR SELECT USING (true);
CREATE POLICY "Ajout distributeurs par users"  ON distributors FOR INSERT WITH CHECK (auth.uid() = added_by AND is_user_added = true);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture publique produits" ON products FOR SELECT USING (true);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture publique profils"  ON profiles FOR SELECT USING (true);
CREATE POLICY "Modification profil perso" ON profiles FOR UPDATE USING (auth.uid() = id);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture abonnements perso"     ON subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Ajout abonnements perso"       ON subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Suppression abonnements perso" ON subscriptions FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture publique signalements" ON reports FOR SELECT USING (true);
CREATE POLICY "Creation signalements"         ON reports FOR INSERT WITH CHECK (auth.uid() = user_id);

ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture publique votes" ON votes FOR SELECT USING (true);
CREATE POLICY "Creation votes"         ON votes FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================
-- FONCTIONS SECURISEES
-- ============================================

-- Voter sur un signalement
CREATE OR REPLACE FUNCTION cast_vote(p_report_id BIGINT, p_vote_type TEXT)
RETURNS void AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  INSERT INTO votes (user_id, report_id, vote_type) VALUES (v_user_id, p_report_id, p_vote_type);
  IF p_vote_type = 'confirm' THEN
    UPDATE reports SET confirmations = confirmations + 1 WHERE id = p_report_id;
  ELSE
    UPDATE reports SET denials = denials + 1 WHERE id = p_report_id;
  END IF;
  UPDATE reports SET resolved = TRUE WHERE id = p_report_id AND (confirmations >= 3 OR denials >= 3);
  UPDATE profiles SET points = points + 2 WHERE id = v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Soumettre un signalement
CREATE OR REPLACE FUNCTION submit_report(p_distributor_id TEXT, p_report_type TEXT, p_product_name TEXT DEFAULT NULL, p_points INTEGER DEFAULT 10)
RETURNS BIGINT AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_report_id BIGINT;
BEGIN
  INSERT INTO reports (user_id, distributor_id, report_type, product_name, points)
  VALUES (v_user_id, p_distributor_id, p_report_type, p_product_name, p_points)
  RETURNING id INTO v_report_id;
  UPDATE profiles SET points = points + p_points, report_count = report_count + 1 WHERE id = v_user_id;
  RETURN v_report_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Creer un profil automatiquement a chaque nouvel utilisateur
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
