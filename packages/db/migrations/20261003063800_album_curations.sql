-- The guide's album curation (docs/data-model.md §3.10, doc delta): one row per trip with the line
-- the guide wrote over its picks (from computed facts; the template's when the model's line said
-- more than the facts) and how many it picked. RLS class T, C1: the crew reads it on the trip
-- stream; only the curation job writes it.
CREATE TABLE album_curations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  note text NOT NULL CHECK (char_length(note) BETWEEN 1 AND 140),
  picks integer NOT NULL CHECK (picks >= 0),
  photos integer NOT NULL CHECK (photos >= 0),
  note_fallback boolean NOT NULL DEFAULT false,
  curated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT album_curations_trip_key UNIQUE (trip_id)
);
CREATE TRIGGER album_curations_touch_updated_at BEFORE UPDATE ON album_curations
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE album_curations ENABLE ROW LEVEL SECURITY;
ALTER TABLE album_curations FORCE ROW LEVEL SECURITY;
CREATE POLICY album_curations_select ON album_curations FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY album_curations_system ON album_curations FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON album_curations TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON album_curations TO app_system;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'powersync' AND tablename = 'album_curations'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE album_curations;
  END IF;
END
$$;
GRANT SELECT ON album_curations TO powersync_repl;
