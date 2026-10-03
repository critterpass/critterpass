-- OpenStreetMap places and opening hours, and live Foursquare search (docs/product-decisions.md D25).
--
-- `pois.source_ids.osm` is the OpenStreetMap element a POI came from or was matched to (`n<id>`,
-- `w<id>`, `r<id>`). Like the other source keys it is stored once, so an ingest rerun updates the
-- row it made. `pois.hours_source` records where stored hours came from: `osm` (an element's
-- `opening_hours`, ODbL), `editorial` (a content-factory overlay) or `research` (the hours
-- research). Foursquare hours are never stored (its terms allow keeping only the place id), so it
-- is not a value here. Existing hours keep a null source. Both columns are covered by the table's
-- RLS, grants and privacy class (C0); the PowerSync place streams list their columns explicitly,
-- so they stay server-side.
CREATE UNIQUE INDEX pois_source_osm_uidx ON pois (((source_ids ->> 'osm'))) WHERE source_ids ? 'osm';

ALTER TABLE pois ADD COLUMN hours_source text
  CONSTRAINT pois_hours_source_check CHECK (hours_source IN ('osm', 'editorial', 'research'));

-- Live place search (`GET /v1/places/search/live`) is a third kind of counted call under the same
-- monthly cap as place details and id matching.
ALTER TABLE foursquare_api_usage
  ADD COLUMN search_calls integer NOT NULL DEFAULT 0 CHECK (search_calls >= 0);

CREATE OR REPLACE FUNCTION app.reserve_foursquare_call(p_kind text, p_cap integer, p_now timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_month text := to_char(p_now AT TIME ZONE 'UTC', 'YYYY-MM');
  v_ok boolean;
BEGIN
  IF p_kind NOT IN ('details', 'match', 'search') THEN
    RAISE EXCEPTION 'unknown foursquare call kind %', p_kind;
  END IF;
  INSERT INTO foursquare_api_usage (month) VALUES (v_month) ON CONFLICT (month) DO NOTHING;
  UPDATE foursquare_api_usage
     SET details_calls = details_calls + (p_kind = 'details')::int,
         match_calls = match_calls + (p_kind = 'match')::int,
         search_calls = search_calls + (p_kind = 'search')::int,
         updated_at = now()
   WHERE month = v_month AND details_calls + match_calls + search_calls < p_cap;
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
