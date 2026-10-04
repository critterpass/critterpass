-- Address search (`GET /v1/geocode`) falls back to Mapbox Geocoding for street addresses, and those
-- calls run under a monthly cap of their own.
--
-- mapbox_geocode_usage: Authz "sys", RLS "S", privacy class C0. Calls per UTC calendar month; a call
-- is only made after its row is counted under the cap, and `refused_calls` counts the lookups the
-- cap turned away (answered from our own places only). Server bookkeeping: never synced.
CREATE TABLE mapbox_geocode_usage (
  month text PRIMARY KEY CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  calls integer NOT NULL DEFAULT 0 CHECK (calls >= 0),
  refused_calls integer NOT NULL DEFAULT 0 CHECK (refused_calls >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE mapbox_geocode_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE mapbox_geocode_usage FORCE ROW LEVEL SECURITY;
CREATE POLICY mapbox_geocode_usage_system ON mapbox_geocode_usage FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON mapbox_geocode_usage TO app_system;

-- One counted call: +1 under the cap and true, or +1 refused and false. Atomic per row, so
-- concurrent lookups never overshoot the cap together.
CREATE FUNCTION app.reserve_mapbox_geocode_call(p_cap integer, p_now timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_month text := to_char(p_now AT TIME ZONE 'UTC', 'YYYY-MM');
  v_ok boolean;
BEGIN
  INSERT INTO mapbox_geocode_usage (month) VALUES (v_month) ON CONFLICT (month) DO NOTHING;
  UPDATE mapbox_geocode_usage
     SET calls = calls + 1, updated_at = now()
   WHERE month = v_month AND calls < p_cap;
  v_ok := FOUND;
  IF NOT v_ok THEN
    UPDATE mapbox_geocode_usage
       SET refused_calls = refused_calls + 1, updated_at = now()
     WHERE month = v_month;
  END IF;
  RETURN v_ok;
END;
$$;
REVOKE ALL ON FUNCTION app.reserve_mapbox_geocode_call(integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reserve_mapbox_geocode_call(integer, timestamptz) TO app_system;
