-- Editorial season curves and events, and curated hazard alerts (season is a hint, never a rule).
-- CHECK lists are copied from packages/domain/src/travel-data/types.ts.
--
-- Season rows are authored from cited public sources (`source`, `source_url`, `sourced_on`) and
-- reach clients only once a content reviewer approves them (`reviewed_at`): an unreviewed row is
-- invisible to app_user, so it is neither served nor synced. Writes go through the audited admin
-- command `upsert_season_editorial` and the `season.ingest` job (app_system).

CREATE TABLE season_months (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  destination_id uuid NOT NULL REFERENCES destinations (id),
  month smallint NOT NULL,
  crowd_index smallint NOT NULL,
  price_index smallint,
  price_index_source text NOT NULL DEFAULT 'editorial',
  highlight_tag text,
  colour_role text NOT NULL DEFAULT 'normal',
  source text NOT NULL,
  source_url text,
  sourced_on date NOT NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (destination_id, month)
);
ALTER TABLE season_months ADD CONSTRAINT season_months_month_check CHECK (month BETWEEN 1 AND 12);
ALTER TABLE season_months ADD CONSTRAINT season_months_index_check
  CHECK (crowd_index BETWEEN 0 AND 100 AND (price_index IS NULL OR price_index BETWEEN 0 AND 100));
ALTER TABLE season_months ADD CONSTRAINT season_months_price_index_source_check
  CHECK (price_index_source IN ('editorial', 'fares'));
ALTER TABLE season_months ADD CONSTRAINT season_months_colour_role_check
  CHECK (colour_role IN ('cheapest', 'peak', 'normal'));
ALTER TABLE season_months ADD CONSTRAINT season_months_source_check CHECK (length(trim(source)) > 0);
CREATE TRIGGER season_months_touch_updated_at BEFORE UPDATE ON season_months
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE season_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_months FORCE ROW LEVEL SECURITY;
CREATE POLICY season_months_select ON season_months FOR SELECT TO app_user
  USING (reviewed_at IS NOT NULL);
CREATE POLICY season_months_system ON season_months FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON season_months TO app_user;
GRANT SELECT, INSERT, UPDATE ON season_months TO app_system;

-- `key` is the editorial natural key (`cherry-blossom`, `gion-matsuri`), stable across yearly
-- forecast edits so an admin upsert updates the row instead of duplicating it.
CREATE TABLE season_events (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  destination_id uuid NOT NULL REFERENCES destinations (id),
  key text NOT NULL,
  kind text NOT NULL,
  name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  confidence text NOT NULL DEFAULT 'typical',
  source text NOT NULL,
  source_url text,
  sourced_on date NOT NULL,
  forecast_updated_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (destination_id, key)
);
ALTER TABLE season_events ADD CONSTRAINT season_events_kind_check
  CHECK (kind IN ('blossom', 'foliage', 'festival', 'ceremony', 'holiday', 'closure'));
ALTER TABLE season_events ADD CONSTRAINT season_events_confidence_check
  CHECK (confidence IN ('typical', 'forecast', 'confirmed'));
ALTER TABLE season_events ADD CONSTRAINT season_events_dates_check CHECK (ends_on >= starts_on);
ALTER TABLE season_events ADD CONSTRAINT season_events_source_check CHECK (length(trim(source)) > 0);
CREATE INDEX season_events_destination_starts_idx ON season_events (destination_id, starts_on);
CREATE TRIGGER season_events_touch_updated_at BEFORE UPDATE ON season_events
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE season_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_events FORCE ROW LEVEL SECURITY;
CREATE POLICY season_events_select ON season_events FOR SELECT TO app_user
  USING (reviewed_at IS NOT NULL);
CREATE POLICY season_events_system ON season_events FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON season_events TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON season_events TO app_system;

-- Current state per (destination, feed, subject): a volcano's alert level or a warning area's
-- highest active warning. Level is normalised 1 (normal/green) to 4 (warning/red); `level_label`
-- keeps the feed's wording. The refresh upserts in place and emits `hazard.changed` on a level move.
CREATE TABLE hazard_alerts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  destination_id uuid NOT NULL REFERENCES destinations (id),
  kind text NOT NULL,
  subject text NOT NULL,
  level smallint NOT NULL,
  level_label text NOT NULL,
  headline text NOT NULL,
  source text NOT NULL,
  source_url text NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz,
  fetched_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (destination_id, source, subject)
);
ALTER TABLE hazard_alerts ADD CONSTRAINT hazard_alerts_kind_check
  CHECK (kind IN ('volcano', 'weather_warning'));
ALTER TABLE hazard_alerts ADD CONSTRAINT hazard_alerts_source_check
  CHECK (source IN ('magma', 'imo', 'jma', 'gvp'));
ALTER TABLE hazard_alerts ADD CONSTRAINT hazard_alerts_level_check CHECK (level BETWEEN 1 AND 4);
CREATE TRIGGER hazard_alerts_touch_updated_at BEFORE UPDATE ON hazard_alerts
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE hazard_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hazard_alerts FORCE ROW LEVEL SECURITY;
CREATE POLICY hazard_alerts_select ON hazard_alerts FOR SELECT TO app_user USING (true);
CREATE POLICY hazard_alerts_system ON hazard_alerts FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON hazard_alerts TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON hazard_alerts TO app_system;

-- PowerSync publication (see *_fares_weather_crowds.sql for the rule this follows).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['season_months', 'season_events', 'hazard_alerts'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', t);
    END IF;
    EXECUTE format('GRANT SELECT ON %I TO powersync_repl', t);
  END LOOP;
END
$$;
