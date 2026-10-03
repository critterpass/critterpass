-- Planning and places tables (docs/data-model.md §3.3, §3.13; docs/api-contracts-planning.md).
-- Every app_user grant is SELECT only: the planning commands write as app_system after their own
-- checks, and the background jobs write as app_system. Synced tables carry an `id` (plan_checks
-- syncs its trip_id as the id).

-- ---------------------------------------------------------------------------------------------
-- trip_ideas (C1, class T): places the crew saved for the trip but has not placed, with their own
-- display copy so Ideas works offline for any place. Visible to the trip's crew, as saves inside
-- the trip's destination already are on the place page.
CREATE TABLE trip_ideas (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  poi_id uuid REFERENCES pois (id),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  name_local text CHECK (name_local IS NULL OR char_length(name_local) <= 120),
  category text NOT NULL,
  lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  backer_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  sources text[] NOT NULL,
  source_url text CHECK (source_url IS NULL OR char_length(source_url) <= 2048),
  fit jsonb CHECK (fit IS NULL OR jsonb_typeof(fit) = 'object'),
  fit_version_id uuid REFERENCES itinerary_versions (id),
  created_by uuid REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
ALTER TABLE trip_ideas ADD CONSTRAINT trip_ideas_category_check CHECK (category IN (
  'temple_shrine', 'food', 'market', 'nature', 'beach', 'museum', 'nightlife', 'shopping',
  'transit', 'stay', 'health', 'other'));
ALTER TABLE trip_ideas ADD CONSTRAINT trip_ideas_sources_check CHECK (
  cardinality(sources) >= 1
  AND sources <@ ARRAY['save', 'link', 'swipe', 'search', 'map', 'pin', 'guide']::text[]);
-- One live idea per place per trip; a dropped pin (no poi_id) is always its own idea.
CREATE UNIQUE INDEX trip_ideas_trip_poi_key ON trip_ideas (trip_id, poi_id)
  WHERE poi_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX trip_ideas_trip_idx ON trip_ideas (trip_id);
CREATE INDEX trip_ideas_poi_idx ON trip_ideas (poi_id);
CREATE INDEX trip_ideas_fit_version_idx ON trip_ideas (fit_version_id);
CREATE INDEX trip_ideas_created_by_idx ON trip_ideas (created_by);
CREATE TRIGGER trip_ideas_touch_updated_at BEFORE UPDATE ON trip_ideas
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE trip_ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_ideas FORCE ROW LEVEL SECURITY;
CREATE POLICY trip_ideas_select ON trip_ideas FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY trip_ideas_system ON trip_ideas FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON trip_ideas TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON trip_ideas TO app_system;

-- ---------------------------------------------------------------------------------------------
-- place_hides (C2, class O): a place a person swiped away. A passive signal: its owner
-- alone ever reads it, on the `me` stream.
CREATE TABLE place_hides (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  poi_id uuid NOT NULL REFERENCES pois (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT place_hides_user_poi_key UNIQUE (user_id, poi_id)
);
CREATE INDEX place_hides_poi_idx ON place_hides (poi_id);
ALTER TABLE place_hides ENABLE ROW LEVEL SECURITY;
ALTER TABLE place_hides FORCE ROW LEVEL SECURITY;
CREATE POLICY place_hides_select_own ON place_hides FOR SELECT TO app_user
  USING (user_id = app.uid());
CREATE POLICY place_hides_system ON place_hides FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON place_hides TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON place_hides TO app_system;

-- ---------------------------------------------------------------------------------------------
-- place_stances (C1, class T): WANT IT / RATHER NOT on a place in a trip, with the person's own
-- words. An explicit public stance, like a named ballot: the crew sees who said it. Never
-- derived from a swipe "no" or a hidden place.
CREATE TABLE place_stances (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  poi_id uuid NOT NULL REFERENCES pois (id),
  user_id uuid NOT NULL REFERENCES users (id),
  stance text NOT NULL CHECK (stance IN ('want', 'rather_not')),
  note text CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 140),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT place_stances_trip_poi_user_key UNIQUE (trip_id, poi_id, user_id)
);
CREATE INDEX place_stances_poi_idx ON place_stances (poi_id);
CREATE INDEX place_stances_user_idx ON place_stances (user_id);
CREATE TRIGGER place_stances_touch_updated_at BEFORE UPDATE ON place_stances
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE place_stances ENABLE ROW LEVEL SECURITY;
ALTER TABLE place_stances FORCE ROW LEVEL SECURITY;
CREATE POLICY place_stances_select ON place_stances FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY place_stances_system ON place_stances FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON place_stances TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON place_stances TO app_system;

-- ---------------------------------------------------------------------------------------------
-- plan_legs (C1, class T + version visibility, like plan_items): travel between consecutive
-- stops of one plan version, the stay first and last. Only self-hosted routing or straight-line
-- estimates are stored, never a Navigation API result.
CREATE TABLE plan_legs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  version_id uuid NOT NULL REFERENCES itinerary_versions (id),
  day_id uuid NOT NULL REFERENCES plan_days (id),
  from_key text NOT NULL,
  to_key text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('walk', 'drive', 'ride', 'driver')),
  minutes integer NOT NULL CHECK (minutes >= 0),
  meters integer NOT NULL CHECK (meters >= 0),
  source text NOT NULL CHECK (source IN ('valhalla', 'straight_line')),
  approx boolean NOT NULL DEFAULT false,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_legs_version_pair_key UNIQUE (version_id, from_key, to_key),
  CONSTRAINT plan_legs_keys_check CHECK (
    (from_key = 'stay' OR from_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    AND (to_key = 'stay' OR to_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    AND from_key <> to_key)
);
CREATE INDEX plan_legs_trip_version_idx ON plan_legs (trip_id, version_id);
CREATE INDEX plan_legs_day_idx ON plan_legs (day_id);
CREATE TRIGGER plan_legs_touch_updated_at BEFORE UPDATE ON plan_legs
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE plan_legs ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_legs FORCE ROW LEVEL SECURITY;
CREATE POLICY plan_legs_select ON plan_legs FOR SELECT TO app_user
  USING (app.is_version_visible(version_id));
CREATE POLICY plan_legs_system ON plan_legs FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON plan_legs TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON plan_legs TO app_system;

-- ---------------------------------------------------------------------------------------------
-- plan_checks and plan_check_issues (C1, class T): the plan check's latest run per trip and what
-- it found, numbers and ids only. Issues follow their version's visibility.
CREATE TABLE plan_checks (
  trip_id uuid PRIMARY KEY REFERENCES trips (id),
  version_id uuid REFERENCES itinerary_versions (id),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  checked_at timestamptz,
  fix_count integer NOT NULL DEFAULT 0 CHECK (fix_count >= 0),
  know_count integer NOT NULL DEFAULT 0 CHECK (know_count >= 0),
  runs_on date,
  runs_today integer NOT NULL DEFAULT 0 CHECK (runs_today >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plan_checks_version_idx ON plan_checks (version_id);
CREATE TRIGGER plan_checks_touch_updated_at BEFORE UPDATE ON plan_checks
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE plan_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_checks FORCE ROW LEVEL SECURITY;
CREATE POLICY plan_checks_select ON plan_checks FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY plan_checks_system ON plan_checks FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON plan_checks TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON plan_checks TO app_system;

CREATE TABLE plan_check_issues (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  version_id uuid NOT NULL REFERENCES itinerary_versions (id),
  kind text NOT NULL CHECK (kind IN (
    'clash', 'closed', 'too_far', 'rain', 'crowds', 'pace', 'booking_note')),
  severity text NOT NULL CHECK (severity IN ('fix', 'know')),
  day_id uuid REFERENCES plan_days (id),
  stable_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  params jsonb NOT NULL CHECK (jsonb_typeof(params) = 'object'),
  fix jsonb CHECK (fix IS NULL OR jsonb_typeof(fix) = 'object'),
  rank integer NOT NULL CHECK (rank >= 0),
  fingerprint text NOT NULL CHECK (char_length(fingerprint) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plan_check_issues_trip_version_rank_idx ON plan_check_issues (trip_id, version_id, rank);
CREATE INDEX plan_check_issues_version_idx ON plan_check_issues (version_id);
CREATE INDEX plan_check_issues_day_idx ON plan_check_issues (day_id);
CREATE TRIGGER plan_check_issues_touch_updated_at BEFORE UPDATE ON plan_check_issues
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE plan_check_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_check_issues FORCE ROW LEVEL SECURITY;
CREATE POLICY plan_check_issues_select ON plan_check_issues FOR SELECT TO app_user
  USING (app.is_version_visible(version_id));
CREATE POLICY plan_check_issues_system ON plan_check_issues FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON plan_check_issues TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON plan_check_issues TO app_system;

-- ---------------------------------------------------------------------------------------------
-- member_asks (C2, two-party): an organiser's private "ASK {name} FIRST" about one member's saves.
-- Only the asker and the asked member read it, on their own `me` stream; never the trip stream,
-- never the crew chat.
CREATE TABLE member_asks (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  asked_by uuid NOT NULL REFERENCES users (id),
  member_id uuid NOT NULL REFERENCES users (id),
  idea_ids uuid[] NOT NULL CHECK (cardinality(idea_ids) BETWEEN 1 AND 3),
  ops jsonb NOT NULL CHECK (jsonb_typeof(ops) = 'array'),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'declined', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz,
  CONSTRAINT member_asks_two_people_check CHECK (asked_by <> member_id)
);
CREATE INDEX member_asks_member_status_idx ON member_asks (member_id, status);
CREATE INDEX member_asks_asked_by_idx ON member_asks (asked_by);
CREATE INDEX member_asks_trip_idx ON member_asks (trip_id);
CREATE TRIGGER member_asks_touch_updated_at BEFORE UPDATE ON member_asks
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE member_asks ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_asks FORCE ROW LEVEL SECURITY;
CREATE POLICY member_asks_select_parties ON member_asks FOR SELECT TO app_user
  USING ((asked_by = app.uid() OR member_id = app.uid()) AND app.is_trip_member(trip_id));
CREATE POLICY member_asks_system ON member_asks FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON member_asks TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON member_asks TO app_system;

-- ---------------------------------------------------------------------------------------------
-- route_cache (C4, class X): drive and walk minutes the server reuses across jobs, keyed by a hash
-- of rounded points, mode and hour. No app_user grant at all; 30-day retention on computed_at.
CREATE TABLE route_cache (
  key text PRIMARY KEY CHECK (char_length(key) BETWEEN 1 AND 128),
  minutes integer NOT NULL CHECK (minutes >= 0),
  meters integer NOT NULL CHECK (meters >= 0),
  source text NOT NULL CHECK (source IN ('valhalla', 'straight_line')),
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX route_cache_computed_at_idx ON route_cache (computed_at);
ALTER TABLE route_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_cache FORCE ROW LEVEL SECURITY;
CREATE POLICY route_cache_system ON route_cache FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON route_cache TO app_system;

-- ---------------------------------------------------------------------------------------------
-- climate_normals (C0, class R): the usual chance of rain by hour, per destination grid cell and
-- month, from sampled weather history. Read over HTTP by the fit routes; not synced.
CREATE TABLE climate_normals (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  destination_id uuid NOT NULL REFERENCES destinations (id),
  cell text NOT NULL CHECK (cell ~ '^-?[0-9]{1,2}\.[0-9],-?[0-9]{1,3}\.[0-9]$'),
  month smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
  rain_pct smallint[] NOT NULL
    CHECK (cardinality(rain_pct) = 24 AND 0 <= ALL (rain_pct) AND 100 >= ALL (rain_pct)),
  source text NOT NULL CHECK (source IN ('weatherapi_history')),
  years smallint NOT NULL CHECK (years >= 1),
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT climate_normals_cell_month_key UNIQUE (destination_id, cell, month)
);
CREATE TRIGGER climate_normals_touch_updated_at BEFORE UPDATE ON climate_normals
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE climate_normals ENABLE ROW LEVEL SECURITY;
ALTER TABLE climate_normals FORCE ROW LEVEL SECURITY;
CREATE POLICY climate_normals_select ON climate_normals FOR SELECT TO app_user USING (true);
CREATE POLICY climate_normals_system ON climate_normals FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON climate_normals TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON climate_normals TO app_system;

-- ---------------------------------------------------------------------------------------------
-- The guide's views (docs/data-model-sync-and-privacy.md §2), members of the trip in context only.
-- Ideas without the pasted link; stances with their notes (a note reaches a model only inside an
-- untrusted crew-message block); the plan check's issues on crew-visible versions.
CREATE VIEW llm.trip_ideas AS
SELECT i.id AS idea_id, i.poi_id, i.name, i.name_local, i.category, i.lat, i.lng, i.backer_ids,
       i.sources, i.fit
FROM trip_ideas i
WHERE i.trip_id = nullif(current_setting('app.trip', true), '')::uuid
  AND app.is_trip_member(i.trip_id)
  AND i.deleted_at IS NULL;
GRANT SELECT ON llm.trip_ideas TO guide_reader;

CREATE VIEW llm.place_stances AS
SELECT s.poi_id, s.user_id, s.stance, s.note, s.updated_at
FROM place_stances s
WHERE s.trip_id = nullif(current_setting('app.trip', true), '')::uuid
  AND app.is_trip_member(s.trip_id);
GRANT SELECT ON llm.place_stances TO guide_reader;

CREATE VIEW llm.plan_check_issues AS
SELECT c.version_id, c.kind, c.severity, c.day_id, c.stable_ids, c.params, c.rank
FROM plan_check_issues c
JOIN itinerary_versions iv ON iv.id = c.version_id
WHERE c.trip_id = nullif(current_setting('app.trip', true), '')::uuid
  AND app.is_trip_member(c.trip_id)
  AND iv.visibility = 'crew';
GRANT SELECT ON llm.plan_check_issues TO guide_reader;

-- ---------------------------------------------------------------------------------------------
-- PowerSync publication (docs/code-standards.md §13), hand-copied from
-- packages/db/src/publication.ts#computePublicationAllowList. route_cache (C4) and
-- climate_normals (served over HTTP) stay out.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'trip_ideas', 'place_hides', 'place_stances', 'plan_legs', 'plan_checks', 'plan_check_issues',
    'member_asks'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', t);
    END IF;
    EXECUTE format('GRANT SELECT ON %I TO powersync_repl', t);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------------------------
-- Planning config defaults (packages/domain/src/planning/config.ts). Seeded once, never
-- overwritten, so a switch the founder flipped stays flipped.
INSERT INTO ops.ops_config (key, value, is_public) VALUES
  ('planning.redesign', 'false'::jsonb, true),
  ('plan.hub', '"map"'::jsonb, true),
  ('plan.check.max_runs_per_trip_day', '96'::jsonb, false),
  ('plan.check.thresholds', '{"too_far_day_min": 180, "too_far_leg_min": 90, "rain_pct": 50, "normal_rain_pct": 40, "busy_level": 70, "pace_stops_per_9h": 6}'::jsonb, false),
  ('routing.walk_max_m', '1200'::jsonb, false),
  ('fair_use.search_parse_per_day', '100'::jsonb, false),
  ('fair_use.link_import_per_day', '30'::jsonb, false),
  ('fair_use.place_compromise_per_day', '20'::jsonb, false),
  ('imports.platforms', '["tiktok", "youtube", "instagram", "apple_maps", "google_maps"]'::jsonb, true)
ON CONFLICT (key) DO NOTHING;
