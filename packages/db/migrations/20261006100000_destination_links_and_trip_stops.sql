-- A trip's areas (docs/data-model.md §3.3, §3.13): how one destination leads to another, the
-- stops of a trip with several cities, and the `area` coverage a day-trip area carries. Behind the
-- public config key `trip.areas` (off); with no rows every reader answers as before.

-- ---------------------------------------------------------------------------------------------
-- destination_links: how to get from one destination to another, one direction per row. A
-- `day_trip` leads from a city to an area the crew visits and comes back from the same day; an
-- `onward` link leads to the next city of a trip. Written by the destination brief from cited web
-- pages (an estimate, shown as one, with its sources) or by an editor; `release_id` names the
-- content release of an editorial row and is empty for a written one.
-- Authz "sys", RLS "R", privacy class C0: about places, never about who asked. Not published:
-- phones read links through the api (shared content is not synced).
CREATE TABLE destination_links (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  key text NOT NULL UNIQUE,
  from_destination_id uuid NOT NULL REFERENCES destinations (id) ON DELETE CASCADE,
  to_destination_id uuid NOT NULL REFERENCES destinations (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('day_trip', 'onward')),
  minutes integer NOT NULL CHECK (minutes BETWEEN 10 AND 1440),
  mode text NOT NULL CHECK (mode IN ('train', 'bus', 'car', 'boat', 'flight', 'tour')),
  day_length text CHECK (day_length IN ('half', 'full')),
  essential boolean,
  cost_pp_minor bigint CHECK (cost_pp_minor >= 0),
  cost_currency text CHECK (cost_currency ~ '^[A-Z]{3}$'),
  note text,
  i18n jsonb,
  position integer NOT NULL DEFAULT 0,
  origin text NOT NULL DEFAULT 'ai' CHECK (origin IN ('editorial', 'ai')),
  sources jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(sources) = 'array'),
  release_id uuid REFERENCES content_releases (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT destination_links_ends_key UNIQUE (from_destination_id, to_destination_id, kind),
  CONSTRAINT destination_links_ends_check CHECK (from_destination_id <> to_destination_id),
  CONSTRAINT destination_links_day_trip_length_check CHECK ((kind = 'day_trip') = (day_length IS NOT NULL)),
  CONSTRAINT destination_links_essential_check CHECK (essential IS NULL OR kind = 'day_trip'),
  CONSTRAINT destination_links_cost_check CHECK ((cost_pp_minor IS NULL) = (cost_currency IS NULL)),
  -- A written estimate is kept only with the pages it came from.
  CONSTRAINT destination_links_cited_check CHECK (origin = 'editorial' OR jsonb_array_length(sources) > 0)
);
CREATE INDEX destination_links_to_idx ON destination_links (to_destination_id);
CREATE TRIGGER destination_links_touch_updated_at BEFORE UPDATE ON destination_links
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE destination_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE destination_links FORCE ROW LEVEL SECURITY;
CREATE POLICY destination_links_select ON destination_links FOR SELECT TO app_user USING (true);
CREATE POLICY destination_links_system ON destination_links FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON destination_links TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON destination_links TO app_system;
GRANT SELECT (cost_currency, cost_pp_minor, created_at, day_length, essential, from_destination_id, i18n, id, key,
  kind, minutes, mode, note, origin, position, release_id, sources, to_destination_id, updated_at)
  ON destination_links TO admin_reader;

-- ---------------------------------------------------------------------------------------------
-- trip_stops: the cities of a trip in order, with the nights spent in each. Row 1 is the trip's
-- own destination; a trip with no rows has one stop, its destination. `crew_id` is the trip's,
-- written with the row, so the always-on crew stream filters on it without a lookup.
-- RLS class T, C1: the trip's members read it as they read the trip; only the system writes it.
-- No column names a person, so no merge or purge rule.
CREATE TABLE trip_stops (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  crew_id uuid NOT NULL REFERENCES crews (id),
  position integer NOT NULL CHECK (position BETWEEN 1 AND 6),
  destination_id uuid NOT NULL REFERENCES destinations (id),
  nights integer NOT NULL CHECK (nights BETWEEN 1 AND 365),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trip_stops_trip_position_key UNIQUE (trip_id, position)
);
CREATE INDEX trip_stops_crew_idx ON trip_stops (crew_id);
CREATE TRIGGER trip_stops_touch_updated_at BEFORE UPDATE ON trip_stops
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE trip_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_stops FORCE ROW LEVEL SECURITY;
CREATE POLICY trip_stops_select ON trip_stops FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY trip_stops_system ON trip_stops FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON trip_stops TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON trip_stops TO app_system;
GRANT SELECT (created_at, crew_id, destination_id, id, nights, position, trip_id, updated_at)
  ON trip_stops TO admin_reader;

-- A trip's route replicates to its crew on the always-on `crews` stream, beside the trip row.
-- `destination_links` stays out of the publication: phones read links through the api.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'powersync') AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'trip_stops'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE trip_stops;
  END IF;
END
$$;
GRANT SELECT ON trip_stops TO powersync_repl;

-- ---------------------------------------------------------------------------------------------
-- Closed lists widened in place: a day-trip area's coverage, the ways a link travels as a stored
-- leg (and the leg's source), and the event a change of the trip's areas appends.
CREATE OR REPLACE FUNCTION pg_temp.widen_in_check(tbl regclass, con text, col text, extra text[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  current_values text[];
  merged text;
BEGIN
  SELECT array_agg(m[1]) INTO current_values
    FROM pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') AS m
   WHERE c.conname = con AND c.conrelid = tbl;
  IF current_values IS NULL THEN
    RAISE EXCEPTION 'constraint % on % not found', con, tbl;
  END IF;
  SELECT string_agg(DISTINCT quote_literal(t), ', ') INTO merged
    FROM unnest(current_values || extra) AS t;
  EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', tbl, con);
  EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK (%I IN (%s))', tbl, con, col, merged);
END
$$;

SELECT pg_temp.widen_in_check('destinations', 'destinations_coverage_check', 'coverage',
  ARRAY['area']);
SELECT pg_temp.widen_in_check('plan_legs', 'plan_legs_mode_check', 'mode',
  ARRAY['train', 'bus', 'car', 'boat', 'flight', 'tour']);
SELECT pg_temp.widen_in_check('plan_legs', 'plan_legs_source_check', 'source', ARRAY['link']);
SELECT pg_temp.widen_in_check('domain_events', 'domain_events_type_check', 'type',
  ARRAY['trip.areas_changed']);

-- The switch for day trips and several stops: public so the app reads it, off until the planner
-- and the screens that use it ship.
INSERT INTO ops.ops_config (key, value, is_public) VALUES ('trip.areas', 'false'::jsonb, true)
ON CONFLICT (key) DO NOTHING;
