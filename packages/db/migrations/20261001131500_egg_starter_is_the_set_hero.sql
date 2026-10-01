-- The egg's starter is the destination set's hero: the guide's own critter (Tokek in Bali, Chà Vá
-- in Đà Nẵng), so the egg hatches into the trip's guide. It was the set's lowest-numbered critter,
-- which is the hero only while the hero happens to come first; Vietnam's set starts with the
-- Hà Nội turtle. The lowest-numbered critter stays the fallback for a set whose hero has no live
-- common form yet.
--
-- An egg that has not hatched carries no promise about what is inside it, so one granted before
-- the hero's form was published follows the current starter the next time it is looked at: when
-- eggs are granted again for the trip (a boarding, the trip moving) and when it hatches
-- (app.hatch_egg grants first). A hatched egg never changes.
CREATE OR REPLACE FUNCTION app.grant_egg(p_user uuid, p_trip uuid)
  RETURNS TABLE (egg_id uuid, created boolean)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
#variable_conflict use_column
DECLARE
  starter uuid;
  inserted uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM trip_participants
     WHERE trip_id = p_trip AND user_id = p_user
       AND (rsvp = 'in' OR (role = 'organiser' AND rsvp <> 'out'))
  ) THEN
    RETURN;
  END IF;
  SELECT f.id INTO starter
    FROM trips t
    JOIN destinations d ON d.id = t.destination_id
    JOIN critter_sets s ON s.id = d.critter_set_id OR s.destination_id = d.id
    JOIN critters c ON c.set_id = s.id
    JOIN critter_forms f ON f.critter_id = c.id AND f.rarity = 'common'
   WHERE t.id = p_trip AND app.is_live_release(f.release_id)
   ORDER BY (s.id = d.critter_set_id) DESC, (c.key = s.hero_critter_key) DESC, c.no, f.key
   LIMIT 1;
  SELECT e.id INTO inserted FROM eggs e WHERE e.user_id = p_user AND e.trip_id = p_trip;
  IF inserted IS NOT NULL THEN
    IF starter IS NOT NULL THEN
      UPDATE eggs e SET form_id = starter
       WHERE e.id = inserted AND e.hatched_at IS NULL AND e.form_id IS DISTINCT FROM starter;
    END IF;
    RETURN QUERY SELECT inserted, false;
    RETURN;
  END IF;
  IF starter IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO eggs (user_id, trip_id, form_id) VALUES (p_user, p_trip, starter)
  ON CONFLICT (user_id, trip_id) DO NOTHING
  RETURNING id INTO inserted;
  IF inserted IS NULL THEN
    SELECT e.id INTO inserted FROM eggs e WHERE e.user_id = p_user AND e.trip_id = p_trip;
    RETURN QUERY SELECT inserted, false;
    RETURN;
  END IF;
  UPDATE trip_participants SET egg_id = inserted WHERE trip_id = p_trip AND user_id = p_user;
  RETURN QUERY SELECT inserted, true;
END
$$;
REVOKE ALL ON FUNCTION app.grant_egg(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.grant_egg(uuid, uuid) TO app_system;

-- Eggs already granted and not yet hatched take the current starter now, so a phone that plays
-- the hatch before it hears back from the server already holds the right critter.
DO $$
DECLARE
  waiting record;
BEGIN
  FOR waiting IN SELECT user_id, trip_id FROM eggs WHERE hatched_at IS NULL LOOP
    PERFORM app.grant_egg(waiting.user_id, waiting.trip_id);
  END LOOP;
END
$$;
