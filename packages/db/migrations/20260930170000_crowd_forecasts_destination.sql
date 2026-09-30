-- Crowd forecasts carry their POI's destination (docs/data-model.md §3.12), so the trip_pack sync
-- stream can select a destination's forecasts by that one key. Selecting them through the
-- destination's POI ids made PowerSync evaluate one parameter result per POI, which passes its
-- per-connection limit (1,000) for any real destination and fails the whole sync request.
--
-- Writers keep inserting by poi_id: a BEFORE trigger copies the POI's destination (the crowd
-- refresh job and every fixture stay unchanged).
ALTER TABLE crowd_forecasts ADD COLUMN destination_id uuid REFERENCES destinations (id);

UPDATE crowd_forecasts f
   SET destination_id = p.destination_id
  FROM pois p
 WHERE p.id = f.poi_id;

ALTER TABLE crowd_forecasts ALTER COLUMN destination_id SET NOT NULL;

CREATE INDEX crowd_forecasts_destination_idx ON crowd_forecasts (destination_id);

CREATE FUNCTION app.crowd_forecasts_set_destination() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  SELECT p.destination_id INTO NEW.destination_id FROM public.pois p WHERE p.id = NEW.poi_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER crowd_forecasts_set_destination
  BEFORE INSERT OR UPDATE OF poi_id ON crowd_forecasts
  FOR EACH ROW EXECUTE FUNCTION app.crowd_forecasts_set_destination();
