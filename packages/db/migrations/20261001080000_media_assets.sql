-- Editorial media: licensed stock photos and short muted video loops for destination and place
-- heroes. The content factory searches Pexels, Pixabay and Wikimedia Commons per subject; the ops
-- console keeps the picks; the publish job writes one row per kept asset, and the worker's
-- `media.ingest` job downloads the original, writes WebP sizes (and for video an mp4 loop plus a
-- poster frame) to the media bucket under the public `c/media/<id>/` prefix, and marks it ready.
--
-- Class C0, RLS class R: every signed-in reader may read a ready asset; only the publish and
-- ingest jobs write (app_system). Served over HTTP (`GET /v1/media`), never synced. The licence and
-- credit travel with the row so every reader can show the attribution the licence requires.

ALTER TABLE content_releases DROP CONSTRAINT content_releases_kind_check;
ALTER TABLE content_releases ADD CONSTRAINT content_releases_kind_check CHECK (kind IN (
  'sets', 'critters', 'forms', 'spawns', 'windows', 'personas', 'places', 'phrases',
  'taste_quiz', 'help', 'emergency', 'facilities', 'insurance', 'ride_tariffs', 'media'
));

CREATE TABLE media_assets (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  kind text NOT NULL CHECK (kind IN ('photo', 'video')),
  source text NOT NULL CHECK (source IN ('pexels', 'pixabay', 'wikimedia')),
  source_id text NOT NULL CHECK (char_length(source_id) BETWEEN 1 AND 200),
  source_url text NOT NULL CHECK (source_url ~ '^https://'),
  -- The file the ingest job downloads (the original, or the largest the source allows).
  download_url text NOT NULL CHECK (download_url ~ '^https://'),
  -- `destination:<slug>` or `poi:<ref>`; the reads filter on these.
  subject_keys text[] NOT NULL CHECK (
    cardinality(subject_keys) BETWEEN 1 AND 20
    AND array_to_string(subject_keys, ',') ~ '^(destination|poi):[a-z0-9-]+(,(destination|poi):[a-z0-9-]+)*$'
  ),
  -- Order inside a subject: 0 is its hero.
  rank smallint NOT NULL DEFAULT 0 CHECK (rank BETWEEN 0 AND 99),
  title text CHECK (char_length(title) <= 300),
  author text NOT NULL CHECK (char_length(author) BETWEEN 1 AND 200),
  author_url text CHECK (author_url ~ '^https?://'),
  licence text NOT NULL CHECK (licence ~ '^[a-z0-9.-]{2,40}$'),
  licence_url text NOT NULL CHECK (licence_url ~ '^https?://'),
  attribution_required boolean NOT NULL,
  -- The credit line as shown ("Photo: Name · Pexels", "Name · CC BY-SA 4.0 · Wikimedia Commons").
  credit text NOT NULL CHECK (char_length(credit) BETWEEN 1 AND 300),
  width integer CHECK (width > 0),
  height integer CHECK (height > 0),
  duration_ms integer CHECK (duration_ms > 0),
  -- Filled by the ingest job: dominant colour, blurhash, and every stored file
  -- ([{key, format, w, h, bytes}]); `poster_key` is a video's still frame.
  colour text CHECK (colour ~ '^#[0-9a-f]{6}$'),
  blurhash text CHECK (char_length(blurhash) BETWEEN 6 AND 120),
  variants jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(variants) = 'array'),
  poster_key text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed')),
  error text CHECK (char_length(error) <= 500),
  release_id uuid REFERENCES content_releases (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_assets_source_key UNIQUE (source, kind, source_id),
  CHECK (status <> 'ready' OR (jsonb_array_length(variants) > 0 AND blurhash IS NOT NULL)),
  CHECK (kind = 'photo' OR status <> 'ready' OR poster_key IS NOT NULL)
);
CREATE INDEX media_assets_subjects_idx ON media_assets USING gin (subject_keys)
  WHERE status = 'ready';
CREATE TRIGGER media_assets_touch_updated_at BEFORE UPDATE ON media_assets
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_assets FORCE ROW LEVEL SECURITY;
CREATE POLICY media_assets_read ON media_assets FOR SELECT TO app_user USING (status = 'ready');
CREATE POLICY media_assets_system ON media_assets FOR ALL TO app_system
  USING (true) WITH CHECK (true);
CREATE POLICY media_assets_admin_reader ON media_assets FOR SELECT TO admin_reader USING (true);
GRANT SELECT ON media_assets TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON media_assets TO app_system;
GRANT SELECT ON media_assets TO admin_reader;
REVOKE ALL ON media_assets FROM guide_reader, powersync_repl;
