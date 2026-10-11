-- The crew chat marks the moment a trip's balances come out square: when the Settled Tokek is
-- granted (one `stickers` row of kind `settled` per participant, all in one statement), one
-- `system` row `trip_settled` is posted in the trip's crew chat, `ref_id` the trip and `body` how
-- many people it settled. A trip is settled once, so the line is posted at most once per trip.
CREATE OR REPLACE FUNCTION app.post_trip_settled_line() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO messages (crew_id, trip_id, sender_kind, type, ref_kind, ref_id, body)
  SELECT g.crew_id, g.trip_id, 'system', 'system', 'trip_settled', g.trip_id, count(*)::text
    FROM granted g
   WHERE g.kind = 'settled' AND g.crew_id IS NOT NULL AND g.trip_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM messages m
        WHERE m.crew_id = g.crew_id AND m.type = 'system' AND m.ref_kind = 'trip_settled'
          AND m.ref_id = g.trip_id
     )
   GROUP BY g.crew_id, g.trip_id;
  RETURN NULL;
END
$$;
REVOKE EXECUTE ON FUNCTION app.post_trip_settled_line() FROM PUBLIC;

CREATE TRIGGER stickers_post_trip_settled_line
  AFTER INSERT ON stickers
  REFERENCING NEW TABLE AS granted
  FOR EACH STATEMENT EXECUTE FUNCTION app.post_trip_settled_line();
