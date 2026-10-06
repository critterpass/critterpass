-- The recommended places, one card per place (docs/data-model-sync-and-privacy.md §4): editorial or
-- machine-picked `pois` rows that are not hidden and not merged, with exactly the columns the
-- `trip_pack` and `explore` streams send. PowerSync keeps a current copy of every row of a table a
-- stream reads, whatever the stream's WHERE says, so streaming `FROM pois` stored the whole open-data
-- catalogue (ten million rows) in bucket storage to send a few thousand. The streams read this table
-- `AS pois` instead, so the phone's `pois` table and its readers stay as they are.
-- RLS class R, C0, like `pois`: any signed-in client reads it; only the trigger below writes it.
CREATE TABLE place_cards (
  id uuid PRIMARY KEY,
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
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX place_cards_destination_idx ON place_cards (destination_id);
ALTER TABLE place_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE place_cards FORCE ROW LEVEL SECURITY;
CREATE POLICY place_cards_select ON place_cards FOR SELECT TO app_user USING (true);
CREATE POLICY place_cards_system ON place_cards FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON place_cards TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON place_cards TO app_system;

-- Keeps a place's card in line with its `pois` row: written while the place is recommended, removed
-- once it is hidden, merged, unpicked or deleted. A card is rewritten only when a column it carries
-- changed (a touch of `updated_at` alone, as an ingest refresh does, writes nothing to replicate).
CREATE FUNCTION app.sync_place_card() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM place_cards WHERE id = OLD.id;
    RETURN NULL;
  END IF;
  IF NOT ((NEW.curation = 'editorial' OR NEW.pick_rank IS NOT NULL)
          AND NEW.status <> 'hidden' AND NEW.merged_into_id IS NULL) THEN
    DELETE FROM place_cards WHERE id = NEW.id;
    RETURN NULL;
  END IF;
  INSERT INTO place_cards AS c (
    id, destination_id, name, name_local, category, lat, lng, address, hours, hours_verified_at,
    price_level, editorial, tags, status, curation, pick_rank, visit_radius_m, timezone,
    last_live_check_at, created_at, updated_at
  ) VALUES (
    NEW.id, NEW.destination_id, NEW.name, NEW.name_local, NEW.category, NEW.lat, NEW.lng,
    NEW.address, NEW.hours, NEW.hours_verified_at, NEW.price_level, NEW.editorial, NEW.tags,
    NEW.status, NEW.curation, NEW.pick_rank, NEW.visit_radius_m, NEW.timezone,
    NEW.last_live_check_at, NEW.created_at, NEW.updated_at
  )
  ON CONFLICT (id) DO UPDATE SET
    destination_id = EXCLUDED.destination_id, name = EXCLUDED.name,
    name_local = EXCLUDED.name_local, category = EXCLUDED.category, lat = EXCLUDED.lat,
    lng = EXCLUDED.lng, address = EXCLUDED.address, hours = EXCLUDED.hours,
    hours_verified_at = EXCLUDED.hours_verified_at, price_level = EXCLUDED.price_level,
    editorial = EXCLUDED.editorial, tags = EXCLUDED.tags, status = EXCLUDED.status,
    curation = EXCLUDED.curation, pick_rank = EXCLUDED.pick_rank,
    visit_radius_m = EXCLUDED.visit_radius_m, timezone = EXCLUDED.timezone,
    last_live_check_at = EXCLUDED.last_live_check_at, created_at = EXCLUDED.created_at,
    updated_at = EXCLUDED.updated_at
  WHERE ROW(
    c.destination_id, c.name, c.name_local, c.category, c.lat, c.lng, c.address, c.hours,
    c.hours_verified_at, c.price_level, c.editorial, c.tags, c.status, c.curation, c.pick_rank,
    c.visit_radius_m, c.timezone, c.last_live_check_at, c.created_at
  ) IS DISTINCT FROM ROW(
    EXCLUDED.destination_id, EXCLUDED.name, EXCLUDED.name_local, EXCLUDED.category, EXCLUDED.lat,
    EXCLUDED.lng, EXCLUDED.address, EXCLUDED.hours, EXCLUDED.hours_verified_at,
    EXCLUDED.price_level, EXCLUDED.editorial, EXCLUDED.tags, EXCLUDED.status, EXCLUDED.curation,
    EXCLUDED.pick_rank, EXCLUDED.visit_radius_m, EXCLUDED.timezone, EXCLUDED.last_live_check_at,
    EXCLUDED.created_at
  );
  RETURN NULL;
END
$$;
REVOKE EXECUTE ON FUNCTION app.sync_place_card() FROM PUBLIC;

-- The WHEN clauses skip the function for the open-data rows that never were and never become
-- recommended, so a bulk import pays one comparison per row.
CREATE TRIGGER pois_place_card_insert AFTER INSERT ON pois
  FOR EACH ROW WHEN (NEW.curation = 'editorial' OR NEW.pick_rank IS NOT NULL)
  EXECUTE FUNCTION app.sync_place_card();
CREATE TRIGGER pois_place_card_update AFTER UPDATE ON pois
  FOR EACH ROW WHEN (OLD.curation = 'editorial' OR OLD.pick_rank IS NOT NULL
                     OR NEW.curation = 'editorial' OR NEW.pick_rank IS NOT NULL)
  EXECUTE FUNCTION app.sync_place_card();
CREATE TRIGGER pois_place_card_delete AFTER DELETE ON pois
  FOR EACH ROW WHEN (OLD.curation = 'editorial' OR OLD.pick_rank IS NOT NULL)
  EXECUTE FUNCTION app.sync_place_card();

-- Backfill: about eleven thousand cards on staging out of ten million places.
INSERT INTO place_cards (
  id, destination_id, name, name_local, category, lat, lng, address, hours, hours_verified_at,
  price_level, editorial, tags, status, curation, pick_rank, visit_radius_m, timezone,
  last_live_check_at, created_at, updated_at
)
SELECT id, destination_id, name, name_local, category, lat, lng, address, hours, hours_verified_at,
       price_level, editorial, tags, status, curation, pick_rank, visit_radius_m, timezone,
       last_live_check_at, created_at, updated_at
  FROM pois
 WHERE (curation = 'editorial' OR pick_rank IS NOT NULL)
   AND status <> 'hidden'
   AND merged_into_id IS NULL;

-- `place_cards` replicates to phones on `trip_pack` and `explore`, sent as `pois`; `pois` itself
-- leaves the publication, so replication never copies the open-data catalogue again.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'powersync' AND tablename = 'place_cards'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE place_cards;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'powersync' AND schemaname = 'public' AND tablename = 'pois'
  ) THEN
    ALTER PUBLICATION powersync DROP TABLE pois;
  END IF;
END
$$;
GRANT SELECT ON place_cards TO powersync_repl;
