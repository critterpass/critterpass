-- `trip_places` replicates to phones on the trip streams (crew rows on `trip`, organiser rows on
-- `trip_draft`), sent as `pois` cards.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'powersync' AND tablename = 'trip_places'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE trip_places;
  END IF;
END
$$;
GRANT SELECT ON trip_places TO powersync_repl;
