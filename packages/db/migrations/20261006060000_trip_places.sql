-- The places a trip uses, one card per place (docs/data-model-sync-and-privacy.md §4): its stops,
-- live ideas, must-dos and swipe deck, copied from `pois` so the trip stream syncs them with one
-- bucket per trip and no lookup per place (a stream's per-place `IN (SELECT poi_id ...)` costs one
-- parameter result per place, which grows with the plan). The card columns carry `pois` names, so
-- the stream sends a row as `pois` and the phone keeps one place table.
-- RLS class T, C1: which places a trip uses reveals its plan, so `crew` rows reach the trip's
-- members and `organiser` rows (an organiser-only draft's stops) its organisers alone. Only the
-- system writes it, through `app.refresh_trip_places`.
CREATE TABLE trip_places (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  poi_id uuid NOT NULL REFERENCES pois (id),
  visibility text NOT NULL CHECK (visibility IN ('crew', 'organiser')),
  roles text[] NOT NULL CHECK (cardinality(roles) > 0),
  destination_id uuid NOT NULL REFERENCES destinations (id),
  name text NOT NULL,
  name_local text,
  category text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  address text,
  hours jsonb NOT NULL,
  hours_verified_at timestamptz,
  price_level integer,
  editorial jsonb NOT NULL,
  tags text[] NOT NULL,
  status text NOT NULL,
  curation text NOT NULL,
  pick_rank integer,
  visit_radius_m integer,
  timezone text,
  last_live_check_at timestamptz,
  poi_created_at timestamptz NOT NULL,
  poi_updated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trip_places_trip_poi_visibility_key UNIQUE (trip_id, poi_id, visibility)
);
CREATE INDEX trip_places_poi_idx ON trip_places (poi_id);
CREATE TRIGGER trip_places_touch_updated_at BEFORE UPDATE ON trip_places
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE trip_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_places FORCE ROW LEVEL SECURITY;
CREATE POLICY trip_places_select ON trip_places FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id) AND (visibility = 'crew' OR app.is_trip_organiser(trip_id)));
CREATE POLICY trip_places_system ON trip_places FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON trip_places TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON trip_places TO app_system;

-- Every place a trip references, by visibility and role. Stops come from the plan versions that are
-- not superseded (crew versions to the crew, organiser drafts to organisers); a stop hidden or
-- merged after it was added keeps its card, so the plan still draws where it was put.
CREATE FUNCTION app.trip_place_refs(p_trip_id uuid)
RETURNS TABLE (poi_id uuid, visibility text, roles text[])
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT r.poi_id, r.visibility, array_agg(DISTINCT r.role ORDER BY r.role)
  FROM (
    SELECT i.poi_id, v.visibility, 'stop' AS role
      FROM plan_items i
      JOIN itinerary_versions v ON v.id = i.version_id
     WHERE i.trip_id = p_trip_id AND v.trip_id = p_trip_id
       AND v.status <> 'superseded' AND i.poi_id IS NOT NULL
    UNION ALL
    SELECT poi_id, 'crew', 'idea' FROM trip_ideas
     WHERE trip_id = p_trip_id AND deleted_at IS NULL AND poi_id IS NOT NULL
    UNION ALL
    SELECT poi_id, 'crew', 'must_do' FROM must_dos
     WHERE trip_id = p_trip_id AND deleted_at IS NULL AND poi_id IS NOT NULL
    UNION ALL
    SELECT (card ->> 'poi_id')::uuid, 'crew', 'deck'
      FROM swipe_sessions s, jsonb_array_elements(s.deck) AS card
     WHERE s.trip_id = p_trip_id AND s.status <> 'ended' AND card ? 'poi_id'
  ) r
  JOIN pois p ON p.id = r.poi_id
  GROUP BY r.poi_id, r.visibility
$$;

