-- ============================================
-- DistriMatch - Photos distributeurs
-- A coller dans SQL Editor > New query > Run
-- ============================================

-- Table photos distributeurs
CREATE TABLE distributor_photos (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  distributor_id  TEXT REFERENCES distributors(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id),
  storage_path    TEXT NOT NULL,
  status          TEXT DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  flag_count      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE distributor_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture publique photos" ON distributor_photos FOR SELECT USING (true);
CREATE POLICY "Ajout photos par users" ON distributor_photos FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Index pour recherche rapide par distributeur
CREATE INDEX idx_photos_distributor ON distributor_photos(distributor_id);

-- Bucket Storage pour les photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('distributor-photos', 'distributor-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Policies Storage : lecture publique, upload par users authentifies
CREATE POLICY "Photos lisibles par tous"
ON storage.objects FOR SELECT
USING (bucket_id = 'distributor-photos');

CREATE POLICY "Upload photos par users"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'distributor-photos' AND auth.role() = 'authenticated');

CREATE POLICY "Suppression photos par proprietaire"
ON storage.objects FOR DELETE
USING (bucket_id = 'distributor-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
