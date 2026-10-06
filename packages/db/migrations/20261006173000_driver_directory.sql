-- Drivers our crews used: a driver is listed only after he
-- confirms his own listing with a WhatsApp code on the web claim page; ratings come only from crews
-- who rode with him. Every write goes through the api as app_system.
--
-- driver_listings (C2; phone and key hashes C3): members read the listed, unpaused columns only,
-- never the phone envelope, hashes or the consent record. Removal hard-deletes the listing, its
-- stats, flags and tips; the crews' own answers and invites lose their listing link.
CREATE TABLE driver_listings (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  areas text[] NOT NULL DEFAULT '{}' CHECK (cardinality(areas) <= 12),
  languages text[] NOT NULL DEFAULT '{}' CHECK (cardinality(languages) <= 12),
  vehicle jsonb CHECK (vehicle IS NULL OR (jsonb_typeof(vehicle) = 'object'
    AND pg_column_size(vehicle) <= 2048)),
  seats smallint CHECK (seats IS NULL OR seats BETWEEN 1 AND 60),
  day_trips boolean NOT NULL DEFAULT true,
  price_text text CHECK (char_length(price_text) <= 200),
  photo_key text CHECK (char_length(photo_key) <= 300),
  phone_e164_enc text NOT NULL CHECK (char_length(phone_e164_enc) <= 4000),
  phone_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'listed' CHECK (status IN ('pending', 'listed', 'paused', 'removed')),
  show_ratings boolean NOT NULL DEFAULT true,
  consent_version text NOT NULL,
  consent_at timestamptz NOT NULL,
  key_hash text NOT NULL UNIQUE,
  prev_key_hash text,
  key_rotated_at timestamptz NOT NULL DEFAULT now(),
  listed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX driver_listings_prev_key_idx ON driver_listings (prev_key_hash)
  WHERE prev_key_hash IS NOT NULL;
CREATE INDEX driver_listings_areas_idx ON driver_listings USING gin (areas);
CREATE TRIGGER driver_listings_touch_updated_at BEFORE UPDATE ON driver_listings
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE driver_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_listings FORCE ROW LEVEL SECURITY;
CREATE POLICY driver_listings_public ON driver_listings FOR SELECT TO app_user
  USING (status = 'listed');
CREATE POLICY driver_listings_system ON driver_listings FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT (id, display_name, areas, languages, vehicle, seats, day_trips, price_text, photo_key,
  status, show_ratings, listed_at) ON driver_listings TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON driver_listings TO app_system;

-- Per-crew counts behind the heart line and the ordering, refreshed after every rating and claim
-- and nightly by the worker. Members read the stats of listed drivers only.
CREATE TABLE driver_listing_stats (
  listing_id uuid PRIMARY KEY REFERENCES driver_listings (id) ON DELETE CASCADE,
  crews_rated integer NOT NULL DEFAULT 0 CHECK (crews_rated >= 0),
  crews_loved integer NOT NULL DEFAULT 0 CHECK (crews_loved >= 0),
  crews_fine integer NOT NULL DEFAULT 0 CHECK (crews_fine >= 0),
  crews_not_again integer NOT NULL DEFAULT 0 CHECK (crews_not_again >= 0),
  trips integer NOT NULL DEFAULT 0 CHECK (trips >= 0),
  top_tags text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE driver_listing_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_listing_stats FORCE ROW LEVEL SECURITY;
CREATE POLICY driver_listing_stats_public ON driver_listing_stats FOR SELECT TO app_user
  USING (EXISTS (SELECT 1 FROM driver_listings l WHERE l.id = listing_id AND l.status = 'listed'));
CREATE POLICY driver_listing_stats_system ON driver_listing_stats FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON driver_listing_stats TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON driver_listing_stats TO app_system;

-- The crew's invite to a driver it used (C1): a single-use link bound to the provider's phone
-- hash. The token itself is never stored.
CREATE TABLE driver_invites (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  listing_id uuid REFERENCES driver_listings (id) ON DELETE SET NULL,
  provider_id uuid NOT NULL REFERENCES providers (id),
  trip_id uuid NOT NULL REFERENCES trips (id),
  crew_id uuid NOT NULL REFERENCES crews (id),
  inviter_id uuid REFERENCES users (id),
  token_hash text NOT NULL UNIQUE,
  phone_hash text NOT NULL,
  status text NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'opened', 'claimed', 'declined', 'cancelled', 'expired')),
  opened_at timestamptz,
  claimed_at timestamptz,
  nudged_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX driver_invites_crew_idx ON driver_invites (crew_id, provider_id);
CREATE INDEX driver_invites_phone_idx ON driver_invites (phone_hash);
CREATE INDEX driver_invites_listing_idx ON driver_invites (listing_id) WHERE listing_id IS NOT NULL;
CREATE INDEX driver_invites_inviter_idx ON driver_invites (inviter_id) WHERE inviter_id IS NOT NULL;
CREATE INDEX driver_invites_open_expiry_idx ON driver_invites (expires_at)
  WHERE status IN ('sent', 'opened');
-- One live invite per crew per driver.
CREATE UNIQUE INDEX driver_invites_live_key ON driver_invites (crew_id, phone_hash)
  WHERE status IN ('sent', 'opened');
CREATE TRIGGER driver_invites_touch_updated_at BEFORE UPDATE ON driver_invites
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE driver_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_invites FORCE ROW LEVEL SECURITY;
CREATE POLICY driver_invites_select ON driver_invites FOR SELECT TO app_user
  USING (app.is_crew_member(crew_id));
CREATE POLICY driver_invites_system ON driver_invites FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT (id, listing_id, provider_id, trip_id, crew_id, inviter_id, status, opened_at,
  claimed_at, nudged_at, expires_at, created_at, updated_at) ON driver_invites TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON driver_invites TO app_system;

-- Each member's answer on the rate card (C1). The listing shows the crew's combined answer; who
-- answered is never shown outside the crew.
CREATE TABLE driver_ratings (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  listing_id uuid REFERENCES driver_listings (id) ON DELETE SET NULL,
  provider_id uuid NOT NULL REFERENCES providers (id),
  trip_id uuid NOT NULL REFERENCES trips (id),
  crew_id uuid NOT NULL REFERENCES crews (id),
  user_id uuid NOT NULL REFERENCES users (id),
  verdict text NOT NULL CHECK (verdict IN ('loved', 'fine', 'not_again')),
  tags text[] NOT NULL DEFAULT '{}' CHECK (cardinality(tags) <= 8),
  status text NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'held')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, trip_id, user_id)
);
CREATE INDEX driver_ratings_listing_idx ON driver_ratings (listing_id) WHERE listing_id IS NOT NULL;
CREATE INDEX driver_ratings_user_idx ON driver_ratings (user_id);
CREATE INDEX driver_ratings_crew_idx ON driver_ratings (crew_id, trip_id);
CREATE TRIGGER driver_ratings_touch_updated_at BEFORE UPDATE ON driver_ratings
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE driver_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_ratings FORCE ROW LEVEL SECURITY;
CREATE POLICY driver_ratings_select ON driver_ratings FOR SELECT TO app_user
  USING (app.is_crew_member(crew_id));
