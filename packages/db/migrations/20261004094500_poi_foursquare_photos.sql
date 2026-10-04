-- A place's Foursquare photos, kept and shown again (docs/product-decisions.md D24). Foursquare's
-- usage guidelines allow "Photo IDs: unlimited caching (solely to improve the performance of your
-- application)", and Foursquare confirmed to the founder that a photo's image address (prefix +
-- size + suffix) may be kept with its id. This table holds a photo's id, address parts, pixel size
-- and creation time and nothing else from a Place Details answer: hours, rating, tips, price,
-- website and phone stay live-only and are never written here.

-- poi_foursquare_photos: Authz "sys" writes, RLS "R" (docs/data-model.md §3.13). Up to five photos
-- per place in Foursquare's order (rank 0 first), replaced as a set each time a place's live details
-- are read. Any
-- signed-in reader may read them; they are served over HTTP (`GET /v1/media`) and never synced.
CREATE TABLE poi_foursquare_photos (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  poi_id uuid NOT NULL REFERENCES pois (id) ON DELETE CASCADE,
  fsq_photo_id text NOT NULL CHECK (char_length(fsq_photo_id) BETWEEN 1 AND 100),
  prefix text NOT NULL CHECK (prefix ~ '^https://' AND char_length(prefix) <= 300),
  suffix text NOT NULL CHECK (suffix ~ '^/' AND char_length(suffix) <= 300),
  width integer NOT NULL CHECK (width > 0),
  height integer NOT NULL CHECK (height > 0),
  -- When Foursquare says the photo was added, when it says.
  fsq_created_at timestamptz,
  rank smallint NOT NULL CHECK (rank BETWEEN 0 AND 4),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT poi_foursquare_photos_photo_key UNIQUE (poi_id, fsq_photo_id)
);
ALTER TABLE poi_foursquare_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE poi_foursquare_photos FORCE ROW LEVEL SECURITY;
CREATE POLICY poi_foursquare_photos_read ON poi_foursquare_photos FOR SELECT TO app_user USING (true);
CREATE POLICY poi_foursquare_photos_system ON poi_foursquare_photos FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON poi_foursquare_photos TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON poi_foursquare_photos TO app_system;