-- Brings a trip's cards in line with what it references: new places in, changed cards updated
-- (only when something changed, so an unchanged refresh writes nothing to replicate), places no
-- longer referenced out. Returns how many rows it wrote or removed.
CREATE FUNCTION app.refresh_trip_places(p_trip_id uuid)
RETURNS integer
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  written integer;
  removed integer;
BEGIN
  INSERT INTO trip_places AS t (
    trip_id, poi_id, visibility, roles, destination_id, name, name_local, category, lat, lng,
    address, hours, hours_verified_at, price_level, editorial, tags, status, curation, pick_rank,
    visit_radius_m, timezone, last_live_check_at, poi_created_at, poi_updated_at
  )
  SELECT p_trip_id, p.id, r.visibility, r.roles, p.destination_id, p.name, p.name_local, p.category,
         p.lat, p.lng, p.address, p.hours, p.hours_verified_at, p.price_level, p.editorial, p.tags,
         p.status, p.curation, p.pick_rank, p.visit_radius_m, p.timezone, p.last_live_check_at,
         p.created_at, p.updated_at
    FROM app.trip_place_refs(p_trip_id) r
    JOIN pois p ON p.id = r.poi_id
  ON CONFLICT (trip_id, poi_id, visibility) DO UPDATE SET
    roles = EXCLUDED.roles, destination_id = EXCLUDED.destination_id, name = EXCLUDED.name,
    name_local = EXCLUDED.name_local, category = EXCLUDED.category, lat = EXCLUDED.lat,
    lng = EXCLUDED.lng, address = EXCLUDED.address, hours = EXCLUDED.hours,
    hours_verified_at = EXCLUDED.hours_verified_at, price_level = EXCLUDED.price_level,
    editorial = EXCLUDED.editorial, tags = EXCLUDED.tags, status = EXCLUDED.status,
    curation = EXCLUDED.curation, pick_rank = EXCLUDED.pick_rank,
    visit_radius_m = EXCLUDED.visit_radius_m, timezone = EXCLUDED.timezone,
    last_live_check_at = EXCLUDED.last_live_check_at, poi_created_at = EXCLUDED.poi_created_at,
    poi_updated_at = EXCLUDED.poi_updated_at
  WHERE ROW(
    t.roles, t.destination_id, t.name, t.name_local, t.category, t.lat, t.lng, t.address, t.hours,
    t.hours_verified_at, t.price_level, t.editorial, t.tags, t.status, t.curation, t.pick_rank,
    t.visit_radius_m, t.timezone, t.last_live_check_at, t.poi_created_at, t.poi_updated_at
  ) IS DISTINCT FROM ROW(
    EXCLUDED.roles, EXCLUDED.destination_id, EXCLUDED.name, EXCLUDED.name_local, EXCLUDED.category,
    EXCLUDED.lat, EXCLUDED.lng, EXCLUDED.address, EXCLUDED.hours, EXCLUDED.hours_verified_at,
    EXCLUDED.price_level, EXCLUDED.editorial, EXCLUDED.tags, EXCLUDED.status, EXCLUDED.curation,
    EXCLUDED.pick_rank, EXCLUDED.visit_radius_m, EXCLUDED.timezone, EXCLUDED.last_live_check_at,
    EXCLUDED.poi_created_at, EXCLUDED.poi_updated_at
  );
  GET DIAGNOSTICS written = ROW_COUNT;

  DELETE FROM trip_places t
   WHERE t.trip_id = p_trip_id
     AND NOT EXISTS (
       SELECT 1 FROM app.trip_place_refs(p_trip_id) r
        WHERE r.poi_id = t.poi_id AND r.visibility = t.visibility);
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN written + removed;
END
$$;
REVOKE ALL ON FUNCTION app.trip_place_refs(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.refresh_trip_places(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.trip_place_refs(uuid) TO app_system;
GRANT EXECUTE ON FUNCTION app.refresh_trip_places(uuid) TO app_system;

-- Backfill every trip that is not archived.
SELECT app.refresh_trip_places(id) FROM trips WHERE status <> 'archived';
