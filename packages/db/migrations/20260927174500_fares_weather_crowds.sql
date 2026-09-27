-- Fares, frozen price quotes, weather/marine snapshots and crowd forecasts (docs/data-model.md §3.4
-- `price_quotes`, §3.12 `weather_snapshots`/`crowd_forecasts`, and the `fare_cells` table this
-- migration adds). CHECK lists are copied from packages/domain/src/travel-data/types.ts.
--
-- Every table here is written by app_system only (Authz "sys"): the nightly fare precompute, the
-- weather refresh and the crowd refresh jobs, and `freezeFareQuote` in the api. app_user reads the
-- C0 catalogue rows directly (RLS "R") and `price_quotes` only for trips it belongs to (RLS "T").

-- Frozen quotes a poll or budget pins; `trip_id` null = a destination-level quote anyone may read.
CREATE TABLE price_quotes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid REFERENCES trips (id),
  kind text NOT NULL,
  origin text,
  destination_id uuid REFERENCES destinations (id),
  dates daterange,
  amount_minor bigint NOT NULL,
  currency text NOT NULL,
  source text NOT NULL,
  fetched_at timestamptz NOT NULL,
  frozen_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE price_quotes ADD CONSTRAINT price_quotes_kind_check
  CHECK (kind IN ('flight', 'stay', 'activity', 'transfer'));
ALTER TABLE price_quotes ADD CONSTRAINT price_quotes_source_check
  CHECK (source IN ('travelpayouts', 'viator', 'user', 'estimate'));
ALTER TABLE price_quotes ADD CONSTRAINT price_quotes_currency_check CHECK (currency ~ '^[A-Z]{3}$');
ALTER TABLE price_quotes ADD CONSTRAINT price_quotes_amount_check CHECK (amount_minor >= 0);
CREATE INDEX price_quotes_trip_kind_idx ON price_quotes (trip_id, kind);
CREATE INDEX price_quotes_destination_idx ON price_quotes (destination_id);
CREATE TRIGGER price_quotes_touch_updated_at BEFORE UPDATE ON price_quotes
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE price_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_quotes FORCE ROW LEVEL SECURITY;
CREATE POLICY price_quotes_select ON price_quotes FOR SELECT TO app_user
  USING (trip_id IS NULL OR app.is_trip_member(trip_id));
CREATE POLICY price_quotes_system ON price_quotes FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON price_quotes TO app_user;
GRANT SELECT, INSERT, UPDATE ON price_quotes TO app_system;

-- One cell per (origin airport, destination airport, month): the cheapest round trip seen for that
-- month, the fastest direct/one-stop duration ("7H FROM SIN"), the cheapest fare per departure day,
-- and the last nightly observations for the 7-day drop check. `price_minor` null = no price has
-- ever been seen; `fetched_at` is when the current price was last confirmed, `checked_at` when the
-- supplier was last asked, so an empty answer ages the price into "no recent price" instead of
-- zeroing it. C0, served over HTTP only (not published, not in any sync stream).
CREATE TABLE fare_cells (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  origin_iata text NOT NULL,
  dest_iata text NOT NULL,
  destination_id uuid NOT NULL REFERENCES destinations (id),
  month date NOT NULL,
  depart_on date,
  return_on date,
  price_minor bigint,
  currency text NOT NULL,
  transfers smallint,
  duration_min integer,
  fastest_duration_min integer,
  days jsonb NOT NULL DEFAULT '[]',
  price_history jsonb NOT NULL DEFAULT '[]',
  found_at timestamptz,
  fetched_at timestamptz,
  checked_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (origin_iata, dest_iata, month)
);
ALTER TABLE fare_cells ADD CONSTRAINT fare_cells_iata_check
  CHECK (origin_iata ~ '^[A-Z]{3}$' AND dest_iata ~ '^[A-Z]{3}$' AND origin_iata <> dest_iata);
ALTER TABLE fare_cells ADD CONSTRAINT fare_cells_month_check CHECK (extract(day FROM month) = 1);
ALTER TABLE fare_cells ADD CONSTRAINT fare_cells_currency_check CHECK (currency ~ '^[A-Z]{3}$');
ALTER TABLE fare_cells ADD CONSTRAINT fare_cells_price_check
  CHECK (price_minor IS NULL OR (price_minor >= 0 AND fetched_at IS NOT NULL));
ALTER TABLE fare_cells ADD CONSTRAINT fare_cells_json_check
  CHECK (jsonb_typeof(days) = 'array' AND jsonb_typeof(price_history) = 'array');
