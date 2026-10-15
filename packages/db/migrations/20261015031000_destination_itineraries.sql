-- Destination itineraries: how the itinerary pages researchers read lay out a first visit to a
-- destination, loaded by the curated places loader after that destination's places and read by
-- the draft planner (`destinationItinerary` in @cp/db).
--
-- destination_itineraries: Authz "sys", RLS "R", privacy class C0. One row per destination.
-- `ideal_days_min`/`ideal_days_max`: how long the pages say a first visit takes.
-- `areas` [{name, character: {en, vi}, places: [{name, poi_id?}]}]: the destination's areas and the
-- curated places in each. `days` [{day, theme: {en, vi}, areas: [name], stops: [{name, poi_id?}],
-- source_count}]: the consensus days in visiting order, `source_count` the pages that group the day
-- that way. A place carries `poi_id` when the curated places loader matched it to one of our rows,
-- else only its name. `day_trips` [{name, travel_minutes, why: {en, vi}}]. `tips` {en: [], vi: []}:
-- city tips. `best_months`: when to go, in words. `sources` [{url, title, kind, lang?, days?}]: the
-- itinerary pages read. No user data: the row is about a destination. Not synced.
CREATE TABLE destination_itineraries (
  destination_id uuid PRIMARY KEY REFERENCES destinations (id) ON DELETE CASCADE,
  ideal_days_min smallint NOT NULL CHECK (ideal_days_min BETWEEN 1 AND 10),
  ideal_days_max smallint NOT NULL CHECK (ideal_days_max BETWEEN 1 AND 10),
  areas jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(areas) = 'array'),
  days jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(days) = 'array'),
  day_trips jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(day_trips) = 'array'),
  tips jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(tips) = 'object'),
  best_months text CHECK (char_length(best_months) <= 120),
  sources jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(sources) = 'array'),
  loaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT destination_itineraries_days_order CHECK (ideal_days_min <= ideal_days_max)
);
CREATE TRIGGER destination_itineraries_touch_updated_at BEFORE UPDATE ON destination_itineraries
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE destination_itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE destination_itineraries FORCE ROW LEVEL SECURITY;
CREATE POLICY destination_itineraries_select ON destination_itineraries FOR SELECT TO app_user
  USING (true);
CREATE POLICY destination_itineraries_system ON destination_itineraries FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON destination_itineraries TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON destination_itineraries TO app_system;
