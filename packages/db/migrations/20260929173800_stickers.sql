-- Stickers (docs/data-model.md §3.9): rewards that are not critters and never enter the dex. The
-- Settled Tokek (`settled`) goes to every participant of a trip once its last payment clears, all
-- with the same `granted_at`; one per member per trip, whoever's confirm gets there first.

CREATE TABLE stickers (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid REFERENCES users (id),
  crew_id uuid REFERENCES crews (id),
  trip_id uuid REFERENCES trips (id),
  kind text NOT NULL CHECK (kind IN ('settled', 'crew_level', 'special')),
  granted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR crew_id IS NOT NULL),
  CHECK (kind <> 'settled' OR (user_id IS NOT NULL AND trip_id IS NOT NULL AND crew_id IS NOT NULL))
);
CREATE UNIQUE INDEX stickers_settled_once_uk ON stickers (user_id, trip_id) WHERE kind = 'settled';
CREATE INDEX stickers_user_id_idx ON stickers (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX stickers_crew_id_idx ON stickers (crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX stickers_trip_id_idx ON stickers (trip_id) WHERE trip_id IS NOT NULL;

-- RLS: a member reads their own stickers and the crew-wide ones of crews they are in. Granted by
-- the server only.
ALTER TABLE stickers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stickers FORCE ROW LEVEL SECURITY;
CREATE POLICY stickers_select ON stickers FOR SELECT TO app_user
  USING (user_id = app.uid() OR (user_id IS NULL AND app.is_crew_member(crew_id)));
CREATE POLICY stickers_system ON stickers FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON stickers TO app_user;
GRANT SELECT, INSERT ON stickers TO app_system;
GRANT SELECT (id, user_id, crew_id, trip_id, kind, granted_at, created_at) ON stickers TO admin_reader;
CREATE POLICY stickers_admin_reader ON stickers FOR SELECT TO admin_reader USING (true);

-- PowerSync publication (docs/code-standards.md §13), hand-copied from
-- packages/db/src/publication.ts#computePublicationAllowList.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'stickers'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE stickers;
  END IF;
END
$$;
GRANT SELECT ON stickers TO powersync_repl;