CREATE POLICY driver_ratings_system ON driver_ratings FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON driver_ratings TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON driver_ratings TO app_system;

-- One tip per crew per driver per trip (C1). A tip waits in `pending` until the automated check
-- passes it; a listed driver's visible tips show crew size and month only.
CREATE TABLE driver_tips (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  listing_id uuid REFERENCES driver_listings (id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES providers (id),
  trip_id uuid NOT NULL REFERENCES trips (id),
  crew_id uuid NOT NULL REFERENCES crews (id),
  author_id uuid REFERENCES users (id),
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 280),
  crew_size smallint NOT NULL CHECK (crew_size BETWEEN 1 AND 60),
  month date NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'visible', 'held', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, trip_id)
);
CREATE INDEX driver_tips_listing_idx ON driver_tips (listing_id, created_at DESC)
  WHERE listing_id IS NOT NULL;
CREATE INDEX driver_tips_author_idx ON driver_tips (author_id) WHERE author_id IS NOT NULL;
CREATE INDEX driver_tips_crew_idx ON driver_tips (crew_id);
CREATE TRIGGER driver_tips_touch_updated_at BEFORE UPDATE ON driver_tips
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE driver_tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_tips FORCE ROW LEVEL SECURITY;
CREATE POLICY driver_tips_select ON driver_tips FOR SELECT TO app_user
  USING (app.is_crew_member(crew_id));
CREATE POLICY driver_tips_system ON driver_tips FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT (id, listing_id, provider_id, trip_id, crew_id, text, crew_size, month, status,
  created_at, updated_at) ON driver_tips TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON driver_tips TO app_system;

-- Ops-only anomaly flags (rating rings) with their evidence.
CREATE TABLE driver_listing_flags (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  listing_id uuid NOT NULL REFERENCES driver_listings (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('rating_ring')),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'cleared')),
  cleared_reason text CHECK (char_length(cleared_reason) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX driver_listing_flags_open_key ON driver_listing_flags (listing_id, kind)
  WHERE status = 'open';
CREATE TRIGGER driver_listing_flags_touch_updated_at BEFORE UPDATE ON driver_listing_flags
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE driver_listing_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_listing_flags FORCE ROW LEVEL SECURITY;
CREATE POLICY driver_listing_flags_system ON driver_listing_flags FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON driver_listing_flags TO app_system;

-- Ops console reads (non-C3 columns, generated from the privacy map).
GRANT SELECT (areas, consent_at, consent_version, created_at, day_trips, display_name, id,
  key_rotated_at, languages, listed_at, photo_key, price_text, seats, show_ratings, status,
  updated_at, vehicle) ON driver_listings TO admin_reader;
CREATE POLICY driver_listings_admin_reader ON driver_listings FOR SELECT TO admin_reader
  USING (true);
GRANT SELECT (crews_fine, crews_loved, crews_not_again, crews_rated, listing_id, top_tags, trips,
  updated_at) ON driver_listing_stats TO admin_reader;
CREATE POLICY driver_listing_stats_admin_reader ON driver_listing_stats FOR SELECT
  TO admin_reader USING (true);
GRANT SELECT (claimed_at, created_at, crew_id, expires_at, id, inviter_id, listing_id, nudged_at,
  opened_at, provider_id, status, trip_id, updated_at) ON driver_invites TO admin_reader;
CREATE POLICY driver_invites_admin_reader ON driver_invites FOR SELECT TO admin_reader
  USING (true);
GRANT SELECT (created_at, crew_id, id, listing_id, provider_id, status, tags, trip_id, updated_at,
  user_id, verdict) ON driver_ratings TO admin_reader;
CREATE POLICY driver_ratings_admin_reader ON driver_ratings FOR SELECT TO admin_reader
  USING (true);
GRANT SELECT (author_id, created_at, crew_id, crew_size, id, listing_id, month, provider_id,
  status, text, trip_id, updated_at) ON driver_tips TO admin_reader;
CREATE POLICY driver_tips_admin_reader ON driver_tips FOR SELECT TO admin_reader USING (true);
GRANT SELECT (cleared_reason, created_at, evidence, id, kind, listing_id, status, updated_at)
  ON driver_listing_flags TO admin_reader;
CREATE POLICY driver_listing_flags_admin_reader ON driver_listing_flags FOR SELECT
  TO admin_reader USING (true);
