-- Switches place geometry from lat/lng + cube/earthdistance (a stand-in adopted when this Postgres
-- image had no PostGIS) to real PostGIS geography, now that PostGIS is confirmed available: PlanetScale
-- staging lists postgis 3.6.4 + postgis_topology in pg_available_extensions, and
-- infra/docker/postgres now installs postgresql-18-postgis-3 (matching 3.6.4) on the same pgvector
-- base image local/test Postgres already used. `lat`/`lng` stay as plain columns (synced clients read
-- plain numbers); `location` is a generated geography column derived from them, and is what
-- near-me ranking, reverse geocoding and geofence containment actually query against.

CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE pois ADD COLUMN location geography(Point, 4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) STORED;
CREATE INDEX pois_location_gist_idx ON pois USING gist (location);

ALTER TABLE cities ADD COLUMN location geography(Point, 4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) STORED;
CREATE INDEX cities_location_gist_idx ON cities USING gist (location);

-- Geofence authoring has no data yet (Overture division/locality seeding is a later pass), so the
-- type change is a straight `USING NULL` rather than a geometry conversion.
ALTER TABLE pois ALTER COLUMN geofence TYPE geography(Polygon, 4326) USING NULL;
COMMENT ON COLUMN pois.geofence IS 'Editorial-authored geofence for visit/spawn detection (P20, P40); no consumer yet.';

ALTER TABLE destinations ALTER COLUMN geofence TYPE geography(MultiPolygon, 4326) USING NULL;
COMMENT ON COLUMN destinations.geofence IS 'Multi-polygon geofence seeded from Overture locality/division polygons at ingest.';

-- The earthdistance-based spherical-distance index/extension are superseded by the PostGIS
-- geography + GiST index above; guarded drops so this stays safe to apply even if a given
-- environment's prior state differs slightly.
DROP INDEX IF EXISTS pois_geo_gist_idx;
DROP INDEX IF EXISTS cities_geo_gist_idx;
DROP EXTENSION IF EXISTS earthdistance;
DROP EXTENSION IF EXISTS cube;
