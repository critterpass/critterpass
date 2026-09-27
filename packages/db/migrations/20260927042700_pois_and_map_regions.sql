-- Curated POI catalogue and map region manifests (docs/data-model.md §3.13). Typed mirror:
-- packages/db/src/schema/places.ts.
--
-- Geo representation note: docs/data-model.md spells `pois.geo` as `geography(Point)` and
-- `pois.geofence`/`destinations.geofence` as `geography(Polygon)`/`geography(MultiPolygon)`, which
-- assumes PostGIS. This Postgres image (`pgvector/pgvector:0.8.6-pg18-trixie`, the same one local
-- compose, Testcontainers and the platform database-latency spike all check) has no PostGIS
-- extension at all (verified against `pg_available_extensions` — it is not merely uninstalled, the
-- package is not present), and `infra/docker/postgres/**` is outside this migration's ownership so
-- it cannot be added here. `cube`/`earthdistance` (Postgres contrib, confirmed available) give the
-- same GIST-indexed spherical distance search over plain `lat`/`lng double precision` columns
-- without an image change; `polygon`/`polygon[]` (core Postgres, no extension needed) stand in for
-- Polygon/MultiPolygon. Doc delta recorded in docs/data-model.md §3.13.

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS cube;
CREATE EXTENSION IF NOT EXISTS earthdistance;

