-- The crew's shared trip album and its postcards (docs/data-model.md §3.10, doc deltas): photos the
-- travellers upload (metadata only; the bytes live in R2 behind media Worker HMAC URLs), the album
-- picks (the guide's and anyone's override), who is in a photo (`photo_people`, self-tagged only:
-- no face data is ever stored), each traveller's album preferences (`album_prefs`: automatic
-- ingestion by trip dates), album exports (a zip of the originals, 7 days), postcards and printed
-- mailings, and mailing addresses (C3, sealed to their owner and the server).
--
-- Everything the crew sees is readable by the trip's crew (`app.is_trip_member`) and written only
-- by commands and the worker (app_system). The album is never gated on payment.

-- ---------------------------------------------------------------------------------------------
-- photos: RLS class T, C1. The app's own id (offline-created). `sha256` is unique per trip among
-- live photos, so the same picture uploaded twice registers once. `quality` holds the device's
-- prefilter scores (blur, exposure, dup_cluster, face_count). `local_date` is the trip-clock day
-- the photo was taken, for the album's day sections.
CREATE TABLE photos (
  id uuid PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES trips (id),
  uploader_id uuid NOT NULL REFERENCES users (id),
  media_key text NOT NULL CHECK (char_length(media_key) <= 300),
  thumb_key text CHECK (thumb_key IS NULL OR char_length(thumb_key) <= 300),
  display_key text CHECK (display_key IS NULL OR char_length(display_key) <= 300),
  taken_at timestamptz,
  local_date date,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  phash text CHECK (phash IS NULL OR phash ~ '^[0-9a-f]{16}$'),
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  quality jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(quality) = 'object'),
  exif_gps_stripped boolean NOT NULL DEFAULT false,
  upload_state text NOT NULL DEFAULT 'uploaded',
  is_pick boolean NOT NULL DEFAULT false,
  faces_opt_in boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE photos ADD CONSTRAINT photos_upload_state_check
  CHECK (upload_state IN ('pending', 'uploaded', 'processed', 'failed'));
CREATE UNIQUE INDEX photos_trip_sha256_live_key ON photos (trip_id, sha256) WHERE deleted_at IS NULL;
CREATE INDEX photos_trip_taken_idx ON photos (trip_id, taken_at);
CREATE INDEX photos_uploader_id_idx ON photos (uploader_id);
CREATE TRIGGER photos_touch_updated_at BEFORE UPDATE ON photos
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- album_picks: RLS class T, C1. One row per picked (or deliberately unpicked) photo: the guide's
-- curation writes `picked_by = 'guide'`; a traveller's choice (`picked_by = 'user'`) overrides it
-- either way and the next curation keeps it.
CREATE TABLE album_picks (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  photo_id uuid NOT NULL REFERENCES photos (id) ON DELETE CASCADE,
  picked boolean NOT NULL DEFAULT true,
  picked_by text NOT NULL,
  picker_id uuid REFERENCES users (id),
  rank smallint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT album_picks_trip_photo_key UNIQUE (trip_id, photo_id),
  CHECK (picked_by = 'user' OR picker_id IS NULL)
);
ALTER TABLE album_picks ADD CONSTRAINT album_picks_picked_by_check
  CHECK (picked_by IN ('user', 'guide'));
