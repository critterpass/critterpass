-- City index for "somewhere else" search and home-airport lookups (docs/data-model.md §3.13, doc
-- delta). Overture divisions/localities; not a PowerSync stream
-- (packages/db/src/publication.ts#PUBLISHABLE_CLASS_EXCEPTIONS), served over HTTP only.

CREATE TABLE cities (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  name text NOT NULL,
  country text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  population integer,
  iata_nearby text[] NOT NULL DEFAULT '{}',
  -- Overture division/locality GERS id; null for a hand-seeded row. The idempotent-ingest key.
  source_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE cities ADD CONSTRAINT cities_lat_check CHECK (lat BETWEEN -90 AND 90);
ALTER TABLE cities ADD CONSTRAINT cities_lng_check CHECK (lng BETWEEN -180 AND 180);
ALTER TABLE cities ADD CONSTRAINT cities_population_check CHECK (population IS NULL OR population >= 0);

CREATE UNIQUE INDEX cities_source_id_uidx ON cities (source_id) WHERE source_id IS NOT NULL;
CREATE INDEX cities_name_trgm_idx ON cities USING gin (name gin_trgm_ops);
CREATE INDEX cities_geo_gist_idx ON cities USING gist (ll_to_earth(lat, lng));

CREATE TRIGGER cities_touch_updated_at BEFORE UPDATE ON cities
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE cities FORCE ROW LEVEL SECURITY;

-- Authz "adm / content pipeline", RLS "R": class C0, read-all authenticated, not synced (served over
-- HTTP instead of a PowerSync stream).
CREATE POLICY cities_select ON cities FOR SELECT TO app_user USING (true);
CREATE POLICY cities_system ON cities FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON cities TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON cities TO app_system;