CREATE INDEX fare_cells_destination_month_idx ON fare_cells (destination_id, month);
CREATE TRIGGER fare_cells_touch_updated_at BEFORE UPDATE ON fare_cells
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE fare_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE fare_cells FORCE ROW LEVEL SECURITY;
CREATE POLICY fare_cells_select ON fare_cells FOR SELECT TO app_user USING (true);
CREATE POLICY fare_cells_system ON fare_cells FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON fare_cells TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON fare_cells TO app_system;

-- Hourly forecast per (destination, point, local date): `point_key` is `centroid`, a summit, or a
-- 0.1° grid cell holding plan-item places, so a trip's points share one row per cell. `marine`
-- (the destination's coastal point, refreshed on its own cadence, `marine_fetched_at`) is set on
-- the centroid row only while a trip there has boat items. `checked_at` > `fetched_at` means the last refresh
-- failed and readers show the last snapshot as stale. 30-day retention on `date`.
CREATE TABLE weather_snapshots (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  destination_id uuid NOT NULL REFERENCES destinations (id),
  point_key text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  elevation_m integer,
  date date NOT NULL,
  hourly jsonb NOT NULL,
  marine jsonb,
  marine_fetched_at timestamptz,
  source text NOT NULL,
  fetched_at timestamptz NOT NULL,
  checked_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (destination_id, point_key, date, source)
);
ALTER TABLE weather_snapshots ADD CONSTRAINT weather_snapshots_source_check
  CHECK (source IN ('weatherapi'));
ALTER TABLE weather_snapshots ADD CONSTRAINT weather_snapshots_point_check
  CHECK (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180);
ALTER TABLE weather_snapshots ADD CONSTRAINT weather_snapshots_json_check
  CHECK (jsonb_typeof(hourly) = 'object' AND (marine IS NULL OR jsonb_typeof(marine) = 'object'));
CREATE INDEX weather_snapshots_date_idx ON weather_snapshots (date);
CREATE TRIGGER weather_snapshots_touch_updated_at BEFORE UPDATE ON weather_snapshots
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE weather_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY weather_snapshots_select ON weather_snapshots FOR SELECT TO app_user USING (true);
CREATE POLICY weather_snapshots_system ON weather_snapshots FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON weather_snapshots TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON weather_snapshots TO app_system;

-- Weekly crowd pattern per place and day of week (0 = Sunday), 24 hourly values 0–100. 90-day
-- retention on `fetched_at`.
CREATE TABLE crowd_forecasts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  poi_id uuid NOT NULL REFERENCES pois (id),
  dow smallint NOT NULL,
  hourly smallint[] NOT NULL,
  source text NOT NULL,
  fetched_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poi_id, dow)
);
ALTER TABLE crowd_forecasts ADD CONSTRAINT crowd_forecasts_dow_check CHECK (dow BETWEEN 0 AND 6);
ALTER TABLE crowd_forecasts ADD CONSTRAINT crowd_forecasts_hourly_check
  CHECK (cardinality(hourly) = 24 AND 0 <= ALL (hourly) AND 100 >= ALL (hourly));
ALTER TABLE crowd_forecasts ADD CONSTRAINT crowd_forecasts_source_check CHECK (source IN ('besttime'));
CREATE INDEX crowd_forecasts_fetched_at_idx ON crowd_forecasts (fetched_at);
CREATE TRIGGER crowd_forecasts_touch_updated_at BEFORE UPDATE ON crowd_forecasts
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE crowd_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crowd_forecasts FORCE ROW LEVEL SECURITY;
CREATE POLICY crowd_forecasts_select ON crowd_forecasts FOR SELECT TO app_user USING (true);
CREATE POLICY crowd_forecasts_system ON crowd_forecasts FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON crowd_forecasts TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON crowd_forecasts TO app_system;

-- The three travel-data events join the domain event types (packages/domain/src/events/catalogue.ts).
ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (
  'crew.member_joined', 'crew.member_left', 'crew.member_removed',
  'trip.created', 'trip.status_changed',
  'plan.version_created',
  'change_set.proposed', 'change_set.applied', 'change_set.reverted', 'change_set.rejected',
  'rsvp.changed',
  'auth.merged',
  'invite.opened', 'attribution.claimed',
  'guide_action.undone',
  'fare.dropped', 'forecast.changed', 'hazard.changed'
));

-- PowerSync publication (docs/code-standards.md §13), hand-copied from
-- packages/db/src/publication.ts#computePublicationAllowList; packages/db/test/publication.test.ts
-- cross-checks the two never drift. `fare_cells` stays out: it is served over HTTP only.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['price_quotes', 'weather_snapshots', 'crowd_forecasts'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', t);
    END IF;
    EXECUTE format('GRANT SELECT ON %I TO powersync_repl', t);
  END LOOP;
END
$$;
