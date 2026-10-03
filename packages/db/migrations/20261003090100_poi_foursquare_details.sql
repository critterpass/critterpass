-- Foursquare Places API bookkeeping (docs/product-decisions.md D24). Foursquare's usage guidelines
-- let a Pay as You Go account keep `fsq_place_id` (and photo ids) indefinitely and no other
-- attribute at all, so place details are fetched live per place-detail open and never stored: these
-- tables hold only our own matching result and our own call counts, never Foursquare content.

-- poi_foursquare_ids: Authz "sys", RLS "S" (docs/data-model.md §3.13). The Foursquare id of a curated
-- POI that open data did not link (`pois.source_ids.fsq_os` stays the ingest key and is never
-- written here). A row with a null id records a search that found no confident match, so the
-- monthly match retries it only after its retry window.
CREATE TABLE poi_foursquare_ids (
  poi_id uuid PRIMARY KEY REFERENCES pois (id) ON DELETE CASCADE,
  fsq_place_id text,
  confidence double precision,
  matched_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT poi_foursquare_ids_match_check CHECK (
    (fsq_place_id IS NULL) = (confidence IS NULL)
    AND (confidence IS NULL OR (confidence > 0 AND confidence <= 1))
  )
);
ALTER TABLE poi_foursquare_ids ENABLE ROW LEVEL SECURITY;
ALTER TABLE poi_foursquare_ids FORCE ROW LEVEL SECURITY;
CREATE POLICY poi_foursquare_ids_system ON poi_foursquare_ids FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON poi_foursquare_ids TO app_system;

-- foursquare_api_usage: Authz "sys", RLS "S". Calls per UTC calendar month, shared by the api (place
-- details) and the worker (id matching); a call is only made after its row is counted under the
-- monthly cap, and `refused_calls` counts the calls the cap turned away.
CREATE TABLE foursquare_api_usage (
  month text PRIMARY KEY CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  details_calls integer NOT NULL DEFAULT 0 CHECK (details_calls >= 0),
  match_calls integer NOT NULL DEFAULT 0 CHECK (match_calls >= 0),
  refused_calls integer NOT NULL DEFAULT 0 CHECK (refused_calls >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE foursquare_api_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE foursquare_api_usage FORCE ROW LEVEL SECURITY;
CREATE POLICY foursquare_api_usage_system ON foursquare_api_usage FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON foursquare_api_usage TO app_system;

-- One counted call: +1 under the cap and true, or +1 refused and false. Atomic per row, so the api
-- and the worker never overshoot the cap together.
CREATE FUNCTION app.reserve_foursquare_call(p_kind text, p_cap integer, p_now timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_month text := to_char(p_now AT TIME ZONE 'UTC', 'YYYY-MM');
  v_ok boolean;
BEGIN
  IF p_kind NOT IN ('details', 'match') THEN
    RAISE EXCEPTION 'unknown foursquare call kind %', p_kind;
  END IF;
  INSERT INTO foursquare_api_usage (month) VALUES (v_month) ON CONFLICT (month) DO NOTHING;
  UPDATE foursquare_api_usage
     SET details_calls = details_calls + (p_kind = 'details')::int,
         match_calls = match_calls + (p_kind = 'match')::int,
         updated_at = now()
   WHERE month = v_month AND details_calls + match_calls < p_cap;
  v_ok := FOUND;
  IF NOT v_ok THEN
    UPDATE foursquare_api_usage
       SET refused_calls = refused_calls + 1, updated_at = now()
     WHERE month = v_month;
  END IF;
  RETURN v_ok;
END;
$$;
REVOKE ALL ON FUNCTION app.reserve_foursquare_call(text, integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reserve_foursquare_call(text, integer, timestamptz) TO app_system;