CREATE INDEX album_picks_photo_id_idx ON album_picks (photo_id);
CREATE INDEX album_picks_picker_id_idx ON album_picks (picker_id) WHERE picker_id IS NOT NULL;
CREATE TRIGGER album_picks_touch_updated_at BEFORE UPDATE ON album_picks
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- photo_people: RLS class T, C1. "I'm in this": a traveller tags only themself (manually, or by
-- their own device's opt-in self-match); no face data of anyone is stored.
CREATE TABLE photo_people (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  photo_id uuid NOT NULL REFERENCES photos (id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES trips (id),
  user_id uuid NOT NULL REFERENCES users (id),
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT photo_people_photo_user_key UNIQUE (photo_id, user_id)
);
ALTER TABLE photo_people ADD CONSTRAINT photo_people_source_check
  CHECK (source IN ('self_match', 'manual'));
CREATE INDEX photo_people_trip_id_idx ON photo_people (trip_id);
CREATE INDEX photo_people_user_id_idx ON photo_people (user_id);

-- album_prefs: RLS class O, C2. A traveller's album settings for one trip.
CREATE TABLE album_prefs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  user_id uuid NOT NULL REFERENCES users (id),
  auto_ingest boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT album_prefs_trip_user_key UNIQUE (trip_id, user_id)
);
CREATE INDEX album_prefs_user_id_idx ON album_prefs (user_id);
CREATE TRIGGER album_prefs_touch_updated_at BEFORE UPDATE ON album_prefs
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- album_exports: RLS class O, C2. "Download all": a zip of the album's originals in R2, owned by
-- the traveller who asked, readable for 7 days.
CREATE TABLE album_exports (
  id uuid PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES trips (id),
  user_id uuid NOT NULL REFERENCES users (id),
  status text NOT NULL DEFAULT 'queued',
  media_key text CHECK (media_key IS NULL OR char_length(media_key) <= 300),
  photos integer CHECK (photos IS NULL OR photos >= 0),
  bytes bigint CHECK (bytes IS NULL OR bytes >= 0),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE album_exports ADD CONSTRAINT album_exports_status_check
  CHECK (status IN ('queued', 'ready', 'failed', 'expired'));
CREATE INDEX album_exports_user_trip_idx ON album_exports (user_id, trip_id);
CREATE INDEX album_exports_trip_id_idx ON album_exports (trip_id);
CREATE TRIGGER album_exports_touch_updated_at BEFORE UPDATE ON album_exports
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- postcards: RLS class T, C1. A traveller's postcard from the trip (photo, note, format).
CREATE TABLE postcards (
  id uuid PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES trips (id),
  photo_id uuid REFERENCES photos (id) ON DELETE SET NULL,
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 200),
  format text NOT NULL DEFAULT 'classic',
  created_by uuid NOT NULL REFERENCES users (id),
  sent_at timestamptz,
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE postcards ADD CONSTRAINT postcards_format_check
  CHECK (format IN ('classic', 'square', 'story'));
CREATE INDEX postcards_trip_id_idx ON postcards (trip_id);
CREATE INDEX postcards_created_by_idx ON postcards (created_by);
CREATE INDEX postcards_photo_id_idx ON postcards (photo_id) WHERE photo_id IS NOT NULL;
CREATE TRIGGER postcards_touch_updated_at BEFORE UPDATE ON postcards
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- postcard_mailings: RLS class T, C2. A printed mailing's progress per order (doc delta: holds no
-- address; the crew sees who it goes to and how far it got, the payer's quota is P12's).
CREATE TABLE postcard_mailings (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  postcard_id uuid NOT NULL REFERENCES postcards (id),
  trip_id uuid NOT NULL REFERENCES trips (id),
  payer_id uuid NOT NULL REFERENCES users (id),
  recipient_ids uuid[] NOT NULL DEFAULT '{}' CHECK (cardinality(recipient_ids) <= 16),
  vendor text NOT NULL,
  vendor_ref text CHECK (vendor_ref IS NULL OR char_length(vendor_ref) <= 200),
  status text NOT NULL DEFAULT 'queued',
  tracking jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(tracking) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE postcard_mailings ADD CONSTRAINT postcard_mailings_status_check
  CHECK (status IN ('queued', 'sent', 'printed', 'shipped', 'failed'));
CREATE INDEX postcard_mailings_postcard_id_idx ON postcard_mailings (postcard_id);
CREATE INDEX postcard_mailings_trip_id_idx ON postcard_mailings (trip_id);
CREATE INDEX postcard_mailings_payer_id_idx ON postcard_mailings (payer_id);
CREATE TRIGGER postcard_mailings_touch_updated_at BEFORE UPDATE ON postcard_mailings
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- mailing_addresses: RLS class X, C3. A traveller's postal address, sealed (AES-GCM envelope):
-- owner-only, never published, never in `llm`, never shown to the crew.
CREATE TABLE mailing_addresses (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id),
  fields_enc text NOT NULL CHECK (char_length(fields_enc) <= 4000),
  country char(2) NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mailing_addresses_user_key UNIQUE (user_id)
);
CREATE TRIGGER mailing_addresses_touch_updated_at BEFORE UPDATE ON mailing_addresses
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Row security and grants.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['photos', 'album_picks', 'photo_people', 'postcards',
                           'postcard_mailings'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO app_user USING (app.is_trip_member(trip_id))',
      t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO app_system USING (true) WITH CHECK (true)',
      t || '_system', t);
    EXECUTE format('GRANT SELECT ON %I TO app_user', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_system', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['album_prefs', 'album_exports'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO app_user USING (user_id = app.uid())',
      t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO app_system USING (true) WITH CHECK (true)',
      t || '_system', t);
    EXECUTE format('GRANT SELECT ON %I TO app_user', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_system', t);
  END LOOP;
END
$$;

ALTER TABLE mailing_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE mailing_addresses FORCE ROW LEVEL SECURITY;
CREATE POLICY mailing_addresses_select ON mailing_addresses FOR SELECT TO app_user
  USING (user_id = app.uid());
CREATE POLICY mailing_addresses_system ON mailing_addresses FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON mailing_addresses TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON mailing_addresses TO app_system;

-- ---------------------------------------------------------------------------------------------
-- Domain events the album appends, merged into the allow-list whatever else it holds by then.
DO $$
DECLARE
  current_values text[];
  merged text;
BEGIN
  SELECT array_agg(m[1] ORDER BY m[1]) INTO current_values
    FROM pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') AS m
   WHERE c.conname = 'domain_events_type_check' AND c.conrelid = 'domain_events'::regclass;
  SELECT string_agg(DISTINCT quote_literal(t), ', ') INTO merged
    FROM unnest(current_values || ARRAY[
      'photo.added', 'photo.deleted', 'album.pick_changed', 'album.export_requested',
      'album.export_ready', 'album.curated'
    ]) AS t;
  ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
  EXECUTE format(
    'ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (%s))',
    merged
  );
END
$$;

-- ---------------------------------------------------------------------------------------------
-- PowerSync publication (docs/code-standards.md §13): every album table but the addresses.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'photos', 'album_picks', 'photo_people', 'album_prefs', 'album_exports', 'postcards',
    'postcard_mailings'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', t);
    END IF;
  END LOOP;
END
$$;
GRANT SELECT ON photos, album_picks, photo_people, album_prefs, album_exports, postcards,
  postcard_mailings TO powersync_repl;