-- unaccent() is only STABLE (it depends on the `unaccent` text search dictionary catalog object),
-- so Postgres refuses it inside a generated column or an index expression, both of which require
-- IMMUTABLE. Wrapping it in a SQL function we assert IMMUTABLE is the standard workaround (the
-- dictionary is never changed at runtime in this project) and lets `pois.fts` below be a normal
-- generated column instead of a trigger-maintained one.
CREATE OR REPLACE FUNCTION app.unaccent_immutable(input text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public AS $$
  SELECT public.unaccent('public.unaccent'::regdictionary, coalesce(input, ''))
$$;
REVOKE EXECUTE ON FUNCTION app.unaccent_immutable(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.unaccent_immutable(text) TO app_user, app_system;

-- The generic `array_to_string(anyarray, text)` is only STABLE too (verified against
-- `pg_proc.provolatile`: its polymorphism over `anyarray` keeps Postgres from marking it
-- IMMUTABLE), so `pois.tags` needs the same immutable-wrapper treatment, narrowed to `text[]`
-- specifically (no polymorphism left, so the IMMUTABLE label is not just trusted but actually true).
CREATE OR REPLACE FUNCTION app.text_array_to_string_immutable(arr text[], sep text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT array_to_string(arr, sep)
$$;
REVOKE EXECUTE ON FUNCTION app.text_array_to_string_immutable(text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.text_array_to_string_immutable(text[], text) TO app_user, app_system;

CREATE TABLE pois (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  destination_id uuid NOT NULL REFERENCES destinations (id),
  name text NOT NULL,
  name_local text,
  category text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  address text,
  hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Required before the guide may quote hours verbatim (docs/api-contracts.md §6 `place_details`
  -- grounding rule).
  hours_verified_at timestamptz,
  price_level integer,
  -- {fsq_os, overture, editorial} provenance ids (docs/data-model.md §3.13); also the conflation
  -- keys the two partial unique indexes below key an idempotent ingest upsert on.
  source_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Content-factory overlay: tips, licensed photos, must-see flag (packages/domain/src/places/editorial.ts).
  editorial jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags text[] NOT NULL DEFAULT '{}',
  fts tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', app.unaccent_immutable(name)), 'A') ||
    setweight(to_tsvector('simple', app.unaccent_immutable(coalesce(name_local, ''))), 'A') ||
    setweight(to_tsvector('simple', app.unaccent_immutable(app.text_array_to_string_immutable(tags, ' '))), 'B') ||
    setweight(to_tsvector('simple', app.unaccent_immutable(coalesce(address, ''))), 'C')
  ) STORED,
  status text NOT NULL DEFAULT 'active',
  -- 'auto' = conflated FSQ OS + Overture only (the 55 guest-guide places); 'editorial' = one of the 6
  -- guide destinations, reviewed by the content factory.
  curation text NOT NULL DEFAULT 'auto',
  -- Conflation/dedup redirect: a merged POI keeps existing so plan items referencing it never dangle;
  -- readers follow this to the surviving row.
  merged_into_id uuid REFERENCES pois (id),
  -- Editorial-authored geofence for future visit/spawn detection (no consumer yet); polygon stands
  -- in for PostGIS geography(Polygon) per the file header note.
  geofence polygon,
  visit_radius_m integer,
  -- Per-POI IANA zone override for the rare place that sits across a tz boundary from its
  -- destination; hours are otherwise evaluated in the destination's own tz.
  timezone text,
  last_live_check_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pois ADD CONSTRAINT pois_category_check CHECK (category IN (
  'temple_shrine', 'food', 'market', 'nature', 'beach', 'museum', 'nightlife', 'shopping',
  'transit', 'stay', 'health', 'other'
));
ALTER TABLE pois ADD CONSTRAINT pois_status_check CHECK (status IN ('active', 'closed', 'hidden'));
ALTER TABLE pois ADD CONSTRAINT pois_curation_check CHECK (curation IN ('auto', 'editorial'));
ALTER TABLE pois ADD CONSTRAINT pois_price_level_check CHECK (price_level IS NULL OR price_level BETWEEN 1 AND 4);
ALTER TABLE pois ADD CONSTRAINT pois_visit_radius_m_check CHECK (visit_radius_m IS NULL OR visit_radius_m > 0);
ALTER TABLE pois ADD CONSTRAINT pois_timezone_check CHECK (timezone IS NULL OR app.valid_tz(timezone));
ALTER TABLE pois ADD CONSTRAINT pois_merged_into_not_self_check CHECK (merged_into_id IS NULL OR merged_into_id <> id);
ALTER TABLE pois ADD CONSTRAINT pois_lat_check CHECK (lat BETWEEN -90 AND 90);
ALTER TABLE pois ADD CONSTRAINT pois_lng_check CHECK (lng BETWEEN -180 AND 180);

CREATE INDEX pois_destination_id_idx ON pois (destination_id);
CREATE INDEX pois_status_idx ON pois (status) WHERE status = 'active';
-- GiST-indexed spherical distance search (docs/data-model.md §3.13 "GIST geo"); canonical
-- earthdistance usage per the Postgres contrib docs: `earth_box(ll_to_earth($1,$2), $radius) @>
-- ll_to_earth(lat,lng)` to pre-filter, `ORDER BY ll_to_earth(lat,lng) <-> ll_to_earth($1,$2)` for KNN.
CREATE INDEX pois_geo_gist_idx ON pois USING gist (ll_to_earth(lat, lng));
CREATE INDEX pois_fts_idx ON pois USING gin (fts);
CREATE INDEX pois_name_trgm_idx ON pois USING gin (name gin_trgm_ops);
-- Idempotent-ingest conflation keys: a monthly rerun must create no new ids.
CREATE UNIQUE INDEX pois_source_fsq_os_uidx ON pois (((source_ids ->> 'fsq_os'))) WHERE source_ids ? 'fsq_os';
CREATE UNIQUE INDEX pois_source_overture_uidx ON pois (((source_ids ->> 'overture'))) WHERE source_ids ? 'overture';

CREATE TRIGGER pois_touch_updated_at BEFORE UPDATE ON pois
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE pois ENABLE ROW LEVEL SECURITY;
ALTER TABLE pois FORCE ROW LEVEL SECURITY;

-- Authz "adm / content pipeline" (docs/data-model.md §3.13), RLS "R": any authenticated app_user
-- reads the whole active catalogue; only app_system (ingest job, and the future admin console's
-- upsert_poi handler) writes, matching the destinations/guides convention.
CREATE POLICY pois_select ON pois FOR SELECT TO app_user USING (true);
CREATE POLICY pois_system ON pois FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON pois TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON pois TO app_system;

-- poi_embeddings: Authz "sys", RLS "S" (docs/data-model.md §3.13) — server-only ranking, no
-- app_user grant at all; packages/db/src/publication.ts#PUBLISHABLE_CLASS_EXCEPTIONS keeps it out of
-- the powersync publication despite its C0 class.
CREATE TABLE poi_embeddings (
  poi_id uuid PRIMARY KEY REFERENCES pois (id) ON DELETE CASCADE,
  model text NOT NULL,
  embedding vector(1024) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX poi_embeddings_hnsw_idx ON poi_embeddings USING hnsw (embedding vector_cosine_ops);
CREATE TRIGGER poi_embeddings_touch_updated_at BEFORE UPDATE ON poi_embeddings
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE poi_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE poi_embeddings FORCE ROW LEVEL SECURITY;
CREATE POLICY poi_embeddings_system ON poi_embeddings FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON poi_embeddings TO app_system;

-- poi_live_checks: Authz "sys", RLS "R" (docs/data-model.md §3.13) — Foursquare live-check flags
-- only, never raw supplier content (docs/code-standards.md §16). Excluded from the publication
-- (Stream "—" in the docs) via PUBLISHABLE_CLASS_EXCEPTIONS even though app_user may read it.
CREATE TABLE poi_live_checks (
  poi_id uuid PRIMARY KEY REFERENCES pois (id) ON DELETE CASCADE,
  is_open_now boolean,
  closed_permanently boolean NOT NULL DEFAULT false,
  checked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE poi_live_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE poi_live_checks FORCE ROW LEVEL SECURITY;
CREATE POLICY poi_live_checks_select ON poi_live_checks FOR SELECT TO app_user USING (true);
CREATE POLICY poi_live_checks_system ON poi_live_checks FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON poi_live_checks TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON poi_live_checks TO app_system;

-- map_regions: Authz "adm", RLS "R" (docs/data-model.md §3.13); one row per destination/version so a
-- tiles re-upload never clobbers the manifest a client mid-download is still reading.
CREATE TABLE map_regions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  destination_id uuid NOT NULL REFERENCES destinations (id),
  pmtiles_key text NOT NULL,
  bytes bigint NOT NULL,
  version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (destination_id, version)
);
CREATE INDEX map_regions_destination_id_idx ON map_regions (destination_id);
CREATE TRIGGER map_regions_touch_updated_at BEFORE UPDATE ON map_regions
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE map_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE map_regions FORCE ROW LEVEL SECURITY;
CREATE POLICY map_regions_select ON map_regions FOR SELECT TO app_user USING (true);
CREATE POLICY map_regions_system ON map_regions FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON map_regions TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON map_regions TO app_system;

-- Place-level geofences seeded from Overture locality/division polygons at ingest, reviewed by the
-- content factory. Expand column on an existing table this migration does not otherwise own
-- (packages/db/src/schema/trips.ts stays out of this file's ownership; its Drizzle mirror picking up
-- this column is a follow-up for whoever next touches that file).
ALTER TABLE destinations ADD COLUMN geofence polygon[];
COMMENT ON COLUMN destinations.geofence IS 'Multi-ring geofence (array of polygon rings; PostGIS MultiPolygon is unavailable on this Postgres image) seeded from Overture locality/division polygons at ingest.';

-- Streams: pois/map_regions carry trip_pack + explore sync streams, so this migration adds them to
-- the powersync publication here; the actual infra/powersync/streams/places.yaml stream file is a
-- separate, later piece of work owned by whichever pass builds the sync-stream layer.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'pois') THEN
    ALTER PUBLICATION powersync ADD TABLE pois;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'map_regions') THEN
    ALTER PUBLICATION powersync ADD TABLE map_regions;
  END IF;
END
$$;
GRANT SELECT ON pois TO powersync_repl;
GRANT SELECT ON map_regions TO powersync_repl;
