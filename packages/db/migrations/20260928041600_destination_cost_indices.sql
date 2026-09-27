-- Editorial cost indices per destination and stay type (per person per night for stays, per
-- person per day for food and fun), the ranges budget breakdowns and estimated shares are built
-- from while no stay quote exists. Authored from cited public sources (`source`, `source_url`,
-- `sourced_on`); a row reaches clients only once a content reviewer approves it (`reviewed_at`),
-- like the season curves. C0, catalogue stream; written by app_system only.
CREATE TABLE destination_cost_indices (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  destination_id uuid NOT NULL REFERENCES destinations (id),
  stay_type text NOT NULL,
  nightly_minor_low bigint NOT NULL,
  nightly_minor_high bigint NOT NULL,
  food_pp_day_minor bigint NOT NULL,
  fun_pp_day_minor bigint NOT NULL,
  currency text NOT NULL,
  source text NOT NULL,
  source_url text,
  sourced_on date NOT NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (destination_id, stay_type)
);
ALTER TABLE destination_cost_indices ADD CONSTRAINT destination_cost_indices_stay_type_check
  CHECK (stay_type ~ '^[a-z][a-z_]*$');
ALTER TABLE destination_cost_indices ADD CONSTRAINT destination_cost_indices_range_check
  CHECK (
    nightly_minor_low >= 0 AND nightly_minor_high >= nightly_minor_low
    AND food_pp_day_minor >= 0 AND fun_pp_day_minor >= 0
  );
ALTER TABLE destination_cost_indices ADD CONSTRAINT destination_cost_indices_currency_check
  CHECK (currency ~ '^[A-Z]{3}$');
ALTER TABLE destination_cost_indices ADD CONSTRAINT destination_cost_indices_source_check
  CHECK (length(trim(source)) > 0);
CREATE TRIGGER destination_cost_indices_touch_updated_at BEFORE UPDATE ON destination_cost_indices
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE destination_cost_indices ENABLE ROW LEVEL SECURITY;
ALTER TABLE destination_cost_indices FORCE ROW LEVEL SECURITY;
CREATE POLICY destination_cost_indices_select ON destination_cost_indices FOR SELECT TO app_user
  USING (reviewed_at IS NOT NULL);
CREATE POLICY destination_cost_indices_system ON destination_cost_indices FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON destination_cost_indices TO app_user;
GRANT SELECT, INSERT, UPDATE ON destination_cost_indices TO app_system;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND tablename = 'destination_cost_indices'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE destination_cost_indices;
  END IF;
  GRANT SELECT ON destination_cost_indices TO powersync_repl;
END
$$;
